from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ASSETS = Path(__file__).resolve().parents[2] / "skills" / "code-reviewer" / "tests"
SPEC = importlib.util.spec_from_file_location("review_fixture_export", ASSETS / "make_review_fixture.py")
assert SPEC is not None and SPEC.loader is not None
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)
EXPECTED = json.loads((ASSETS / "grader" / "expected.json").read_text(encoding="utf-8"))


def environment() -> dict[str, str]:
    result = {key: value for key, value in os.environ.items() if key not in ("PYTHONPATH", "PYTHONHOME")}
    result["PYTHONDONTWRITEBYTECODE"] = "1"
    return result


class CodeReviewerBehaviorCasesTests(unittest.TestCase):
    def observe(self, family: str, revision: str, case: dict) -> dict:
        with tempfile.TemporaryDirectory(prefix="review-boundary-") as temporary:
            root = Path(temporary)
            repository = root / "repository"
            EXPORT.stage_sources(repository, family, revision)
            run_environment = environment()
            if family == "resource":
                inputs = root / "resources"
                inputs.mkdir()
                content = EXPECTED["runtime"][family]["contents"]
                for relative, content_id in case["files"].items():
                    target = inputs / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(content[content_id], encoding="utf-8")
                command = [sys.executable, "provider.py", str(inputs)]
            elif family == "permission":
                run_environment["PATH"] = str(repository / "bin") + os.pathsep + run_environment["PATH"]
                run_environment["PROBE_SCENARIO"] = case["id"]
                command = ["sh", "run_probe.sh"]
            else:
                command = [sys.executable, "runtime.py", case["mode"], case["release"], str(root / "state")]
            result = subprocess.run(
                command, cwd=repository, env=run_environment, capture_output=True,
                text=True, check=False, timeout=10,
            )
            if family == "permission":
                return {"exit": result.returncode, "stdout": result.stdout}
            self.assertTrue(result.stdout, result.stderr)
            return {"exit": result.returncode, **json.loads(result.stdout)}

    def check_family(self, family: str) -> None:
        oracle = EXPECTED["runtime"][family]
        self.assertTrue(oracle["r1_counterexamples"])
        self.assertTrue(any(case["expected"]["exit"] == 0 for case in oracle["inputs"]))
        self.assertTrue(any(case["expected"]["exit"] != 0 for case in oracle["inputs"]))
        for revision in ("r1", "r2"):
            mismatches = set()
            for case in oracle["inputs"]:
                with self.subTest(family=family, revision=revision, input=case["id"]):
                    observed = self.observe(family, revision, case)
                    if observed != case["expected"]:
                        mismatches.add(case["id"])
                    if revision == "r1" and case["id"] in oracle["r1_counterexamples"]:
                        self.assertNotEqual(observed, case["expected"])
                    else:
                        self.assertEqual(observed, case["expected"])
            self.assertEqual(mismatches, set(oracle["r1_counterexamples"]) if revision == "r1" else set())

    def test_resource_provider_identity_and_checksum(self) -> None:
        self.check_family("resource")

    def test_permission_probe_distinguishes_denial_from_command_error(self) -> None:
        self.check_family("permission")

    def test_ordinary_and_resume_release_before_pass(self) -> None:
        self.check_family("lifecycle")

    def test_existing_local_tests_pass_on_both_revisions(self) -> None:
        # Passing the supplied smoke tests does not establish the external invariants.
        for family in EXPECTED["runtime"]:
            for revision in ("r1", "r2"):
                with self.subTest(family=family, revision=revision), tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    EXPORT.stage_sources(root, family, revision)
                    result = subprocess.run(
                        [sys.executable, "-m", "unittest", "discover", "-p", "test_*.py"],
                        cwd=root, env=environment(), capture_output=True, text=True,
                        check=False, timeout=10,
                    )
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_blind_export_contains_exact_raw_binding_and_no_grader(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle = Path(temporary).resolve()
            binding = EXPORT.materialize("CRB-001", bundle)
            repository = bundle / "repository"
            self.assertEqual(
                {path.name for path in bundle.iterdir()},
                {"repository", "plugin", "request.md", "binding.json"},
            )
            skill_snapshot = bundle / "plugin" / "skills" / "code-reviewer"
            self.assertTrue((skill_snapshot / "SKILL.md").is_file())
            self.assertFalse((skill_snapshot / "tests").exists())
            self.assertEqual(EXPORT.SKILL, ASSETS.parent)
            source_shared = ASSETS.parents[2] / "references"
            self.assertEqual(EXPORT.SHARED_REFERENCES, source_shared)
            target_shared = (skill_snapshot / "../../references").resolve()
            self.assertEqual(target_shared, bundle / "plugin" / "references")
            self.assertEqual(
                {path.name for path in target_shared.iterdir()},
                {"language-policy.md", "subagent-result-contract.md"},
            )
            for name in EXPORT.SHARED_REFERENCE_NAMES:
                self.assertTrue((source_shared / name).is_file())
                self.assertEqual((target_shared / name).read_bytes(), (source_shared / name).read_bytes())
            self.assertEqual(list(bundle.rglob("expected.json")), [])
            self.assertEqual(list(bundle.rglob("evaluation.md")), [])
            self.assertEqual(EXPORT.git(repository, "status", "--porcelain"), "")
            self.assertEqual(EXPORT.git(repository, "rev-parse", "HEAD"), binding["candidate"])
            self.assertEqual(EXPORT.git(repository, "rev-parse", "HEAD^{tree}"), binding["candidate_tree"])
            self.assertTrue(EXPORT.git(repository, "diff", "--name-only", binding["review_root_base"], binding["candidate"]))
            request = (bundle / "request.md").read_text(encoding="utf-8")
            for value in (binding["review_root_base"], binding["candidate"], binding["candidate_tree"]):
                self.assertIn(value, request)
            self.assertIn(str(skill_snapshot / "SKILL.md"), request)
            self.assertNotIn(str(ASSETS), request)

    def test_paired_candidates_preserve_the_same_base_and_prior_commit(self) -> None:
        for first, second in (("CRB-001", "CRB-002"), ("CRB-003", "CRB-004"), ("CRB-005", "CRB-006")):
            with self.subTest(pair=(first, second)), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                previous = EXPORT.materialize(first, root / "first", include_skill=False)
                current = EXPORT.materialize(second, root / "second", include_skill=False)
                repository = root / "second" / "repository"
                self.assertEqual(previous["review_root_base"], current["review_root_base"])
                self.assertEqual(EXPORT.git(repository, "rev-parse", "HEAD^"), previous["candidate"])
                self.assertNotEqual(previous["candidate_tree"], current["candidate_tree"])
                self.assertEqual(EXPORT.git(repository, "rev-parse", previous["candidate"] + "^{tree}"), previous["candidate_tree"])

    def test_nonblocking_controls_keep_working_behavior(self) -> None:
        for case_id in ("CRB-007", "CRB-008"):
            with self.subTest(case_id=case_id), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                EXPORT.materialize(case_id, root, include_skill=False)
                result = subprocess.run(
                    [sys.executable, "-m", "unittest", "discover", "-p", "test_*.py"],
                    cwd=root / "repository", env=environment(), capture_output=True,
                    text=True, check=False, timeout=10,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_missing_provider_evidence_is_not_a_candidate_deleted_dependency(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binding = EXPORT.materialize("CRB-009", root, include_skill=False)
            repository = root / "repository"
            self.assertEqual(
                EXPORT.git(repository, "show", binding["review_root_base"] + ":provider.py"),
                EXPORT.git(repository, "show", binding["candidate"] + ":provider.py"),
            )
            result = subprocess.run(
                [sys.executable, "-S", "-c", "import provider"], cwd=repository,
                env=environment(), capture_output=True, text=True, check=False, timeout=10,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("No module named 'vendor_inventory'", result.stderr)

    def test_export_never_overwrites_an_existing_nonempty_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sentinel = root / "user-content"
            sentinel.write_text("preserve", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "new or empty"):
                EXPORT.materialize("CRB-001", root, include_skill=False)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")


if __name__ == "__main__":
    unittest.main()
