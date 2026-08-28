"""Structural compatibility checks, not evidence of reviewer decision quality.

Behavioral validation lives in the skill's raw-case/independent-review workflow.
These tests protect policy invariants and the shared record's contract, not prose
wording or a requirement to duplicate that record in every terminal artifact.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
import unittest
from copy import deepcopy
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[4]
SKILL_DIR = REPO_ROOT / "plugins" / "testany-eng" / "skills" / "code-reviewer"
POLICY_PATH = SKILL_DIR / "references" / "review-policy.yaml"
WORKFLOW_PATH = (
    REPO_ROOT
    / "plugins"
    / "testany-eng"
    / "skills"
    / "guide"
    / "references"
    / "workflow-map.yaml"
)


class CodeReviewerPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = yaml.safe_load(POLICY_PATH.read_text(encoding="utf-8"))
        cls.workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        spec = importlib.util.spec_from_file_location(
            "code_reviewer_policy_scope_digest",
            SKILL_DIR / "scripts" / "scope_lock_digest.py",
        )
        assert spec is not None and spec.loader is not None
        cls.scope_digest = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = cls.scope_digest
        spec.loader.exec_module(cls.scope_digest)

    @staticmethod
    def reference_text(filename: str) -> str:
        return (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")

    @staticmethod
    def fenced_blocks(text: str, language: str) -> list[str]:
        return re.findall(rf"^```{re.escape(language)}\s*\n(.*?)^```\s*$", text, re.M | re.S)

    def scope_template_payload(self, filename: str) -> dict:
        payloads = [json.loads(block) for block in self.fenced_blocks(self.reference_text(filename), "json")]
        payloads = [
            payload for payload in payloads
            if payload.get("schema") == self.policy["scope_lock_binding"]["payload_schema"]
        ]
        self.assertEqual(len(payloads), 1, f"{filename}: one complete canonical payload")
        return payloads[0]

    @staticmethod
    def inline_record_fields(text: str) -> dict[str, str]:
        return dict(re.findall(r"`([a-z][a-z0-9_]*): ([^`]+)`", text))

    @staticmethod
    def table_rows(text: str) -> list[list[str]]:
        def cell_value(cell: str) -> str:
            cell = cell.strip()
            if cell.startswith("`") and cell.endswith("`") and cell.count("`") == 2:
                return cell[1:-1]
            return cell

        return [
            [cell_value(cell) for cell in line.strip().strip("|").split("|")]
            for line in text.splitlines()
            if line.startswith("|") and not re.fullmatch(r"[| :\-]+", line)
        ]

    def markdown_records(self, filename: str) -> list[dict[str, str]]:
        return [
            dict(re.findall(r"^(?:- )?([A-Za-z][A-Za-z0-9_ /-]*):\s*(.+)$", block, re.M))
            for block in self.fenced_blocks(self.reference_text(filename), "markdown")
        ]

    def terminal_records(self, filename: str, verdict: str) -> list[dict[str, str]]:
        return [
            record for record in self.markdown_records(filename)
            if record.get("Verdict", record.get("Source verdict", "")).strip("`") == verdict
        ]

    def assert_policy_flags(
        self, values: dict, *, enabled: tuple[str, ...] = (), disabled: tuple[str, ...] = ()
    ) -> None:
        for keys, expected in ((enabled, True), (disabled, False)):
            for key in keys:
                with self.subTest(policy_flag=key):
                    self.assertIs(values[key], expected)

    def test_v2_uses_one_readable_verified_record_without_losing_authority(self) -> None:
        self.assertEqual(self.policy["version"], 2)
        record = self.policy["review_record"]
        self.assertCountEqual(
            record["allowed_representation"],
            ["embedded_complete_record", "readable_versioned_artifact_with_sha256"],
        )
        self.assertCountEqual(
            record["required_once"],
            [
                "review_identity_and_mode",
                "complete_scope_lock_payload_or_verified_charter",
                "exact_repository_candidate_and_range_bindings",
                "changed_path_classification_and_coverage",
                "critical_behavior_evidence",
                "prior_blocking_item_closure_when_applicable",
                "verification_results_and_limitations",
            ],
        )
        self.assert_policy_flags(
            record,
            enabled=(
                "single_authoritative_record_per_attempt",
                "references_require_read_and_digest_verification",
                "copied_fields_when_present_must_match_authority",
                "report_and_subagents_may_reference_verified_record",
                "exception_history_may_use_verified_prior_chain_reference",
                "exception_count_still_derived_from_complete_verified_history",
            ),
            disabled=(
                "digest_or_summary_alone_is_sufficient",
                "duplicate_history_and_empty_inapplicable_appendices_required",
            ),
        )

    def test_child_result_references_verified_input_and_returns_only_assigned_deltas(self) -> None:
        text = self.reference_text("subagent-result-extension.md")
        blocks = self.fenced_blocks(text, "yaml")
        self.assertEqual(len(blocks), 1)
        block = "\n".join(line for line in blocks[0].splitlines() if not line.startswith("<!--"))
        result = yaml.safe_load(block)
        self.assertEqual(result["role"], "code-reviewer")
        self.assertIn(result["status"], ["success", "failed", "needs_input"])
        self.assertIn(result["verdict"], ["pass", "fail"])
        self.assertEqual(result["record_verification"], "READ_AND_HASH_VERIFIED")
        self.assertIn("path@version + sha256", result["review_record_ref"])
        self.assertIn("EMBEDDED_INPUT_RECORD", result["review_record_ref"])
        self.assertTrue(result["assignment_ref"])
        for field in (
            "prior_exception_history", "prior_exception_count", "prior_terminal_chain",
            "invalidated_attempt_lineage", "exceptional_review", "repositories",
        ):
            self.assertNotIn(field, result, "global facts are resolved from the verified record")
        coverage = result["coverage"]
        self.assertCountEqual(
            coverage,
            [
                "manifest_verification", "path_classification", "reviewed_paths_or_components",
                "reviewed_diff_complete", "unclassified", "scope_decision_blocked_ranges",
                "evidence_or_assignment_gaps",
            ],
        )
        self.assertTrue(coverage["manifest_verification"])
        for manifest in coverage["manifest_verification"]:
            self.assertEqual(set(manifest), {"repository_ref", "manifest_ref", "verification"})
            self.assertEqual(manifest["verification"], "MATCH")
            self.assertTrue(manifest["repository_ref"])
            self.assertTrue(manifest["manifest_ref"])
        self.assertIs(coverage["reviewed_diff_complete"], True)
        for field in (
            "path_classification", "reviewed_paths_or_components", "unclassified",
            "scope_decision_blocked_ranges", "evidence_or_assignment_gaps",
        ):
            self.assertEqual(coverage[field], [])
        for field in (
            "behavior_evidence", "causal_closure_updates", "findings", "scope_proposals",
            "evidence_blockers", "environment_only_notes", "commands_run",
        ):
            self.assertEqual(result[field], [])
        for severity in ("p0", "p1", "p2"):
            self.assertEqual(result[f"{severity}_count"], 0)
        consistency = self.policy["multi_repository_review"]["subagent_result_consistency"]
        self.assert_policy_flags(
            consistency,
            enabled=(
                "ids_globally_unique_per_review_id",
                "severity_counts_equal_findings",
                "fail_when_any_p0_p1_scope_violation_or_scope_proposal",
                "pass_requires_completed_assigned_coverage",
            ),
        )

    def test_production_evidence_requires_real_path_and_independent_expected_result(self) -> None:
        production = self.policy["production_evidence"]
        self.assertEqual(production["applies_to"], "TOUCHED_CRITICAL_PATHS_AND_FROZEN_INVARIANTS")
        self.assertCountEqual(
            production["required_evidence_dimensions"],
            [
                "production_entry_and_input_provider_or_parser",
                "actual_helper_and_substitution_boundary",
                "independent_expected_result_source",
                "legal_illegal_error_and_side_effect_behavior",
                "direct_callers_branches_targets_and_recovery_sequences",
                "remaining_unproven_boundary",
            ],
        )
        self.assert_policy_flags(
            production,
            enabled=(
                "one_evidence_row_may_cover_multiple_findings",
                "parser_comparison_uses_actual_owning_parser_semantics",
                "pair_required_legal_acceptance_with_illegal_rejection",
                "inspect_normal_transitions_only_when_relevant",
                "smallest_discriminating_existing_harness_preferred",
            ),
            disabled=(
                "real_database_or_cluster_alone_proves_production_semantics",
                "mock_of_reviewed_helper_proves_its_closure",
                "current_output_generated_expected_hash_proves_approved_binding",
                "source_string_order_proves_runtime_branch_execution",
                "alternate_parser_authority_may_be_invented",
                "historical_terminal_and_active_terminating_objects_may_be_conflated",
                "universal_new_test_platform_or_per_file_matrix_required",
            ),
        )

    def test_behavior_closure_follows_all_relevant_consumers_and_recovery_sequences(self) -> None:
        self.assert_policy_flags(
            self.policy["behavior_closure"],
            enabled=(
                "trace_direct_consumers_of_same_invariant",
                "include_ordinary_and_continuation_paths_when_present",
                "include_all_approved_targets_when_present",
                "inspect_cross_attempt_state_when_recovery_or_compensation_is_touched",
            ),
            disabled=(
                "one_line_change_is_sufficient_closure",
                "scope_expansion_or_unrelated_repository_rescan_allowed",
            ),
        )

    def test_same_id_causal_history_retains_acceptance_and_reviewer_responsibility(self) -> None:
        history = self.policy["remediation_rounds"]["causal_history"]
        self.assertCountEqual(
            history["categories"],
            ["original_unfixed", "introduced_by_fix", "pre_existing_unreported_cause"],
        )
        self.assertCountEqual(
            history["required_evidence"],
            [
                "prior_and_current_source",
                "first_discoverability",
                "prior_acceptance_and_status",
                "reviewer_responsibility",
            ],
        )
        self.assert_policy_flags(
            history,
            enabled=(
                "applies_even_when_finding_id_is_unchanged",
                "new_blocker_or_invalidated_closed_approved_path_requires_miss_assessment",
            ),
            disabled=(
                "same_id_or_scope_exempts_miss_accountability",
                "every_extra_cause_of_open_item_automatically_is_formal_miss",
                "silently_changed_acceptance_conditions_allowed",
            ),
        )

    def test_optional_p2_and_complexity_do_not_create_unapproved_blocking_work(self) -> None:
        self.assert_policy_flags(
            self.policy["optional_work"],
            enabled=(
                "mandatory_remediation_contains_only_confirmed_p0_p1",
                "p2_requires_explicit_selection_to_become_requested_work",
            ),
            disabled=(
                "selected_p2_automatically_becomes_blocking",
                "unselected_p2_enters_next_round_blocking_closure",
                "bundled_suggestion_to_close_all_p2_this_round_allowed",
            ),
        )
        self.assert_policy_flags(
            self.policy["scope"]["complexity_boundary"],
            enabled=(
                "review_minimum_fix_operational_and_maintenance_cost",
                "additional_manual_steps_gates_configuration_and_approvals_require_invariant_justification",
                "prefer_narrowing_false_claim_over_building_proof_infrastructure",
            ),
            disabled=(
                "no_new_architecture_surface_is_sufficient_justification",
                "generic_complexity_score_or_zero_guard_policy_required",
                "narrowing_false_claim_may_weaken_approved_requirements",
            ),
        )

    def test_evidence_reuse_requires_all_verified_inputs_not_just_unchanged_file_names(self) -> None:
        reuse = self.policy["evidence_reuse"]
        self.assertEqual(reuse["allowed_layer"], "source_local")
        self.assertCountEqual(reuse["decisions"], ["REUSE", "RERUN", "BLOCKED"])
        self.assertCountEqual(
            reuse["all_required"],
            [
                "same_verified_scope_and_approved_baselines",
                "prior_evidence_read_and_provenance_verified",
                "prior_and_current_original_content_reconstructable",
                "reviewed_delta_and_direct_dependency_closure",
                "exact_command_config_tool_inputs_and_external_fixture_identity",
                "independent_oracle_and_test_semantics_still_valid",
                "no_changed_input_to_the_reused_evidence",
            ],
        )
        self.assert_policy_flags(
            reuse,
            enabled=(
                "rebind_requires_new_review_id_exact_candidate_and_verdict",
                "delta_eligibility_also_requires_trustworthy_complete_prior_coverage_and_empty_gaps",
                "changed_gate_inputs_require_rerun",
            ),
            disabled=(
                "unchanged_file_or_commit_message_alone_is_sufficient",
                "live_observation_reuse_as_current_state_allowed",
                "exact_sha_ci_rebinding_allowed",
                "invalidated_method_or_miss_affected_coverage_reuse_allowed",
                "old_approval_automatically_inherited",
                "unrelated_changed_files_automatically_invalidate_all_evidence",
            ),
        )
        self.assertEqual(reuse["unknown_input_disposition"], "DO_NOT_REUSE_RESTORE_SMALLEST_CHECK")
        self.assertEqual(reuse["unreconstructable_or_unbounded_delta_disposition"], "INITIAL_FULL_REVIEW")
        self.assertTrue((SKILL_DIR / reuse["reference"]).is_file())

    def test_snapshot_delta_requires_original_content_and_trustworthy_full_coverage(self) -> None:
        eligibility = self.policy["review_modes"]["remediation_delta_review"]["delta_eligibility"]
        self.assertCountEqual(
            eligibility["previous_candidate_allowed"],
            ["immutable_commit", "verified_reconstructable_snapshot"],
        )
        self.assert_policy_flags(
            eligibility,
            enabled=(
                "same_scope_lock_required",
                "previous_candidate_must_be_reconstructable",
                "prior_initial_full_coverage_complete_required",
                "prior_scope_decision_blocked_ranges_must_be_empty",
                "prior_evidence_or_assignment_gaps_must_be_empty",
                "prior_gate0_or_partial_coverage_requires_initial_full_review",
                "changed_scope_lock_requires_initial_full_review_of_new_scope",
            ),
            disabled=("snapshot_digest_without_original_content_is_sufficient",),
        )
        self.assertEqual(
            eligibility["mutable_to_mutable_disposition"],
            "VERIFIED_DELTA_AND_DEPENDENCY_CLOSURE_OR_INITIAL_FULL_REVIEW",
        )

    def test_independence_requires_a_discriminating_method_not_reviewer_count(self) -> None:
        self.assert_policy_flags(
            self.policy["review_independence"],
            enabled=(
                "build_critical_path_and_assumptions_before_author_pass_narrative",
                "delta_prior_acceptance_conditions_must_not_be_hidden",
                "after_miss_requires_old_blind_spot_and_different_discriminating_method",
                "main_reviewer_revalidates_subagent_evidence",
            ),
            disabled=(
                "reviewer_identity_or_count_alone_is_sufficient",
                "changed_path_coverage_alone_is_behavior_proof",
                "maximize_finding_count_is_valid_objective",
            ),
        )

    def test_behavior_validation_is_independent_and_scores_all_four_dimensions(self) -> None:
        validation = self.policy["skill_behavior_validation"]
        self.assertCountEqual(
            validation["evaluation_dimensions"],
            ["missed_defect", "false_positive", "scope_creep", "convergence"],
        )
        self.assert_policy_flags(
            validation,
            enabled=(
                "applies_only_when_maintaining_skill",
                "paired_defective_and_corrected_raw_cases_required",
                "fixed_scope_p2_and_insufficient_evidence_controls_required",
                "raw_case_must_include_exact_source_binding_and_approved_requirement",
            ),
            disabled=(
                "independent_forward_test_sees_expected_answers",
                "policy_string_tests_alone_are_quality_proof",
                "reduced_fixture_claims_real_product_deployment_success",
            ),
        )
        self.assertTrue((SKILL_DIR / validation["reference"]).is_file())

    def test_verdicts_are_closed_and_conditional_pass_is_forbidden(self) -> None:
        self.assertEqual(
            self.policy["verdicts"],
            [
                "APPROVED",
                "CHANGES_REQUIRED",
                "SCOPE_DECISION_REQUIRED",
                "EVIDENCE_BLOCKED",
            ],
        )
        self.assertFalse(self.policy["conditional_pass_allowed"])

    def test_p2_never_blocks_or_gains_a_count_threshold(self) -> None:
        severity = self.policy["severity"]
        self.assertTrue(severity["P0"]["blocks_approval"])
        self.assertTrue(severity["P1"]["blocks_approval"])
        self.assertFalse(severity["P2"]["blocks_approval"])
        self.assertIsNone(severity["P2"]["count_threshold"])

    def test_scope_violation_is_removed_and_true_expansion_needs_a_decision(self) -> None:
        scope = self.policy["scope"]
        self.assertTrue(scope["baseline_driven"])
        self.assertFalse(scope["unlisted_architecture_surface_authorized"])
        self.assertFalse(scope["author_claim_is_approval"])
        self.assertEqual(
            scope["candidate_out_of_budget_delta"][
                "boundary_preserving_revert_or_delete_available"
            ],
            "CHANGES_REQUIRED_AS_STANDARD_P1_SCOPE_VIOLATION",
        )
        self.assertTrue(
            scope["candidate_out_of_budget_delta"][
                "main_reviewer_converts_to_standard_finding"
            ]
        )
        self.assertEqual(
            scope["candidate_out_of_budget_delta"]["required_severity"], "P1"
        )
        self.assertFalse(
            scope["candidate_out_of_budget_delta"][
                "reviewer_may_offer_expansion_instead_of_revert"
            ]
        )
        self.assertIn(
            "minimum_correct_fix_requires_unapproved_surface",
            scope["scope_decision_required_when"],
        )
        self.assertTrue(
            scope["independent_in_scope_review_continues_when_scope_proposal_exists"]
        )
        self.assertFalse(scope["scope_proposal_may_be_converted_to_finding"])
        self.assertGreaterEqual(len(scope["architecture_surfaces"]), 8)

    def test_blocking_findings_require_reproducer_and_budgeted_surface_delta(self) -> None:
        finding = self.policy["finding"]
        self.assertCountEqual(
            finding["required_identity_fields"],
            ["finding_id", "severity", "scope_classification"],
        )
        self.assertEqual(
            set(finding["required_for_p0_p1"]),
            {
                "provenance",
                "violated_frozen_invariant",
                "exact_evidence",
                "reproducer_or_failure_path",
                "impact",
                "minimum_boundary_preserving_fix",
                "architecture_surface_delta",
            },
        )
        self.assertEqual(
            finding["conditionally_required_fields"],
            {
                "within_approved_budget": ["architecture_budget_reference"],
                "previously_unavailable_evidence": [
                    "prior_evidence_blocker_id",
                    "prior_evidence_blocker_restoration_evidence",
                    "why_not_discoverable_previously",
                ],
                "post_terminal_new_ci_env": [
                    "prior_terminal_chain_reference",
                    "underlying_item_prior_source_nondiscoverability_evidence",
                    "why_not_discoverable_previously",
                ],
                "reviewer_miss": [
                    "prior_terminal_chain_reference",
                    "prior_candidate_discoverability_evidence",
                ],
                "continued_or_late_cause": ["causal_history"],
            },
        )
        self.assertFalse(finding["unused_conditional_fields_require_na_rows"])
        self.assertEqual(
            finding["allowed_architecture_surface_delta_for_p0_p1"],
            ["none", "within_approved_budget"],
        )
        self.assertFalse(finding["unapproved_architecture_surface_delta_allowed"])
        self.assertFalse(finding["best_practice_without_baseline_is_finding"])
        self.assertFalse(finding["pre_existing_issue_blocks_candidate"])
        self.assertTrue(
            finding["pre_existing_issue_may_block_when_candidate_expands_or_depends_on_it"]
        )

    def test_ci_and_environment_are_separate_from_source_verdict(self) -> None:
        layers = self.policy["evidence_layers"]
        self.assertTrue(layers["source"]["may_block_code_approval"])
        self.assertFalse(layers["ci"]["missing_or_not_run_blocks_source_approval"])
        self.assertTrue(layers["ci"]["failing_gate_may_prove_source_finding"])
        self.assertTrue(layers["ci"]["report_status_separately"])
        self.assertEqual(
            layers["ci"]["post_terminal_new_evidence_without_prior_blocker"],
            "NEW_INITIAL_FULL_REVIEW_FROM_REVIEW_ROOT_SCOPE_EFFECT_DERIVED_FROM_COPRESENT_APPROVED_SCOPE_CHANGING_CAUSE_OTHERWISE_SAME_ONLY_WHEN_UNDERLYING_ITEM_WAS_NOT_SUPPORTABLE_FROM_PRIOR_REQUIRED_SOURCE_EVIDENCE",
        )
        self.assertFalse(
            layers["environment"]["missing_activation_evidence_blocks_source_approval"]
        )
        self.assertTrue(
            layers["environment"]["reproduced_candidate_defect_may_prove_source_finding"]
        )
        self.assertTrue(layers["environment"]["report_status_separately"])
        self.assertEqual(
            layers["environment"][
                "post_terminal_new_evidence_without_prior_blocker"
            ],
            "NEW_INITIAL_FULL_REVIEW_FROM_REVIEW_ROOT_SCOPE_EFFECT_DERIVED_FROM_COPRESENT_APPROVED_SCOPE_CHANGING_CAUSE_OTHERWISE_SAME_ONLY_WHEN_UNDERLYING_ITEM_WAS_NOT_SUPPORTABLE_FROM_PRIOR_REQUIRED_SOURCE_EVIDENCE",
        )

    def test_remediation_review_is_delta_only_with_a_finite_stop_condition(self) -> None:
        rounds = self.policy["remediation_rounds"]
        self.assertTrue(rounds["preserve_scope_lock"])
        self.assertTrue(rounds["preserve_finding_ids"])
        self.assertTrue(rounds["ordinary_remediation_delta_only"])
        self.assertTrue(rounds["late_p0_p1_requires_explanation"])
        late = rounds["late_finding"]
        self.assertTrue(late["reviewer_miss_is_not_an_ordinary_delta_finding"])
        self.assertEqual(
            late["reviewer_miss_disposition"],
            "INVALIDATE_PRIOR_COVERAGE_AND_RUN_ONE_EXCEPTIONAL_INDEPENDENT_FULL_REVIEW",
        )
        self.assertEqual(
            late["repeated_miss_after_exception"],
            "EVIDENCE_BLOCKED_AND_HUMAN_REVIEW_PROCESS_DECISION",
        )
        self.assertFalse(rounds["p2_may_extend_review"])
        self.assertEqual(
            self.policy["approval_stop_condition"],
            {
                "p0_count": 0,
                "p1_count": 0,
                "unresolved_scope_proposals": 0,
                "open_evidence_blockers": 0,
                "required_source_local_gates_complete": True,
                "required_evidence_complete": True,
                "candidate_binding_stable": True,
                "initial_full_coverage_complete": True,
                "multi_repository_coverage_reconciled_when_applicable": True,
                "scope_decision_blocked_ranges": [],
                "evidence_or_assignment_gaps": [],
            },
        )

    def test_mutable_review_requires_stable_snapshot_and_cannot_get_certificate(self) -> None:
        binding = self.policy["candidate_binding"]
        mutable = binding["mutable_worktree"]
        self.assertEqual(
            mutable["snapshot_schema"],
            "testany.code-reviewer.worktree-snapshot.v1",
        )
        self.assertTrue(mutable["resolved_skill_script_path_required"])
        self.assertEqual(mutable["consecutive_internal_captures_required"], 2)
        self.assertFalse(mutable["hidden_index_flags_allowed"])
        self.assertFalse(mutable["dirty_submodules_allowed"])
        self.assertFalse(mutable["mutable_baseline_symlinks_allowed"])
        self.assertTrue(mutable["initial_snapshot_required"])
        self.assertTrue(mutable["recheck_after_validation"])
        self.assertTrue(mutable["recheck_immediately_before_verdict"])
        self.assertFalse(mutable["silent_rebind_allowed"])
        self.assertFalse(mutable["immutable_certificate_allowed"])
        self.assertEqual(
            mutable["approval_artifact"], "MUTABLE_WORKTREE_REVIEW_COMMENT"
        )

    def test_scope_decision_templates_include_explicit_verdict(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            with self.subTest(template=filename):
                records = self.terminal_records(filename, "SCOPE_DECISION_REQUIRED")
                self.assertEqual(len(records), 1)
                self.assertIn("Owner decision", records[0])
                self.assertIn("Confirmed findings", records[0])

    def test_higher_precedence_evidence_verdict_preserves_scope_decisions(self) -> None:
        self.assertTrue(self.policy["scope_proposal"]["higher_precedence_verdict_must_preserve_confirmed_proposals"])
        for filename in ("report-templates.md", "report-templates.en.md"):
            with self.subTest(template=filename):
                records = self.terminal_records(filename, "EVIDENCE_BLOCKED")
                self.assertEqual(len(records), 1)
                self.assertIn("Missing inputs", records[0])
                self.assertIn("Completed checks / confirmed findings / scope proposals", records[0])
                self.assertIn("Record", records[0]["Completed checks / confirmed findings / scope proposals"])

    def test_initial_and_multi_repo_coverage_are_closed(self) -> None:
        initial = self.policy["review_modes"]["initial_full_review"]
        delta = self.policy["review_modes"]["remediation_delta_review"]
        multi = self.policy["multi_repository_review"]
        self.assertTrue(initial["full_in_scope_coverage_required"])
        self.assertFalse(initial["may_stop_after_first_finding_batch"])
        self.assertTrue(delta["prerequisite_initial_full_coverage_complete"])
        self.assertTrue(delta["prior_verdict_does_not_control_delta_eligibility"])
        eligibility = delta["delta_eligibility"]
        self.assertTrue(eligibility["prior_initial_full_coverage_complete_required"])
        self.assertTrue(
            eligibility["prior_scope_decision_blocked_ranges_must_be_empty"]
        )
        self.assertTrue(
            eligibility["prior_evidence_or_assignment_gaps_must_be_empty"]
        )
        self.assertTrue(eligibility["prior_gate0_or_partial_coverage_requires_initial_full_review"])
        self.assertTrue(multi["shared_scope_lock_digest_required"])
        self.assertTrue(
            multi[
                "complete_scope_lock_content_or_persisted_charter_required_for_each_subreviewer"
            ]
        )
        self.assertTrue(multi["digest_alone_is_not_review_input"])
        self.assertTrue(multi["coverage_ledger_required"])
        self.assertTrue(multi["one_changed_path_manifest_per_repository"])
        self.assertTrue(multi["path_classification_is_repository_qualified"])
        self.assertFalse(multi["conditional_pass_allowed"])
        self.assertFalse(multi["partial_status_allowed"])
        self.assertTrue(
            multi[
                "scope_decision_blocked_ranges_must_be_empty_for_approval_or_delta_reuse"
            ]
        )
        self.assertTrue(
            multi[
                "evidence_or_assignment_gaps_must_be_empty_for_approval_or_delta_reuse"
            ]
        )
        mixed = multi["mixed_candidate_binding"]
        self.assertEqual(
            mixed["any_mutable_repository_requires_overall_artifact"],
            "MUTABLE_WORKTREE_REVIEW_COMMENT",
        )
        self.assertTrue(
            mixed["every_immutable_repository_row_retains_exact_candidate_and_tree"]
        )
        self.assertFalse(
            mixed["immutable_repository_may_be_represented_as_worktree_snapshot"]
        )
        self.assertTrue(
            mixed["snapshot_and_wip_appendices_apply_only_to_actual_mutable_repositories"]
        )
        self.assertFalse(
            mixed["mixed_comment_may_be_converted_to_immutable_certificate_after_commit"]
        )

    def test_evidence_binding_precedes_scope_judgment(self) -> None:
        self.assertEqual(self.policy["decision_precedence"][0], "EVIDENCE_BLOCKED")

    def test_immutable_certificate_binds_exact_reviewed_range(self) -> None:
        immutable = self.policy["candidate_binding"]["immutable_commit"]
        self.assertTrue(immutable["exact_commit_and_tree_required"])
        self.assertEqual(immutable["approval_artifact"], "CODE_REVIEW_APPROVAL_CERTIFICATE")
        self.assertIn("exact_repository_candidate_and_range_bindings", self.policy["review_record"]["required_once"])
        for filename in ("report-templates.md", "report-templates.en.md"):
            with self.subTest(template=filename):
                records = self.terminal_records(filename, "APPROVED")
                certificates = [record for record in records if "Artifact type" not in record]
                self.assertEqual(len(certificates), 1)
                self.assertIn("Scope", certificates[0])
                self.assertIn("Record", certificates[0]["Scope"])
                self.assertIn("Readiness", certificates[0])
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            payload = self.scope_template_payload(filename)
            for repository in payload["repositories"]:
                self.assertEqual(set(repository), {"repository_identity", "review_root_base"})
            rows = self.table_rows(self.reference_text(filename))
            self.assertIn(
                ["Repository / root reference", "Absolute checkout", "Reviewed from", "Candidate", "Tree / snapshot", "Exact reviewed range / ownership"],
                rows,
            )

    def test_every_terminal_artifact_binds_scope_and_coverage_state(self) -> None:
        lock = self.policy["scope_lock_binding"]
        self.assertEqual(lock["digest_script"], "scripts/scope_lock_digest.py")
        self.assertEqual(
            lock["payload_schema"], "testany.code-reviewer.scope-lock.v1"
        )
        self.assertTrue(lock["payload_is_closed"])
        self.assertTrue(lock["content_digest_required_after_charter_freeze"])
        self.assertTrue(
            lock[
                "terminal_artifact_must_reference_persisted_charter_with_digest_or_embed_full_canonical_payload"
            ]
        )
        self.assertTrue(lock["pre_charter_evidence_blocked_exception"]["allowed"])
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            with self.subTest(record=filename):
                payload = self.scope_template_payload(filename)
                self.assertEqual(
                    set(payload),
                    {
                        "schema", "repositories", "approved_baselines", "in_scope",
                        "out_of_scope", "must_not_change_or_regress", "architecture_budget",
                        "verification_boundary",
                    },
                )
                self.scope_digest.digest_payload(payload)
                fields = self.inline_record_fields(self.reference_text(filename))
                for key in ("initial_full_coverage_complete", "coverage_reconciled"):
                    self.assertIn(key, fields)
                for key in (
                    "unclassified", "scope_decision_blocked_ranges", "evidence_or_assignment_gaps",
                    "findings", "scope_proposals", "evidence_blockers", "environment_only_notes",
                    "blocking_items", "prior_terminal_chain",
                ):
                    self.assertEqual(fields[key], "[]", f"{filename}: {key}")
        self.assertEqual(
            self.scope_template_payload("scope-lock-template.md"),
            self.scope_template_payload("scope-lock-template.en.md"),
        )

    def test_mutable_approval_is_multi_repo_and_coverage_bound(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            records = self.terminal_records(filename, "APPROVED")
            comments = [record for record in records if "Artifact type" in record]
            self.assertEqual(len(comments), 1)
            self.assertEqual(comments[0]["Artifact type"], "REVIEW COMMENT — NOT AN IMMUTABLE CANDIDATE CERTIFICATE")
            self.assertIn("Record", comments[0]["Scope"])
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            rows = self.table_rows(self.reference_text(filename))
            layers = {row[0]: row[1:] for row in rows if row[0] in {"Source/local", "Exact-SHA CI", "Environment/deployment"}}
            self.assertEqual(set(layers), {"Source/local", "Exact-SHA CI", "Environment/deployment"})
            self.assertIn("NOT_APPLICABLE_UNTIL_COMMIT", layers["Exact-SHA CI"][0])
            self.assertEqual(layers["Source/local"][-1], "COMPLETE / INCOMPLETE")

    def test_changed_path_manifest_is_fully_classified(self) -> None:
        coverage = self.policy["coverage"]
        self.assertTrue(coverage["candidate_changed_path_manifest_required"])
        self.assertTrue(coverage["every_candidate_owned_path_must_be_classified"])
        self.assertTrue(coverage["unclassified_paths_must_be_empty"])
        self.assertEqual(
            coverage["immutable_allowed_path_classifications"],
            ["in_scope", "scope_violation"],
        )
        self.assertEqual(
            coverage["mutable_allowed_path_classifications"],
            ["in_scope", "scope_violation", "verified_filtered_baseline"],
        )
        self.assertTrue(
            coverage["verified_filtered_baseline"]["prior_raw_bytes_evidence_required"]
        )
        self.assertFalse(
            coverage["excluded_wip_reconciliation"][
                "immutable_diff_may_be_excluded_as_wip"
            ]
        )
        self.assertTrue(
            coverage["excluded_wip_reconciliation"][
                "must_be_absent_from_changed_path_manifest"
            ]
        )
        self.assertTrue(
            coverage["excluded_wip_reconciliation"][
                "attempt_charter_or_terminal_artifact_reference_required"
            ]
        )
        self.assertFalse(
            coverage["excluded_wip_reconciliation"][
                "semantic_scope_lock_payload_reference_allowed"
            ]
        )
        self.assertTrue(coverage["every_changed_path_manifest_entry_must_be_classified"])
        self.assertEqual(
            coverage["mutable_manifest_digest_field"],
            "manifest.candidate_changed_paths_sha256",
        )
        self.assertTrue(coverage["candidate_owned_ignored"]["must_enter_changed_path_manifest"])
        self.assertFalse(coverage["candidate_owned_ignored"]["mutable_baseline_option_may_substitute"])
        self.assertEqual(coverage["immutable_manifest_source"], "replacement_disabled_config_safe_git_diff_name_status")
        self.assertEqual(coverage["immutable_manifest_digest"], "sha256_of_raw_git_diff_name_status_no_renames_z_stdout")
        self.assertFalse(coverage["excluded_wip_reconciliation"]["committed_candidate_path_or_ancestor_descendant_may_be_excluded"])
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            rows = self.table_rows(self.reference_text(filename))
            self.assertIn(["Repository reference", "Manifest source / exact range", "Raw manifest SHA-256"], rows)
            self.assertIn(["Repo-qualified manifest path / layers / status", "Classification", "Scope/budget reference / evidence", "Assignment"], rows)

    def test_scope_proposals_are_closed_and_cannot_hide_scope_violations(self) -> None:
        proposal = self.policy["scope_proposal"]
        self.assertEqual(
            set(proposal["closed_fields"]),
            {
                "scope_proposal_id",
                "trigger",
                "provenance",
                "prior_evidence_blocker_id",
                "prior_evidence_blocker_restoration_evidence",
                "prior_terminal_chain_reference",
                "underlying_item_prior_source_nondiscoverability_evidence",
                "why_not_discoverable_previously",
                "conflicting_or_ambiguous_baselines",
                "approved_budget_reference",
                "exact_evidence",
                "why_revert_or_delete_is_not_a_correct_fix",
                "contaminated_paths_or_ranges",
                "minimum_owner_question",
                "boundary_preserving_recommendation",
                "expansion_option_consequence",
                "prior_candidate_discoverability_evidence",
                "causal_history",
            },
        )
        self.assertFalse(proposal["generic_best_practice_allowed"])
        self.assertFalse(
            proposal["directly_revertible_candidate_scope_violation_allowed"]
        )
        self.assertTrue(proposal["contaminated_ranges_must_match_coverage_gaps"])
        self.assertEqual(proposal["field_population"], "CORE_PROPOSAL_FIELDS_PLUS_APPLICABLE_PROVENANCE_FIELDS_ONLY")
        self.assertTrue(proposal["provenance_fields_follow_finding_conditional_requirements"])
        self.assertCountEqual(
            proposal["required_fields"],
            [
                "scope_proposal_id", "trigger", "provenance",
                "conflicting_or_ambiguous_baselines", "approved_budget_reference",
                "exact_evidence", "why_revert_or_delete_is_not_a_correct_fix",
                "contaminated_paths_or_ranges", "minimum_owner_question",
                "boundary_preserving_recommendation", "expansion_option_consequence",
            ],
        )
        applicable_fields = set(proposal["required_fields"])
        for condition, fields in self.policy["finding"]["conditionally_required_fields"].items():
            if condition != "within_approved_budget":
                applicable_fields.update(fields)
        self.assertEqual(set(proposal["closed_fields"]), applicable_fields)

    def test_conditional_provenance_retains_evidence_restoration_and_miss_modes(self) -> None:
        expected_provenance = {
            "initial_review", "remediation_delta", "previously_unavailable_evidence",
            "reviewer_miss", "post_terminal_new_ci_env",
        }
        expected_modes = {
            "initial_full_review": {"initial_review", "post_terminal_new_ci_env"},
            "remediation_delta_review": {"remediation_delta", "previously_unavailable_evidence"},
            "exceptional_full_review_after_reviewer_miss": expected_provenance,
        }
        for name in ("finding", "scope_proposal"):
            section = self.policy[name]
            self.assertCountEqual(section["allowed_provenance"], expected_provenance)
            self.assertEqual(set(section["provenance_by_review_mode"]), set(expected_modes))
            for mode, allowed in expected_modes.items():
                with self.subTest(item=name, mode=mode):
                    self.assertCountEqual(section["provenance_by_review_mode"][mode], allowed)
        finding = self.policy["finding"]
        self.assertTrue(finding["reviewer_miss_provenance_requires_exceptional_mode"])
        self.assertTrue(finding["post_terminal_new_ci_env_provenance_requires_matching_full_review_cause"])
        restored = finding["previously_unavailable_evidence"]
        self.assert_policy_flags(
            restored,
            enabled=(
                "prior_evidence_blocker_id_required",
                "same_invariant_and_range_required",
                "exact_restoration_evidence_required",
            ),
        )
        self.assertEqual(restored["missing_prior_blocker_disposition"], "REVIEWER_MISS")
        self.assertTrue(self.policy["scope_proposal"]["previously_unavailable_evidence_requires_prior_blocker_id"])

    def test_reviewer_miss_has_one_closed_exceptional_full_review_mode(self) -> None:
        mode = self.policy["review_modes"][
            "exceptional_full_review_after_reviewer_miss"
        ]
        self.assertEqual(mode["diff"], "review_root_base_to_current_candidate")
        self.assertTrue(mode["independent_reviewer_required"])
        self.assertTrue(mode["missed_scope_lock_is_immediate_prior_terminal_scope_lock"])
        self.assertEqual(mode["maximum_occurrences_per_missed_scope_lock"], 1)
        self.assertEqual(
            mode["immediate_prior_scope_lock_recovery_count_must_equal"], 0
        )
        self.assertTrue(
            mode[
                "may_compose_with_every_transition_cause_not_explicitly_incompatible"
            ]
        )
        self.assertTrue(
            mode["cumulative_exception_history_required_on_every_later_attempt"]
        )
        self.assertTrue(mode["invalidated_prior_main_reviewer_identity_required"])
        self.assertTrue(mode["prior_candidate_discoverability_evidence_required"])
        self.assertTrue(mode["terminal_gap_arrays_allowed"])
        self.assertTrue(
            mode["approval_or_coverage_reuse_requires_both_gap_arrays_empty"]
        )

        process = self.policy["evidence_blocker"]["review_process_integrity"]
        self.assertFalse(process["may_close_with_candidate_or_verification_evidence"])
        self.assertTrue(process["restoration_requires_explicit_user_review_process_authority"])
        self.assertEqual(
            process["restoration_action"],
            "NEW_INDEPENDENT_INITIAL_FULL_REVIEW_FROM_REVIEW_ROOT",
        )
        self.assertFalse(process["delta_review_after_closure_allowed"])
        self.assertEqual(
            process["trigger"],
            "REPEATED_REVIEWER_MISS_WHEN_IMMEDIATE_PRIOR_MISSED_SCOPE_LOCK_RECOVERY_COUNT_EQUALS_ONE",
        )

    def test_attempt_integrity_and_exception_history_are_persistent(self) -> None:
        attempt = self.policy["attempt_integrity"]
        self.assertTrue(attempt["main_reviewer_identity_required"])
        self.assertTrue(attempt["prior_exception_history_required_on_every_attempt"])
        self.assertTrue(
            attempt["prior_exception_history_entries_require_terminal_artifact_digest"]
        )
        self.assertTrue(
            attempt["global_prior_exception_count_must_equal_history_length"]
        )
        self.assertTrue(
            attempt[
                "immediate_prior_scope_lock_recovery_count_must_equal_history_filtered_by_missed_scope_lock"
            ]
        )
        self.assertTrue(
            attempt[
                "new_scope_lock_may_not_reset_recovery_count_for_the_immediate_prior_scope_lock"
            ]
        )
        self.assertTrue(attempt["review_id_is_unique_per_attempt"])
        self.assertFalse(attempt["review_id_reuse_after_candidate_snapshot_mode_or_reviewed_from_change"])
        self.assertTrue(attempt["each_prior_exception_history_entry_requires_missed_and_recovery_scope_lock_id_and_digest"])
        self.assertTrue(attempt["prior_exception_history_entries_must_be_verified_against_bound_terminal_artifact"])
        self.assertCountEqual(
            attempt["prior_exception_history_bound_fields_must_equal_terminal_artifact"],
            [
                "review_id", "missed_scope_lock_id_and_digest", "recovery_scope_lock_id_and_digest",
                "invalidated_prior_review_id", "invalidated_prior_main_reviewer_identity",
                "independent_main_reviewer_identity",
            ],
        )
        record = self.policy["review_record"]
        self.assertTrue(record["exception_history_may_use_verified_prior_chain_reference"])
        self.assertTrue(record["exception_count_still_derived_from_complete_verified_history"])

    def test_prior_terminal_and_drift_lineages_are_closed_and_non_blocking_p2_stays_non_blocking(self) -> None:
        chain = self.policy["prior_terminal_chain"]
        self.assertTrue(chain["required_when_an_immediate_prior_terminal_exists"])
        self.assertTrue(chain["first_attempt_without_prior_terminal_uses_explicit_empty_chain"])
        self.assertTrue(chain["legacy_explicit_na_for_no_prior_terminal_accepted"])
        causes = chain["transition_causes"]
        self.assertEqual(
            causes["representation_when_immediate_prior_terminal_exists"],
            "nonempty_unique_set_of_closed_records_keyed_by_cause",
        )
        self.assertEqual(
            causes["true_first_attempt_without_prior_terminal_must_equal"], []
        )
        self.assertCountEqual(
            causes["allowed"],
            [
                "ORDINARY_REMEDIATION", "PARTIAL_COVERAGE_CONTINUATION",
                "REVIEWER_MISS", "REPEATED_REVIEWER_MISS", "PROCESS_AUTHORITY_RESET",
                "POST_TERMINAL_NEW_CI_ENV", "SCOPE_DECISION_RESOLVED_PRESERVED",
                "SCOPE_DECISION_RESOLVED_CHANGED_OR_EXPANDED", "APPROVED_BASELINE_OR_SCOPE_CHANGED",
                "PRECHARTER_INPUTS_RESTORED_AND_SCOPE_LOCK_FIRST_FROZEN", "MUTABLE_TO_IMMUTABLE_REBIND",
            ],
        )
        self.assertEqual(set(causes["cause_requirements"]), set(causes["allowed"]))
        self.assertTrue(chain["p2_is_not_a_required_chain_item"])
        self.assertTrue(chain["approval_requires_every_prior_blocking_item_closed"])
        self.assertEqual(
            chain["scope_decision_resolution"]["preserved"][
                "scope_lock_effect_must_equal"
            ],
            "SAME",
        )
        self.assertEqual(
            chain["scope_decision_resolution"]["changed_or_expanded"][
                "scope_lock_effect_must_equal"
            ],
            "NEW",
        )

        drift = self.policy["invalidated_attempt_lineage"]
        self.assertTrue(drift["separate_from_prior_terminal_chain"])
        self.assertEqual(
            drift["transition_reason_must_equal"],
            "MUTABLE_SNAPSHOT_DRIFT_REBIND",
        )
        self.assertFalse(drift["invalidated_verdict_may_be_reused"])
        self.assertTrue(drift["validation_reuse_requires_verified_unaffected_inputs"])
        self.assertIn("evidence_reuse_decisions", drift["required_fields"])

        self.assertTrue(chain["bound_fields_may_resolve_through_read_verified_review_record"])
        self.assertTrue(chain["prior_and_current_scope_lock_id_and_digest_required"])
        self.assertEqual(chain["scope_lock_effect_required"], "SAME_OR_NEW")
        self.assertTrue(chain["one_canonical_prior_terminal_artifact_reference_must_be_reused_everywhere"])
        self.assertFalse(chain["redundant_prior_review_artifact_alias_allowed"])
        self.assertFalse(chain["prior_terminal_artifact_representation"]["summary_only_allowed"])
        self.assertTrue(chain["every_blocking_p0_p1_scope_proposal_and_evidence_blocker_from_immediate_prior_terminal_must_be_listed"])
        self.assertFalse(chain["prior_blocking_item_may_disappear_silently"])
        self.assertCountEqual(
            drift["required_fields"],
            [
                "invalidated_review_id", "old_snapshot_digest", "new_snapshot_digest",
                "resolved_snapshot_script_path_and_digest", "exact_argv",
                "exact_drift_evidence", "evidence_reuse_decisions",
            ],
        )
        self.assertEqual(drift["terminal_artifact_must_equal"], "N/A")
        self.assertTrue(drift["required_after_mutable_snapshot_drift_without_terminal"])
        self.assertTrue(drift["may_be_present_with_prior_terminal_chain"])

    def test_transition_causes_compose_without_combination_enums(self) -> None:
        chain = self.policy["prior_terminal_chain"]
        causes = chain["transition_causes"]
        self.assertNotIn(
            "PROCESS_AUTHORITY_RESET_WITH_APPROVED_SCOPE_CHANGE",
            causes["allowed"],
        )
        self.assertNotIn(
            "REVIEWER_MISS_EXCEPTION_WITH_POST_TERMINAL_NEW_CI_ENV",
            causes["allowed"],
        )
        precedence = chain["review_mode_precedence"]
        self.assertEqual(
            precedence["repeated_reviewer_miss"]["review_mode_must_equal"],
            "initial_full_review",
        )
        self.assertEqual(
            precedence["repeated_reviewer_miss"][
                "immediate_prior_missed_scope_lock_recovery_count_must_equal"
            ],
            1,
        )
        self.assertFalse(
            precedence["repeated_reviewer_miss"][
                "initial_full_coverage_complete_must_equal"
            ]
        )
        self.assertEqual(
            precedence["process_authority_reset"]["review_mode_must_equal"],
            "initial_full_review",
        )
        self.assertEqual(
            precedence["reviewer_miss"]["review_mode_must_equal"],
            "exceptional_full_review_after_reviewer_miss",
        )
        self.assertEqual(
            precedence["reviewer_miss"][
                "immediate_prior_missed_scope_lock_recovery_count_must_equal"
            ],
            0,
        )
        self.assertTrue(
            chain["process_integrity_reset"][
                "may_compose_with_scope_change_or_mutable_rebind"
            ]
        )
        rebind = chain["mutable_to_immutable_rebind"]
        self.assertFalse(rebind["full_review_mode_required"])
        self.assertTrue(rebind["mode_depends_on_verified_delta_and_all_copresent_causes"])
        self.assertTrue(rebind["missing_equivalence_or_bounded_delta_requires_full_review"])
        self.assertFalse(rebind["mutable_approval_may_be_converted_to_certificate"])
        self.assertTrue(rebind["delta_reuse_allowed_only_under_evidence_reuse_policy"])
        self.assertTrue(rebind["new_review_id_candidate_binding_and_verdict_required"])
        self.assertEqual(
            rebind["at_least_one_repository_must_transition"],
            {
                "prior_candidate_must_be": "WORKTREE_SNAPSHOT",
                "current_candidate_must_be": "IMMUTABLE_COMMIT_AND_TREE",
            },
        )
        self.assertEqual(
            rebind["current_candidate_for_every_repository_must_be"],
            "EXACT_IMMUTABLE_OR_VERIFIED_MUTABLE_BINDING",
        )
        self.assertTrue(rebind["certificate_requires_all_repositories_immutable"])
        self.assertTrue(
            rebind[
                "prior_immutable_repository_binding_must_remain_exact_unless_another_transition_cause_authorizes_and_evidences_its_change"
            ]
        )
        self.assertTrue(rebind["prior_and_current_binding_required_per_repository"])
        self.assertEqual(
            list(precedence),
            ["repeated_reviewer_miss", "process_authority_reset", "reviewer_miss", "other_full_review", "delta"],
        )
        self.assertNotIn("MUTABLE_TO_IMMUTABLE_REBIND", precedence["other_full_review"]["when_any_cause_present"])
        delta = precedence["delta"]
        self.assertCountEqual(
            delta["allowed_causes"],
            ["ORDINARY_REMEDIATION", "SCOPE_DECISION_RESOLVED_PRESERVED", "MUTABLE_TO_IMMUTABLE_REBIND"],
        )
        self.assert_policy_flags(
            delta,
            enabled=(
                "only_when_no_higher_precedence_cause_present",
                "remediation_delta_eligibility_must_also_pass",
                "rebind_requires_evidence_reuse_predicates",
                "unbounded_or_unreconstructable_delta_requires_initial_full_review",
            ),
        )
        self.assertFalse(chain["process_integrity_reset"]["delta_reuse_allowed"])
        self.assertTrue(
            chain["scope_lock_effect_consistency"]["NEW"][
                "full_review_mode_required"
            ]
        )
        self.assertTrue(
            self.policy["remediation_rounds"]["late_finding"][
                "exceptional_full_review_scope_effect_is_derived_from_transition_causes"
            ]
        )

    def test_precharter_sentinels_only_replace_unavailable_fields(self) -> None:
        sentinels = self.policy["prior_terminal_chain"][
            "precharter_prior_terminal_sentinels"
        ]
        self.assertEqual(
            sentinels["unavailable_repository_candidate_tree_and_range_fields"],
            "NOT_BOUND",
        )
        self.assertTrue(
            sentinels[
                "available_repository_candidate_tree_and_range_fields_must_remain_exact"
            ]
        )
        self.assertNotIn("repository_candidate_tree_and_range", sentinels)
        self.assertEqual(sentinels["review_mode"], "NOT_DETERMINED")
        self.assertEqual(sentinels["scope_lock_id_and_digest"], "NOT_FROZEN")
        self.assertTrue(sentinels["main_reviewer_identity_still_required"])
        self.assertTrue(sentinels["sentinels_must_equal_verified_prior_terminal_bytes"])

    def test_post_terminal_external_evidence_cannot_relabel_a_source_discoverable_miss(self) -> None:
        finding = self.policy["finding"]
        self.assertIn("post_terminal_new_ci_env", finding["allowed_provenance"])
        late = finding["post_terminal_new_ci_env"]
        self.assertEqual(
            late["prior_terminal_chain_must_include_cause"],
            "POST_TERMINAL_NEW_CI_ENV",
        )
        self.assertTrue(
            late[
                "underlying_item_non_discoverability_from_all_prior_required_source_evidence_required"
            ]
        )
        self.assertEqual(late["prior_source_discoverable_disposition"], "REVIEWER_MISS")
        proposal = self.policy["scope_proposal"]
        self.assertIn("post_terminal_new_ci_env", proposal["allowed_provenance"])
        self.assertEqual(
            proposal["post_terminal_new_ci_env"][
                "prior_source_discoverable_disposition"
            ],
            "REVIEWER_MISS",
        )
        self.assertTrue(late["prior_evidence_blocker_id_must_be_absent_or_na"])
        self.assertTrue(late["exceptional_mode_requires_reviewer_miss_cause_too"])
        self.assertTrue(late["exact_external_evidence_and_first_available_source_or_time_required"])
        self.assertTrue(proposal["post_terminal_new_ci_env"]["prior_terminal_chain_reference_required"])
        self.assertTrue(proposal["post_terminal_new_ci_env"]["exceptional_mode_requires_reviewer_miss_cause_too"])

    def test_process_reset_reviewer_is_outside_every_implicated_reviewer(self) -> None:
        process = self.policy["evidence_blocker"]["review_process_integrity"]
        self.assertTrue(
            process["blocker_must_list_all_implicated_main_reviewer_identities"]
        )
        self.assertTrue(
            process["restoration_main_reviewer_must_not_be_in_implicated_set"]
        )
        self.assertIn(
            "implicated_reviewer_identities",
            self.policy["evidence_blocker"]["closed_fields"],
        )

    def test_immutable_and_mutable_manifests_ignore_submodule_hiding_config(self) -> None:
        coverage = self.policy["coverage"]
        self.assertIn("worktree_mode_vs_index", coverage["mutable_manifest_layers"])
        self.assertIn("submodule_head_vs_index", coverage["mutable_manifest_layers"])
        immutable = self.policy["candidate_binding"]["immutable_commit"]
        self.assertFalse(immutable["replacement_objects_allowed"])
        self.assertTrue(immutable["replace_refs_and_legacy_grafts_must_be_absent"])
        self.assertTrue(immutable["binding_commands_require_git_no_replace_objects"])
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            text = self.reference_text(filename)
            for option in (
                "--ignore-submodules=none", "--no-ext-diff", "--no-textconv",
                "--no-renames", "--name-status", "GIT_NO_REPLACE_OBJECTS=1",
            ):
                self.assertIn(option, text)

    def test_verification_charter_cannot_override_closed_layer_semantics(self) -> None:
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            payload = self.scope_template_payload(filename)
            boundary = payload["verification_boundary"]
            self.assertEqual(len(boundary), 3)
            by_layer = {row["layer"]: row for row in boundary}
            self.assertEqual(set(by_layer), {"source", "ci", "environment"})
            for layer, required, effect in (
                ("source", True, "MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT"),
                ("ci", False, "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"),
                ("environment", False, "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"),
            ):
                with self.subTest(template=filename, layer=layer):
                    self.assertIs(by_layer[layer]["required_in_code_review"], required)
                    self.assertEqual(by_layer[layer]["effect_on_code_verdict"], effect)
                    invalid = deepcopy(payload)
                    row = next(row for row in invalid["verification_boundary"] if row["layer"] == layer)
                    row["required_in_code_review"] = not required
                    with self.assertRaises(self.scope_digest.ScopeLockError):
                        self.scope_digest.digest_payload(invalid)

    def test_all_terminal_shapes_bind_attempt_identity_and_mutable_state(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            with self.subTest(report=filename):
                text = self.reference_text(filename)
                shared = [record for record in self.markdown_records(filename) if "Review Record" in record]
                self.assertEqual(len(shared), 1)
                self.assertIn("EMBEDDED_REVIEW_RECORD", shared[0]["Review Record"])
                self.assertIn("path@version + sha256", shared[0]["Review Record"])
                self.assertTrue(shared[0]["Record verification"].startswith("READ_AND_HASH_VERIFIED"))
                self.assertIn("Required remediation IDs", shared[0])
                self.assertIn("Required decisions / inputs", shared[0])
                record_filename = filename.replace("report-templates", "scope-lock-template")
                self.assertIn(f"]({record_filename})", text)
                for verdict in self.policy["verdicts"]:
                    self.assertTrue(self.terminal_records(filename, verdict))
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            text = self.reference_text(filename)
            rows = self.table_rows(text)
            fields = {row[0] for row in rows}
            self.assertTrue(
                {"Review ID / main Reviewer", "Mode / round", "Scope Lock ID / digest", "Prior exception history", "Global / immediate-prior lock recovery count"} <= fields
            )
            self.assertIn(
                ["Repository reference", "Immutable base / HEAD", "Snapshot schema", "Resolved snapshot script + file sha256", "Exact argv", "Post-validation / pre-verdict recheck"],
                rows,
            )
            self.assertIn(
                ["Invalidated Review ID", "Old / new snapshot", "Snapshot script digest / exact argv", "Drift evidence", "Specific evidence reuse decision"],
                rows,
            )
            collections = self.inline_record_fields(text)
            for field in ("candidate_untracked", "candidate_ignored", "excluded_wip", "mutable_baselines", "evidence_reuse"):
                self.assertEqual(collections[field], "[]")

    def test_exceptional_full_review_is_not_a_delta_appendix(self) -> None:
        mode = self.policy["review_modes"]["exceptional_full_review_after_reviewer_miss"]
        self.assertEqual(mode["diff"], "review_root_base_to_current_candidate")
        self.assert_policy_flags(
            mode,
            enabled=(
                "invalidated_prior_review_id_required",
                "invalidated_prior_main_reviewer_identity_required",
                "prior_candidate_discoverability_evidence_required",
                "triggering_missed_item_id_type_and_evidence_required",
                "current_main_reviewer_must_differ_from_invalidated_prior_main_reviewer",
                "full_in_scope_coverage_required",
                "exception_history_required",
                "every_composed_cause_retains_its_own_evidence_and_binding_requirements",
            ),
        )
        delta = self.policy["finding"]["provenance_by_review_mode"]["remediation_delta_review"]
        self.assertNotIn("reviewer_miss", delta)
        self.assertNotIn("post_terminal_new_ci_env", delta)
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            self.assertIn(
                ["Missed item / type", "Prior-Candidate discoverability", "Missed lock / prior terminal reference", "Independent main / different evidence method"],
                self.table_rows(self.reference_text(filename)),
            )

    def test_scope_and_evidence_terminal_templates_bind_reusable_gates(self) -> None:
        record = self.policy["review_record"]
        self.assertIn("verification_results_and_limitations", record["required_once"])
        self.assertIn("prior_blocking_item_closure_when_applicable", record["required_once"])
        self.assertTrue(record["references_require_read_and_digest_verification"])
        delta = self.policy["review_modes"]["remediation_delta_review"]
        self.assertTrue(delta["prior_verdict_does_not_control_delta_eligibility"])
        self.assertTrue(delta["delta_eligibility"]["prior_scope_decision_blocked_ranges_must_be_empty"])
        self.assertTrue(delta["delta_eligibility"]["prior_evidence_or_assignment_gaps_must_be_empty"])
        process = self.policy["evidence_blocker"]["review_process_integrity"]
        self.assertFalse(process["delta_review_after_closure_allowed"])
        self.assertTrue(self.policy["evidence_reuse"]["delta_eligibility_also_requires_trustworthy_complete_prior_coverage_and_empty_gaps"])

    def test_item_templates_use_core_fields_with_shared_conditional_evidence(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            records = self.markdown_records(filename)
            findings = [record for record in records if "violated_frozen_invariant" in record]
            proposals = [record for record in records if "scope_proposal_id" in record]
            self.assertEqual(len(findings), 1)
            self.assertEqual(len(proposals), 1)
            self.assertEqual(set(findings[0]), set(self.policy["finding"]["required_for_p0_p1"]))
            self.assertEqual(set(proposals[0]), set(self.policy["scope_proposal"]["required_fields"]))
            text = self.reference_text(filename)
            rows = {row[0]: " ".join(row[1:]) for row in self.table_rows(text)}
            for condition in ("previously_unavailable_evidence", "post_terminal_new_ci_env", "reviewer_miss"):
                evidence = set(re.findall(r"`([a-z][a-z0-9_]+)`", rows[condition]))
                self.assertTrue(set(self.policy["finding"]["conditionally_required_fields"][condition]) <= evidence)
            self.assertIn("`architecture_budget_reference`", text)
            self.assertIn("`causal_history`", text)
        blocker = self.policy["evidence_blocker"]
        self.assertTrue(blocker["process_fields_required_only_for_review_process_integrity"])
        self.assertTrue(blocker["non_review_process_integrity_fields"]["process_specific_fields_may_be_omitted_or_na"])

    def test_complete_architecture_budget_placeholders_include_keep(self) -> None:
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            for action in ("KEEP", "ADD", "MODIFY", "DELETE", "NONE"):
                with self.subTest(template=filename, action=action):
                    payload = self.scope_template_payload(filename)
                    payload["architecture_budget"][0]["allowed_action"] = action
                    _, canonical = self.scope_digest.digest_payload(payload)
                    self.assertEqual(canonical["architecture_budget"][0]["allowed_action"], action)
            invalid = self.scope_template_payload(filename)
            invalid["architecture_budget"][0]["allowed_action"] = "ANY"
            with self.assertRaises(self.scope_digest.ScopeLockError):
                self.scope_digest.digest_payload(invalid)

    def test_workflow_exposes_exact_code_reviewer_command(self) -> None:
        nodes = {node["id"]: node for node in self.workflow["nodes"]}
        routes = {
            route["artifact"]: route for route in self.workflow["artifact_routes"]
        }
        self.assertEqual(nodes["code-reviewer"]["command"], "/code-reviewer")
        self.assertEqual(nodes["code-reviewer"]["lane"], "implementation")
        self.assertEqual(
            routes["IMPLEMENTATION_CANDIDATE"]["review_command"],
            "/code-reviewer",
        )
        command = (
            REPO_ROOT / "plugins" / "testany-eng" / "commands" / "code-reviewer.md"
        ).read_text(encoding="utf-8")
        self.assertIn("${CLAUDE_PLUGIN_ROOT}/skills/code-reviewer/SKILL.md", command)
        self.assertIn("不要在 command 层复制", command)
        self.assertNotIn("同一语义 Scope Lock", command)

    def test_guide_resolves_terminal_tool_by_host_not_claude_env_only(self) -> None:
        guide = (
            REPO_ROOT / "plugins" / "testany-eng" / "skills" / "guide" / "SKILL.md"
        ).read_text(encoding="utf-8")
        detection = (
            REPO_ROOT
            / "plugins"
            / "testany-eng"
            / "skills"
            / "guide"
            / "references"
            / "artifact-detection.md"
        ).read_text(encoding="utf-8")
        for text in (guide, detection):
            self.assertIn("Skill 资源解析规则", text)
            self.assertIn("不得假设该环境变量存在", text)
            self.assertIn("SHA-256", text)
            self.assertIn("verify", text)
            self.assertIn("extract", text)
            self.assertIn("每个实际 mutable", text)
        self.assertIn("按全部共存 causes 和全局 precedence", guide)
        rebind_route = next(line for line in guide.splitlines() if "`MUTABLE_TO_IMMUTABLE_REBIND`" in line)
        for token in ("precedence", "delta/rebind", "full review", "Review ID", "commit/tree", "verdict"):
            self.assertIn(token, rebind_route)
        self.assertIn("evidence-reuse", guide)
        self.assertIn("immutable 行只核对 exact SHA/tree", guide)
        self.assertIn("任一 mutable 行", guide)
        self.assertIn("只有所有行都匹配", detection)
        self.assertIn("整个 mixed comment stale", detection)

    def test_local_scope_or_evidence_gap_does_not_stop_independent_review(self) -> None:
        skill = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("继续审完全部可独立判断范围", skill)
        self.assertTrue(self.policy["scope"]["independent_in_scope_review_continues_when_scope_proposal_exists"])
        self.assertTrue(self.policy["scope"]["scope_contaminated_ranges_are_recorded_as_gaps"])
        gaps = self.policy["coverage"]["gap_types"]
        self.assertEqual(gaps["evidence_or_assignment_gaps"]["verdict_when_nonempty"], "EVIDENCE_BLOCKED")
        self.assertTrue(gaps["scope_decision_blocked_ranges"]["must_match_scope_proposal_contaminated_ranges"])
        self.assertEqual(gaps["scope_decision_blocked_ranges"]["verdict_when_nonempty_without_evidence_gap"], "SCOPE_DECISION_REQUIRED")

    def test_skill_entrypoint_is_compact_and_bilingual_templates_are_paired(self) -> None:
        skill_lines = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8").splitlines()
        self.assertLess(len(skill_lines), 500)
        for stem in ("scope-lock-template", "report-templates"):
            self.assertTrue((SKILL_DIR / "references" / f"{stem}.md").is_file())
            self.assertTrue((SKILL_DIR / "references" / f"{stem}.en.md").is_file())


if __name__ == "__main__":
    unittest.main()
