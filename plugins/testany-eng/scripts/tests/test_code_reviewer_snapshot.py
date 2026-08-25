from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "skills"
    / "code-reviewer"
    / "scripts"
    / "snapshot_worktree.py"
)
SPEC = importlib.util.spec_from_file_location("snapshot_worktree", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
SNAPSHOT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SNAPSHOT
SPEC.loader.exec_module(SNAPSHOT)


class CodeReviewerSnapshotTests(unittest.TestCase):
    def git(self, repo: Path, *args: str) -> str:
        return subprocess.run(
            ["git", "-C", str(repo), *args],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        ).stdout.strip()

    def make_repo(self, root: Path) -> tuple[Path, str]:
        repo = root / "repo"
        repo.mkdir()
        self.git(repo, "init", "-q")
        self.git(repo, "config", "user.name", "Snapshot Test")
        self.git(repo, "config", "user.email", "snapshot@example.invalid")
        (repo / ".gitignore").write_text("ignored/\n", encoding="utf-8")
        (repo / "tracked.txt").write_text("base\n", encoding="utf-8")
        self.git(repo, "add", ".")
        self.git(repo, "commit", "-qm", "base")
        return repo, self.git(repo, "rev-parse", "HEAD")

    def test_snapshot_changes_for_staged_unstaged_and_untracked_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            first = SNAPSHOT.create_snapshot(repo, base)["snapshot_sha256"]

            (repo / "tracked.txt").write_text("staged\n", encoding="utf-8")
            self.git(repo, "add", "tracked.txt")
            staged = SNAPSHOT.create_snapshot(repo, base)["snapshot_sha256"]

            (repo / "tracked.txt").write_text("unstaged\n", encoding="utf-8")
            unstaged = SNAPSHOT.create_snapshot(repo, base)["snapshot_sha256"]

            (repo / "new.txt").write_text("untracked\n", encoding="utf-8")
            untracked_snapshot = SNAPSHOT.create_snapshot(repo, base)
            untracked = untracked_snapshot["snapshot_sha256"]

        self.assertEqual(len({first, staged, unstaged, untracked}), 4)
        changed = {
            item["path"]: item["changes"]
            for item in untracked_snapshot["manifest"]["candidate_changed_paths"]
        }
        self.assertIn("tracked.txt", changed)
        self.assertIn("new.txt", changed)
        self.assertIn(
            {"layer": "untracked", "status": "?"}, changed["new.txt"]
        )
        expected_digest = hashlib.sha256(
            json.dumps(
                untracked_snapshot["manifest"]["candidate_changed_paths"],
                ensure_ascii=True,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        self.assertEqual(
            untracked_snapshot["manifest"]["candidate_changed_paths_sha256"],
            expected_digest,
        )

    def test_changed_path_manifest_records_staged_deletion(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            (repo / "tracked.txt").unlink()
            self.git(repo, "add", "tracked.txt")

            snapshot = SNAPSHOT.create_snapshot(repo, base)

        changed = snapshot["manifest"]["candidate_changed_paths"]
        self.assertEqual(
            changed,
            [
                {
                    "path": "tracked.txt",
                    "changes": [{"layer": "base_to_index", "status": "D"}],
                }
            ],
        )

    @unittest.skipIf(os.name == "nt", "filter command semantics differ on Windows")
    def test_raw_tracked_bytes_are_bound_even_when_clean_filter_hides_diff(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, _ = self.make_repo(Path(tmpdir))
            filter_script = repo / "mask-clean.sh"
            filter_script.write_text(
                "#!/bin/sh\ncat >/dev/null\nprintf 'MASKED\\n'\n",
                encoding="utf-8",
            )
            filter_script.chmod(0o755)
            (repo / ".gitattributes").write_text(
                "tracked.txt filter=mask\n", encoding="utf-8"
            )
            self.git(repo, "config", "filter.mask.clean", str(filter_script))
            self.git(repo, "config", "filter.mask.required", "true")
            self.git(repo, "add", ".gitattributes", "mask-clean.sh")
            self.git(repo, "add", "--renormalize", "tracked.txt")
            self.git(repo, "commit", "-qm", "enable deterministic clean filter")
            base = self.git(repo, "rev-parse", "HEAD")

            (repo / "tracked.txt").write_bytes(b"ORIGINAL_RUNTIME_BYTES\n")
            first = SNAPSHOT.create_snapshot(repo, base)
            (repo / "tracked.txt").write_bytes(b"DIFFERENT_RUNTIME_BYTES\n")
            second = SNAPSHOT.create_snapshot(repo, base)

        self.assertEqual(first["manifest"]["unstaged_patch"]["bytes"], 0)
        self.assertEqual(second["manifest"]["unstaged_patch"]["bytes"], 0)
        self.assertNotEqual(first["snapshot_sha256"], second["snapshot_sha256"])
        changed = {
            item["path"]: item["changes"]
            for item in second["manifest"]["candidate_changed_paths"]
        }
        self.assertIn(
            {"layer": "raw_worktree_vs_index", "status": "RAW"},
            changed["tracked.txt"],
        )

    def test_raw_tracked_bytes_bind_crlf_even_when_text_normalization_hides_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, _ = self.make_repo(Path(tmpdir))
            (repo / ".gitattributes").write_text(
                "tracked.txt text eol=lf\n", encoding="utf-8"
            )
            self.git(repo, "add", ".gitattributes", "tracked.txt")
            self.git(repo, "commit", "-qm", "normalize tracked text")
            base = self.git(repo, "rev-parse", "HEAD")

            (repo / "tracked.txt").write_bytes(b"base\n")
            lf = SNAPSHOT.create_snapshot(repo, base)
            (repo / "tracked.txt").write_bytes(b"base\r\n")
            crlf = SNAPSHOT.create_snapshot(repo, base)

        self.assertEqual(lf["manifest"]["unstaged_patch"]["bytes"], 0)
        self.assertEqual(crlf["manifest"]["unstaged_patch"]["bytes"], 0)
        self.assertNotEqual(lf["snapshot_sha256"], crlf["snapshot_sha256"])
        changed = {
            item["path"]: item["changes"]
            for item in crlf["manifest"]["candidate_changed_paths"]
        }
        self.assertIn(
            {"layer": "raw_worktree_vs_index", "status": "RAW"},
            changed["tracked.txt"],
        )

    def test_ignored_and_explicitly_excluded_wip_do_not_change_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            (repo / "local-wip.txt").write_text("one\n", encoding="utf-8")
            first = SNAPSHOT.create_snapshot(
                repo, base, exclusions=["local-wip.txt"]
            )["snapshot_sha256"]

            (repo / "local-wip.txt").write_text("two\n", encoding="utf-8")
            (repo / "ignored").mkdir()
            (repo / "ignored" / "result.bin").write_bytes(b"generated")
            second = SNAPSHOT.create_snapshot(
                repo, base, exclusions=["local-wip.txt"]
            )["snapshot_sha256"]

        self.assertEqual(first, second)

    def test_staged_tracked_excluded_wip_does_not_change_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            (repo / "tracked.txt").write_text("owner-wip-one\n", encoding="utf-8")
            self.git(repo, "add", "tracked.txt")
            first = SNAPSHOT.create_snapshot(
                repo, base, exclusions=["tracked.txt"]
            )

            (repo / "tracked.txt").write_text("owner-wip-two\n", encoding="utf-8")
            self.git(repo, "add", "tracked.txt")
            second = SNAPSHOT.create_snapshot(
                repo, base, exclusions=["tracked.txt"]
            )

        self.assertEqual(first["snapshot_sha256"], second["snapshot_sha256"])
        self.assertEqual(first["manifest"]["candidate_changed_paths"], [])
        self.assertEqual(second["manifest"]["candidate_changed_paths"], [])

    def test_exclusion_cannot_hide_committed_candidate_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            (repo / "candidate.txt").write_text("candidate\n", encoding="utf-8")
            self.git(repo, "add", "candidate.txt")
            self.git(repo, "commit", "-qm", "candidate")

            with self.assertRaisesRegex(
                SNAPSHOT.SnapshotError, "cannot hide a committed Candidate path"
            ):
                SNAPSHOT.create_snapshot(
                    repo,
                    base,
                    exclusions=["candidate.txt"],
                )

    def test_directory_exclusion_cannot_hide_committed_candidate_descendant(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            candidate_dir = repo / "candidate"
            candidate_dir.mkdir()
            (candidate_dir / "nested.txt").write_text("candidate\n", encoding="utf-8")
            self.git(repo, "add", "candidate/nested.txt")
            self.git(repo, "commit", "-qm", "candidate directory")

            with self.assertRaisesRegex(
                SNAPSHOT.SnapshotError, "cannot hide a committed Candidate path"
            ):
                SNAPSHOT.create_snapshot(repo, base, exclusions=["candidate"])

    def test_candidate_owned_ignored_file_is_bound_and_classified(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            ignored_dir = repo / "ignored"
            ignored_dir.mkdir()
            candidate_file = ignored_dir / "candidate.json"
            candidate_file.write_text('{"version": 1}\n', encoding="utf-8")

            first = SNAPSHOT.create_snapshot(
                repo, base, candidate_ignored=["ignored/candidate.json"]
            )
            candidate_file.write_text('{"version": 2}\n', encoding="utf-8")
            second = SNAPSHOT.create_snapshot(
                repo, base, candidate_ignored=["ignored/candidate.json"]
            )

        self.assertNotEqual(first["snapshot_sha256"], second["snapshot_sha256"])
        self.assertEqual(
            second["manifest"]["candidate_changed_paths"],
            [
                {
                    "path": "ignored/candidate.json",
                    "changes": [{"layer": "candidate_ignored", "status": "?"}],
                }
            ],
        )
        self.assertEqual(
            second["manifest"]["candidate_ignored"][0]["path"],
            "ignored/candidate.json",
        )

    def test_candidate_ignored_must_really_be_ignored_and_not_excluded(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            (repo / "visible.txt").write_text("visible\n", encoding="utf-8")
            with self.assertRaisesRegex(SNAPSHOT.SnapshotError, "not ignored"):
                SNAPSHOT.create_snapshot(
                    repo, base, candidate_ignored=["visible.txt"]
                )

            ignored_dir = repo / "ignored"
            ignored_dir.mkdir()
            (ignored_dir / "candidate.txt").write_text("candidate\n", encoding="utf-8")
            with self.assertRaisesRegex(SNAPSHOT.SnapshotError, "cannot also be excluded"):
                SNAPSHOT.create_snapshot(
                    repo,
                    base,
                    exclusions=["ignored"],
                    candidate_ignored=["ignored/candidate.txt"],
                )

    def test_external_mutable_baseline_is_bound(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            repo, base = self.make_repo(root)
            baseline = root / "approved-baseline.md"
            baseline.write_text("v1\n", encoding="utf-8")
            first = SNAPSHOT.create_snapshot(
                repo, base, mutable_baselines=[baseline]
            )["snapshot_sha256"]
            baseline.write_text("v2\n", encoding="utf-8")
            second = SNAPSHOT.create_snapshot(
                repo, base, mutable_baselines=[baseline]
            )["snapshot_sha256"]

        self.assertNotEqual(first, second)

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_mutable_baseline_symlink_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            repo, base = self.make_repo(root)
            target = root / "baseline-target.md"
            target.write_text("v1\n", encoding="utf-8")
            link = root / "baseline-link.md"
            link.symlink_to(target)
            with self.assertRaisesRegex(SNAPSHOT.SnapshotError, "regular file"):
                SNAPSHOT.create_snapshot(repo, base, mutable_baselines=[link])

    def test_hidden_index_flags_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            for flag in ("--assume-unchanged", "--skip-worktree"):
                self.git(repo, "update-index", flag, "tracked.txt")
                with self.assertRaisesRegex(SNAPSHOT.SnapshotError, "index flags"):
                    SNAPSHOT.create_snapshot(repo, base)
                reset = (
                    "--no-assume-unchanged"
                    if flag == "--assume-unchanged"
                    else "--no-skip-worktree"
                )
                self.git(repo, "update-index", reset, "tracked.txt")

    def test_repository_control_git_environment_override_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            alternate_index = repo / "alternate-index"
            with mock.patch.dict(
                os.environ,
                {"GIT_INDEX_FILE": str(alternate_index)},
                clear=False,
            ):
                with self.assertRaisesRegex(
                    SNAPSHOT.SnapshotError,
                    "repository-control environment overrides",
                ):
                    SNAPSHOT.create_snapshot(repo, base)

    def test_git_replace_ref_fails_closed_even_though_replacements_are_disabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            (repo / "candidate.txt").write_text("candidate\n", encoding="utf-8")
            self.git(repo, "add", "candidate.txt")
            self.git(repo, "commit", "-qm", "candidate")
            candidate = self.git(repo, "rev-parse", "HEAD")
            self.git(repo, "replace", candidate, base)

            with self.assertRaisesRegex(SNAPSHOT.SnapshotError, "replace refs"):
                SNAPSHOT.create_snapshot(repo, base)

    def test_head_advance_cannot_race_committed_exclusion_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            original = SNAPSHOT._assert_exclusions_do_not_hide_committed_candidate
            advanced = False

            def advance_after_head_capture(*args, **kwargs):
                nonlocal advanced
                if not advanced:
                    advanced = True
                    (repo / "excluded.txt").write_text("candidate\n", encoding="utf-8")
                    self.git(repo, "add", "excluded.txt")
                    self.git(repo, "commit", "-qm", "advance head")
                return original(*args, **kwargs)

            SNAPSHOT._assert_exclusions_do_not_hide_committed_candidate = (
                advance_after_head_capture
            )
            try:
                with self.assertRaisesRegex(
                    SNAPSHOT.SnapshotError, "HEAD changed while snapshotting"
                ):
                    SNAPSHOT.create_snapshot(
                        repo,
                        base,
                        exclusions=["excluded.txt"],
                    )
            finally:
                SNAPSHOT._assert_exclusions_do_not_hide_committed_candidate = original

    @unittest.skipIf(os.name == "nt", "executable bit semantics differ on Windows")
    def test_executable_mode_is_bound_when_git_filemode_is_disabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            self.git(repo, "config", "core.fileMode", "false")
            first = SNAPSHOT.create_snapshot(repo, base)["snapshot_sha256"]
            (repo / "tracked.txt").chmod(0o755)
            second_snapshot = SNAPSHOT.create_snapshot(repo, base)
            second = second_snapshot["snapshot_sha256"]

        self.assertNotEqual(first, second)
        changed = {
            item["path"]: item["changes"]
            for item in second_snapshot["manifest"]["candidate_changed_paths"]
        }
        self.assertIn(
            {"layer": "worktree_mode_vs_index", "status": "MODE"},
            changed["tracked.txt"],
        )

    def test_dirty_submodule_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            child = root / "child"
            child.mkdir()
            self.git(child, "init", "-q")
            self.git(child, "config", "user.name", "Snapshot Test")
            self.git(child, "config", "user.email", "snapshot@example.invalid")
            (child / "child.txt").write_text("base\n", encoding="utf-8")
            self.git(child, "add", ".")
            self.git(child, "commit", "-qm", "child base")

            repo, _ = self.make_repo(root)
            subprocess.run(
                [
                    "git",
                    "-c",
                    "protocol.file.allow=always",
                    "-C",
                    str(repo),
                    "submodule",
                    "add",
                    "-q",
                    str(child),
                    "vendor/child",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.git(repo, "commit", "-qam", "add submodule")
            base = self.git(repo, "rev-parse", "HEAD")
            (repo / "vendor" / "child" / "child.txt").write_text(
                "dirty\n", encoding="utf-8"
            )

            with self.assertRaisesRegex(SNAPSHOT.SnapshotError, "dirty submodule"):
                SNAPSHOT.create_snapshot(repo, base)

    def test_clean_submodule_head_change_is_in_changed_path_manifest_even_when_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            child = root / "child"
            child.mkdir()
            self.git(child, "init", "-q")
            self.git(child, "config", "user.name", "Snapshot Test")
            self.git(child, "config", "user.email", "snapshot@example.invalid")
            (child / "child.txt").write_text("base\n", encoding="utf-8")
            self.git(child, "add", ".")
            self.git(child, "commit", "-qm", "child base")

            repo, _ = self.make_repo(root)
            subprocess.run(
                [
                    "git",
                    "-c",
                    "protocol.file.allow=always",
                    "-C",
                    str(repo),
                    "submodule",
                    "add",
                    "-q",
                    str(child),
                    "vendor/child",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.git(repo, "commit", "-qam", "add submodule")
            base = self.git(repo, "rev-parse", "HEAD")
            nested = repo / "vendor" / "child"
            self.git(nested, "config", "user.name", "Snapshot Test")
            self.git(nested, "config", "user.email", "snapshot@example.invalid")
            (nested / "child.txt").write_text("next\n", encoding="utf-8")
            self.git(nested, "add", "child.txt")
            self.git(nested, "commit", "-qm", "child next")
            self.git(repo, "config", "diff.ignoreSubmodules", "all")

            snapshot = SNAPSHOT.create_snapshot(repo, base)

        changed = {
            item["path"]: item["changes"]
            for item in snapshot["manifest"]["candidate_changed_paths"]
        }
        self.assertIn(
            {"layer": "submodule_head_vs_index", "status": "SUBMODULE"},
            changed["vendor/child"],
        )

    @unittest.skipIf(os.name == "nt", "filter command semantics differ on Windows")
    def test_submodule_clean_filter_cannot_hide_different_raw_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            child = root / "child"
            child.mkdir()
            self.git(child, "init", "-q")
            self.git(child, "config", "user.name", "Snapshot Test")
            self.git(child, "config", "user.email", "snapshot@example.invalid")
            (child / ".gitattributes").write_text(
                "payload.txt filter=mask\n", encoding="utf-8"
            )
            (child / "payload.txt").write_text("base\n", encoding="utf-8")
            self.git(child, "config", "filter.mask.clean", "sed 's/.*/MASKED/'")
            self.git(child, "config", "filter.mask.required", "true")
            self.git(child, "add", ".gitattributes", "payload.txt")
            self.git(child, "add", "--renormalize", "payload.txt")
            self.git(child, "commit", "-qm", "child filter baseline")

            repo, _ = self.make_repo(root)
            subprocess.run(
                [
                    "git",
                    "-c",
                    "protocol.file.allow=always",
                    "-C",
                    str(repo),
                    "submodule",
                    "add",
                    "-q",
                    str(child),
                    "vendor/child",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.git(repo, "commit", "-qam", "add filtered submodule")
            base = self.git(repo, "rev-parse", "HEAD")
            nested = repo / "vendor" / "child"
            self.git(
                nested,
                "config",
                "filter.mask.clean",
                "sed 's/.*/MASKED/'",
            )
            self.git(nested, "config", "filter.mask.required", "true")
            (nested / "payload.txt").write_bytes(b"RAW_RUNTIME_BYTES\n")
            hidden_diff = subprocess.run(
                ["git", "-C", str(nested), "diff", "--quiet", "--", "payload.txt"],
                check=False,
            )
            self.assertEqual(hidden_diff.returncode, 0)

            with self.assertRaisesRegex(
                SNAPSHOT.SnapshotError,
                "dirty submodule raw bytes/modes are hidden",
            ):
                SNAPSHOT.create_snapshot(repo, base)

    def test_unchanged_uninitialized_submodule_is_bound_but_not_a_candidate_change(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            child = root / "child"
            child.mkdir()
            self.git(child, "init", "-q")
            self.git(child, "config", "user.name", "Snapshot Test")
            self.git(child, "config", "user.email", "snapshot@example.invalid")
            (child / "child.txt").write_text("base\n", encoding="utf-8")
            self.git(child, "add", ".")
            self.git(child, "commit", "-qm", "child base")

            repo, _ = self.make_repo(root)
            subprocess.run(
                [
                    "git",
                    "-c",
                    "protocol.file.allow=always",
                    "-C",
                    str(repo),
                    "submodule",
                    "add",
                    "-q",
                    str(child),
                    "vendor/child",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.git(repo, "commit", "-qam", "add submodule")
            base = self.git(repo, "rev-parse", "HEAD")
            self.git(repo, "submodule", "deinit", "-f", "--", "vendor/child")
            nested = repo / "vendor" / "child"
            self.assertTrue(nested.is_dir())
            self.assertFalse((nested / ".git").exists())

            snapshot = SNAPSHOT.create_snapshot(repo, base)

        self.assertEqual(snapshot["manifest"]["candidate_changed_paths"], [])
        self.assertEqual(
            snapshot["manifest"]["index_state"]["submodules"][0]["state"],
            "UNINITIALIZED",
        )

    def test_uninitialized_submodule_with_residual_bytes_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            child = root / "child"
            child.mkdir()
            self.git(child, "init", "-q")
            self.git(child, "config", "user.name", "Snapshot Test")
            self.git(child, "config", "user.email", "snapshot@example.invalid")
            (child / "child.txt").write_text("base\n", encoding="utf-8")
            self.git(child, "add", ".")
            self.git(child, "commit", "-qm", "child base")

            repo, _ = self.make_repo(root)
            subprocess.run(
                [
                    "git",
                    "-c",
                    "protocol.file.allow=always",
                    "-C",
                    str(repo),
                    "submodule",
                    "add",
                    "-q",
                    str(child),
                    "vendor/child",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.git(repo, "commit", "-qam", "add submodule")
            base = self.git(repo, "rev-parse", "HEAD")
            self.git(repo, "submodule", "deinit", "-f", "--", "vendor/child")
            nested = repo / "vendor" / "child"
            (nested / "opaque.bin").write_bytes(b"unbound bytes")

            with self.assertRaisesRegex(
                SNAPSHOT.SnapshotError,
                "uninitialized submodule directory contains unbound files",
            ):
                SNAPSHOT.create_snapshot(repo, base)

    def test_invalid_root_exclusion_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            with self.assertRaises(SNAPSHOT.SnapshotError):
                SNAPSHOT.create_snapshot(repo, base, exclusions=["../outside"])

    def test_change_between_internal_captures_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, base = self.make_repo(Path(tmpdir))
            original = SNAPSHOT._capture_state
            calls = 0

            def mutating_capture(*args, **kwargs):
                nonlocal calls
                result = original(*args, **kwargs)
                calls += 1
                if calls == 1:
                    (repo / "tracked.txt").write_text(
                        "changed-between-captures\n", encoding="utf-8"
                    )
                return result

            SNAPSHOT._capture_state = mutating_capture
            try:
                with self.assertRaisesRegex(SNAPSHOT.SnapshotError, "changed during snapshot"):
                    SNAPSHOT.create_snapshot(repo, base)
            finally:
                SNAPSHOT._capture_state = original


if __name__ == "__main__":
    unittest.main()
