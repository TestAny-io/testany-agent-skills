"""Local fixture checks, NOT model trajectories or review evidence."""

import importlib.util
import copy
from datetime import datetime, timezone
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
import code_review_case as case
from test_fixture_support import require_local_archive, write_session, write_synthetic_archive


def queue_type(repo):
    spec = importlib.util.spec_from_file_location("isolated_queue", repo / case.SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.JobQueue


class CaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        case.OUTPUT.mkdir(parents=True, exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(prefix="unit fixture ", dir=case.OUTPUT)
        cls.home = Path(cls.temp.name)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def new_repo(self):
        root = Path(tempfile.mkdtemp(prefix="git task ", dir=self.home))
        case.materialize(root)
        return root / "workspace"

    def gate(self, repo):
        return subprocess.run([sys.executable, "-B", "-m", "unittest", "discover", "-s", "tests", "-v"],
                              cwd=repo, capture_output=True, text=True)

    def test_reproducible_real_commits_and_complete_range(self):
        first, second = self.new_repo(), self.new_repo()
        for ref in ("review-base", "review-initial", "review-initial^{tree}"):
            self.assertEqual(case.git(first, "rev-parse", ref), case.git(second, "rev-parse", ref))
        info = json.loads((first / ".review/input.json").read_bytes())
        self.assertEqual(case.git(first, "rev-parse", "HEAD^").decode().strip(), info["review_root_base"])
        self.assertEqual(bytes.fromhex(info["manifest_raw_hex"]),
                         b"M\x00job_queue.py\x00M\x00tests/test_job_queue.py\x00")
        self.assertEqual(case.git(first, "status", "--porcelain"), b"")
        self.assertEqual(case.git(first, "remote"), b"")
        self.assertEqual(case.git(first, "for-each-ref", "refs/replace"), b"")
        self.assertFalse((first / ".git/info/grafts").exists())
        self.assertEqual(list((first / ".git/hooks").iterdir()), [])
        for name, approved in info["approved_baselines"].items():
            self.assertEqual(case.sha(case.git(first, "show", info["review_root_base"] + ":" + name)),
                             approved["sha256"])

    def test_git_ignores_inherited_overrides(self):
        with patch.dict(os.environ, {"GIT_AUTHOR_NAME": "NOT THE OWNER", "GIT_CONFIG_COUNT": "1",
                                    "GIT_CONFIG_KEY_0": "commit.gpgSign", "GIT_CONFIG_VALUE_0": "true",
                                    "GIT_DIR": "/does/not/exist", "GIT_WORK_TREE": "/does/not/exist"}):
            repo = self.new_repo()
        identity, timestamp = case.git(repo, "show", "-s", "--format=%an|%ae|%aI", "HEAD").decode().strip().rsplit("|", 1)
        self.assertEqual(identity, "Local Fixture Owner|fixture@example.invalid")
        self.assertEqual(datetime.fromisoformat(timestamp.replace("Z", "+00:00")),
                         datetime(2026, 9, 14, tzinfo=timezone.utc))

    def test_author_gate_green_but_real_batch_loses_failed_job(self):
        repo = self.new_repo()
        result = self.gate(repo)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Ran 4 tests", result.stderr)
        queue = queue_type(repo)(["a", "b", "c"])
        calls = []
        error = RuntimeError("transient")

        def handler(job):
            calls.append(job)
            if job == "b":
                raise error
            return job.upper()

        with self.assertRaises(RuntimeError) as caught:
            queue.run_batch(handler, 3)
        self.assertIs(caught.exception, error)
        self.assertEqual(calls, ["a", "b"])
        self.assertEqual(queue.pending, ["c"])
        self.assertNotEqual(queue.pending, ["b", "c"])
        self.assertEqual(queue.run_batch(str.upper, 3), ["C"])

    def test_recipe_fixes_real_helper_and_negative_positive_recovery(self):
        repo = self.new_repo()
        old = case.git(repo, "rev-parse", "HEAD").decode().strip()
        frozen = case.recipe()
        # Unit-only application: no synthetic reviewer report or model score is created.
        for item in frozen["operations"]:
            self.assertEqual(case.sha((repo / item["path"]).read_bytes()), item["before_sha256"])
            (repo / item["path"]).write_text(item["after"], encoding="utf-8")
            self.assertEqual(case.sha((repo / item["path"]).read_bytes()), item["after_sha256"])
        new = case.commit(repo, frozen["commit_message"])
        self.assertNotEqual(old, new)
        self.assertEqual(case.git(repo, "rev-parse", new + "^").decode().strip(), old)
        result = self.gate(repo)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Ran 5 tests", result.stderr)
        Queue = queue_type(repo)
        for length in range(5):
            for limit in range(6):
                for failure in range(length + 1):
                    queue, calls = Queue(range(length)), []

                    def handler(job):
                        calls.append(job)
                        if job == failure:
                            raise RuntimeError("transient")
                        return job * 10

                    completed = min(length, limit)
                    if failure < completed:
                        with self.assertRaises(RuntimeError):
                            queue.run_batch(handler, limit)
                        self.assertEqual(calls, list(range(failure + 1)))
                        self.assertEqual(queue.pending, list(range(failure, length)))
                        self.assertEqual(queue.run_next(lambda value: value), failure)
                        self.assertEqual(queue.run_batch(lambda value: value, length), list(range(failure + 1, length)))
                    else:
                        self.assertEqual(queue.run_batch(handler, limit), [x * 10 for x in range(completed)])
                        self.assertEqual(queue.pending, list(range(completed, length)))

    def test_shared_prepare_archive_isolation_and_no_dispatch(self):
        require_local_archive(case.support.DEFAULT_ARCHIVE)
        batch = self.home / "prepared"
        receipts = case.prepare_case(batch)
        self.addCleanup(lambda: [__import__("shutil").rmtree(r["directory"]) for r in receipts])
        self.assertEqual(len(receipts), 2)
        self.assertFalse(list(batch.glob("dispatch*.json")))
        self.assertFalse((batch / "phases").exists())
        case.verify_frozen(batch)
        for receipt in receipts:
            root = Path(receipt["directory"])
            self.assertIn(" ", root.name)
            self.assertFalse(root.is_relative_to(batch))
            self.assertEqual(receipt["source_archive_sha256"], case.ARCHIVE_SHA256)
            files = receipt["input_hashes"]
            self.assertFalse(any("skill-manager" in path for path in files))
            for path in files:
                self.assertNotIn("expected.frozen.json", path)
                self.assertNotIn("repair.recipe", path)
                self.assertNotIn("repair-regression", path)
                self.assertNotIn("request-delta", path)
            installed = root / "installed skills/plugins/testany-eng/skills/code-reviewer"
            for name in ("SKILL.md", "references/review-policy.yaml", "references/reviewer-checklist.md",
                         "references/scope-lock-template.md", "references/report-templates.md",
                         "references/evidence-reuse.md"):
                self.assertTrue((installed / name).is_file(), name)
            self.check_scope_script(root, installed)
            with self.assertRaises((FileNotFoundError, ValueError)):
                case.apply_repair(batch, receipt, ".review/initial/terminal.md")
            self.assertEqual(case.git(root / "workspace", "rev-parse", "HEAD"),
                             case.git(root / "workspace", "rev-parse", "review-initial"))
        self.assertEqual(json.loads((batch / "trajectory-plan.json").read_bytes())[1]["model"], "gpt-5.6-terra")
        (batch / "repair.recipe.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "drift"):
            case.verify_frozen(batch)

    def check_scope_script(self, root, installed):
        info = json.loads((root / "workspace/.review/input.json").read_bytes())
        payload = {"schema": "testany.code-reviewer.scope-lock.v1",
            "repositories": [{"repository_identity": "local/batch-queue", "review_root_base": info["review_root_base"]}],
            "approved_baselines": [{"baseline_type": "User decision",
                "exact_reference": "requirements.md@" + info["review_root_base"],
                "approval_evidence": "request.md#DEC-BATCH-1", "governs": "INV-1 through INV-4"}],
            "in_scope": ["approved run_batch and tests"], "out_of_scope": ["network", "deployment"],
            "must_not_change_or_regress": ["run_next semantics"], "architecture_budget": [],
            "verification_boundary": [{"layer": layer, "required_in_code_review": layer == "source",
                "required_gates": ["unittest"] if layer == "source" else [], "evidence_boundary": "local fixture only",
                "effect_on_code_verdict": effect} for layer, effect in (
                    ("source", "MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT"),
                    ("ci", "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"),
                    ("environment", "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"))]}
        path = root / "workspace/.review/unit-only-payload.json"
        case.save(path, payload)
        result = subprocess.run([sys.executable, "-B", str(installed / "scripts/scope_lock_digest.py"), str(path)],
                                cwd=root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        path.unlink()

    def test_wrong_archive_is_rejected_before_materialization(self):
        archive = self.home / "wrong.tar.gz"
        archive.write_bytes(b"not the approved archive")
        with self.assertRaisesRegex(ValueError, "v2"):
            case.prepare_case(self.home / "not-created", archive)
        self.assertFalse((self.home / "not-created").exists())

    def test_nonempty_workspace_is_not_overwritten(self):
        repo = self.new_repo()
        before = case.git(repo, "rev-parse", "HEAD")
        with self.assertRaisesRegex(ValueError, "empty"):
            case.materialize(repo.parent)
        self.assertEqual(case.git(repo, "rev-parse", "HEAD"), before)


class EligibilityTests(unittest.TestCase):
    """Real local Git and collector; synthetic session/report bytes, never model evidence."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eligibility unit ")
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.batch = self.home / "prepared future"
        archive = self.home / "synthetic-unit.tar.gz"
        digest = write_synthetic_archive(archive)
        # Only this unit fixture substitutes the pinned digest; production stays fail-closed.
        with patch.object(case, "ARCHIVE_SHA256", digest):
            self.receipts = case.prepare_case(self.batch, archive=archive)
        for receipt in self.receipts:
            self.addCleanup(shutil.rmtree, receipt["directory"])
            self.assertEqual(receipt["source_archive_sha256"], digest)
            self.assertFalse(any("synthetic-padding" in name for name in receipt["input_hashes"]))
        with self.assertRaisesRegex(ValueError, "v2"):
            case.prepare_case(self.home / "must-not-create", archive=archive)
        self.assertFalse((self.home / "must-not-create").exists())
        self.receipt = self.receipts[0]
        self.root = Path(self.receipt["directory"])
        self.repo = self.root / "workspace"
        self.run = self.receipt["run_key"]
        self.agent = "synthetic-unit-agent"
        self.message = case.support.dispatch_message(self.receipt)
        self.sessions = self.home / "synthetic sessions"
        self.session = self.sessions / ("rollout-" + self.agent + ".jsonl")
        self.terminal = ".review/initial/terminal.md"
        self.record = ".review/initial/record.json"
        (self.repo / ".review/initial").mkdir()
        (self.repo / self.terminal).write_text("SYNTHETIC UNIT TERMINAL: not model review evidence\n")
        (self.repo / self.record).write_text('{"unit_only": true, "not_model_evidence": true}\n')
        self.checks = {**{k: True for k in case.ELIGIBILITY_FLAGS},
                       **{k: [] for k in case.ELIGIBILITY_GAPS}}
        write_session(self.session, self.agent, self.message)

    def capture_initial(self):
        return case.capture_turn(self.batch, self.receipt, self.agent, self.message,
                                 "initial-complete", sessions_root=self.sessions)

    def assess(self, **kwargs):
        values = dict(decision="ELIGIBLE", terminal_relative=self.terminal, record_relative=self.record,
                      checks=self.checks, assessed_by="unit test, not a reviewer",
                      rationale="Synthetic checks exercise machinery only; no semantic model grade.")
        values.update(kwargs)
        return case.record_eligibility(self.batch, self.receipt, **values)

    def reject_repair(self, **kwargs):
        before = case.support.b4.inventory(self.batch)
        source = {p: (self.repo / p).read_bytes() for p in (case.SOURCE, case.TEST)}
        head = case.git(self.repo, "rev-parse", "HEAD")
        with self.assertRaises((ValueError, FileNotFoundError, FileExistsError)):
            case.apply_repair(self.batch, kwargs.get("receipt", self.receipt),
                              kwargs.get("terminal", self.terminal))
        self.assertEqual(case.support.b4.inventory(self.batch), before)
        self.assertEqual(case.git(self.repo, "rev-parse", "HEAD"), head)
        self.assertEqual({p: (self.repo / p).read_bytes() for p in source}, source)
        self.assertFalse((self.repo / ".review/delta-input.json").exists())

    def test_structured_positive_repair_and_same_agent_delta(self):
        phase = self.capture_initial()
        initial_inventory = case.support.b4.inventory(phase)
        reports = case.support.b4.inventory(self.repo / ".review/initial")
        eligibility = self.assess()
        document = case.support.read_json(eligibility)
        self.assertEqual(document["run_key"], self.run)
        self.assertEqual(document["agent_id"], self.agent)
        for name, relative in (("terminal", self.terminal), ("record", self.record)):
            self.assertEqual(document[name], {"path": relative, "sha256": case.sha((self.repo / relative).read_bytes())})
        old = case.git(self.repo, "rev-parse", "HEAD").decode().strip()
        message = case.apply_repair(self.batch, self.receipt, self.terminal)
        mutation = self.batch / "mutations" / self.run
        repair = case.support.read_json(mutation / "repair-receipt.json")
        self.assertEqual(repair["previous_candidate"], old)
        self.assertEqual(repair["agent_id"], self.agent)
        self.assertEqual(repair["host_eligibility_sha256"], case.sha(eligibility.read_bytes()))
        self.assertEqual(repair["initial_phase_hashes_sha256"], document["initial_phase"]["hashes_sha256"])
        self.assertNotEqual(repair["current_candidate"], old)
        self.assertEqual(case.git(self.repo, "rev-parse", "HEAD^").decode().strip(), old)
        self.assertEqual(case.git(self.repo, "status", "--porcelain"), b"")
        self.assertEqual(set(case.git(self.repo, "diff", "--name-only", old, "HEAD").decode().splitlines()),
                         {case.SOURCE, case.TEST})
        for item in case.recipe()["operations"]:
            self.assertEqual((self.repo / item["path"]).read_text(), item["after"])
        gate = subprocess.run([sys.executable, "-B", "-m", "unittest", "discover", "-s", "tests", "-v"],
                              cwd=self.repo, capture_output=True, text=True)
        self.assertEqual(gate.returncode, 0, gate.stderr)
        self.assertIn("Ran 5 tests", gate.stderr)
        self.assertEqual(case.support.b4.inventory(phase), initial_inventory)
        self.assertEqual(case.support.b4.inventory(self.repo / ".review/initial"), reports)
        self.assertEqual((mutation / "delta-request.md").read_text(), message)
        before = case.support.b4.inventory(self.batch)
        for agent, text in (("other-agent", message), (self.agent, message + "edited")):
            with self.subTest(agent=agent), self.assertRaises(ValueError):
                case.capture_turn(self.batch, self.receipt, agent, text, "delta-complete",
                                  sessions_root=self.sessions)
            self.assertEqual(case.support.b4.inventory(self.batch), before)
        # Append a second real JSONL turn to this synthetic same-session stream.
        second = self.home / "second-turn.jsonl"
        write_session(second, self.agent, message)
        with self.session.open("a") as stream:
            stream.write("\n".join(second.read_text().splitlines()[1:]) + "\n")
        delta = case.capture_turn(self.batch, self.receipt, self.agent, message, "delta-complete",
                                  sessions_root=self.sessions)
        case.verify_phase(delta)
        self.assertEqual(case.support.read_json(delta / "metadata.json")["agent_id"], self.agent)
        self.assertNotIn("PRIVATE_UNIT_ANALYSIS", (delta / "public-trace.jsonl").read_text())
        final_state = case.support.b4.inventory(self.batch)
        with self.assertRaises((ValueError, FileExistsError)):
            case.apply_repair(self.batch, self.receipt, self.terminal)
        self.assertEqual(case.support.b4.inventory(self.batch), final_state)

    def test_markdown_keyword_and_explicit_ineligible_cannot_authorize(self):
        self.capture_initial()
        path = self.batch / "preflight" / self.run / "delta-eligibility.md"
        path.parent.mkdir(parents=True)
        path.write_text("INELIGIBLE; ELIGIBLE appears in a quotation, not an approval.\n")
        self.reject_repair()
        self.assess(decision="INELIGIBLE", checks={**self.checks, "original_defect_reported": False},
                    rationale="Not eligible, despite the keyword ELIGIBLE.")
        self.reject_repair()

    def test_decision_schema_and_check_types_fail_closed(self):
        self.capture_initial()
        path = self.assess()
        original = case.support.read_json(path)
        variants = [{**original, "decision": v} for v in ("eligible", "NOT ELIGIBLE", "ELIGIBLE yes", True, None)]
        variants += [{**original, "extra": "ELIGIBLE"}, {**original, "assessed_by": " "},
                     {**original, "rationale": ""}, {k: v for k, v in original.items() if k != "checks"}]
        for flag in case.ELIGIBILITY_FLAGS:
            variants += [{**original, "checks": {**original["checks"], flag: value}} for value in (False, 1, "true")]
        for gap in case.ELIGIBILITY_GAPS:
            variants += [{**original, "checks": {**original["checks"], gap: value}} for value in (["open"], "", None)]
        for value in variants:
            with self.subTest(value=value):
                path.write_text(json.dumps(value))
                self.reject_repair()

    def test_every_actual_run_phase_and_artifact_binding_is_checked(self):
        self.capture_initial()
        path = self.assess()
        original = case.support.read_json(path)
        changes = [("run_key", "other-run"), ("agent_id", "other-agent"),
                   ("schema", "old-schema"), ("initial_phase", {"path": "elsewhere", "hashes_sha256": "0" * 64}),
                   ("terminal", {"path": self.terminal, "sha256": "0" * 64}),
                   ("record", {"path": self.record, "sha256": "0" * 64})]
        for field in ("initial_phase", "terminal", "record"):
            for key in original[field]:
                altered = copy.deepcopy(original[field])
                altered[key] = "0" * 64 if key.endswith("sha256") else "../escape"
                changes.append((field, altered))
            changes.append((field, {**original[field], "unexpected": True}))
        for field, value in changes:
            with self.subTest(field=field, value=value):
                path.write_text(json.dumps({**original, field: value}))
                self.reject_repair()
        path.write_text(json.dumps(original))
        for value in ("../escape", str(self.repo / self.terminal), ".review/initial/../initial/terminal.md", self.record):
            self.reject_repair(terminal=value)
        self.reject_repair(receipt={**self.receipt, "repeat": 2})

    def test_changed_current_terminal_record_input_or_additional_evidence_rejected(self):
        self.capture_initial()
        self.assess()
        for relative in (self.terminal, self.record, ".review/input.json"):
            path = self.repo / relative
            raw = path.read_bytes()
            path.write_bytes(raw + b"\nchanged\n")
            self.reject_repair()
            path.write_bytes(raw)
        extra = self.repo / ".review/initial/extra.md"
        extra.write_text("added after capture")
        self.reject_repair()

    def test_phase_hash_or_user_provenance_drift_rejected(self):
        phase = self.capture_initial()
        self.assess()
        for path in (phase / "final.md", phase / "hashes.json",
                     self.batch / "user-messages" / self.run / "initial-complete.json"):
            raw = path.read_bytes()
            path.write_text("{}")
            self.reject_repair()
            path.write_bytes(raw)

    def test_invalid_assessment_writes_nothing_and_valid_assessment_is_one_shot(self):
        self.capture_initial()
        before = case.support.b4.inventory(self.batch)
        for values in ({"decision": "maybe ELIGIBLE"}, {"checks": {}},
                       {"record_relative": self.terminal}, {"record_relative": "../escape"}):
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.assess(**values)
            self.assertEqual(case.support.b4.inventory(self.batch), before)
        self.assess()
        before = case.support.b4.inventory(self.batch)
        with self.assertRaises(FileExistsError):
            self.assess()
        self.assertEqual(case.support.b4.inventory(self.batch), before)

    def test_symlinked_eligibility_artifacts_and_output_ancestors_rejected(self):
        self.capture_initial()
        path = self.assess()
        # Internal aliases are also forbidden for binding-critical evidence.
        for target in (path, self.repo / self.record):
            saved = target.with_name(target.name + ".saved")
            target.rename(saved)
            target.symlink_to(saved.name)
            self.reject_repair()
            target.unlink()
            saved.rename(target)
        outside = self.home / "outside mutation"
        outside.mkdir()
        (self.batch / "mutations").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            case.apply_repair(self.batch, self.receipt, self.terminal)
        self.assertEqual(list(outside.iterdir()), [])
        self.assertEqual(case.git(self.repo, "rev-parse", "HEAD"), case.git(self.repo, "rev-parse", "review-initial"))

    def test_duplicate_json_keys_cannot_smuggle_eligible(self):
        self.capture_initial()
        path = self.assess()
        raw = path.read_text().rstrip()
        path.write_text(raw[:-1] + ', "decision": "INELIGIBLE", "decision": "ELIGIBLE"}')
        self.reject_repair()

    def test_model_effort_and_exact_observed_user_checked_before_phase_output(self):
        before = case.support.b4.inventory(self.batch)
        variants = ({"model": "gpt-5.6-terra"}, {"effort": "low"}, {"message": self.message + " altered"})
        for variant in variants:
            args = {"message": self.message, **variant}
            write_session(self.session, self.agent, **args)
            with self.assertRaises(ValueError):
                self.capture_initial()
            self.assertEqual(case.support.b4.inventory(self.batch), before)
        write_session(self.session, self.agent, self.message)
        lines = self.session.read_text().splitlines()
        lines.insert(3, lines[2])
        self.session.write_text("\n".join(lines) + "\n")
        with self.assertRaises(ValueError):
            self.capture_initial()
        self.assertEqual(case.support.b4.inventory(self.batch), before)
        self.assertFalse((self.batch / "phases").exists())
        self.assertFalse((self.batch / "user-messages").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
