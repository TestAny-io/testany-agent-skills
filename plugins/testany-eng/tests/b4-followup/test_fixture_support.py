import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import fixture_support as support


def require_local_archive(path):
    """Skip absent private integration input, never malformed input."""
    try:
        path.lstat()
    except FileNotFoundError:
        raise unittest.SkipTest("local frozen integration archive absent: " + str(path))
    if path.is_symlink() or not path.is_file():
        raise ValueError("integration archive must be a regular file: " + str(path))


def write_synthetic_archive(path, member_count=503):
    """Unit-only runtime skeleton, not a historical candidate or model evidence."""
    files = {"AGENTS.md": "SYNTHETIC UNIT ONLY", "CLAUDE.md": "SYNTHETIC UNIT ONLY",
             ".claude-plugin/marketplace.json": "{}"}
    for plugin in support.b4.PLUGINS:
        files[f"plugins/{plugin}/skills/demo/SKILL.md"] = "---\nname: demo\ndescription: synthetic unit task\n---\n"
    if member_count < len(files):
        raise ValueError("member count is smaller than the runtime skeleton")
    for index in range(member_count - len(files)):
        files[f"plugins/testany-eng/tests/synthetic-padding/{index}.txt"] = "UNIT ONLY"
    with tarfile.open(path, "w:gz") as bundle:
        for name, text in files.items():
            raw = text.encode()
            entry = tarfile.TarInfo(name)
            entry.size = len(raw)
            bundle.addfile(entry, io.BytesIO(raw))
    return support.b4.sha(path.read_bytes())


def write_session(path, agent_id, message, *, model="gpt-6-astra", effort="high", complete=True):
    """Synthetic local parser input only, never evidence of a real model run."""
    records = [
        {"type": "session_meta", "payload": {"id": agent_id, "cwd": "/synthetic-unit-only"}},
        {"type": "turn_context", "payload": {"model": model, "effort": effort}},
        {"type": "response_item", "payload": {"type": "message", "role": "user",
            "content": [{"type": "input_text", "text": message}]}},
        {"type": "response_item", "payload": {"type": "message", "role": "assistant", "channel": "analysis",
            "content": [{"type": "output_text", "text": "PRIVATE_UNIT_ANALYSIS"}]}},
        {"type": "response_item", "payload": {"type": "message", "role": "assistant", "channel": "final",
            "content": [{"type": "output_text", "text": "SYNTHETIC UNIT FINAL, NOT MODEL EVIDENCE"}]}},
    ]
    if complete:
        records.append({"type": "event_msg", "payload": {"type": "task_complete"}})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r) + "\n" for r in records), encoding="utf-8")


