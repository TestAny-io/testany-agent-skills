"""Local fixture checks, not model acceptance or organization-validator success."""

import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock
from uuid import UUID

import design_environment_cases as cases
from test_fixture_support import require_local_archive


class FixtureTestCase(unittest.TestCase):
    def setUp(self):
        cases.DEFAULT_OUTPUT.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="fixture unit inputs ", dir=cases.DEFAULT_OUTPUT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def load_case(self, case_id):
        root = self.root / ("business input " + case_id)
        root.mkdir()
        cases.materialize(root, case_id)
        return root

    def read_json(self, root, relative):
        return json.loads((root / relative).read_text(encoding="utf-8"))

    def invoke_missing_tool(self, root, cwd=None, path=None):
        return subprocess.run(
            ["/bin/sh", str(root / "harness/validate-contract.sh")],
            cwd=cwd or root, env={"PATH": path or "/usr/bin:/bin", "LC_ALL": "C"},
            text=True, capture_output=True, timeout=10, check=False,
        )

    def assert_missing_tool_failure(self, root, result):
        target = root / "workspace/.tools/bin/contract-check"
        self.assertFalse(os.path.lexists(target))
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertIn(str(target), result.stderr)
        self.assertRegex(result.stderr, r"not found|No such file or directory")
        self.assertNotIn("PASS", result.stdout + result.stderr)


