import copy
import importlib.util
from pathlib import Path
import sys
import unittest


HOME = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("legacy_adapter", HOME.parent / "gpt6-adaptation/adapter.py")
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
sys.modules["legacy_adapter"] = legacy
import command_adapter as adapter


class CommandAdapterTests(unittest.TestCase):
    def state(self, trigger):
        return {"case": {"runtime_uuid": "local-runtime", "case_meta": {
            "trigger_method": trigger,
            "environment_variables": [{"name": "MODE", "type": "env", "value": "preview"},
                                      {"name": "TOKEN", "type": "secret", "secret_ref": "local-ref"}]}}}

    def test_documented_command_and_legacy_path(self):
        for entry in ({"trigger_command": ["python", "main.py"]},
                      {"trigger_command": "python main.py"}, {"trigger_path": "main.py"}):
            with self.subTest(entry=entry):
                state = self.state({"executor": "python", **entry})
                before = copy.deepcopy(state["case"])
                result = adapter.dispatch("testany_dry_run_case", {}, state)
                self.assertEqual(result["dry_run_id"], "DR0001")
                self.assertEqual(state["case"], before)
                self.assertEqual(state["dry_runs"], 1)

    def test_both_entry_fields_must_agree(self):
        for path in ("main.py", "other.py", "", None, ["main.py"]):
            with self.subTest(path=path):
                state = self.state({"executor": "python", "trigger_command": ["python", "main.py"], "trigger_path": path})
                before = copy.deepcopy(state)
                if path == "main.py":
                    adapter.dispatch("testany_dry_run_case", {}, state)
                    self.assertEqual(state["case"], before["case"])
                else:
                    with self.assertRaises(ValueError): adapter.dispatch("testany_dry_run_case", {}, state)
                    self.assertEqual(state, before)

    def test_malformed_or_missing_entry_is_rejected(self):
        for trigger in (None, [], "python", {}, {"executor": "python"}):
            with self.subTest(trigger=trigger):
                state = self.state(trigger)
                before = copy.deepcopy(state)
                with self.assertRaises(ValueError): adapter.dispatch("testany_dry_run_case", {}, state)
                self.assertEqual(state, before)

    def test_invalid_commands_do_not_run_or_mutate(self):
        for command in ([], None, "", "python wrong.py", ["python", "other.py"], "python main.py; echo bad"):
            with self.subTest(command=command):
                state = self.state({"executor": "python", "trigger_path": "main.py", "trigger_command": command})
                before = copy.deepcopy(state)
                with self.assertRaises(ValueError):
                    adapter.dispatch("testany_dry_run_case", {}, state)
                self.assertEqual(state, before)

    def test_other_preconditions_still_apply(self):
        for failure in ("runtime", "executor", "mode", "case_key", "workspace_key"):
            with self.subTest(failure=failure):
                state = self.state({"executor": "python", "trigger_command": ["python", "main.py"]})
                args = {}
                if failure == "runtime": state["case"]["runtime_uuid"] = ""
                if failure == "executor": state["case"]["case_meta"]["trigger_method"]["executor"] = "other"
                if failure == "mode": state["case"]["case_meta"]["environment_variables"] = []
                if failure.endswith("_key"): args[failure] = "OTHER"
                before = copy.deepcopy(state)
                with self.assertRaises(ValueError):
                    adapter.dispatch("testany_dry_run_case", args, state)
                self.assertEqual(state, before)


if __name__ == "__main__":
    unittest.main()
