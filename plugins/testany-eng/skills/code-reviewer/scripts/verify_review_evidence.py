#!/usr/bin/env python3
"""Read-only evidence checks. MATCH verifies bytes/binding, never review approval.

manifest: verify listed files and explicitly allowed external references.
archive: compare a pinned tar with a pinned snapshot using Git type/execute bits.
source: compare two pinned snapshots, including original checkout permission bits.
No archive extraction, test execution, recursive reference chasing or repository writes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import snapshot_worktree as snapshot
import verify_candidate_binding as binding
from review_artifacts import print_error, print_summary, save_json


def pinned_file(path: Path, expected: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("a separately pinned file SHA-256 is required")
    record = snapshot._file_record(path, str(path), allow_symlink=False)
    if record["sha256"] != expected:
        raise ValueError(f"file does not match pinned SHA-256: {path}")
    return record


def read_candidate(path: Path, expected: str) -> tuple[dict, dict]:
    payload = snapshot.load_snapshot(path, expected)
    records, manifest = binding.snapshot_files(payload, expected)
    if manifest["excluded_paths"]:
        raise ValueError("source/archive comparison with excluded WIP is unsupported; retain the missing proof explicitly")
    return records, manifest


def candidate_roots(manifest: dict) -> list:
    control = manifest["repository_control_state"]
    return [manifest["repository_root"], control["git_dir"], control["git_common_dir"]]


def differences(before: dict, after: dict) -> list:
    return [{"path": path, "expected": before.get(path), "actual": after.get(path)}
            for path in sorted(set(before) | set(after)) if before.get(path) != after.get(path)]


def unique_object(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def manifest_entries(payload: dict, manifest_format: str) -> tuple[list, str, list]:
    if not isinstance(payload, dict):
        raise ValueError("manifest must be a JSON object; select its declared format explicitly")
    if manifest_format == "entries":
        entries = payload.get("entries")
        if not isinstance(entries, list) or not entries:
            raise ValueError("entries format requires a non-empty entries list of path/bytes/sha256")
        field, fields = "entries", ["size", "sha256"]
    elif manifest_format in ("evidence-map", "source-files"):
        field = "evidence" if manifest_format == "evidence-map" else "source_files"
        values = payload.get(field)
        if not isinstance(values, dict) or not values:
            raise ValueError(f"{manifest_format} format requires a non-empty {field} object")
        entries = []
        for name, item in values.items():
            if manifest_format == "evidence-map":
                if not isinstance(item, dict) or not {"size", "sha256"} <= item.keys():
                    raise ValueError(f"evidence-map requires size/sha256 for: {name}")
                entries.append({"path": name, "bytes": item["size"], "sha256": item["sha256"]})
            else:
                entries.append({"path": name, "sha256": item})
        fields = ["size", "sha256"] if manifest_format == "evidence-map" else ["sha256"]
    else:
        raise ValueError(f"unsupported manifest format: {manifest_format}")
    required = {"path", "sha256"} | ({"bytes"} if "size" in fields else set())
    if any(not isinstance(entry, dict) or not required <= entry.keys() for entry in entries):
        raise ValueError(f"{manifest_format} entries require {', '.join(sorted(required))}")
    return entries, field, fields


def verify_manifest(path: Path, expected: str, root: Path, allowed: list[Path], manifest_format: str = "entries") -> dict:
    pinned_file(path, expected)
    payload = json.loads(path.read_bytes(), object_pairs_hook=unique_object)
    entries, field, fields = manifest_entries(payload, manifest_format)
    root = root.resolve(strict=True)
    allowed = {item.resolve(strict=True) for item in allowed}
    checked, seen = [], set()
    for entry in entries:
        value = entry["path"]
        if not isinstance(value, str) or not value:
            raise ValueError("invalid evidence path")
        supplied = Path(value)
        if supplied.is_absolute():
            target = supplied.resolve()
            if target not in allowed:
                raise ValueError(f"absolute evidence reference needs --allow-external-file: {value}")
        else:
            binding.path_key(value)
            supplied = root / value
            target = supplied.resolve()
            if not target.is_relative_to(root):
                raise ValueError(f"relative evidence reference escapes root: {value}")
        if target in seen:
            raise ValueError(f"duplicate evidence path: {value}")
        seen.add(target)
        sha = entry["sha256"]
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
            raise ValueError(f"invalid evidence digest: {value}")
        wanted = {"sha256": sha}
        if "size" in fields:
            size = entry["bytes"]
            if type(size) is not int or size < 0:
                raise ValueError(f"invalid evidence size: {value}")
            wanted["size"] = size
        try:
            record = snapshot._file_record(supplied, value, allow_symlink=False)
            actual = {key: record[key] for key in fields}
            checked.append({"path": value, "match": wanted == actual, "expected": wanted, "actual": actual})
        except (OSError, snapshot.SnapshotError) as exc:
            checked.append({"path": value, "match": False, "error": str(exc)})
    pinned_file(path, expected)
    return {"manifest_path": str(path.resolve()), "manifest_sha256": expected, "evidence_root": str(root),
            "manifest_format": manifest_format, "manifest_field": field, "verified_fields": fields,
            "verification_scope": "listed_files_only",
            "files_checked": len(checked), "checks": checked,
            "failures": [item for item in checked if not item["match"]],
            "unverified_by_tool": ["manifest_completeness", "unselected_manifest_fields", "source_path_set_and_modes",
                                   "test_execution_and_oracle", "source_approval"]}


def verify_archive(path: Path, expected: str, snapshot_path: Path, snapshot_sha: str, prefix: str) -> tuple[dict, list]:
    wanted, manifest = read_candidate(snapshot_path, snapshot_sha)
    if any(item["mode"] == "160000" for item in wanted.values()):
        raise ValueError("tar cannot prove gitlink identity; use candidate binding evidence instead")
    if prefix:
        prefix = binding.path_key(prefix.rstrip("/")) + "/"
    pinned_file(path, expected)
    actual, names = {}, set()
    with tarfile.open(path, "r:*") as archive:
        for member in archive:
            name = member.name
            if name.startswith("./"):
                name = name[2:]
            if member.isdir() and name in ("", "."):
                continue
            name = binding.path_key(name.rstrip("/") if member.isdir() else name)
            if prefix:
                if member.isdir() and name == prefix[:-1]:
                    continue
                if not name.startswith(prefix):
                    raise ValueError(f"archive entry outside declared prefix: {name}")
                name = binding.path_key(name[len(prefix):])
            if name in names:
                raise ValueError(f"duplicate archive entry: {name}")
            names.add(name)
            if member.isdir():
                if not any(value.startswith(name + "/") for value in wanted):
                    raise ValueError(f"unexpected archive directory: {name}")
                continue
            if member.issym():
                data = os.fsencode(member.linkname)
                record = {"mode": "120000", "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            elif member.isfile():
                hasher, size = hashlib.sha256(), 0
                with archive.extractfile(member) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        hasher.update(chunk)
                        size += len(chunk)
                record = {"mode": "100755" if member.mode & 0o111 else "100644", "size": size, "sha256": hasher.hexdigest()}
            else:
                raise ValueError(f"unsupported archive entry type (including hardlinks): {name}")
            actual[name] = record
    pinned_file(path, expected)
    return ({"archive_path": str(path.resolve()), "archive_sha256": expected, "archive_prefix": prefix,
             "snapshot_sha256": snapshot_sha, "files_checked": len(set(wanted) | set(actual)),
             "mode_semantics": "git_type_and_executable_bit", "failures": differences(wanted, actual),
             "unverified_by_tool": ["checkout_raw_permission_bits", "test_execution_and_oracle", "source_approval"]},
            candidate_roots(manifest))


def verify_source(snapshot_path: Path, snapshot_sha: str, tested_path: Path, tested_sha: str) -> tuple[dict, list]:
    wanted, reviewed = read_candidate(snapshot_path, snapshot_sha)
    actual, tested = read_candidate(tested_path, tested_sha)
    for records, manifest in ((wanted, reviewed), (actual, tested)):
        files = manifest["index_state"]["tracked_worktree"] + manifest["candidate_untracked"] + manifest["candidate_ignored"]
        for item in files:
            if item["kind"] != "missing":
                records[item["path"]]["raw_mode"] = item["mode"]
    return ({"snapshot_sha256": snapshot_sha, "tested_snapshot_sha256": tested_sha,
             "files_checked": len(set(wanted) | set(actual)), "mode_semantics": "raw_checkout_and_git_type",
             "failures": differences(wanted, actual),
             "unverified_by_tool": ["snapshot_corresponds_to_test_execution", "non_file_dependencies", "source_approval"]},
            candidate_roots(reviewed) + candidate_roots(tested))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    manifest = modes.add_parser("manifest", help="check pinned path/bytes/sha256 entries, without chasing references")
    manifest.add_argument("--manifest", type=Path, required=True)
    manifest.add_argument("--manifest-sha256", required=True)
    manifest.add_argument("--root", type=Path, required=True)
    manifest.add_argument("--format", choices=("entries", "evidence-map", "source-files"), default="entries",
                          help="explicit field/shape; source-files verifies listed hashes only")
    manifest.add_argument("--allow-external-file", type=Path, action="append", default=[])
    archive = modes.add_parser("archive", help="compare pinned tar raw content against reviewed snapshot")
    archive.add_argument("--archive", type=Path, required=True)
    archive.add_argument("--archive-sha256", required=True)
    archive.add_argument("--prefix", default="", help="explicit tar root prefix, never guessed")
    source = modes.add_parser("source", help="compare reviewed and tested snapshots, including raw permissions")
    source.add_argument("--tested-snapshot", type=Path, required=True)
    source.add_argument("--tested-snapshot-sha256", required=True)
    for child in (archive, source):
        child.add_argument("--snapshot", type=Path, required=True)
        child.add_argument("--snapshot-sha256", required=True)
    for child in (manifest, archive, source):
        child.add_argument("--output", type=Path, help="new full receipt outside inputs; default: temporary artifact")
    args = parser.parse_args()
    try:
        if args.mode == "manifest":
            receipt = verify_manifest(args.manifest, args.manifest_sha256, args.root, args.allow_external_file, args.format)
            roots = [args.root]
        elif args.mode == "archive":
            receipt, roots = verify_archive(args.archive, args.archive_sha256, args.snapshot, args.snapshot_sha256, args.prefix)
        else:
            receipt, roots = verify_source(args.snapshot, args.snapshot_sha256, args.tested_snapshot, args.tested_snapshot_sha256)
        receipt.update(schema="testany.code-reviewer.evidence-receipt.v1", mode=args.mode,
                       result="MISMATCH" if receipt["failures"] else "MATCH", approval_granted=False)
        output, sha = save_json(receipt, args.output, forbidden_roots=roots, prefix="review-evidence-")
        summary = {key: receipt[key] for key in ("result", "approval_granted", "files_checked", "mode")}
        if args.mode == "manifest":
            summary.update({key: receipt[key] for key in ("manifest_format", "manifest_field", "verified_fields", "verification_scope")})
        summary.update(receipt_path=str(output), receipt_sha256=sha)
        print_summary(summary, paths=[item["path"] for item in receipt["failures"]], path_key="failed_paths")
        return 1 if receipt["failures"] else 0
    except (OSError, ValueError, KeyError, TypeError, snapshot.SnapshotError, tarfile.TarError, subprocess.SubprocessError) as exc:
        print_error(exc)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