class MaterialTests(FixtureTestCase):
    def test_prd_hld_are_distinct_real_artifact_types_with_opposing_semantics(self):
        root = self.load_case("D01")
        prd = (root / "workspace/docs/PRD.md").read_text()
        hld = (root / "workspace/docs/HLD.md").read_text()
        self.assertTrue(prd.startswith("# PRD-ARCHIVE v1.1"))
        self.assertTrue(hld.startswith("# HLD-ARCHIVE v1.3"))
        self.assertIn("满 7 日", prd)
        self.assertIn("满 30 日", hld)
        for document in (prd, hld):
            for term in ("正文", "元数据", "completed_at", "硬删除", "REQ-ARCHIVE-02"):
                self.assertIn(term, document)
        self.assertIn("第 15 日都不能查询或恢复", prd)
        self.assertIn("期间管理员可查询", hld)
        self.assertFalse(list(root.rglob("*BRD*")))

    def test_original_approvals_bind_both_versions_and_both_authority_roles(self):
        root = self.load_case("D01")
        for name, artifact, version, roles, days in (
            ("product-review", "PRD-ARCHIVE", "1.1", {"product_owner"}, 7),
            ("architecture-review", "HLD-ARCHIVE", "1.3", {"product_owner", "architecture_owner"}, 30),
        ):
            path = root / "workspace/records" / (name + ".json")
            record = json.loads(path.read_text())
            self.assertEqual(record["export_kind"], "original_project_conversation")
            attachment, = record["attachments"]
            self.assertEqual((attachment["artifact"], attachment["version"]), (artifact, version))
            target = (path.parent / attachment["path"]).resolve()
            self.assertTrue(target.is_relative_to(root))
            self.assertIn(artifact + " v" + version, target.read_text())
            approved = [m for m in record["messages"] if m["role"] in roles]
            self.assertEqual({m["role"] for m in approved}, roles)
            for message in approved:
                self.assertIn("批准", message["text"])
                self.assertIn(artifact + " v" + version, message["text"])
                self.assertIn(f"保留 {days} 日", message["text"])
                self.assertIn("硬删除", message["text"])
                self.assertTrue(message["id"] and message["at"])
        guardrails = (root / "workspace/docs/Guardrails.md").read_text()
        self.assertIn("林岚负责产品可见行为与数据处置批准", guardrails)
        self.assertIn("数据处置架构需同时获得二者批准", guardrails)
        self.assertIn("没有按审批时间自动覆盖其他工件的规则", guardrails)

    def test_d01_has_design_prerequisites_and_no_hidden_supersession(self):
        root = self.load_case("D01")
        for relative in ("docs/PRD.md", "docs/HLD.md", "docs/API-contract.md", "docs/Guardrails.md"):
            self.assertTrue((root / "workspace" / relative).is_file())
        text = "\n".join(p.read_text() for p in (root / "workspace/records").glob("*.json"))
        for word in ("撤销", "取代", "覆盖旧", "supersedes", "revoked", "reviewer"):
            self.assertNotIn(word, text)
        self.assertIn("hld-writer", cases.request_for("D01"))
        self.assertIn("更新 HLD", cases.request_for("D01"))
        self.assertIn("架构增量", cases.request_for("D01"))

    def test_all_approval_attachments_exist_at_bound_versions(self):
        for case_id in cases.CASES:
            root = self.load_case(case_id)
            files = list((root / "workspace").rglob("*.json"))
            for path in files:
                value = json.loads(path.read_text())
                if value.get("export_kind") != "original_project_conversation":
                    continue
                for attachment in value["attachments"]:
                    target = (path.parent / attachment["path"]).resolve()
                    self.assertTrue(target.is_relative_to(root))
                    self.assertTrue(target.is_file(), target)
                    self.assertIn(attachment["artifact"] + " v" + attachment["version"], target.read_text())

    def test_expected_and_request_are_not_materialized_or_leaked(self):
        for case_id in cases.CASES:
            root = self.load_case(case_id)
            expected = cases.expected_for(case_id)
            payload = "\n".join(p.read_text() for p in root.rglob("*") if p.is_file())
            request = cases.request_for(case_id)
            for private in (expected["grader_only"], "must_observe", "hard_fail", "expected.json", "expected.frozen.json"):
                self.assertNotIn(private, payload + request)
            for criterion in expected["must_observe"]:
                self.assertNotIn(criterion["id"], payload + request)
                self.assertNotIn(criterion["criterion"], payload + request)
            self.assertFalse((root / "request.md").exists())
            self.assertEqual({p.name for p in root.iterdir()}, {"workspace"} if case_id == "D01" else {"workspace", "harness"})
        for answer in ("7 日", "30 日", "冲突", "DECISION_REQUIRED", "批准来源冲突"):
            self.assertNotIn(answer, cases.request_for("D01"))
        for answer in ("127", "ENOENT", "缺失", "evidence_gap", "未准出", "校验失败"):
            self.assertNotIn(answer, cases.request_for("E01"))

    def test_e01_only_adds_the_approved_optional_field(self):
        root = self.load_case("E01")
        old = self.read_json(root, "workspace/contracts/receipt.v1.schema.json")
        candidate = self.read_json(root, "workspace/contracts/receipt.schema.json")
        reduced = copy.deepcopy(candidate)
        reduced["title"] = old["title"]
        new_field = reduced["properties"].pop("request_id")
        self.assertEqual(old, reduced)
        self.assertNotIn("request_id", candidate["required"])
        self.assertEqual(new_field["type"], "string")
        self.assertEqual((new_field["minLength"], new_field["maxLength"]), (1, 64))
        for value in ("x", "batch-127", "a" * 64):
            self.assertIsNone(re.search(new_field["not"]["pattern"], value))
        for value in ("A", "secret@example", "with space", "tail\n", "汉字"):
            self.assertIsNotNone(re.search(new_field["not"]["pattern"], value))

    def test_e01_examples_and_real_old_consumer_support_the_delta(self):
        root = self.load_case("E01")
        path = root / "workspace/consumer/reader.py"
        spec = importlib.util.spec_from_file_location("receipt_old_consumer", path)
        reader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reader)
        examples = [self.read_json(root, "workspace/examples/" + name)
                    for name in ("receipt.json", "receipt-without-id.json")]
        self.assertEqual(reader.project_receipt(examples[0]), reader.project_receipt(examples[1]))
        for value in examples:
            UUID(value["job_id"])
            self.assertEqual(value["status"], "completed")
        self.assertIn("request_id", examples[0])
        self.assertNotIn("request_id", examples[1])

    def test_e01_all_other_required_context_is_present(self):
        root = self.load_case("E01")
        standard = (root / "workspace/docs/Guardrails.md").read_text()
        contract = (root / "workspace/contracts/Contract.md").read_text()
        environment = (root / "workspace/docs/LOCAL-ENVIRONMENT.md").read_text()
        self.assertIn("必须运行组织固定版本 contract-check 1.4.2", standard)
        self.assertIn("不能用 JSON 解析或人工静态检查替代", standard)
        self.assertIn("本机尚未供应", environment)
        for term in ("UTF-8", "4096", "0600", "INVALID_RECEIPT", "ACCESS_DENIED", "REQ-RECEIPT-02", "忽略未知字段", "PRD-RECEIPT v1.1"):
            self.assertIn(term, contract)
        self.assertTrue((root / "workspace/docs/approvals.json").is_file())
        self.assertEqual(list(root.rglob("*result*")), [])
        self.assertEqual(list(root.rglob("*.jsonl")), [])

    def test_e01_actual_exec_fails_without_any_injected_result(self):
        root = self.load_case("E01")
        before = cases.support.b4.inventory(root)
        self.assert_missing_tool_failure(root, self.invoke_missing_tool(root))
        self.assertEqual(before, cases.support.b4.inventory(root))
        with self.assertRaises(FileNotFoundError) as failure:
            subprocess.run([str(root / "workspace/.tools/bin/contract-check"), "lint"], check=False)
        self.assertEqual(failure.exception.errno, 2)

    def test_e01_spaces_and_different_cwd_still_reach_correct_missing_tool(self):
        root = self.load_case("E01")
        self.assertIn(" ", str(root))
        self.assert_missing_tool_failure(root, self.invoke_missing_tool(root, cwd=root / "workspace/contracts"))

    def test_e01_never_falls_back_to_a_global_same_named_command(self):
        root = self.load_case("E01")
        other = self.root / "unrelated PATH tools"
        other.mkdir()
        # A decoy is outside the task and must never be invoked by the launcher.
        decoy = other / "contract-check"
        decoy.write_text("#!/bin/sh\nprintf 'WRONG_TOOL_USED\\n'\n")
        decoy.chmod(0o755)
        result = self.invoke_missing_tool(root, path=str(other) + ":/usr/bin:/bin")
        self.assert_missing_tool_failure(root, result)
        self.assertNotIn("WRONG_TOOL_USED", result.stdout + result.stderr)

    def test_launcher_is_an_exec_only_adapter_not_a_fake_validator(self):
        root = self.load_case("E01")
        launcher = (root / "harness/validate-contract.sh").read_text()
        self.assertIn('exec "$root/.tools/bin/contract-check" lint', launcher)
        for artificial in ("exit 127", "not-run", "not found", "PASS", "FAIL", "pip ", "curl ", "python"):
            self.assertNotIn(artificial, launcher)
        self.assertIn("--baseline", launcher)
        self.assertEqual(launcher.count("--example"), 2)

    def test_expected_loading_is_independent_and_unknown_cases_fail_closed(self):
        first = cases.expected_for("D01")
        first["critical_facts"]["prd"]["retention_days"] = 999
        self.assertEqual(cases.expected_for("D01")["critical_facts"]["prd"]["retention_days"], 7)
        for value in ("../D01", "E02", "d01"):
            with self.assertRaises(ValueError):
                cases.materialize(self.root, value)
        root = self.load_case("D01")
        with self.assertRaises(FileExistsError):
            cases.materialize(root, "D01")


