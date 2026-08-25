from __future__ import annotations

import unittest
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
        self.assertEqual(
            set(finding["required_for_p0_p1"]),
            {
                "provenance",
                "prior_evidence_blocker_id",
                "prior_evidence_blocker_restoration_evidence",
                "prior_terminal_chain_reference",
                "underlying_item_prior_source_nondiscoverability_evidence",
                "why_not_discoverable_previously",
                "violated_frozen_invariant",
                "exact_evidence",
                "reproducer_or_failure_path",
                "impact",
                "minimum_boundary_preserving_fix",
                "architecture_surface_delta",
                "architecture_budget_reference",
            },
        )
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
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            section = text.split("## B. SCOPE_DECISION_REQUIRED", 1)[1].split(
                "## C. EVIDENCE_BLOCKED", 1
            )[0]
            self.assertIn("Verdict: `SCOPE_DECISION_REQUIRED`", section)

    def test_higher_precedence_evidence_verdict_preserves_scope_decisions(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            section = text.split("## C. EVIDENCE_BLOCKED", 1)[1].split(
                "## D. Code Review Approval Certificate", 1
            )[0]
            self.assertIn("Confirmed findings", section)
            self.assertIn("Confirmed scope proposals / Owner decisions", section)
            self.assertIn("Confirmed proposal IDs", section)

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
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            section = text.split("## D. Code Review Approval Certificate", 1)[1].split(
                "## E. Mixed / Mutable Worktree", 1
            )[0]
            self.assertIn("Review root base", section)
            self.assertIn("Reviewed range", section)
            self.assertIn("Previous finding IDs", section)
            self.assertIn("Required source/local gates", section)
            self.assertIn("Required verification evidence", section)
            self.assertIn("Unresolved scope proposals | `0`", section)
            self.assertIn("Open evidence blockers | `0`", section)

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
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            for section_name, next_name in (
                ("## B. SCOPE_DECISION_REQUIRED", "## C. EVIDENCE_BLOCKED"),
                ("## C. EVIDENCE_BLOCKED", "## D. Code Review Approval Certificate"),
            ):
                section = text.split(section_name, 1)[1].split(next_name, 1)[0]
                self.assertIn("Initial full coverage complete", section)
                self.assertIn("Scope-decision-blocked ranges", section)
                self.assertIn("Evidence/assignment gaps", section)
                self.assertIn("Confirmed findings", section)

    def test_mutable_approval_is_multi_repo_and_coverage_bound(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            section = text.split("## E. Mixed / Mutable Worktree", 1)[1].split(
                "## F. Remediation", 1
            )[0]
            self.assertIn("| Repository | Review root base | Reviewed from", section)
            self.assertIn("| Candidate | Tree / worktree snapshot |", section)
            self.assertIn("{exact SHA or WORKTREE@sha256}", section)
            self.assertIn("{exact tree SHA or WORKTREE@sha256}", section)
            self.assertIn("{mutable repo only}", section)
            self.assertIn(
                "immutable replacement-disabled raw git command or WORKTREE snapshot field",
                section,
            )
            self.assertIn("Exact-SHA CI by repository", section)
            self.assertIn("NOT_APPLICABLE_UNTIL_COMMIT for mutable repo", section)
            self.assertIn("Initial full coverage source", section)
            self.assertIn("scope_decision_blocked_ranges=[]", section)
            self.assertIn("evidence_or_assignment_gaps=[]", section)
            self.assertIn("Required source/local gates", section)
            self.assertIn("Required verification evidence", section)
            self.assertIn("Unresolved scope proposals | `0`", section)
            self.assertIn("Open evidence blockers | `0`", section)

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
        extension = (
            SKILL_DIR / "references" / "subagent-result-extension.md"
        ).read_text(encoding="utf-8")
        self.assertIn("changed_path_manifests:", extension)
        self.assertIn("repository_identity:", extension)
        self.assertIn("manifest_changes:", extension)
        self.assertNotIn("changed_path_manifest_sha256:", extension)

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
            },
        )
        self.assertFalse(proposal["generic_best_practice_allowed"])
        self.assertFalse(
            proposal["directly_revertible_candidate_scope_violation_allowed"]
        )
        self.assertTrue(proposal["contaminated_ranges_must_match_coverage_gaps"])
        extension = (
            SKILL_DIR / "references" / "subagent-result-extension.md"
        ).read_text(encoding="utf-8")
        for field in proposal["closed_fields"]:
            self.assertIn(field, extension)

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
        extension = (
            SKILL_DIR / "references" / "subagent-result-extension.md"
        ).read_text(encoding="utf-8")
        for field in (
            "main_reviewer_identity:",
            "prior_exception_history:",
            "prior_exception_count:",
            "invalidated_prior_main_reviewer_identity:",
            "prior_candidate_discoverability_evidence:",
        ):
            self.assertIn(field, extension)
        self.assertIn("full immutable previous Candidate", extension)

    def test_prior_terminal_and_drift_lineages_are_closed_and_non_blocking_p2_stays_non_blocking(self) -> None:
        chain = self.policy["prior_terminal_chain"]
        self.assertTrue(chain["required_when_an_immediate_prior_terminal_exists"])
        causes = chain["transition_causes"]
        self.assertEqual(
            causes["representation_when_immediate_prior_terminal_exists"],
            "nonempty_unique_set_of_closed_records_keyed_by_cause",
        )
        self.assertEqual(
            causes["true_first_attempt_without_prior_terminal_must_equal"], []
        )
        self.assertIn("REVIEWER_MISS", causes["allowed"])
        self.assertIn("REPEATED_REVIEWER_MISS", causes["allowed"])
        self.assertIn("SCOPE_DECISION_RESOLVED_CHANGED_OR_EXPANDED", causes["allowed"])
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
        self.assertFalse(drift["invalidated_validation_may_be_reused"])

        extension = (
            SKILL_DIR / "references" / "subagent-result-extension.md"
        ).read_text(encoding="utf-8")
        for required in (
            "prior_terminal_chain:",
            "transition_causes:",
            "prior_scope_lock_id_and_digest:",
            "current_scope_lock_id_and_digest:",
            "scope_lock_effect: SAME | NEW | N/A",
            "invalidated_attempt_lineage:",
            "MUTABLE_SNAPSHOT_DRIFT_REBIND",
        ):
            self.assertIn(required, extension)

        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            self.assertIn("Prior Scope Lock ID / digest", text)
            self.assertIn("Current Scope Lock ID / digest", text)
            self.assertIn("Transition causes", text)
            self.assertNotIn("REVIEWER_MISS_EXCEPTION_WITH", text)
            self.assertIn("MUTABLE_SNAPSHOT_DRIFT_REBIND", text)
            self.assertIn("P2", text)

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
        self.assertTrue(
            chain["mutable_to_immutable_rebind"]["full_review_mode_required"]
        )
        rebind = chain["mutable_to_immutable_rebind"]
        self.assertEqual(
            rebind["at_least_one_repository_must_transition"],
            {
                "prior_candidate_must_be": "WORKTREE_SNAPSHOT",
                "current_candidate_must_be": "IMMUTABLE_COMMIT_AND_TREE",
            },
        )
        self.assertEqual(
            rebind["current_candidate_for_every_repository_must_be"],
            "IMMUTABLE_COMMIT_AND_TREE",
        )
        self.assertTrue(
            rebind[
                "prior_immutable_repository_binding_must_remain_exact_unless_another_transition_cause_authorizes_and_evidences_its_change"
            ]
        )
        self.assertTrue(rebind["prior_and_current_binding_required_per_repository"])
        self.assertTrue(
            rebind[
                "reviewed_from_must_equal_current_review_root_base_for_every_repository"
            ]
        )
        extension = (
            SKILL_DIR / "references" / "subagent-result-extension.md"
        ).read_text(encoding="utf-8")
        rebind_rule = next(
            line
            for line in extension.splitlines()
            if "mutable 或 mixed approval 被 commit 后" in line
        )
        self.assertNotIn("MUTABLE_TO_IMMUTABLE_REBIND + SAME", rebind_rule)
        self.assertIn("完整 cause 集合推导", rebind_rule)
        self.assertIn("REVIEWER_MISS", rebind_rule)

        prose_sources = [
            (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8"),
            (SKILL_DIR / "references" / "report-templates.md").read_text(
                encoding="utf-8"
            ),
            (SKILL_DIR / "references" / "report-templates.en.md").read_text(
                encoding="utf-8"
            ),
            (SKILL_DIR / "references" / "scope-lock-template.md").read_text(
                encoding="utf-8"
            ),
            (SKILL_DIR / "references" / "scope-lock-template.en.md").read_text(
                encoding="utf-8"
            ),
        ]
        for text in prose_sources:
            self.assertIn("repeated reviewer miss", text)
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
        extension = (
            SKILL_DIR / "references" / "subagent-result-extension.md"
        ).read_text(encoding="utf-8")
        self.assertIn("当时确实不可得的单个", extension)
        self.assertIn("其余可得字段仍须保留精确值", extension)

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
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            self.assertIn("prior_terminal_chain_reference", text)
            self.assertIn(
                "underlying_item_prior_source_nondiscoverability_evidence", text
            )

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
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            self.assertIn("--ignore-submodules=none", text)

    def test_verification_charter_cannot_override_closed_layer_semantics(self) -> None:
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            section = text.split("## 6. Verification boundary", 1)[1].split(
                "## 7. Coverage ledger", 1
            )[0]
            self.assertNotIn("{yes/no", section)
            self.assertIn("| Source/local tests | `YES", section)
            self.assertIn("| Exact-SHA CI | `NO`", section)
            self.assertIn("| Environment/deployment | `NO`", section)
            self.assertIn("MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT", section)
            self.assertIn("REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING", section)

    def test_all_terminal_shapes_bind_attempt_identity_and_mutable_state(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            mutable = text.split("## A. Review Comment", 1)[0]
            for required in (
                "Resolved script path + file SHA-256",
                "Exact argv (all options)",
                "candidate_ignored",
                "excluded_wip",
                "mutable_baseline",
                "owner + evidence-backed reason",
            ):
                self.assertIn(required, mutable)

            sections = {
                "A": text.split("## A. Review Comment", 1)[1].split(
                    "## B. SCOPE_DECISION_REQUIRED", 1
                )[0],
                "B": text.split("## B. SCOPE_DECISION_REQUIRED", 1)[1].split(
                    "## C. EVIDENCE_BLOCKED", 1
                )[0],
                "C": text.split("## C. EVIDENCE_BLOCKED", 1)[1].split(
                    "## D. Code Review Approval Certificate", 1
                )[0],
                "D": text.split("## D. Code Review Approval Certificate", 1)[1].split(
                    "## E. Mixed / Mutable Worktree", 1
                )[0],
                "E": text.split("## E. Mixed / Mutable Worktree", 1)[1].split(
                    "## F. Remediation", 1
                )[0],
            }
            for section in sections.values():
                self.assertIn("Main Reviewer identity", section)
                self.assertIn(
                    "reviewer-miss recovery history / global count / immediate-prior Scope Lock recovery count",
                    section,
                )

    def test_exceptional_full_review_is_not_a_delta_appendix(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            delta = text.split("## F. Remediation delta section", 1)[1].split(
                "## G. Exceptional reviewer-miss full review", 1
            )[0]
            exceptional = text.split(
                "## G. Exceptional reviewer-miss full review", 1
            )[1]
            self.assertNotIn("Invalidated prior main Reviewer identity", delta)
            for required in (
                "Invalidated prior terminal artifact",
                "Invalidated prior main Reviewer identity",
                "Prior-Candidate discoverability evidence",
                "Current independent main Reviewer identity",
                "Current exception ordinal",
            ):
                self.assertIn(required, exceptional)

    def test_scope_and_evidence_terminal_templates_bind_reusable_gates(self) -> None:
        proposal_fields = set(self.policy["scope_proposal"]["closed_fields"])
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            b = text.split("## B. SCOPE_DECISION_REQUIRED", 1)[1].split(
                "## C. EVIDENCE_BLOCKED", 1
            )[0]
            c = text.split("## C. EVIDENCE_BLOCKED", 1)[1].split(
                "## D. Code Review Approval Certificate", 1
            )[0]
            for field in proposal_fields:
                self.assertIn(field, b)
            for section in (b, c):
                self.assertIn("Required source/local gates and exact results", section)
                self.assertIn("Required verification evidence", section)
                self.assertIn("terminal Candidate is an immutable commit/tree", section)
                self.assertIn("WORKTREE is always NO", section)
            self.assertIn("review_process_integrity", c)

    def test_complete_architecture_budget_placeholders_include_keep(self) -> None:
        for filename in ("report-templates.md", "report-templates.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            self.assertNotIn("complete ADD/MODIFY/DELETE/NONE", text)
            self.assertIn("complete KEEP/ADD/MODIFY/DELETE/NONE", text)

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
        self.assertIn("没有更高优先 cause时为 initial full", guide)
        self.assertIn("immutable 行只核对 exact SHA/tree", guide)
        self.assertIn("任一 mutable 行", guide)
        self.assertIn("只有所有行都匹配", detection)
        self.assertIn("整个 mixed comment stale", detection)

    def test_local_scope_or_evidence_gap_does_not_stop_independent_review(self) -> None:
        skill = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("继续审完全部可独立判断范围", skill)
        for filename in ("scope-lock-template.md", "scope-lock-template.en.md"):
            text = (SKILL_DIR / "references" / filename).read_text(encoding="utf-8")
            self.assertIn("Proceed with independently reviewable ranges", text)

    def test_skill_entrypoint_is_compact_and_bilingual_templates_are_paired(self) -> None:
        skill_lines = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8").splitlines()
        self.assertLess(len(skill_lines), 500)
        for stem in ("scope-lock-template", "report-templates"):
            self.assertTrue((SKILL_DIR / "references" / f"{stem}.md").is_file())
            self.assertTrue((SKILL_DIR / "references" / f"{stem}.en.md").is_file())


if __name__ == "__main__":
    unittest.main()
