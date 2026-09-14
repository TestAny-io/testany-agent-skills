"""Structural guards supplement, but never replace, fresh behavior evidence."""
import hashlib
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

import yaml


ROOT = Path(__file__).resolve().parents[4]
ENG = ROOT / "plugins/testany-eng"
BOT = ROOT / "plugins/testany-bot"
LLM = ROOT / "plugins/testany-llm"


class ContractTests(unittest.TestCase):
    def test_frozen_behavior_expectations(self):
        path = Path(__file__).with_name("suite.json")
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         "4690d4f1b89e9f1ae2c88a7dc6735bd16e492530d2cbb36ad23ca8d003ab164b")

    def test_brd_uc_roots_are_short_with_scope_and_modes(self):
        for name in ("brd-interviewer", "uc-interviewer"):
            body = (ENG / "skills" / name / "SKILL.md").read_text()
            self.assertLess(len(body.splitlines()), 500)
            self.assertIn("interview-modes.md", body)
            self.assertIn("synthesis", body)
            self.assertIn("gap_followup", body)
            self.assertIn("使用示例", body)

    def test_handoff_chain_and_command_routes(self):
        for name in ("case-writing", "case", "pipeline", "trigger", "execution"):
            body = (BOT / "skills" / ("testany-" + name) / "SKILL.md").read_text()
            self.assertIn("task-handoff.md", body)
            self.assertIn("task-handoff.md", (BOT / "commands" / (name + ".md")).read_text())
        contract = (BOT / "skills/testany-guide/references/task-handoff.md").read_text()
        self.assertIn("不重置计时", contract)
        self.assertIn("每次调用前将目标 key 对照", contract)
        self.assertIn("连只读查询也不能直接代入", contract)
        self.assertIn("只查", (BOT / "skills/testany-execution/SKILL.md").read_text())

    def test_touched_entry_and_shared_document_links_resolve(self):
        paths = [ROOT / name for name in ("AGENTS.md", "CLAUDE.md", "docs/plugin-development.md")]
        paths += [ENG / "references/interview-modes.md"]
        paths += [BOT / "skills/testany-guide/references" / name for name in
                  ("task-handoff.md", "delivery-verification.md")]
        paths += [ENG / "skills" / name / "SKILL.md" for name in ("brd-interviewer", "uc-interviewer")]
        paths += [BOT / "skills" / ("testany-" + name) / "SKILL.md" for name in
                  ("case-writing", "case", "pipeline", "trigger", "execution", "workspace", "guide")]
        for path in paths:
            for target in re.findall(r"\]\(([^)]+)\)", path.read_text()):
                if target.startswith(("http://", "https://", "#")):
                    continue
                self.assertTrue((path.parent / target.split("#")[0]).exists(), (str(path), target))

    def test_templates_do_not_preapprove_flows(self):
        for suffix in (".md", ".en.md"):
            path = ENG / "skills/uc-interviewer/assets" / ("journey-output-template" + suffix)
            body = path.read_text()
            self.assertNotIn("status: approved", body)
            self.assertIn("not_run", body)
            self.assertIn("synthesis", body)
        for suffix in (".md", ".en.md"):
            body = (ENG / "skills/brd-interviewer/assets" / ("brd-template" + suffix)).read_text()
            for marker in ("measured", "estimated", "measurement_plan", "discrete_acceptance"):
                self.assertIn(marker, body)

    def test_legacy_unconditional_interview_rules_removed(self):
        paths = list((ENG / "skills/brd-interviewer").rglob("*.md"))
        paths += [ENG / "skills/uc-interviewer/SKILL.md"]
        forbidden = ("假设数量 > 3", "假设 ≤ 3", "所有问题都是选择题", "每个痛点必须有数值化描述",
                     "一个 journey 完成确认后，再进入下一个。不要批量处理")
        for path in paths:
            for phrase in forbidden:
                self.assertNotIn(phrase, path.read_text(), str(path))

    def test_prompt_hook_is_bounded_and_xml_example_parses(self):
        body = (LLM / "skills/prompt-optimizer/SKILL.md").read_text()
        front = yaml.safe_load(body.split("---", 2)[1])
        hook = front["hooks"]["Stop"][0]["hooks"][0]["prompt"]
        self.assertIn('若 stop_hook_active 为 true，必须返回 {"ok": true}', hook)
        self.assertNotIn("必须使用对应的格式语法", body)
        xml = re.search(r"```xml\n(.*?)\n```", body, re.S).group(1)
        root = ET.fromstring(xml)
        self.assertEqual(root.tag, "prompt")
        self.assertEqual([child.tag for child in root], ["task", "input", "output"])
        self.assertEqual(root.findtext("input"), "{{TEXT}}")

    def test_global_routes_and_discovery_invariants(self):
        for name in ("AGENTS.md", "CLAUDE.md"):
            body = (ROOT / name).read_text()
            self.assertLess(len(body.splitlines()), 60)
            for phrase in ("docs/plugin-development.md", "中文", "500", "Git ignored", "fail closed", "authority"):
                self.assertIn(phrase, body)
        manual = (ROOT / "docs/plugin-development.md").read_text()
        for phrase in ("strict: true", "strict: false", "null", "marketplace root", "全部列出路径均不存在",
                       "source resolved version", "绝不能同时", "显式版本每次发布必须递增"):
            self.assertIn(phrase, manual)

    def test_delivery_contract_covers_readback_and_partial_failure(self):
        body = (BOT / "skills/testany-guide/references/delivery-verification.md").read_text()
        for phrase in ("read-after-write", "部分失败", "不重建", "不自动删除", "申请 workspace", "静态"):
            self.assertIn(phrase, body)
        for name in ("case", "pipeline", "trigger", "workspace"):
            self.assertIn("delivery-verification.md", (BOT / "skills" / ("testany-" + name) / "SKILL.md").read_text())

    def test_new_reference_code_fences_are_balanced(self):
        paths = [ENG / "references/interview-modes.md", ROOT / "docs/plugin-development.md",
                 ENG / "skills/uc-interviewer/SKILL.md", LLM / "skills/prompt-optimizer/SKILL.md"]
        for path in paths:
            fences = [line for line in path.read_text().splitlines() if line.startswith("```")]
            self.assertEqual(len(fences) % 2, 0, str(path))


if __name__ == "__main__":
    unittest.main()
