import json
from pathlib import Path
import tempfile
import unittest
import wait_adapter
import wait_cases


class WaitCasesTests(unittest.TestCase):
    def test_nested_terminal_response_and_no_execute(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            wait_cases.materialize("W02", root)
            home = root / "harness"
            args = '{"execution_key":"EX-LAB-WAIT"}'
            self.assertEqual(wait_adapter.invoke(home, ["testany_get_execution", args])["data"]["status"], 0)
            self.assertEqual(wait_adapter.invoke(home, ["testany_refresh_execution", args])["data"]["status"], 1)
            self.assertFalse(wait_adapter.invoke(home, ["testany_execute_pipeline", args])["ok"])
            calls = [json.loads(line) for line in (home / "calls.jsonl").read_text().splitlines()]
            self.assertEqual(len(calls), 3)
            self.assertGreaterEqual(calls[1]["monotonic"], calls[0]["monotonic"])

    def test_budget_fixture_never_creates_terminal(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            wait_cases.materialize("W03", root)
            for op in ("testany_get_execution", "testany_refresh_execution"):
                result = wait_adapter.invoke(root / "harness", [op, '{"execution_key":"EX-LAB-WAIT"}'])
                self.assertEqual(result["data"]["status"], 0)

    def test_chain_static_package_and_unexecuted_initial_state(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            wait_cases.materialize("W01", root)
            meta = json.loads((root / "workspace/metadata.json").read_bytes())
            self.assertTrue(wait_cases.adapter.inspect_package(root / "workspace/package.zip", meta["case_meta"]))
            state = json.loads((root / "harness/state.json").read_bytes())
            self.assertEqual(state["executions"], {})


if __name__ == "__main__":
    unittest.main()
