from __future__ import annotations

import importlib.util
import sys
import unittest
from copy import deepcopy
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "skills"
    / "code-reviewer"
    / "scripts"
    / "scope_lock_digest.py"
)
SPEC = importlib.util.spec_from_file_location("scope_lock_digest", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
SCOPE_LOCK = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SCOPE_LOCK
SPEC.loader.exec_module(SCOPE_LOCK)


def payload() -> dict[str, object]:
    return {
        "schema": "testany.code-reviewer.scope-lock.v1",
        "repositories": [
            {
                "repository_identity": "example/backend",
                "review_root_base": "a" * 40,
            },
            {
                "repository_identity": "example/portal",
                "review_root_base": "b" * 40,
            },
        ],
        "approved_baselines": [
            {
                "baseline_type": "User decision",
                "exact_reference": "DEC-001",
                "approval_evidence": "thread@1",
                "governs": "Product scope",
            }
        ],
        "in_scope": ["Backend implementation", "Portal implementation"],
        "out_of_scope": ["Deployment"],
        "must_not_change_or_regress": ["Existing V1 wire"],
        "architecture_budget": [
            {
                "surface": "endpoint",
                "allowed_action": "MODIFY",
                "approved_source": "DEC-001",
                "exact_boundary": "internal endpoint only",
            }
        ],
        "verification_boundary": [
            {
                "layer": "source",
                "required_in_code_review": True,
                "required_gates": ["unit", "compile"],
                "evidence_boundary": "local Candidate",
                "effect_on_code_verdict": "MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT",
            },
            {
                "layer": "ci",
                "required_in_code_review": False,
                "required_gates": [],
                "evidence_boundary": "exact SHA after push",
                "effect_on_code_verdict": "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING",
            },
            {
                "layer": "environment",
                "required_in_code_review": False,
                "required_gates": [],
                "evidence_boundary": "live activation",
                "effect_on_code_verdict": "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING",
            },
        ],
    }


class ScopeLockDigestTests(unittest.TestCase):
    def test_order_independent_sets_have_one_digest(self) -> None:
        first = payload()
        second = deepcopy(first)
        second["repositories"].reverse()
        second["in_scope"].reverse()
        second["verification_boundary"].reverse()
        next(
            item
            for item in second["verification_boundary"]
            if item["layer"] == "source"
        )["required_gates"].reverse()

        first_digest, first_canonical = SCOPE_LOCK.digest_payload(first)
        second_digest, second_canonical = SCOPE_LOCK.digest_payload(second)

        self.assertEqual(first_digest, second_digest)
        self.assertEqual(first_canonical, second_canonical)

    def test_semantic_change_changes_digest(self) -> None:
        first = payload()
        second = deepcopy(first)
        second["architecture_budget"][0]["exact_boundary"] = "public endpoint"

        self.assertNotEqual(
            SCOPE_LOCK.digest_payload(first)[0],
            SCOPE_LOCK.digest_payload(second)[0],
        )

    def test_shape_and_duplicates_fail_closed(self) -> None:
        with_extra = payload()
        with_extra["candidate"] = "c" * 40
        with self.assertRaises(SCOPE_LOCK.ScopeLockError):
            SCOPE_LOCK.digest_payload(with_extra)

        with_duplicate = payload()
        with_duplicate["in_scope"].append("Backend implementation")
        with self.assertRaises(SCOPE_LOCK.ScopeLockError):
            SCOPE_LOCK.digest_payload(with_duplicate)

    def test_review_root_base_requires_full_commit(self) -> None:
        invalid = payload()
        invalid["repositories"][0]["review_root_base"] = "abc123"
        with self.assertRaises(SCOPE_LOCK.ScopeLockError):
            SCOPE_LOCK.digest_payload(invalid)

    def test_repository_identity_has_one_root_base(self) -> None:
        invalid = payload()
        invalid["repositories"][1]["repository_identity"] = "example/backend"
        with self.assertRaisesRegex(SCOPE_LOCK.ScopeLockError, "one review_root_base"):
            SCOPE_LOCK.digest_payload(invalid)

    def test_verification_layer_is_unique(self) -> None:
        invalid = payload()
        duplicate = deepcopy(invalid["verification_boundary"][0])
        duplicate["required_in_code_review"] = False
        invalid["verification_boundary"].append(duplicate)
        with self.assertRaisesRegex(SCOPE_LOCK.ScopeLockError, "exactly one source"):
            SCOPE_LOCK.digest_payload(invalid)

    def test_ci_and_environment_cannot_become_source_blockers(self) -> None:
        invalid = payload()
        ci = next(
            item for item in invalid["verification_boundary"] if item["layer"] == "ci"
        )
        ci["required_in_code_review"] = True
        with self.assertRaisesRegex(SCOPE_LOCK.ScopeLockError, "must be False"):
            SCOPE_LOCK.digest_payload(invalid)

        invalid_effect = payload()
        environment = next(
            item
            for item in invalid_effect["verification_boundary"]
            if item["layer"] == "environment"
        )
        environment["effect_on_code_verdict"] = "BLOCKS"
        with self.assertRaisesRegex(SCOPE_LOCK.ScopeLockError, "must equal"):
            SCOPE_LOCK.digest_payload(invalid_effect)

    def test_scope_and_budget_semantic_keys_are_unique(self) -> None:
        scope_conflict = payload()
        scope_conflict["out_of_scope"].append("Backend implementation")
        with self.assertRaisesRegex(SCOPE_LOCK.ScopeLockError, "overlap"):
            SCOPE_LOCK.digest_payload(scope_conflict)

        budget_conflict = payload()
        conflicting_budget = deepcopy(budget_conflict["architecture_budget"][0])
        conflicting_budget["allowed_action"] = "DELETE"
        budget_conflict["architecture_budget"].append(conflicting_budget)
        with self.assertRaisesRegex(SCOPE_LOCK.ScopeLockError, "one action"):
            SCOPE_LOCK.digest_payload(budget_conflict)



if __name__ == "__main__":
    unittest.main()
