#!/usr/bin/env python3
"""Create a deterministic, read-only review snapshot for a mutable Git worktree."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Sequence


SCHEMA = "testany.code-reviewer.worktree-snapshot.v1"
DANGEROUS_GIT_ENV_EXACT = {
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_REPLACE_REF_BASE",
    "GIT_SHALLOW_FILE",
    "GIT_NAMESPACE",
    "GIT_CONFIG",
    "GIT_CONFIG_SYSTEM",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_COUNT",
    "GIT_LITERAL_PATHSPECS",
    "GIT_GLOB_PATHSPECS",
    "GIT_NOGLOB_PATHSPECS",
    "GIT_ICASE_PATHSPECS",
}
DANGEROUS_GIT_ENV_PREFIXES = ("GIT_CONFIG_KEY_", "GIT_CONFIG_VALUE_")


class SnapshotError(RuntimeError):
    pass


def _closed_git_env() -> dict[str, str]:
    dangerous = sorted(
        key
        for key in os.environ
        if key in DANGEROUS_GIT_ENV_EXACT
        or key.startswith(DANGEROUS_GIT_ENV_PREFIXES)
    )
    if dangerous:
        raise SnapshotError(
            "Git repository-control environment overrides are not allowed: "
            + ", ".join(dangerous)
        )
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env.update(
        {
            "LC_ALL": "C",
            "GIT_NO_REPLACE_OBJECTS": "1",
            "GIT_OPTIONAL_LOCKS": "0",
        }
    )
    return env


def _git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        env=_closed_git_env(),
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise SnapshotError(f"git {' '.join(args)} failed: {detail}")
    return result.stdout


def _git_returncode(repo: Path, *args: str) -> int:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
        env=_closed_git_env(),
    ).returncode


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical_path(value: str) -> str:
    normalized = PurePosixPath(value.replace(os.sep, "/"))
    if normalized.is_absolute() or ".." in normalized.parts:
        raise SnapshotError(f"excluded path must be repository-relative: {value}")
    result = normalized.as_posix()
    if not result or result == ".":
        raise SnapshotError("repository root cannot be excluded")
    return result


def _pathspecs(exclusions: Sequence[str]) -> list[str]:
    specs = ["."]
    specs.extend(f":(exclude,top,literal){path}" for path in exclusions)
    return specs


def _paths_overlap(left: str, right: str) -> bool:
    return (
        left == right
        or left.startswith(f"{right}/")
        or right.startswith(f"{left}/")
    )


def _assert_exclusions_do_not_hide_committed_candidate(
    root: Path,
    base_commit: str,
    head_commit: str,
    exclusions: Sequence[str],
) -> None:
    if not exclusions:
        return
    committed = _name_status(
        root,
        (f"{base_commit}..{head_commit}",),
        (".",),
        "base_to_head",
    )
    conflicts = sorted(
        {
            (excluded, path)
            for path, _layer, _status in committed
            for excluded in exclusions
            if _paths_overlap(excluded, path)
        }
    )
    if conflicts:
        rendered = ", ".join(
            f"{excluded} -> {path}" for excluded, path in conflicts[:20]
        )
        raise SnapshotError(
            "--exclude cannot hide a committed Candidate path or its ancestor/descendant: "
            f"{rendered}"
        )


def _assert_candidate_ignored_eligibility(
    root: Path, candidate_ignored_paths: Sequence[str]
) -> None:
    for path in candidate_ignored_paths:
        if _git_returncode(root, "ls-files", "--error-unmatch", "--", path) == 0:
            raise SnapshotError(f"--candidate-ignored path is already tracked: {path}")
        if _git_returncode(root, "check-ignore", "-q", "--", path) != 0:
            raise SnapshotError(f"--candidate-ignored path is not ignored by Git: {path}")


def _assert_no_object_rewrite_state(root: Path) -> None:
    replace_refs = _git(
        root, "for-each-ref", "--format=%(refname)", "refs/replace"
    ).decode("utf-8", errors="replace").splitlines()
    if replace_refs:
        raise SnapshotError(
            "Git replace refs are not allowed in a review snapshot: "
            + ", ".join(sorted(replace_refs)[:20])
        )
    grafts_raw = _git(root, "rev-parse", "--git-path", "info/grafts").decode().strip()
    grafts_path = Path(grafts_raw)
    if not grafts_path.is_absolute():
        grafts_path = root / grafts_path
    if grafts_path.exists() or grafts_path.is_symlink():
        raise SnapshotError(
            f"legacy Git graft state is not allowed in a review snapshot: {grafts_path}"
        )


def _repository_control_state(
    root: Path, pathspecs: Sequence[str]
) -> dict[str, object]:
    git_dir_raw = _git(root, "rev-parse", "--absolute-git-dir").decode().strip()
    common_dir_raw = _git(root, "rev-parse", "--git-common-dir").decode().strip()
    index_raw = _git(root, "rev-parse", "--git-path", "index").decode().strip()

    def absolute(value: str) -> Path:
        path = Path(value)
        return path.resolve() if path.is_absolute() else (root / path).resolve()

    git_dir = absolute(git_dir_raw)
    common_dir = absolute(common_dir_raw)
    index_path = absolute(index_raw)
    if not index_path.is_file():
        raise SnapshotError(f"canonical Git index is missing: {index_path}")

    # Do not hash the index file itself. Read-only Git commands may legitimately
    # rewrite its stat/cache extensions even when every review-relevant entry is
    # unchanged. Bind the canonical semantic entry set and visibility flags
    # instead: path, mode, object id, stage, assume-unchanged/skip-worktree and
    # fsmonitor-valid state. These commands do not refresh the index.
    semantic_index = b"\0".join(
        (
            _git(root, "ls-files", "--stage", "-z", "--", *pathspecs),
            _git(root, "ls-files", "-v", "-z", "--", *pathspecs),
            _git(root, "ls-files", "-f", "-z", "--", *pathspecs),
        )
    )
    return {
        "git_dir": str(git_dir),
        "git_common_dir": str(common_dir),
        "index_path": str(index_path),
        "semantic_index_sha256": _sha256(semantic_index),
    }


def _resolve_commit(repo: Path, revision: str) -> str:
    return _git(repo, "rev-parse", "--verify", f"{revision}^{{commit}}").decode().strip()


def _file_record(
    path: Path,
    display_path: str,
    *,
    allow_symlink: bool = True,
    git_object_format: str | None = None,
) -> dict[str, object]:
    try:
        before = path.lstat()
    except FileNotFoundError as exc:
        raise SnapshotError(f"file changed while snapshotting: {display_path}") from exc

    mode = stat.S_IMODE(before.st_mode)
    git_digest = hashlib.new(git_object_format) if git_object_format else None
    if stat.S_ISREG(before.st_mode):
        digest = hashlib.sha256()
        size = 0
        if git_digest is not None:
            git_digest.update(f"blob {before.st_size}\0".encode("ascii"))
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
                if git_digest is not None:
                    git_digest.update(chunk)
                size += len(chunk)
        if size != before.st_size:
            raise SnapshotError(f"file changed while snapshotting: {display_path}")
        kind = "file"
        content_sha = digest.hexdigest()
    elif stat.S_ISLNK(before.st_mode):
        if not allow_symlink:
            raise SnapshotError(
                f"mutable baseline must be a regular file, not a symlink: {display_path}"
            )
        target = os.fsencode(os.readlink(path))
        size = len(target)
        kind = "symlink"
        content_sha = _sha256(target)
        if git_digest is not None:
            git_digest.update(f"blob {size}\0".encode("ascii"))
            git_digest.update(target)
    else:
        raise SnapshotError(f"unsupported untracked/baseline file type: {display_path}")

    try:
        after = path.lstat()
    except FileNotFoundError as exc:
        raise SnapshotError(f"file changed while snapshotting: {display_path}") from exc
    if (
        before.st_mode,
        before.st_size,
        before.st_mtime_ns,
        before.st_ino,
    ) != (
        after.st_mode,
        after.st_size,
        after.st_mtime_ns,
        after.st_ino,
    ):
        raise SnapshotError(f"file changed while snapshotting: {display_path}")

    record: dict[str, object] = {
        "path": display_path,
        "kind": kind,
        "mode": f"{mode:04o}",
        "size": size,
        "sha256": content_sha,
    }
    if git_digest is not None:
        record["raw_git_blob_oid"] = git_digest.hexdigest()
    return record


def _assert_no_hidden_index_flags(root: Path, pathspecs: Sequence[str]) -> None:
    checks = (
        ("-v", lambda tag: tag == "S" or tag.islower(), "assume-unchanged/skip-worktree"),
        ("-f", lambda tag: tag.islower(), "fsmonitor-valid"),
    )
    for option, is_hidden, label in checks:
        raw = _git(root, "ls-files", option, "-z", "--", *pathspecs)
        flagged = []
        for record in raw.split(b"\0"):
            if len(record) < 3 or record[1:2] != b" ":
                continue
            tag = chr(record[0])
            if is_hidden(tag):
                flagged.append(os.fsdecode(record[2:]))
        if flagged:
            shown = ", ".join(sorted(flagged)[:20])
            raise SnapshotError(
                f"{label} index flags hide mutable worktree state: {shown}"
            )


def _initialized_submodule_state(root: Path) -> tuple[str, str]:
    """Return HEAD and a raw/mode-bound state digest for a clean submodule.

    ``git status`` alone is insufficient because clean filters and EOL rules can
    hide different raw worktree bytes. Recursing through ``_index_state`` binds
    every tracked byte/mode and nested submodule, while the before/after checks
    make that read fail closed under concurrent mutation.
    """
    _assert_no_object_rewrite_state(root)
    control_state = _repository_control_state(root, (".",))
    _assert_no_hidden_index_flags(root, (".",))
    head_commit = _resolve_commit(root, "HEAD")
    status_args = (
        "status",
        "--porcelain=v2",
        "-z",
        "--untracked-files=all",
        "--ignore-submodules=none",
    )
    # Bind raw bytes before consulting porcelain status. A clean filter can
    # make ``git diff`` semantically empty while Git still reports only a stat
    # change; raw/index divergence is the more precise fail-closed diagnosis.
    index_state = _index_state(root, (".",))
    if index_state["raw_index_mismatches"] or index_state["mode_mismatches"]:
        affected = sorted(
            set(index_state["raw_index_mismatches"])
            | {item["path"] for item in index_state["mode_mismatches"]}
        )
        raise SnapshotError(
            "dirty submodule raw bytes/modes are hidden by Git normalization: "
            f"{root}: {', '.join(affected[:20])}"
        )

    if _git(root, *status_args):
        raise SnapshotError(f"dirty submodule must be committed: {root}")

    if _git(root, *status_args):
        raise SnapshotError(f"submodule changed while snapshotting: {root}")
    if _resolve_commit(root, "HEAD") != head_commit:
        raise SnapshotError(f"submodule HEAD changed while snapshotting: {root}")
    if _repository_control_state(root, (".",)) != control_state:
        raise SnapshotError(f"submodule index changed while snapshotting: {root}")
    _assert_no_object_rewrite_state(root)

    canonical = json.dumps(
        index_state, ensure_ascii=True, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return head_commit, _sha256(canonical)


def _index_state(root: Path, pathspecs: Sequence[str]) -> dict[str, object]:
    raw = _git(root, "ls-files", "--stage", "-z", "--", *pathspecs)
    mode_digest = hashlib.sha256()
    mode_mismatches: list[dict[str, str]] = []
    submodules: list[dict[str, str]] = []
    tracked_worktree: list[dict[str, object]] = []
    raw_index_mismatches: list[str] = []
    object_format = _git(root, "rev-parse", "--show-object-format").decode().strip()
    count = 0

    for record in raw.split(b"\0"):
        if not record:
            continue
        try:
            header, path_bytes = record.split(b"\t", 1)
            index_mode_raw, object_id_raw, stage_raw = header.split(b" ")
        except ValueError as exc:
            raise SnapshotError("unexpected git ls-files --stage output") from exc

        index_mode = index_mode_raw.decode("ascii")
        object_id = object_id_raw.decode("ascii")
        stage = stage_raw.decode("ascii")
        display_path = os.fsdecode(path_bytes)
        if stage != "0":
            raise SnapshotError(f"unmerged index entry cannot be reviewed: {display_path}")

        worktree_path = root / display_path
        if index_mode == "160000":
            submodule_git_marker = worktree_path / ".git"
            if worktree_path.is_symlink():
                raise SnapshotError(f"gitlink is not a directory: {display_path}")
            if not worktree_path.exists():
                actual_mode = "UNINITIALIZED_GITLINK"
                submodules.append(
                    {
                        "path": display_path,
                        "index_commit": object_id,
                        "worktree_commit": "UNINITIALIZED",
                        "state": "UNINITIALIZED",
                    }
                )
            elif not worktree_path.is_dir():
                raise SnapshotError(f"gitlink is not a directory: {display_path}")
            elif not (
                submodule_git_marker.exists() or submodule_git_marker.is_symlink()
            ):
                # ``git submodule deinit`` leaves a strictly empty directory.
                # Any residual entry would otherwise be mutable bytes outside
                # both the superproject gitlink and a child Git index.
                try:
                    residual_entries = sorted(
                        entry.name for entry in worktree_path.iterdir()
                    )
                except OSError as exc:
                    raise SnapshotError(
                        f"cannot inspect uninitialized submodule: {display_path}"
                    ) from exc
                if residual_entries:
                    shown = ", ".join(residual_entries[:20])
                    raise SnapshotError(
                        "uninitialized submodule directory contains unbound files: "
                        f"{display_path}: {shown}"
                    )
                actual_mode = "UNINITIALIZED_GITLINK"
                submodules.append(
                    {
                        "path": display_path,
                        "index_commit": object_id,
                        "worktree_commit": "UNINITIALIZED",
                        "state": "UNINITIALIZED",
                    }
                )
            else:
                if submodule_git_marker.is_symlink():
                    raise SnapshotError(
                        f"submodule .git marker must not be a symlink: {display_path}"
                    )
                child_root = Path(
                    _git(worktree_path, "rev-parse", "--show-toplevel")
                    .decode("utf-8")
                    .strip()
                ).resolve()
                if child_root != worktree_path.resolve():
                    raise SnapshotError(
                        "gitlink directory resolves to a different repository root: "
                        f"{display_path}: {child_root}"
                    )
                submodule_head, submodule_state_sha256 = (
                    _initialized_submodule_state(worktree_path)
                )
                actual_mode = "160000"
                submodules.append(
                    {
                        "path": display_path,
                        "index_commit": object_id,
                        "worktree_commit": submodule_head,
                        "state": "CLEAN",
                        "worktree_state_sha256": submodule_state_sha256,
                    }
                )
        else:
            try:
                current = worktree_path.lstat()
            except FileNotFoundError:
                actual_mode = "MISSING"
                tracked_worktree.append(
                    {
                        "path": display_path,
                        "kind": "missing",
                        "mode": "MISSING",
                        "size": 0,
                        "sha256": None,
                    }
                )
            else:
                if stat.S_ISLNK(current.st_mode):
                    actual_mode = "120000"
                elif stat.S_ISREG(current.st_mode):
                    actual_mode = "100755" if current.st_mode & 0o111 else "100644"
                else:
                    raise SnapshotError(f"unsupported tracked file type: {display_path}")
                worktree_record = _file_record(
                    worktree_path,
                    display_path,
                    allow_symlink=True,
                    git_object_format=object_format,
                )
                worktree_record["index_object_id"] = object_id
                worktree_record["raw_matches_index_blob"] = (
                    worktree_record["raw_git_blob_oid"] == object_id
                )
                if not worktree_record["raw_matches_index_blob"]:
                    raw_index_mismatches.append(display_path)
                tracked_worktree.append(worktree_record)

        mode_digest.update(path_bytes)
        mode_digest.update(b"\0")
        mode_digest.update(index_mode.encode("ascii"))
        mode_digest.update(b"\0")
        mode_digest.update(actual_mode.encode("ascii"))
        mode_digest.update(b"\0")
        count += 1
        if index_mode != actual_mode and actual_mode != "UNINITIALIZED_GITLINK":
            mode_mismatches.append(
                {
                    "path": display_path,
                    "index_mode": index_mode,
                    "worktree_mode": actual_mode,
                }
            )

    return {
        "tracked_entries": count,
        "tracked_modes_sha256": mode_digest.hexdigest(),
        "mode_mismatches": mode_mismatches,
        "tracked_worktree": tracked_worktree,
        "raw_index_mismatches": sorted(raw_index_mismatches),
        "submodules": submodules,
    }


def _name_status(
    root: Path, args: Sequence[str], pathspecs: Sequence[str], layer: str
) -> list[tuple[str, str, str]]:
    raw = _git(
        root,
        "diff",
        "--name-status",
        "--no-renames",
        "-z",
        "--no-ext-diff",
        "--no-textconv",
        "--ignore-submodules=none",
        *args,
        "--",
        *pathspecs,
    )
    fields = [item for item in raw.split(b"\0") if item]
    if len(fields) % 2:
        raise SnapshotError(f"unexpected git name-status output for {layer}")
    return [
        (os.fsdecode(fields[index + 1]), layer, fields[index].decode("ascii"))
        for index in range(0, len(fields), 2)
    ]


def _changed_path_manifest(
    root: Path,
    base_commit: str,
    pathspecs: Sequence[str],
    untracked_paths: Sequence[str],
    candidate_ignored_paths: Sequence[str],
    raw_index_mismatches: Sequence[str],
    mode_mismatches: Sequence[dict[str, str]],
    submodules: Sequence[dict[str, str]],
) -> list[dict[str, object]]:
    entries: dict[str, list[dict[str, str]]] = {}
    uninitialized_submodules = {
        item["path"] for item in submodules if item["state"] == "UNINITIALIZED"
    }
    changes = _name_status(
        root, ("--cached", base_commit), pathspecs, "base_to_index"
    )
    changes.extend(
        (path, layer, status)
        for path, layer, status in _name_status(
            root, (), pathspecs, "index_to_worktree"
        )
        if not (
            path in uninitialized_submodules
            and layer == "index_to_worktree"
            and status == "D"
        )
    )
    changes.extend((path, "untracked", "?") for path in untracked_paths)
    changes.extend((path, "candidate_ignored", "?") for path in candidate_ignored_paths)
    changes.extend(
        (path, "raw_worktree_vs_index", "RAW") for path in raw_index_mismatches
    )
    changes.extend(
        (item["path"], "worktree_mode_vs_index", "MODE")
        for item in mode_mismatches
    )
    changes.extend(
        (item["path"], "submodule_head_vs_index", "SUBMODULE")
        for item in submodules
        if item["state"] == "CLEAN"
        and item["worktree_commit"] != item["index_commit"]
    )
    for path, layer, status in changes:
        entries.setdefault(path, []).append({"layer": layer, "status": status})
    return [
        {"path": path, "changes": sorted(entries[path], key=lambda item: item["layer"])}
        for path in sorted(entries)
    ]


def _capture_state(
    root: Path,
    base_commit: str,
    pathspecs: Sequence[str],
    excluded_paths: Sequence[str],
    mutable_baselines: Sequence[Path],
    candidate_ignored_paths: Sequence[str],
) -> dict[str, object]:
    _assert_no_object_rewrite_state(root)
    control_state = _repository_control_state(root, pathspecs)
    _assert_no_hidden_index_flags(root, pathspecs)
    head_commit = _resolve_commit(root, "HEAD")
    _assert_exclusions_do_not_hide_committed_candidate(
        root, base_commit, head_commit, excluded_paths
    )
    _assert_candidate_ignored_eligibility(root, candidate_ignored_paths)
    staged = _git(
        root,
        "diff",
        "--cached",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--ignore-submodules=none",
        "--submodule=short",
        base_commit,
        "--",
        *pathspecs,
    )
    unstaged = _git(
        root,
        "diff",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--ignore-submodules=none",
        "--submodule=short",
        "--",
        *pathspecs,
    )
    untracked_raw = _git(
        root,
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        *pathspecs,
    )
    untracked_paths = sorted(
        os.fsdecode(item) for item in untracked_raw.split(b"\0") if item
    )
    untracked = [_file_record(root / path, path) for path in untracked_paths]
    candidate_ignored = [
        _file_record(root / path, path) for path in candidate_ignored_paths
    ]
    index_state = _index_state(root, pathspecs)
    changed_paths = _changed_path_manifest(
        root,
        base_commit,
        pathspecs,
        untracked_paths,
        candidate_ignored_paths,
        index_state["raw_index_mismatches"],
        index_state["mode_mismatches"],
        index_state["submodules"],
    )
    changed_paths_canonical = json.dumps(
        changed_paths, ensure_ascii=True, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")

    baseline_records = []
    for supplied in sorted((Path(item) for item in mutable_baselines), key=str):
        resolved = supplied.expanduser()
        if not resolved.is_absolute():
            resolved = Path(os.path.abspath(Path.cwd() / resolved))
        else:
            resolved = Path(os.path.abspath(resolved))
        baseline_records.append(
            _file_record(resolved, str(resolved), allow_symlink=False)
        )

    if _resolve_commit(root, "HEAD") != head_commit:
        raise SnapshotError("HEAD changed while snapshotting")
    if _repository_control_state(root, pathspecs) != control_state:
        raise SnapshotError("canonical Git index changed while snapshotting")
    _assert_no_object_rewrite_state(root)

    return {
        "head_commit": head_commit,
        "repository_control_state": control_state,
        "staged_patch": {"bytes": len(staged), "sha256": _sha256(staged)},
        "unstaged_patch": {"bytes": len(unstaged), "sha256": _sha256(unstaged)},
        "candidate_untracked": untracked,
        "candidate_ignored": candidate_ignored,
        "candidate_changed_paths": changed_paths,
        "candidate_changed_paths_sha256": _sha256(changed_paths_canonical),
        "mutable_baselines": baseline_records,
        "index_state": index_state,
    }


def create_snapshot(
    repo: Path,
    base: str,
    exclusions: Sequence[str] = (),
    mutable_baselines: Sequence[Path] = (),
    candidate_ignored: Sequence[str] = (),
) -> dict[str, object]:
    root = Path(
        _git(repo, "rev-parse", "--show-toplevel").decode("utf-8").strip()
    ).resolve()
    base_commit = _resolve_commit(root, base)
    normalized_exclusions = sorted({_canonical_path(value) for value in exclusions})
    normalized_candidate_ignored = sorted(
        {_canonical_path(value) for value in candidate_ignored}
    )
    for path in normalized_candidate_ignored:
        if any(path == excluded or path.startswith(f"{excluded}/") for excluded in normalized_exclusions):
            raise SnapshotError(
                f"candidate-owned ignored path cannot also be excluded: {path}"
            )
    pathspecs = _pathspecs(normalized_exclusions)
    first = _capture_state(
        root,
        base_commit,
        pathspecs,
        normalized_exclusions,
        mutable_baselines,
        normalized_candidate_ignored,
    )
    second = _capture_state(
        root,
        base_commit,
        pathspecs,
        normalized_exclusions,
        mutable_baselines,
        normalized_candidate_ignored,
    )
    if first != second:
        raise SnapshotError(
            "repository or mutable baseline changed during snapshot; stop concurrent writers and retry"
        )

    manifest: dict[str, object] = {
        "schema": SCHEMA,
        "repository_root": str(root),
        "base_commit": base_commit,
        "excluded_paths": normalized_exclusions,
        "candidate_ignored_paths": normalized_candidate_ignored,
        **first,
    }
    canonical = json.dumps(
        manifest, ensure_ascii=True, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return {"snapshot_sha256": _sha256(canonical), "manifest": manifest}


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--base", required=True, help="Approved base/previous commit")
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Repository-relative unowned/WIP path to exclude; repeat as needed",
    )
    parser.add_argument(
        "--candidate-ignored",
        action="append",
        default=[],
        help="Repository-relative Candidate-owned ignored file; repeat as needed",
    )
    parser.add_argument(
        "--mutable-baseline",
        action="append",
        default=[],
        type=Path,
        help="Mutable approved baseline file outside or inside the repository",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        snapshot = create_snapshot(
            args.repo,
            args.base,
            args.exclude,
            args.mutable_baseline,
            args.candidate_ignored,
        )
    except SnapshotError as exc:
        print(f"snapshot failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
