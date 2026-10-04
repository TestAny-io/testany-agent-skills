"""Exercise relocated package entry points and lifecycle failures with isolated records."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

PLUGIN = Path(__file__).resolve().parents[2]


def copy_package(destination: Path) -> None:
    manifest = json.loads((PLUGIN / "workflow-package.json").read_text())
    for relative in ["workflow-package.json", *manifest["files"]]:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(PLUGIN / relative, target)


class WorkflowRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="workflow-lifecycle-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / "新 installation"
        copy_package(self.package)
        self.state = self.root / "project/engineering/state.json"
        self.state.parent.mkdir(parents=True)
        self.entry = self.root / "project/workflow-entry.json"
        self.record = {"task_id": "enterprise", "question": "Why did restore fail?",
                       "binding": "candidate-a", "completed": ["unit: passed"],
                       "open": ["integration: not run"], "next_action": "probe actual consumer",
                       "evidence": ["record.md#attempt-1"]}
        self.save({"resume": self.record, "history": "HISTORY_MUST_NOT_BE_OUTPUT" * 5000})

    def save(self, value):
        self.state.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def run_cli(self, script, *args, code=0, budget=6144):
        environment = dict(os.environ)
        environment.pop("PYTHONPATH", None)
        result = subprocess.run([sys.executable, str(self.package / script), *map(str, args)],
                                cwd=self.root, env=environment, capture_output=True)
        self.assertEqual(result.returncode, code, result.stderr.decode(errors="replace"))
        self.assertLessEqual(len(result.stdout), budget)
        self.assertLessEqual(len(result.stderr), budget)
        raw = result.stderr if code == 2 else result.stdout
        self.assertNotIn(b"HISTORY_MUST_NOT_BE_OUTPUT", raw)
        return json.loads(raw)

    def workflow(self, *args, **kwargs):
        return self.run_cli("scripts/workflow_context.py", *args, **kwargs)

    def bind(self, task="enterprise", role="writer", state=None, pointer="/resume", pin=None, code=0):
        args = ["bind", "--entry", self.entry, "--role", role, "--task", task,
                "--state", state or self.state, "--pointer", pointer]
        if pin:
            args += ["--expected-entry-sha256", pin]
        return self.workflow(*args, code=code)

    def resume(self, task="enterprise", role="writer", *args, code=0):
        return self.workflow("resume", "--entry", self.entry, "--role", role, "--task", task, *args, code=code)

    def test_package_relocation_refresh_and_compatibility_entry(self):
        first = self.workflow("check")
        self.assertEqual(first["status"], "PACKAGE_OK")
        self.bind()
        moved = self.root / "refreshed package"
        copy_package(moved)
        shutil.rmtree(self.package)  # No old install is available to import.
        self.package = moved
        resumed = self.resume()
        self.assertEqual(resumed["package"]["package_sha256"], first["package_sha256"])
        self.assertEqual(resumed["selections"][3]["value"], ["integration: not run"])
        selected = self.run_cli("skills/code-reviewer/scripts/read_machine_context.py", self.state,
                                "--pointer", "/resume/question")
        self.assertEqual(selected["selections"][0]["value"], self.record["question"])

    def test_dependencies_missing_or_modified_fail_without_old_source_fallback(self):
        reader = self.package / "scripts/context_json.py"
        original = reader.read_bytes()
        reader.unlink()
        missing = self.workflow("check", code=2)
        self.assertEqual(missing["status"], "UNAVAILABLE")
        self.run_cli("skills/code-reviewer/scripts/read_machine_context.py", self.state, code=2)
        reader.write_text("broken syntax )\n")
        self.workflow("check", code=2)
        self.run_cli("skills/code-reviewer/scripts/read_machine_context.py", self.state, code=2)
        reader.write_bytes(original + b"\n# accidental overwrite\n")
        self.assertIn("changed package", self.workflow("check", code=2)["error"])
        shutil.copyfile(PLUGIN / "scripts/context_json.py", reader)
        self.assertEqual(self.workflow("check")["status"], "PACKAGE_OK")

    def test_switch_and_return_preserve_other_role_and_engineering_records(self):
        original = self.state.read_bytes()
        bound = self.bind()
        reviewer = self.bind(role="reviewer", pin=bound["entry_sha256"])
        community = self.root / "project/community.json"
        community.write_text(json.dumps({"active": {**self.record, "task_id": "community",
                                                     "open": ["C2: failed permission check"]}}))
        self.resume(task="community", code=2)
        switched = self.bind(task="community", state=community, pointer="/active", pin=reviewer["entry_sha256"])
        selected = self.resume(task="community")
        self.assertEqual(selected["selections"][3]["value"], ["C2: failed permission check"])
        self.assertEqual(self.resume(role="reviewer")["task_id"], "enterprise")
        self.bind(pin=switched["entry_sha256"])
        self.assertEqual(self.resume()["selections"][3]["value"], ["integration: not run"])
        self.assertEqual(self.state.read_bytes(), original)
        self.assertLess(self.entry.stat().st_size, 700)
        self.assertNotIn("completed", json.loads(self.entry.read_text()))

    def test_stale_binding_pin_and_busy_lock_cannot_overwrite(self):
        first = self.bind()
        second = self.bind(role="reviewer", pin=first["entry_sha256"])
        before = self.entry.read_bytes()
        self.bind(pin=first["entry_sha256"], code=2)
        self.assertEqual(self.entry.read_bytes(), before)
        lock = self.entry.with_name(self.entry.name + ".lock")
        lock.write_text("another writer")
        self.bind(pin=second["entry_sha256"], code=2)
        self.assertEqual(lock.read_text(), "another writer")
        self.assertEqual(self.entry.read_bytes(), before)

    def test_record_identity_change_or_missing_fields_not_stale_success(self):
        self.bind()
        self.save({"resume": {**self.record, "task_id": "other"}})
        self.assertIn("TARGET_MISMATCH", self.resume(code=2)["error"])
        record = dict(self.record)
        del record["open"]
        self.save({"resume": record})
        selected = self.resume(code=1)
        self.assertFalse(selected["complete"])
        self.assertTrue(selected["selections"][3]["missing"])
        self.assertEqual(selected["selections"][4]["value"], record["next_action"])

    def test_repeated_field_flags_and_new_evidence_are_read(self):
        self.bind()
        self.save({"resume": {**self.record, "open": ["new counterevidence"], "judgment": "approval withdrawn"}})
        selected = self.resume("enterprise", "writer", "--field", "open", "--field", "judgment")
        self.assertEqual([r["value"] for r in selected["selections"]], [["new counterevidence"], "approval withdrawn"])
        self.resume("enterprise", "writer", "--field", "open", "--field", "open", code=2)

    def test_long_resume_is_partial_without_dropping_open_items(self):
        self.record["open"] = ["risk-" + str(i) + ":未做" * 30 for i in range(40)]
        self.save({"resume": self.record})
        self.bind()
        result = self.resume()
        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(result["selections"][3]["count"], 40)
        self.assertTrue(result["selections"][3]["value_omitted"])
        full = self.read_chunks("/resume/open")
        self.assertEqual(json.loads(full), self.record["open"])

    def test_explicit_medium_field_uses_available_budget_without_extra_round_trip(self):
        self.record["open"] = "未解决" * 180
        self.save({"resume": self.record})
        self.bind()
        self.assertTrue(self.resume()["selections"][3]["value_omitted"])
        selected = self.resume("enterprise", "writer", "--field", "open")
        self.assertTrue(selected["complete"])
        self.assertEqual(selected["selections"][0]["value"], self.record["open"])

    def read_chunks(self, pointer):
        args = [self.state, "--pointer", pointer, "--chunk-offset", "0", "--max-bytes", "1800"]
        chunks = []
        end = 0
        for _ in range(100):
            result = self.run_cli("scripts/context_json.py", *args, budget=1800)
            row = result["selections"][0]
            self.assertEqual(row["start"], end)
            end = row["end"]
            chunks.append(row["chunk"])
            if row["field_end"]:
                if len(chunks) > 1:
                    self.assertFalse(result["complete"])
                return "".join(chunks)
            args = row["next_args"]
        self.fail("continuation did not finish")

    def test_unicode_and_escaped_chunks_reassemble_exactly(self):
        value = ('中文\\quote"\n😀' * 80)
        self.save({"value": value})
        self.assertEqual(self.read_chunks("/value"), value)

    def test_continuation_rejects_changed_source_and_missing_pin(self):
        self.save({"value": "large" * 1000})
        first = self.run_cli("scripts/context_json.py", self.state, "--pointer", "/value",
                             "--chunk-offset", "0", "--max-bytes", "1800", budget=1800)
        args = first["selections"][0]["next_args"]
        self.save({"value": "changed" * 1000})
        self.run_cli("scripts/context_json.py", *args, code=2)
        self.run_cli("scripts/context_json.py", self.state, "--pointer", "/value", "--chunk-offset", "2", code=2)

    def test_corrupt_state_and_missing_record_cannot_bind(self):
        for value in ('{"resume":{},"resume":{}}', '{"resume":NaN}', '{}'):
            self.state.write_text(value)
            self.bind(code=2)
            self.assertFalse(self.entry.exists())

    def test_project_and_package_move_together_keep_relative_state_binding(self):
        self.bind()
        moved = self.root / "other project"
        shutil.move(self.entry.parent, moved)
        self.entry = moved / "workflow-entry.json"
        result = self.resume()
        self.assertTrue(Path(result["source"]["path"]).is_relative_to(moved.resolve()))

    @unittest.skipUnless(shutil.which("node"), "Node is required for offline browser VM lifecycle tests")
    def test_browser_bootstrap_reset_failures_and_notices(self):
        result = subprocess.run(["node", "--input-type=commonjs", "-", str(self.package / "scripts/browser_context.js")],
                                input=BROWSER_TEST, text=True, capture_output=True, cwd=self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "browser lifecycle passed")


BROWSER_TEST = r'''
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');
const boot = () => {const c = vm.createContext({TextEncoder}); vm.runInContext(source, c); return c;};
const page = '- heading "Current"\n- text "success"\n' + '- text "history"\n'.repeat(10000) + '- alert "permission denied"';
const a = {playwright:{domSnapshot: async () => page}}, b = {playwright:{domSnapshot: async () => '- heading "Other"'}};
(async () => {
  let c = boot();
  assert.equal(c.workflowRead(a).status, 'STALE');
  const selected = await c.workflowObserve(a, {find: '"Current"', before:0, after:1});
  assert.equal(selected.status, 'REGION');
  assert.equal(selected.notice_lines.length, 1);
  assert(!selected.text.includes('history'));
  assert.equal(c.workflowRead(b).status, 'STALE');
  assert.equal(c.workflowRead(a, {find:'missing'}).status, 'NOT_FOUND');
  assert.equal(c.workflowRead(a, {find:'history'}).status, 'AMBIGUOUS');
  assert(Buffer.byteLength(JSON.stringify(c.workflowRead(a, {find:'history'}))) <= 6144);
  assert.equal(c.workflowRead(a, {from:1,to:10000}).status, 'TOO_LARGE');
  assert.equal(c.workflowRead(a, {from:10003,to:10003}).text, '- alert "permission denied"');
  c.workflowInvalidate();
  assert.equal(c.workflowRead(a).status, 'STALE');
  await c.workflowObserve(a);
  a.playwright.domSnapshot = async () => {throw new Error('lost runtime');};
  assert.equal((await c.workflowObserve(a)).status, 'UNAVAILABLE');
  assert.equal(c.workflowRead(a).status, 'STALE');
  assert.equal((await c.workflowObserve({})).status, 'UNSUPPORTED');
  c = boot(); // Fresh VM models loss of definitions, not a claimed host compaction.
  assert.equal(c.workflowRead(b).status, 'STALE');
  assert.equal((await c.workflowObserve(b, {find:'Other'})).status, 'REGION');
  vm.runInContext(source, c); // Reinstalling definitions is idempotent and clears stale state.
  assert.equal(c.workflowRead(b).status, 'STALE');
  const unicode = '- heading "中文😀"\n'.repeat(200);
  const partial = c.workflowRegion(unicode, {maxBytes:1024});
  assert(Buffer.byteLength(JSON.stringify(partial)) <= 1024);
  assert(partial.matches_omitted > 0);
  console.log('browser lifecycle passed');
})().catch(error => {console.error(error); process.exitCode=1;});
'''


if __name__ == "__main__":
    unittest.main()