class PrepareTests(FixtureTestCase):
    def test_shared_prepare_receives_exact_interface_and_frozen_archive(self):
        def fake_prepare(**kwargs):
            self.assertEqual(kwargs["archive"], cases.DEFAULT_ARCHIVE)
            self.assertEqual(kwargs["repeats"], 1)
            self.assertEqual(kwargs["request"], cases.request_for(kwargs["case_id"]))
            self.assertEqual(kwargs["expected"], cases.expected_for(kwargs["case_id"]))
            target = self.root / "shared callback root"
            target.mkdir()
            kwargs["materialize"](target)
            self.assertTrue((target / "workspace").is_dir())
            return [{"run_key": "test-receipt"}]
        with mock.patch.object(cases.support, "prepare", side_effect=fake_prepare) as prepare:
            self.assertEqual(cases.prepare_case(self.root / "batch", "D01"), [{"run_key": "test-receipt"}])
            self.assertEqual(prepare.call_count, 1)

    def test_real_v2_export_freezes_separate_inputs_and_preserves_runtime(self):
        require_local_archive(cases.DEFAULT_ARCHIVE)
        batch = self.root / "prepared receipts"
        receipt, = cases.prepare_case(batch, "E01")
        root = Path(receipt["directory"])
        self.addCleanup(shutil.rmtree, root)
        self.assertIn(" ", root.name)
        self.assertFalse(root.is_relative_to(batch))
        self.assertFalse(batch.is_relative_to(root))
        self.assertEqual(receipt["source_archive"], str(cases.DEFAULT_ARCHIVE.resolve()))
        self.assertEqual(receipt["source_archive_sha256"], hashlib.sha256(cases.DEFAULT_ARCHIVE.read_bytes()).hexdigest())
        expected = json.loads((batch / "expected.frozen.json").read_text())
        self.assertEqual(expected, cases.expected_for("E01"))
        self.assertFalse((root / "expected.frozen.json").exists())
        cases.support.collector.read_receipt(batch, receipt, root)
        with tarfile.open(batch / receipt["archive"], "r:gz") as archive:
            names = archive.getnames()
            self.assertNotIn("input/expected.frozen.json", names)
            self.assertFalse(any("facility-snapshot" in name for name in names))
            for name in ("ENTRY.md", "SKILLS.md", "ENVIRONMENT.md", "request.md"):
                self.assertIn("input/" + name, names)
            self.assertEqual(archive.extractfile("input/request.md").read().decode().strip(), cases.request_for("E01"))
        snapshot = cases.support.b4.snapshot("candidate", {"candidate": cases.DEFAULT_ARCHIVE})
        with tarfile.open(cases.DEFAULT_ARCHIVE, "r:gz") as archive:
            selected = {m.name for m in archive if cases.support.b4.selected_runtime(m.name) and not m.isdir()}
        self.assertEqual(set(snapshot["tree"]), selected)
        for name, node in snapshot["tree"].items():
            actual = root / cases.support.b4.INSTALL / name
            if "data" in node:
                self.assertEqual(actual.read_bytes(), node["data"], name)
            else:
                self.assertEqual(os.readlink(actual), node["link"], name)
            self.assertNotIn("tests", Path(name).parts)
            self.assertNotIn("skill-manager", Path(name).parts)
        self.assert_missing_tool_failure(root, self.invoke_missing_tool(root))
        self.assertFalse(list(batch.glob("dispatch*.json")))

    def test_four_run_plan_has_no_dispatch_and_one_repeat_per_model(self):
        with mock.patch.object(cases, "prepare_case") as prepare:
            prepare.side_effect = lambda batch, case_id, archive: [{
                "run_key": "plan-" + case_id, "directory": str(self.root / ("random input " + batch.name)),
            }]
            output = self.root / "review bundle"
            plan = cases.prepare_all(output)
        self.assertEqual(len(plan), 4)
        self.assertEqual(prepare.call_count, 4)
        self.assertEqual({(p["case_id"], p["model"]) for p in plan}, {
            (case_id, model) for case_id in cases.CASES for _, model in cases.MODELS})
        for item in plan:
            self.assertEqual(item["reasoning_effort"], "high")
            self.assertEqual(item["repeats"], 1)
            self.assertIs(item["fork_context"], False)
        frozen = json.loads((output / "dispatch-plan.frozen.json").read_text())
        self.assertFalse(frozen["dispatched"])
        self.assertEqual(frozen["max_concurrent_agents"], 1)
        self.assertTrue(frozen["collect_and_close_before_next"])
        review = (output / "PREDISPATCH-REVIEW.md").read_text()
        for case_id in cases.CASES:
            self.assertIn(cases.request_for(case_id), review)
        with self.assertRaises(FileExistsError):
            cases.prepare_all(output)


if __name__ == "__main__":
    unittest.main()
