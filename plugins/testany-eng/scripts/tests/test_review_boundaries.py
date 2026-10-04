"""Static fixture/routing consistency only; independent model review is separate."""
from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


PLUGIN = Path(__file__).resolve().parents[2]
FIXTURES = PLUGIN / "tests" / "review-boundaries"
SPEC = importlib.util.spec_from_file_location("review_boundary_export", FIXTURES / "export_fixture.py")
assert SPEC is not None and SPEC.loader is not None
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)


class ReviewBoundariesTests(unittest.TestCase):
    def test_raw_requests_and_independent_expectations_are_closed(self) -> None:
        expected = json.loads((FIXTURES / "grader" / "expected.json").read_text(encoding="utf-8"))
        self.assertEqual(expected["schema"], "review-boundary-evaluation-v1")
        raw = {path.stem for path in (FIXTURES / "raw").glob("*.md")}
        self.assertEqual(raw, {f"RB-{index:03d}" for index in range(1, 9)})
        self.assertEqual(raw, set(expected["cases"]))
        self.assertEqual(len({case["dimension"] for case in expected["cases"].values()}), len(raw))
        for case_id, expected_case in expected["cases"].items():
            with self.subTest(case_id=case_id):
                self.assertEqual(set(expected_case), {"dimension", "must", "must_not"})
                self.assertTrue(expected_case["must"])
                self.assertTrue(expected_case["must_not"])
                request = (FIXTURES / "raw" / f"{case_id}.md").read_text(encoding="utf-8")
                self.assertTrue(request.startswith("# 用户请求\n"))
                self.assertNotIn("grader/", request)
                self.assertNotIn("expected.json", request)
                self.assertNotIn(expected_case["dimension"], request)

    def test_export_contains_raw_input_and_all_four_skills_without_answers(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = EXPORT.materialize("RB-003", Path(temporary))
            self.assertEqual({path.name for path in root.iterdir()}, {"plugin", "entry.md", "request.md"})
            self.assertEqual((root / "request.md").read_bytes(), (FIXTURES / "raw" / "RB-003.md").read_bytes())
            for skill in EXPORT.SKILLS:
                self.assertEqual(
                    (root / "plugin" / "skills" / skill / "SKILL.md").read_bytes(),
                    (PLUGIN / "skills" / skill / "SKILL.md").read_bytes(),
                )
                self.assertTrue((root / "plugin" / "commands" / f"{skill}.md").is_file())
            self.assertEqual(
                (root / "plugin" / "references" / "review-boundaries.md").read_bytes(),
                (PLUGIN / "references" / "review-boundaries.md").read_bytes(),
            )
            self.assertTrue((root / "plugin" / "scripts" / "trace_lint.py").is_file())
            check = subprocess.run([sys.executable, "-B", str(root / "plugin/scripts/workflow_context.py"), "check"],
                                   cwd=root, capture_output=True, text=True)
            self.assertEqual(check.returncode, 0, check.stderr)
            self.assertEqual(json.loads(check.stdout)["status"], "PACKAGE_OK")
            for forbidden in ("tests", "grader", "expected.json", "evaluation.md", "__pycache__"):
                self.assertEqual(list(root.rglob(forbidden)), [], forbidden)

    def test_export_refuses_unknown_case_and_preserves_user_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sentinel = root / "user-content"
            sentinel.write_text("preserve", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unknown case"):
                EXPORT.materialize("../grader/expected", root)
            with self.assertRaisesRegex(ValueError, "new or empty"):
                EXPORT.materialize("RB-001", root)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")

    def test_target_skills_read_the_shared_boundary_and_have_real_commands(self) -> None:
        for skill in EXPORT.SKILLS:
            with self.subTest(skill=skill):
                skill_path = PLUGIN / "skills" / skill / "SKILL.md"
                text = skill_path.read_text(encoding="utf-8")
                self.assertIn("../../references/review-boundaries.md", text)
                self.assertLess(len(text.splitlines()), 500)
                command = PLUGIN / "commands" / f"{skill}.md"
                self.assertTrue(command.is_file())
                self.assertIn(skill, command.read_text(encoding="utf-8"))

    def test_design_reviewer_main_and_references_have_no_p2_count_gate(self) -> None:
        # Protect the removed positive gate, not particular replacement phrasing.
        banned = re.compile(r"P2(?:\s*\|\s*)?\s*(?:>|≤|<=|&gt;)\s*2|P2\s*数量[^\n]*超过\s*2")
        for skill in ("hld-reviewer", "lld-reviewer"):
            files = [PLUGIN / "skills" / skill / "SKILL.md"]
            files.extend((PLUGIN / "skills" / skill / "references").glob("*.md"))
            files.append(PLUGIN / "commands" / f"{skill}.md")
            for path in files:
                with self.subTest(path=str(path.relative_to(PLUGIN))):
                    self.assertIsNone(banned.search(path.read_text(encoding="utf-8")))

    def test_workflow_routes_resolve_and_formal_requirements_do_not_leak(self) -> None:
        workflow_path = PLUGIN / "skills/guide/references/workflow-map.yaml"
        workflow = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))
        nodes = {node["id"]: node for node in workflow["nodes"]}
        commands = {node["command"] for node in nodes.values()}
        routing = workflow["review_routing"]
        self.assertEqual((workflow_path.parent / routing["shared_reference"]).resolve(),
                         PLUGIN / "references/review-boundaries.md")
        self.assertEqual(set(routing["modes"]), {"formal_design", "bounded_change"})
        for rule in routing["rules"]:
            if "command" in rule:
                self.assertIn(rule["command"], commands)
        for name in ("hld-reviewer", "lld-reviewer"):
            self.assertEqual(nodes[name]["requires_apply_to"], "formal_design")
            self.assertIn("relevant_approved_baseline_or_owner_decision", nodes[name]["bounded_inputs"])


if __name__ == "__main__":
    unittest.main()
