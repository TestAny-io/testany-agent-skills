"""Public CLI regressions for compact artifacts and real Git/tar/evidence inputs."""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[2] / "skills/code-reviewer/scripts"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class ReviewArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="review-artifact-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.outputs = self.root / "outputs"
        self.outputs.mkdir()
        self.git("init", "-q")
        self.git("config", "user.name", "Artifact Test")
        self.git("config", "user.email", "artifact@example.invalid")
        self.git("config", "core.filemode", "true")
        (self.repo / "source.txt").write_bytes(b"approved\x00\xff\n")
        (self.repo / "source.txt").chmod(0o644)
        (self.repo / "run.sh").write_text("#!/bin/sh\nexit 0\n")
        (self.repo / "run.sh").chmod(0o755)
        (self.repo / "link").symlink_to("source.txt")
        self.base = self.commit()
        self.serial = 0

    def git(self, *args, repo=None):
        return subprocess.run(["git", "-C", str(repo or self.repo), *args], check=True, capture_output=True).stdout.decode().strip()

    def commit(self):
        self.git("add", "-A")
        self.git("commit", "--allow-empty", "-qm", "candidate")
        return self.git("rev-parse", "HEAD")

    def run_tool(self, tool, *args, code=0):
        env = {**os.environ, "TMPDIR": str(self.outputs)}
        run = subprocess.run([sys.executable, str(SCRIPTS / tool), *map(str, args)], capture_output=True, env=env)
        self.assertEqual(run.returncode, code, run.stderr.decode(errors="replace"))
        if "--full-json" not in args:
            self.assertLessEqual(len(run.stdout), 4096)
            self.assertLessEqual(len(run.stderr), 4096)
        return json.loads(run.stdout if code != 2 else run.stderr)

    def capture(self, *args, repo=None, code=0):
        return self.run_tool("snapshot_worktree.py", "--repo", repo or self.repo, "--base", self.base, *args, code=code)

    def save_manifest(self, entries):
        self.serial += 1
        path = self.root / f"manifest-{self.serial}.json"
        path.write_text(json.dumps({"entries": entries}))
        return path

    def entry(self, path, label=None):
        return {"path": label or path.name, "bytes": path.stat().st_size, "sha256": sha(path)}

    def manifest(self, path, root, *args, code=0):
        return self.run_tool("verify_review_evidence.py", "manifest", "--manifest", path,
                             "--manifest-sha256", sha(path), "--root", root, *args, code=code)

    def archive(self, path, capture, *args, code=0):
        return self.run_tool("verify_review_evidence.py", "archive", "--archive", path, "--archive-sha256", sha(path),
                             "--snapshot", capture["artifact_path"], "--snapshot-sha256", capture["snapshot_sha256"], *args, code=code)

    def make_tar(self, *, prefix="", mode_change=None, extra=None, skip=None):
        self.serial += 1
        path = self.root / f"source-{self.serial}.tar"
        with tarfile.open(path, "w") as archive:
            for file in sorted(self.repo.iterdir()):
                if file.name == ".git" or file.name == skip:
                    continue
                item = archive.gettarinfo(str(file), arcname=prefix + file.name)
                if mode_change:
                    item.mode = mode_change(file.name, item.mode)
                if item.isfile():
                    with file.open("rb") as stream:
                        archive.addfile(item, stream)
                else:
                    archive.addfile(item)
            if extra:
                item, data = extra
                archive.addfile(item, io.BytesIO(data))
        return path

    def test_large_snapshot_defaults_to_bounded_summary_and_complete_immutable_artifact(self):
        for i in range(300):
            (self.repo / f"new-{i:04d}-文.txt").write_text("candidate")
        before = self.git("status", "--porcelain=v1")
        result = self.capture()
        artifact = Path(result["artifact_path"])
        payload = json.loads(artifact.read_bytes())
        self.assertEqual(result["result"], "CAPTURED")
        self.assertNotIn("manifest", result)
        self.assertGreater(artifact.stat().st_size, 40000)
        self.assertEqual(result["changed_paths_count"], 300)
        self.assertGreater(result["changed_paths_omitted"], 0)
        self.assertEqual(len(payload["manifest"]["candidate_changed_paths"]), 300)
        canonical = json.dumps(payload["manifest"], ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()
        self.assertEqual(hashlib.sha256(canonical).hexdigest(), result["snapshot_sha256"])
        self.assertEqual(sha(artifact), result["artifact_sha256"])
        self.assertFalse(artifact.is_relative_to(self.repo))
        self.assertEqual(before, self.git("status", "--porcelain=v1"))

    def test_explicit_full_json_preserves_legacy_digest_and_shape(self):
        compact = self.capture()
        full = self.capture("--full-json")
        self.assertEqual(set(full), {"snapshot_sha256", "manifest"})
        self.assertEqual(full["snapshot_sha256"], compact["snapshot_sha256"])
        self.assertEqual(full["manifest"], json.loads(Path(compact["artifact_path"]).read_bytes())["manifest"])

    def test_final_compare_detects_raw_mode_drift_even_without_git_diff(self):
        first = self.capture()
        args = ["--compare", first["artifact_path"], "--compare-sha256", first["snapshot_sha256"]]
        self.assertEqual(self.capture(*args)["result"], "MATCH")
        (self.repo / "source.txt").chmod(0o664)
        self.assertEqual(self.git("diff", "--name-only"), "")
        drift = self.capture(*args, code=1)
        self.assertEqual(drift["result"], "DRIFT")
        self.assertIn("source.txt", drift["changed_paths"])

    def test_compare_catches_index_and_external_baseline_changes(self):
        baseline = self.root / "approval.txt"
        baseline.write_text("approved")
        (self.repo / "source.txt").write_text("candidate")
        first = self.capture("--mutable-baseline", baseline)
        self.git("add", "source.txt")
        args = ["--mutable-baseline", baseline, "--compare", first["artifact_path"], "--compare-sha256", first["snapshot_sha256"]]
        self.assertEqual(self.capture(*args, code=1)["result"], "DRIFT")
        baseline.write_text("changed")
        self.assertIn(str(baseline), self.capture(*args, code=1)["changed_paths"])

    def test_unpinned_or_tampered_comparison_never_returns_match(self):
        first = self.capture()
        self.capture("--compare", first["artifact_path"], code=2)
        path = Path(first["artifact_path"])
        payload = json.loads(path.read_bytes())
        payload["manifest"]["head_commit"] = "0" * 40
        payload["snapshot_sha256"] = hashlib.sha256(json.dumps(payload["manifest"], ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        path.write_text(json.dumps(payload))
        self.capture("--compare", path, "--compare-sha256", first["snapshot_sha256"], code=2)

    def test_snapshot_output_refuses_overwrite_checkout_and_symlink(self):
        path = self.root / "snapshot.json"
        self.capture("--output", path)
        original = path.read_bytes()
        self.capture("--output", path, code=2)
        self.assertEqual(path.read_bytes(), original)
        self.capture("--output", self.repo / "result.json", code=2)
        self.assertFalse((self.repo / "result.json").exists())
        link = self.root / "linked-output"
        link.symlink_to(self.root / "new-target")
        self.capture("--output", link, code=2)
        self.assertFalse((self.root / "new-target").exists())

    def test_snapshot_errors_with_long_unicode_paths_stay_bounded(self):
        self.capture("--output", self.root / ("\U0001f680" * 400), code=2)

    def test_binding_many_changes_preserves_full_receipt_with_bounded_stdout(self):
        for i in range(200):
            (self.repo / f"new-{i:04d}.txt").write_text("new")
        current = self.commit()
        result = self.run_tool("verify_candidate_binding.py", "--repo", self.repo, "--prior-commit", self.base, "--commit", current, code=1)
        self.assertEqual(result["changed_paths_count"], 200)
        self.assertGreater(result["changed_paths_omitted"], 0)
        receipt = Path(result["receipt_path"])
        self.assertEqual(sha(receipt), result["receipt_sha256"])
        self.assertEqual(len(json.loads(receipt.read_bytes())["changes"]), 200)

    def test_manifest_checks_relative_and_explicit_external_files(self):
        evidence = self.root / "evidence"
        evidence.mkdir()
        log = evidence / "result.log"
        log.write_text("raw result")
        external = self.root / "review.json"
        external.write_text("independent result")
        manifest = self.save_manifest([self.entry(log), self.entry(external, str(external))])
        self.manifest(manifest, evidence, code=2)
        result = self.manifest(manifest, evidence, "--allow-external-file", external)
        self.assertEqual(result["result"], "MATCH")
        self.assertFalse(result["approval_granted"])
        receipt = json.loads(Path(result["receipt_path"]).read_bytes())
        self.assertIn("manifest_completeness", receipt["unverified_by_tool"])

    def test_manifest_reports_missing_and_changed_bytes_without_hiding_failures(self):
        evidence = self.root / "evidence"
        evidence.mkdir()
        a, b = evidence / "a", evidence / "b"
        a.write_text("one")
        b.write_text("two")
        manifest = self.save_manifest([self.entry(a), self.entry(b)])
        a.write_text("bad")
        b.unlink()
        result = self.manifest(manifest, evidence, code=1)
        self.assertEqual(result["failed_paths"], ["a", "b"])
        self.assertEqual(result["files_checked"], 2)

    def test_manifest_rejects_traversal_duplicates_symlink_escape_and_wrong_pin(self):
        evidence = self.root / "evidence"
        evidence.mkdir()
        log = evidence / "log"
        log.write_text("result")
        for entries in ([self.entry(log, "../evidence/log")], [self.entry(log), self.entry(log)]):
            with self.subTest(entries=entries):
                self.manifest(self.save_manifest(entries), evidence, code=2)
        (evidence / "outside").symlink_to(self.repo, target_is_directory=True)
        self.manifest(self.save_manifest([self.entry(self.repo / "source.txt", "outside/source.txt")]), evidence, code=2)
        manifest = self.save_manifest([self.entry(log)])
        self.run_tool("verify_review_evidence.py", "manifest", "--manifest", manifest, "--manifest-sha256", "0" * 64,
                      "--root", evidence, code=2)

    def map_manifest(self, manifest_format, entries):
        self.serial += 1
        path = self.root / f"map-{self.serial}.json"
        field = "evidence" if manifest_format == "evidence-map" else "source_files"
        path.write_text(json.dumps({field: entries, "external_evidence": {"not-selected": "not-a-proof"}}))
        return path

    def test_explicit_map_formats_check_real_files_without_adapters_or_invented_size(self):
        path = self.repo / "source.txt"
        for fmt in ("evidence-map", "source-files"):
            with self.subTest(format=fmt):
                declared = {"size": path.stat().st_size, "sha256": sha(path)} if fmt == "evidence-map" else sha(path)
                manifest = self.map_manifest(fmt, {path.name: declared})
                self.manifest(manifest, self.repo, code=2)  # No guessing/default fallback.
                result = self.manifest(manifest, self.repo, "--format", fmt)
                receipt = json.loads(Path(result["receipt_path"]).read_bytes())
                fields = ["size", "sha256"] if fmt == "evidence-map" else ["sha256"]
                self.assertEqual(result["verified_fields"], fields)
                self.assertEqual(result["verification_scope"], "listed_files_only")
                self.assertEqual(result["files_checked"], 1)
                self.assertFalse(result["approval_granted"])
                self.assertEqual(set(receipt["checks"][0]["expected"]), set(fields))
                self.assertEqual(set(receipt["checks"][0]["actual"]), set(fields))
                self.assertIn("unselected_manifest_fields", receipt["unverified_by_tool"])
                self.assertIn("source_path_set_and_modes", receipt["unverified_by_tool"])
                self.run_tool("verify_review_evidence.py", "manifest", "--manifest", manifest,
                              "--manifest-sha256", "0" * 64, "--root", self.repo, "--format", fmt, code=2)

    def test_map_formats_detect_changed_and_missing_files(self):
        a, b = self.repo / "source.txt", self.repo / "run.sh"
        manifests = []
        for fmt in ("evidence-map", "source-files"):
            entries = {p.name: ({"size": p.stat().st_size, "sha256": sha(p)} if fmt == "evidence-map" else sha(p)) for p in (a, b)}
            manifests.append((fmt, self.map_manifest(fmt, entries)))
        a.write_bytes(b"unreviewed")
        b.unlink()
        for fmt, manifest in manifests:
            with self.subTest(format=fmt):
                result = self.manifest(manifest, self.repo, "--format", fmt, code=1)
                self.assertEqual(result["result"], "MISMATCH")
                self.assertEqual(set(result["failed_paths"]), {a.name, b.name})

    def test_map_formats_reject_bad_shape_size_and_digest(self):
        invalid = [("evidence-map", {}), ("source-files", {}),
                   ("evidence-map", {"source.txt": {"sha256": sha(self.repo / "source.txt")}}),
                   ("evidence-map", {"source.txt": {"size": True, "sha256": "a" * 64}}),
                   ("evidence-map", {"source.txt": "a" * 64}),
                   ("source-files", {"source.txt": {"sha256": "a" * 64}}),
                   ("source-files", {"source.txt": "not-a-hash"})]
        for fmt, entries in invalid:
            with self.subTest(format=fmt, entries=entries):
                self.manifest(self.map_manifest(fmt, entries), self.repo, "--format", fmt, code=2)
        path = self.repo / "source.txt"
        incorrect_size = self.map_manifest("evidence-map", {path.name: {"size": 0, "sha256": sha(path)}})
        self.assertEqual(self.manifest(incorrect_size, self.repo, "--format", "evidence-map", code=1)["result"], "MISMATCH")
        self.manifest(self.save_manifest([{"path": path.name, "sha256": sha(path)}]), self.repo, code=2)

    def test_map_formats_preserve_path_boundaries_and_reject_duplicate_json_keys(self):
        file = self.repo / "source.txt"
        (self.root / "outside.txt").write_bytes(file.read_bytes())
        (self.repo / "escaped").symlink_to(self.root, target_is_directory=True)
        for fmt in ("evidence-map", "source-files"):
            declared = {"size": file.stat().st_size, "sha256": sha(file)} if fmt == "evidence-map" else sha(file)
            for label in ("../repo/source.txt", "escaped/outside.txt"):
                with self.subTest(format=fmt, label=label):
                    self.manifest(self.map_manifest(fmt, {label: declared}), self.repo, "--format", fmt, code=2)
            manifest = self.map_manifest(fmt, {str(file): declared})
            self.manifest(manifest, self.repo, "--format", fmt, code=2)
            self.manifest(manifest, self.repo, "--format", fmt, "--allow-external-file", file)
            field = "evidence" if fmt == "evidence-map" else "source_files"
            item = json.dumps(declared)
            manifest.write_text('{"' + field + '":{"source.txt":' + item + ',"source.txt":' + item + '}}')
            result = self.manifest(manifest, self.repo, "--format", fmt, code=2)
            self.assertEqual(result["result"], "UNVERIFIED")

    def test_git_archive_group_write_mode_is_not_false_source_drift(self):
        first = self.capture()
        archive = self.make_tar(mode_change=lambda name, mode: mode | 0o020)
        result = self.archive(archive, first)
        self.assertEqual(result["result"], "MATCH")
        receipt = json.loads(Path(result["receipt_path"]).read_bytes())
        self.assertIn("checkout_raw_permission_bits", receipt["unverified_by_tool"])

    def test_archive_missing_extra_and_execute_bit_change_fail(self):
        first = self.capture()
        extra = tarfile.TarInfo("unreviewed.txt")
        extra.size = 3
        for archive in (self.make_tar(skip="source.txt"), self.make_tar(extra=(extra, b"new")),
                        self.make_tar(mode_change=lambda name, mode: mode | 0o111 if name == "source.txt" else mode)):
            with self.subTest(archive=archive):
                self.assertEqual(self.archive(archive, first, code=1)["result"], "MISMATCH")

    def test_archive_different_raw_bytes_and_symlink_targets_fail(self):
        first = self.capture()
        (self.repo / "source.txt").write_text("unreviewed")
        (self.repo / "link").unlink()
        (self.repo / "link").symlink_to("run.sh")
        self.assertEqual(self.archive(self.make_tar(), first, code=1)["failed_paths"], ["link", "source.txt"])

    def test_archive_unsafe_duplicate_and_hardlink_entries_are_unverified_without_extraction(self):
        first = self.capture()
        for name, kind in (("../outside", tarfile.REGTYPE), ("source.txt", tarfile.REGTYPE), ("hard", tarfile.LNKTYPE)):
            with self.subTest(name=name):
                item = tarfile.TarInfo(name)
                item.type = kind
                item.linkname = "source.txt" if kind == tarfile.LNKTYPE else ""
                self.archive(self.make_tar(extra=(item, b"")), first, code=2)
        self.assertFalse((self.root / "outside").exists())

    def test_archive_prefix_is_explicit_and_gitlinks_are_not_silently_ignored(self):
        first = self.capture()
        archive = self.make_tar(prefix="src/")
        self.archive(archive, first, code=1)
        self.archive(archive, first, "--prefix", "src")
        self.git("update-index", "--add", "--cacheinfo", f"160000,{self.base},module")
        first = self.capture()
        self.archive(self.make_tar(), first, code=2)

    def test_source_comparison_preserves_raw_permissions_across_checkout_locations(self):
        first = self.capture()
        checkout = self.root / "tested"
        subprocess.run(["git", "clone", "-q", str(self.repo), str(checkout)], check=True)
        tested = self.capture(repo=checkout)
        args = ["source", "--snapshot", first["artifact_path"], "--snapshot-sha256", first["snapshot_sha256"],
                "--tested-snapshot", tested["artifact_path"], "--tested-snapshot-sha256", tested["snapshot_sha256"]]
        self.run_tool("verify_review_evidence.py", *args)
        (checkout / "source.txt").chmod(0o664)
        tested = self.capture(repo=checkout)
        args[-3], args[-1] = tested["artifact_path"], tested["snapshot_sha256"]
        result = self.run_tool("verify_review_evidence.py", *args, code=1)
        self.assertEqual(result["failed_paths"], ["source.txt"])


if __name__ == "__main__":
    unittest.main()