class FixtureSupportTests(unittest.TestCase):
    def test_optional_archive_skips_only_absence(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "archive.tar.gz"
            with self.assertRaisesRegex(unittest.SkipTest, "archive absent"):
                require_local_archive(path)
            path.symlink_to("missing-target")
            with self.assertRaises(ValueError):
                require_local_archive(path)
            path.unlink()
            path.mkdir()
            with self.assertRaises(ValueError):
                require_local_archive(path)
            path.rmdir()
            path.write_bytes(b"corrupt archive must reach the real archive validator")
            require_local_archive(path)

    def test_synthetic_archive_has_explicit_shape(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "synthetic-unit.tar.gz"
            digest = write_synthetic_archive(path)
            self.assertEqual(digest, support.b4.sha(path.read_bytes()))
            with tarfile.open(path) as bundle:
                members = bundle.getmembers()
                self.assertEqual(len(members), 503)
                self.assertTrue(all(member.isfile() for member in members))
                self.assertEqual(len({member.name for member in members}), 503)
            with self.assertRaises(ValueError):
                write_synthetic_archive(Path(temp) / "invalid.tar.gz", member_count=1)
            self.assertFalse((Path(temp) / "invalid.tar.gz").exists())

    def test_freeze_excludes_grader_and_rejects_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            archive = base / "source.tar.gz"
            files = {"AGENTS.md": "local", "CLAUDE.md": "local",
                     ".claude-plugin/marketplace.json": "{}"}
            for plugin in support.b4.PLUGINS:
                files[f"plugins/{plugin}/skills/demo/SKILL.md"] = "---\nname: demo\ndescription: demo task\n---\n"
            files["plugins/testany-eng/tests/secret.txt"] = "hidden grader"
            with tarfile.open(archive, "w:gz") as bundle:
                for name, text in files.items():
                    raw = text.encode()
                    entry = tarfile.TarInfo(name)
                    entry.size = len(raw)
                    bundle.addfile(entry, io.BytesIO(raw))
            def materials(root):
                support.b4.write_new(root / "workspace/note.txt", b"raw facts")
            batch = base / "batch"
            tasks = support.prepare(batch, "X01", "Read note", {"secret": "answer"}, materials, archive=archive)
            root = Path(tasks[0]["directory"])
            try:
                self.assertFalse((root / "expected.frozen.json").exists())
                self.assertFalse((root / "installed skills/plugins/testany-eng/tests").exists())
                self.assertTrue((root / "plugins/testany-eng/skills/demo/SKILL.md").is_file())
                self.assertEqual(tasks[0]["input_hashes"]["workspace/note.txt"], support.b4.sha(b"raw facts"))
                with self.assertRaises(FileExistsError):
                    support.prepare(batch, "X01", "Read note", {}, materials, archive=archive)
            finally:
                support.shutil.rmtree(root)

    def test_invalid_case_and_repeats_fail_before_writes(self):
        with self.assertRaises(ValueError):
            support.prepare("unused", "../bad", "request", {}, lambda _: None)
        with self.assertRaises(ValueError):
            support.prepare("unused", "X01", "request", {}, lambda _: None, repeats=True)


class PhaseCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="phase capture unit ")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.batch = self.base / "evidence batch"
        self.batch.mkdir()
        self.root = self.base / "business task"
        (self.root / "workspace").mkdir(parents=True)
        (self.root / "workspace/note.md").write_text("raw business fact")
        self.sessions = self.base / "synthetic sessions"
        self.sessions.mkdir()
        self.agent = "unit-agent"
        self.message = "Read the local fixture."
        self.receipt = {"run_key": "unit-run", "directory": str(self.root), "repeat": 1,
                        "input_hashes": {"workspace/note.md": support.b4.sha(b"raw business fact")}}
        self.persist_receipt()
        self.session = self.sessions / ("rollout-" + self.agent + ".jsonl")
        write_session(self.session, self.agent, self.message)

    def persist_receipt(self):
        (self.batch / "unit-run-receipt.json").write_text(json.dumps(self.receipt))
        (self.batch / "manifest.json").write_text(json.dumps({"runs": [self.receipt]}))

    def capture(self, **kwargs):
        return support.capture_phase(self.batch, kwargs.pop("receipt", self.receipt),
            kwargs.pop("agent_id", self.agent), self.message, "initial-complete",
            sessions_root=self.sessions, **kwargs)

    def assert_rejected(self, **kwargs):
        before = support.b4.inventory(self.batch)
        with self.assertRaises((ValueError, FileNotFoundError, FileExistsError, RuntimeError)):
            self.capture(**kwargs)
        self.assertEqual(support.b4.inventory(self.batch), before)

    def test_valid_capture_hashes_public_only_and_no_overwrite(self):
        (self.root / "workspace/alias.md").symlink_to("note.md")
        dest = self.capture()
        self.assertTrue(dest.is_relative_to(self.batch))
        self.assertEqual((dest / "workspace/alias.md").read_text(), "raw business fact")
        self.assertNotIn("PRIVATE_UNIT", (dest / "public-trace.jsonl").read_text())
        manifest = support.b4.inventory(dest)
        manifest.pop("hashes.json")
        self.assertEqual(manifest, support.read_json(dest / "hashes.json"))
        self.assert_rejected()

    def test_run_and_agent_components_are_validated_before_session_read(self):
        for value in ("/absolute", "../escape", "..", "x/y", "x\\y", "*", ""):
            with self.subTest(value=value), patch.object(support.collector, "read_public_session") as read:
                self.assert_rejected(receipt={**self.receipt, "run_key": value})
                self.assert_rejected(agent_id=value)
                read.assert_not_called()

    def test_receipt_and_manifest_identity_mismatches_have_no_output(self):
        self.assert_rejected(receipt={**self.receipt, "repeat": True})
        manifest = self.batch / "manifest.json"
        manifest.write_text(json.dumps({"runs": [{**self.receipt, "repeat": True}]}))
        self.assert_rejected()
        self.persist_receipt()
        self.assert_rejected(receipt={**self.receipt, "repeat": 2})
        self.receipt["repeat"] = 2
        (self.batch / "unit-run-receipt.json").write_text(json.dumps(self.receipt))
        self.assert_rejected()

    def test_malformed_or_duplicate_manifest_runs_have_no_output(self):
        for runs in (None, {}, [None], [self.receipt, self.receipt], []):
            with self.subTest(runs=runs):
                (self.batch / "manifest.json").write_text(json.dumps({"runs": runs}))
                self.assert_rejected()

    def test_missing_duplicate_and_unsafe_input_receipts_have_no_output(self):
        receipt = self.batch / "unit-run-receipt.json"
        receipt.unlink()
        self.assert_rejected()
        self.persist_receipt()
        receipt.write_text('{"run_key":"wrong","run_key":"unit-run"}')
        self.assert_rejected()
        self.receipt["input_hashes"] = {"../outside": "a" * 64}
        self.persist_receipt()
        self.assert_rejected()

    def test_receipt_symlink_rejected_before_session_read(self):
        receipt = self.batch / "unit-run-receipt.json"
        saved = self.base / "saved-receipt.json"
        receipt.rename(saved)
        receipt.symlink_to(saved)
        with patch.object(support.collector, "read_public_session") as read:
            # Inventory intentionally rejects an out-of-batch link, so check absence directly.
            with self.assertRaises(ValueError):
                self.capture()
            read.assert_not_called()
            self.assertFalse((self.batch / "phases").exists())

    def test_batch_root_and_phase_parent_symlinks_are_rejected(self):
        alias = self.base / "batch alias"
        alias.symlink_to(self.batch, target_is_directory=True)
        original = self.batch
        self.batch = alias
        with self.assertRaises(ValueError):
            self.capture()
        self.batch = original
        root_alias = self.base / "root alias"
        root_alias.symlink_to(self.root, target_is_directory=True)
        self.assert_rejected(receipt={**self.receipt, "directory": str(root_alias)})
        outside = self.base / "outside"
        outside.mkdir()
        (self.batch / "phases").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.capture()
        self.assertEqual(list(outside.iterdir()), [])

    def test_root_overlap_and_out_of_task_links_have_no_output(self):
        for root in (self.batch, self.base, self.batch / "inner"):
            root.mkdir(exist_ok=True)
            self.assert_rejected(receipt={**self.receipt, "directory": str(root)})
        link = self.root / "workspace/bad"
        for target in (self.base, "absent", "."):
            link.symlink_to(target)
            self.assert_rejected()
            link.unlink()

    def test_session_symlink_and_ancestor_alias_rejected_before_read(self):
        other = self.base / "saved-session.jsonl"
        self.session.rename(other)
        self.session.symlink_to(other)
        with patch.object(support.collector, "read_public_session") as read:
            self.assert_rejected()
            read.assert_not_called()
        alias = self.base / "sessions alias"
        alias.symlink_to(self.sessions, target_is_directory=True)
        self.sessions = alias
        self.assert_rejected()

    def test_missing_ambiguous_incomplete_and_wrong_session_have_no_output(self):
        self.session.unlink()
        self.assert_rejected()
        write_session(self.session, self.agent, self.message)
        extra = self.sessions / ("other-" + self.agent + ".jsonl")
        extra.write_bytes(self.session.read_bytes())
        self.assert_rejected()
        extra.unlink()
        write_session(self.session, "different-agent", self.message)
        self.assert_rejected()
        write_session(self.session, self.agent, self.message, complete=False)
        self.assert_rejected()

    def test_case_specific_preflight_runs_before_any_output(self):
        def reject(_):
            raise ValueError("case-specific preflight failure")
        self.assert_rejected(validate_session=reject)

    def test_copy_failure_has_no_hash_completion_and_cannot_be_overwritten(self):
        with patch.object(support.shutil, "copytree", side_effect=OSError("copy failure")):
            with self.assertRaises(OSError):
                self.capture()
        dest = self.batch / "phases/unit-run/initial-complete"
        self.assertTrue(dest.exists())
        self.assertFalse((dest / "hashes.json").exists())
        self.assert_rejected()


if __name__ == "__main__":
    unittest.main()
