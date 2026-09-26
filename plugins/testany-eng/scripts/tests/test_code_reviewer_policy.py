"""Policy compatibility invariants; behavioral decisions require blind review.

The v2 count/reset-state tests are replaced by v3 bounded recovery, binding-only
and reuse requirements. Snapshot/scope/envelope adversarial tests remain intact.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import re
import unittest
import yaml

PLUGIN = Path(__file__).resolve().parents[2]
SKILL = PLUGIN / 'skills/code-reviewer'
REFS = SKILL / 'references'


class CodeReviewerPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = yaml.safe_load((REFS / 'review-policy.yaml').read_text())
        spec = importlib.util.spec_from_file_location('scope_policy_test', SKILL / 'scripts/scope_lock_digest.py')
        cls.scope = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.scope)

    def test_modes_do_not_escalate_by_miss_count_or_new_log(self):
        self.assertEqual(self.p['version'], 3)
        self.assertEqual(set(self.p['review_modes']), {'initial_full_review', 'remediation_delta_review', 'focused_recovery_review', 'binding_only'})
        selection = self.p['review_selection']
        for field in ('repeated_miss_automatically_blocks_process', 'miss_automatically_requires_new_main',
                      'review_reset_requires_pm_approval', 'new_ci_or_environment_log_alone_requires_full_review'):
            self.assertFalse(selection[field])
        self.assertTrue(selection['newer_blocker_or_withdrawal_overrides_older_approval'])
        self.assertIn('impact_cannot_be_isolated', selection['full_review_requires_concrete_reason'])
        self.assertIn('shared_baseline_or_oracle_invalidates_all_coverage', selection['full_review_requires_concrete_reason'])
        self.assertTrue(self.p['review_modes']['focused_recovery_review']['preserve_unaffected_coverage'])

    def test_binding_receipt_is_not_a_new_approval_or_a_bypass(self):
        mode = self.p['review_modes']['binding_only']
        for field in ('semantic_review', 'new_review_id', 'new_test_run_by_default'):
            self.assertFalse(mode[field])
        binding = self.p['candidate_binding']['binding_only']
        self.assertFalse(binding['receipt_is_approval'])
        self.assertIn('no_newer_blocker_withdrawal_or_semantic_requirement_change', binding['require'])
        self.assertIn('valid_prior_source_approved_with_complete_coverage_and_no_open_blockers', binding['require'])
        self.assertIn('identical_entire_candidate_raw_bytes_paths_modes_and_gitlinks', binding['require'])
        self.assertIn('commands_configuration_toolchain_fixtures_and_oracles_unchanged', binding['require'])
        self.assertFalse(binding['ci_transfer_between_shas'])
        self.assertFalse(binding['environment_or_deployment_approval_transfer'])
        self.assertEqual(binding['commit_sensitive_tests'], 'INVALIDATE_WHEN_COMMIT_METADATA_IS_AN_INPUT')

    def test_candidate_protection_remains_exact_and_raw(self):
        immutable = self.p['candidate_binding']['immutable_commit']
        self.assertTrue(immutable['no_replace_refs_or_legacy_grafts'])
        self.assertTrue(immutable['git_no_replace_objects'])
        self.assertFalse(immutable['external_diff_and_textconv'])
        mutable = self.p['candidate_binding']['mutable_worktree']
        self.assertEqual(mutable['consecutive_capture_count'], 2)
        for field in ('allow_hidden_index_flags', 'allow_dirty_submodules', 'allow_symlink_baselines', 'excluded_wip_may_hide_committed_candidate'):
            self.assertFalse(mutable[field])
        self.assertTrue(mutable['candidate_owned_ignored_requires_explicit_capture'])
        self.assertEqual(mutable['recheck'], 'ONCE_AFTER_LAST_VALIDATION_IMMEDIATELY_BEFORE_VERDICT')
        self.assertFalse(mutable['read_only_ack_requires_recheck'])

    def test_reuse_requires_independent_evidence_and_invalidation(self):
        reuse = self.p['evidence_reuse']
        self.assertEqual(set(reuse['require']), {'verified_prior_result', 'exact_content_binding', 'same_invariant_and_oracle', 'unaffected_or_reviewed_dependency_delta', 'equivalent_command_config_toolchain_fixture'})
        for field in ('author_pass_without_primary_evidence_sufficient', 'invalidated_coverage_reusable', 'live_evidence_transfer', 'exact_sha_ci_transfer'):
            self.assertFalse(reuse[field])
        ownership = self.p['validation_ownership']
        self.assertFalse(ownership['concurrent_duplicate_run_allowed'])
        self.assertEqual(set(ownership['rerun_triggers']), {'relevant_inputs_changed', 'result_missing_or_untrustworthy', 'specific_invariant_not_covered'})
        self.assertTrue(ownership['check_actual_ci_entry_and_configuration_early'])

    def test_scope_and_findings_keep_authority_and_minimum_fix(self):
        scope = self.p['scope']
        self.assertFalse(scope['unlisted_architecture_surface_authorized'])
        self.assertFalse(scope['author_claim_or_old_reviewer_comment_is_approval'])
        self.assertTrue(scope['semantic_trust_ownership_dependency_changes_are_surfaces'])
        self.assertEqual(scope['candidate_out_of_budget_delta']['boundary_preserving_revert_available'], 'P1_SCOPE_VIOLATION')
        self.assertFalse(scope['candidate_out_of_budget_delta']['offer_expansion_instead_of_revert'])
        self.assertFalse(scope['complexity_boundary']['weakening_approved_requirements_allowed'])
        for field in ('violated_frozen_invariant', 'exact_evidence', 'reproducer_or_failure_path', 'impact', 'minimum_boundary_preserving_fix', 'architecture_surface_delta'):
            self.assertIn(field, self.p['finding']['required'])
        self.assertTrue(self.p['finding']['stable_id_and_original_acceptance_required'])
        self.assertFalse(self.p['finding']['missing_evidence_is_automatically_p1'])

    def test_production_oracle_and_recovery_chain_not_weakened(self):
        production = self.p['production_evidence']
        self.assertIn('production_entry_provider_parser_and_configuration', production['require_for_touched_critical_paths'])
        self.assertIn('legal_illegal_and_failure_outcomes', production['require_for_touched_critical_paths'])
        for field in ('real_dependency_alone_proves_real_production_input', 'implementation_generated_expected_value_is_independent_oracle', 'static_string_order_or_test_name_proves_behavior', 'mock_of_reviewed_logic_proves_behavior'):
            self.assertFalse(production[field])
        self.assertTrue(production['management_compiler_must_express_required_runtime_input_when_touched'])
        self.assertTrue(self.p['behavior_closure']['stateful_failure_requires_relevant_consecutive_attempts'])
        self.assertFalse(self.p['behavior_closure']['fix_one_line_is_sufficient'])

    def test_approval_keeps_blockers_coverage_gaps_and_stops_without_p2_gate(self):
        self.assertFalse(self.p['conditional_pass_allowed'])
        self.assertEqual(self.p['decision_precedence'], ['EVIDENCE_BLOCKED', 'SCOPE_DECISION_REQUIRED', 'CHANGES_REQUIRED', 'APPROVED'])
        self.assertEqual(set(self.p['approval_stop_condition']['all_required']), {'p0_p1_zero', 'prior_blockers_closed', 'no_open_sd_or_eb', 'necessary_source_evidence_complete', 'candidate_stable', 'trusted_complete_coverage', 'all_gap_sets_empty'})
        self.assertFalse(self.p['severity']['P2']['blocks_approval'])
        self.assertIsNone(self.p['severity']['P2']['count_threshold'])
        self.assertFalse(self.p['optional_work']['selected_p2_automatically_becomes_blocking'])
        self.assertFalse(self.p['optional_work']['unselected_p2_enters_next_round_blocking_closure'])
        self.assertFalse(self.p['approval_stop_condition']['continue_after_conditions_met'])
        self.assertFalse(self.p['approval_stop_condition']['approval_grants_external_action_permission'])

    def test_bilingual_scope_payloads_keep_exact_v1_canonical_contract(self):
        digests = []
        for name in ('scope-lock-template.md', 'scope-lock-template.en.md'):
            payloads = re.findall(r'```json\n(.*?)\n```', (REFS / name).read_text(), re.S)
            self.assertEqual(len(payloads), 1)
            payload = json.loads(payloads[0])
            value, canonical = self.scope.digest_payload(payload)
            self.assertEqual(canonical['schema'], 'testany.code-reviewer.scope-lock.v1')
            digests.append(value)
        self.assertEqual(digests[0], digests[1])

    def test_progressive_reading_and_machine_appendices(self):
        self.assertFalse(self.p['reading']['author_summary_replaces_primary_evidence'])
        self.assertFalse(self.p['reading']['recursive_history_replay_required'])
        self.assertTrue(self.p['review_record']['relevant_primary_evidence_must_be_read'])
        self.assertFalse(self.p['review_record']['report_full_copy_of_appendices'])
        self.assertFalse(self.p['coordination']['reply_to_ack_required'])
        self.assertFalse(self.p['coordination']['unchanged_status_message_or_new_review_turn_required'])

    def test_paths_and_shared_subagent_envelope_resolve(self):
        entry = (SKILL / 'SKILL.md').read_text()
        self.assertLess(len(entry.splitlines()), 500)
        for binding in self.p['candidate_binding'].values():
            if 'tool' in binding:
                self.assertTrue((SKILL / binding['tool']).is_file())
        for path in [SKILL / 'SKILL.md', *REFS.glob('*.md')]:
            for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
                if '://' not in target and not target.startswith('#'):
                    self.assertTrue((path.parent / target.split('#')[0]).exists(), (path, target))
        extension = (REFS / 'subagent-result-extension.md').read_text()
        block = re.search(r'```yaml\n(.*?)\n```', extension, re.S).group(1)
        block = re.sub(r'<!--.*?-->', '', block)
        result = yaml.safe_load(block)
        self.assertEqual(result['status'], 'success')
        self.assertEqual(result['verdict'], 'pass')
        for name in self.p['coverage']['required_gap_sets']:
            self.assertEqual(result['coverage'][name], [])
        self.assertIn('assignment_ref', result)

    def test_guide_routes_to_new_modes_and_preserves_source_only_authority(self):
        guide = (PLUGIN / 'skills/guide/SKILL.md').read_text()
        for mode in ('focused_recovery_review', 'binding_only', 'remediation_delta_review'):
            self.assertIn(mode, guide)
        artifact = (PLUGIN / 'skills/guide/references/artifact-detection.md').read_text()
        self.assertIn('receipt', artifact)
        self.assertIn('较新 blocker/撤回', artifact)
        workflow = yaml.safe_load((PLUGIN / 'skills/guide/references/workflow-map.yaml').read_text())
        review = next(node for node in workflow['nodes'] if node['id'] == 'code-reviewer')
        self.assertEqual(review['command'], '/code-reviewer')


if __name__ == '__main__':
    unittest.main()
