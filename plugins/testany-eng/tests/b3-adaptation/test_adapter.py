"""Offline adapter regressions; no network, test-package execution or agents."""

import ast
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import adapter
import fixtures


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="b3-adapter-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "harness"
        self.home.mkdir()
        self.work = self.root / "workspace"
        self.work.mkdir()
        fixtures.package(self.work)
        shutil.copyfile(Path(adapter.__file__), self.home / "testany.py")
        self.reset("chain")

    def reset(self, profile):
        fixtures.write_json(self.home / "state.json", adapter.initial_state(profile))

    def call(self, op, args=None, ok=True):
        result = adapter.invoke(self.home, ["testany_" + op, json.dumps(args or {})])
        self.assertEqual(result["ok"], ok, result)
        self.assertTrue(result["simulation"])
        return result

    def state(self):
        return json.loads((self.home / "state.json").read_text())

    def logs(self):
        return [json.loads(line) for line in (self.home / "calls.jsonl").read_text().splitlines()]

    def create_case(self):
        meta = fixtures.metadata()
        created = self.call("create_case", {k: meta[k] for k in ("name", "runtime_uuid", "is_private", "workspace_keys")})
        key = created["case_key"]
        self.assertRegex(key, r"^[A-F0-9]{8}$")
        self.call("update_case", {"case_key": key, **{k: meta[k] for k in ("case_meta", "description", "case_labels", "environments")}})
        return key

    def upload(self, key, ok=True):
        return self.call("update_case_script", {"case_key": key, "zip_path": "workspace/package.zip"}, ok=ok)

    def test_authorized_chain_uses_actual_keys_and_reaches_one_terminal(self):
        key = self.create_case()
        uploaded = self.upload(key)
        self.assertEqual(uploaded["case_key"], key)
        self.assertTrue(self.call("get_case", {"case_key": key})["script_uploaded"])
        verified = self.call("verify_pipeline", {"case_keys": [key], "workspace_key": "LAB"})
        self.assertTrue(verified["valid"])
        self.assertFalse(verified["executed"])
        pipeline = self.call("create_pipeline", {"name": "Billing smoke", "workspace_key": "LAB", "case_keys": [key]})
        self.assertEqual(pipeline["case_keys"], [key])
        pkey = pipeline["pipeline_key"]
        self.assertEqual(self.call("get_pipeline", {"pipeline_key": pkey})["case_keys"], [key])
        self.assertIn(key, self.call("get_pipeline_yaml", {"pipeline_key": pkey})["yaml"])
        self.call("verify_pipeline", {"pipeline_key": pkey})
        run = self.call("execute_pipeline", {"pipeline_key": pkey, "workspace_key": "LAB"})
        self.assertEqual(run["status"], 0)
        terminal = self.call("get_execution", {"execution_key": run["execution_key"]})
        self.assertEqual(terminal["status"], 1)
        self.assertEqual(terminal["pipeline_key"], pkey)
        state = self.state()
        for collection in ("cases", "pipelines", "executions"):
            self.assertEqual(len(state[collection]), 1)
        for op in ("create_case", "update_case_script", "create_pipeline", "execute_pipeline"):
            self.assertEqual(state["calls"]["testany_" + op], 1)
        self.assertEqual(len(self.logs()), state["sequence"])

    def test_readonly_inventory_does_not_create_objects(self):
        for op in ("filter_case_runtimes", "get_my_workspaces", "get_my_workspaces_with_roles",
                   "get_tenant_config", "list_labels", "list_cases", "list_my_cases", "list_pipelines", "list_my_pipelines"):
            self.call(op)
        for name in ("cases", "pipelines", "executions", "requests"):
            self.assertEqual(self.state()[name], {})

    def test_a03_remains_running_and_never_creates_execution(self):
        self.reset("query")
        for op in ("get_execution", "refresh_execution", "get_execution"):
            result = self.call(op, {"execution_key": "EX-LAB-001"})
            self.assertEqual((result["status"], result["status_name"]), (0, "RUNNING"))
        self.call("execute_pipeline", {"pipeline_key": "PIPE-LAB-001", "workspace_key": "LAB"}, ok=False)
        self.assertEqual(list(self.state()["executions"]), ["EX-LAB-001"])

    def test_d03_accepts_once_but_readback_is_unchanged(self):
        self.reset("mismatch")
        before = self.call("get_pipeline", {"pipeline_key": "PIPE-LAB-001"})
        args = {"pipeline_key": "PIPE-LAB-001", "workspace_key": "LAB", "name": "Billing smoke"}
        changed = self.call("update_pipeline", args)
        self.assertTrue(changed["accepted"])
        after = self.call("get_pipeline", {"pipeline_key": "PIPE-LAB-001"})
        self.assertEqual(before, after)
        self.assertEqual(after["name"], "Invoice smoke")
        self.call("update_pipeline", args, ok=False)
        self.assertEqual(before, self.call("get_pipeline", {"pipeline_key": "PIPE-LAB-001"}))

    def test_d03_rejects_other_fields_without_partial_mutation(self):
        self.reset("mismatch")
        before = copy.deepcopy(self.state()["pipelines"])
        self.call("update_pipeline", {"pipeline_key": "PIPE-LAB-001", "name": "Billing smoke", "description": "changed"}, ok=False)
        self.assertEqual(before, self.state()["pipelines"])

    def test_d04_upload_failure_preserves_one_case_and_attempt(self):
        self.reset("upload_failure")
        key = self.create_case()
        result = self.upload(key, ok=False)
        self.assertEqual(result["error"], "SIMULATED_UPLOAD_FAILURE")
        self.assertEqual(result["case_key"], key)
        self.assertFalse(self.call("get_case", {"case_key": key})["script_uploaded"])
        self.assertEqual(self.state()["calls"]["testany_update_case_script"], 1)
        self.upload(key, ok=False)
        self.call("create_case", fixtures.metadata(), ok=False)
        self.call("delete_case", {"case_key": key}, ok=False)
        self.assertEqual(len(self.state()["cases"]), 1)

    def test_d05_pending_request_is_not_available_workspace(self):
        self.reset("workspace")
        self.assertTrue(self.call("check_workspace_key", {"workspace_key": "QA2"})["available"])
        args = {"workspace_key": "QA2", "description": "内部演练"}
        result = self.call("request_workspace", args)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["status"], "pending")
        request = self.call("get_workspace_request", {"request_id": result["request_id"]})
        self.assertFalse(request["workspace_available"])
        self.assertEqual(request["status"], "pending")
        workspaces = self.call("get_my_workspaces")["workspaces"]
        self.assertEqual([w["workspace_key"] for w in workspaces], ["LAB"])
        self.call("request_workspace", args, ok=False)
        self.call("assign_user_to_workspace", {"workspace_key": "QA2", "user": "someone"}, ok=False)
        self.assertEqual(len(self.state()["requests"]), 1)

    def test_malformed_unknown_and_denied_calls_are_all_logged(self):
        for argv in ([], ["bad-op"], ["testany_get_my_workspaces", "{"],
                     ["testany_get_my_workspaces", "[]"], ["x", "{}", "extra"]):
            self.assertFalse(adapter.invoke(self.home, argv)["ok"])
        self.assertEqual(len(self.logs()), 5)
        self.assertEqual([x["sequence"] for x in self.logs()], list(range(1, 6)))
        self.assertTrue(all(not x["result"]["ok"] for x in self.logs()))

    def test_duplicate_mutation_rejected_and_unknown_keys_not_fabricated(self):
        key = self.create_case()
        self.upload(key)
        self.upload(key, ok=False)
        for op, args in (("get_case", {"case_key": "FFFFFFFF"}),
                         ("get_pipeline", {"pipeline_key": "PIPE-MISSING"}),
                         ("get_execution", {"execution_key": "EX-MISSING"})):
            self.call(op, args, ok=False)
        self.assertEqual(len(self.state()["cases"]), 1)
        self.assertEqual(self.state()["executions"], {})

    def test_wrong_runtime_visibility_or_workspace_rejected(self):
        for updates in ({"runtime_uuid": "unknown"}, {"is_private": False}, {"workspace_keys": ["PROD"]}):
            with self.subTest(updates=updates):
                self.reset("chain")
                self.call("create_case", {**fixtures.metadata(), **updates}, ok=False)
                self.assertFalse(self.state()["cases"])

    def test_metadata_uses_real_case_shape(self):
        adapter.validate_meta(fixtures.metadata()["case_meta"])
        for meta in ({"executor": "pyres"}, {"trigger_method": {"executor": "pyres", "trigger_command": "python test.py"}},
                     {**fixtures.metadata()["case_meta"], "environment_variables": [{"name": "TOKEN", "type": "secrets"}]}):
            with self.assertRaises(ValueError):
                adapter.validate_meta(meta)

    def test_static_inspection_never_runs_script(self):
        with mock.patch("subprocess.run", side_effect=AssertionError("execution not permitted")), \
             mock.patch("builtins.__import__", wraps=__import__) as imports:
            result = adapter.inspect_package(self.work / "package.zip", fixtures.metadata()["case_meta"])
        self.assertIn("test_billing.py", result["members"])
        self.assertNotIn("test_billing", [c.args[0] for c in imports.call_args_list])

    def test_zip_bad_entry_and_syntax_independently_fail(self):
        fixtures.package(self.work, bad=True)
        meta = json.loads((self.work / "metadata.json").read_text())["case_meta"]
        with self.assertRaisesRegex(ValueError, "missing entry"):
            adapter.inspect_package(self.work / "package.zip", meta)
        with self.assertRaises(SyntaxError):
            adapter.inspect_package(self.work / "package.zip", fixtures.metadata()["case_meta"])

    def test_simple_yaml_supported_and_nontrivial_yaml_rejected(self):
        key = self.create_case()
        self.upload(key)
        yaml = "kind: rule/v1.3\nspec:\n  rules:\n    - run: '" + key + "'\n"
        self.call("verify_pipeline", {"yaml": yaml})
        self.call("verify_pipeline", {"yaml": yaml + "      whenFailed: OTHER\n"}, ok=False)
        self.call("verify_pipeline", {"case_keys": [key, key]}, ok=False)
        self.assertFalse(self.state()["pipelines"])
        self.assertFalse(self.state()["executions"])

    def test_upload_outside_workspace_is_rejected(self):
        key = self.create_case()
        path = self.root / "outside.zip"
        shutil.copyfile(self.work / "package.zip", path)
        self.call("update_case_script", {"case_key": key, "zip_path": str(path)}, ok=False)
        self.assertFalse(self.state()["cases"][key]["script_uploaded"])

    def test_cli_persists_across_processes_and_records_failure_exit(self):
        self.reset("workspace")
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        def cli(op, args):
            proc = subprocess.run([sys.executable, str(self.home / "testany.py"), op, json.dumps(args)],
                                  cwd=self.root, env=env, capture_output=True, text=True, check=False)
            return proc.returncode, json.loads(proc.stdout)
        code, request = cli("testany_request_workspace", {"workspace_key": "QA2", "description": "internal exercise"})
        self.assertEqual(code, 0)
        code, readback = cli("testany_get_workspace_request", {"request_id": request["request_id"]})
        self.assertEqual(code, 0)
        self.assertEqual(readback["status"], "pending")
        code, result = cli("testany_delete_workspace", {"workspace_key": "QA2"})
        self.assertEqual(code, 1)
        self.assertFalse(result["ok"])
        self.assertEqual(len(self.logs()), 3)

    def test_adapter_has_no_network_or_process_imports(self):
        source = ast.parse(Path(adapter.__file__).read_text())
        imports = {alias.name.split(".")[0] for n in ast.walk(source) if isinstance(n, ast.Import) for alias in n.names}
        imports |= {n.module.split(".")[0] for n in ast.walk(source) if isinstance(n, ast.ImportFrom) and n.module}
        self.assertFalse(imports & {"socket", "urllib", "requests", "http", "subprocess", "os"})


if __name__ == "__main__":
    unittest.main()
