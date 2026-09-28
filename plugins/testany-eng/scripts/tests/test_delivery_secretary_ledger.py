"""Regression cases for stable commitments, dependency conflicts and read-only views."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[2] / "skills/delivery-secretary"
SCRIPT = SKILL / "scripts/ledger.py"
SPEC = importlib.util.spec_from_file_location("delivery_ledger", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def task(key, status="todo", parent=None, deps=(), scope="accepted"):
    return {"id": key, "title": key, "parent_id": parent, "depends_on": list(deps),
            "scope": scope, "status": status, "owner": "writer", "done_when": "Specified checks pass",
            "source": "request.md", "evidence": ["results.md"] if status in ("done", "deferred", "cancelled") else [],
            "updated_at": None}


def ledger(tasks, members=None):
    data = json.loads((SKILL / "assets/ledger.json").read_text())
    data.update(project="fixture", tasks=tasks)
    if members is not None:
        data["collections"] = [{"id": "ORIGINAL", "title": "Original commitments",
                                "task_ids": members, "source": "original.md"}]
    return data


class LedgerTests(unittest.TestCase):
    def cli(self, data, *args, expected=0, raw=False):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ledger.json"
            path.write_text(data if raw else json.dumps(data))
            before = path.read_bytes()
            run = subprocess.run([sys.executable, str(SCRIPT), *args[:1], str(path), *args[1:]],
                                 capture_output=True, text=True)
            self.assertEqual(run.returncode, expected, run.stderr)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(list(Path(tmp).iterdir()), [path])
            return json.loads(run.stdout if expected == 0 else run.stderr)

    def test_original_27_survive_breakdown_and_new_scope(self):
        states = ["done"] * 18 + ["failed"] * 3 + ["todo"] * 4 + ["blocked"] * 2
        originals = [task(f"T{i:02}", state, "GOAL") for i, state in enumerate(states, 1)]
        data = ledger([task("GOAL", "doing"), *originals,
                       *[task(f"S{i}", parent="T27") for i in range(5)],
                       task("NEW", parent="GOAL", scope="proposed")], [t["id"] for t in originals])
        result = self.cli(data, "status", "--collection", "ORIGINAL", "--pending-only")
        self.assertEqual(result["counts"]["units"], 27)
        self.assertEqual(result["counts"]["states"]["done"], 18)
        self.assertEqual(result["counts"]["active_remaining"], 9)
        self.assertEqual(result["items_total"], 9)
        self.assertNotIn("NEW", [x["id"] for x in result["items"]])

    def test_children_done_do_not_grant_parent_acceptance(self):
        data = ledger([task("P", "doing"), task("A", "done", "P"), task("B", "done", "P")])
        result = MOD.Ledger(data).status(focus="P")
        self.assertEqual(result["focus"]["effective_status"], "doing")
        self.assertEqual(result["counts"]["states"]["done"], 2)

    def test_false_completion_propagates_without_rewriting(self):
        data = ledger([task("ROOT", "done"), task("P", "done", "ROOT"), task("C", "failed", "P")], ["ROOT"])
        before = deepcopy(data)
        result = MOD.Ledger(data).status(collection="ORIGINAL")
        self.assertEqual(result["completion_conflict_count"], 2)
        self.assertEqual(result["counts"]["states"]["done"], 0)
        self.assertEqual(result["counts"]["states"]["needs_confirmation"], 1)
        self.assertEqual(data, before)

    def test_shared_dependency_is_one_node_and_not_a_child(self):
        data = ledger([task("ROOT", "doing"), task("A", "doing", "ROOT", ["COMMON"]),
                       task("B", "doing", "ROOT", ["COMMON"]), task("COMMON", "done")], ["A", "B"])
        view = MOD.Ledger(data)
        self.assertEqual(view.status(collection="ORIGINAL")["counts"]["units"], 2)
        self.assertEqual(view.status(focus="ROOT")["counts"]["units"], 2)
        self.assertEqual(view.status(focus="A")["dependencies"][0]["id"], "COMMON")
        self.assertEqual(len(view.tasks), 4)

    def test_proposed_work_not_automatically_a_gate(self):
        data = ledger([task("P", "done"), task("EXTRA", parent="P", scope="proposed")])
        self.assertEqual(MOD.Ledger(data).effective["P"], "done")
        data["tasks"][0]["depends_on"] = ["EXTRA"]
        data["tasks"][1].update(status="done", evidence=["author-implementation.md"])
        self.assertEqual(MOD.Ledger(data).effective["P"], "needs_confirmation")

    def test_cancelled_child_and_cancelled_prerequisite_differ(self):
        data = ledger([task("P", "done"), task("C", "cancelled", "P")])
        self.assertEqual(MOD.Ledger(data).effective["P"], "done")
        data["tasks"][0]["depends_on"] = ["C"]
        self.assertEqual(MOD.Ledger(data).effective["P"], "needs_confirmation")

    def test_deferred_and_cancelled_not_counted_as_passed(self):
        data = ledger([task("A", "done"), task("B", "deferred"), task("C", "cancelled"),
                       task("D", "failed"), task("E", scope="proposed")], ["A", "B", "C", "D", "E"])
        result = MOD.Ledger(data).status(collection="ORIGINAL", pending_only=True)
        self.assertEqual(result["counts"]["accepted"], 4)
        self.assertEqual(result["counts"]["proposed"], 1)
        self.assertEqual(result["counts"]["active_remaining"], 1)
        self.assertEqual({x["id"] for x in result["items"]}, {"B", "D"})

    def test_combined_graph_cycle(self):
        data = ledger([task("P"), task("C", parent="P", deps=["P"])])
        self.assertIn("cycle", self.cli(data, "check", expected=2)["error"])

    def test_hierarchy_and_dependency_cycles(self):
        cases = [[task("A", parent="B"), task("B", parent="A")],
                 [task("A", deps=["B"]), task("B", deps=["A"])]]
        for tasks in cases:
            with self.subTest(tasks=tasks), self.assertRaises(MOD.LedgerError):
                MOD.Ledger(ledger(tasks))

    def test_missing_references_and_duplicate_ids(self):
        cases = [ledger([task("A", parent="MISSING")]), ledger([task("A", deps=["MISSING"])]),
                 ledger([task("A"), task("A")]), ledger([task("A")], ["MISSING"]),
                 ledger([task("A")], ["A", "A"])]
        for data in cases:
            with self.subTest(data=data), self.assertRaises(MOD.LedgerError):
                MOD.Ledger(data)

    def test_terminal_status_needs_result_or_decision_reference(self):
        for state in ("done", "cancelled", "deferred"):
            value = task("A", state)
            value["evidence"] = []
            with self.subTest(state=state), self.assertRaises(MOD.LedgerError):
                MOD.Ledger(ledger([value]))

    def test_questions_distinguish_draft_sent_and_answered(self):
        data = ledger([task("A")])
        question = {"id": "Q1", "task_ids": ["A"], "to": "writer", "status": "draft", "question": "Result?"}
        data["questions"] = [question]
        MOD.Ledger(data)
        question["status"] = "pending"
        with self.assertRaises(MOD.LedgerError):
            MOD.Ledger(data)
        question["sent_ref"] = "actual-message-1"
        MOD.Ledger(data)
        question["status"] = "closed"
        with self.assertRaises(MOD.LedgerError):
            MOD.Ledger(data)
        question["answer_ref"] = "reply-2"
        MOD.Ledger(data)

    def test_deep_tree_and_bounded_path(self):
        tasks = [task(f"T{i}", parent=f"T{i-1}" if i else None) for i in range(1500)]
        data = ledger(tasks)
        data["focus"] = [t["id"] for t in tasks]
        view = MOD.Ledger(data)
        result = view.status(focus="T1499", limit=5)
        self.assertEqual(result["containment_path"], [f"T{i}" for i in range(1495, 1500)])
        self.assertEqual(result["containment_path_omitted"], 1495)
        self.assertEqual(result["containment_root"], "T0")
        self.assertEqual(len(view.status(limit=5)["focus_path"]), 5)

    def test_focus_may_follow_shared_dependency_but_not_unrelated_task(self):
        data = ledger([task("P"), task("C", parent="P", deps=["DEP"]), task("DEP"), task("OTHER")])
        data["focus"] = ["P", "C", "DEP"]
        MOD.Ledger(data)
        data["focus"] = ["P", "OTHER"]
        with self.assertRaises(MOD.LedgerError):
            MOD.Ledger(data)

    def test_pagination_keeps_counts_and_read_only_evidence(self):
        data = ledger([task(f"T{i}", "done" if i == 0 else "todo") for i in range(30)],
                      [f"T{i}" for i in range(30)])
        result = self.cli(data, "status", "--collection", "ORIGINAL", "--pending-only", "--limit", "3", "--offset", "3")
        self.assertEqual(result["counts"]["units"], 30)
        self.assertEqual([x["id"] for x in result["items"]], ["T4", "T5", "T6"])
        self.assertEqual(result["items_total"], 29)
        self.assertEqual(result["items_omitted"], 26)
        self.assertTrue(result["recorded_structure_only"])

    def test_duplicate_json_keys_and_invalid_shape_fail_without_traceback(self):
        for raw in ('{"schema_version":1,"schema_version":1}', '[]', '{',
                    json.dumps({**ledger([task("A")]), "schema_version": True})):
            with self.subTest(raw=raw):
                self.assertIn("error", self.cli(raw, "check", expected=2, raw=True))

    def test_empty_template_checks_without_claiming_a_project_complete(self):
        data = json.loads((SKILL / "assets/ledger.json").read_text())
        result = self.cli(data, "status")
        self.assertEqual(result["counts"]["units"], 0)
        self.assertTrue(result["recorded_structure_only"])


if __name__ == "__main__":
    unittest.main()
