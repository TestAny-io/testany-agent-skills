# Code Review Output Templates

Each terminal uses one [Review Record](scope-lock-template.en.md) and the applicable body below; A–G are selectors, not sections to emit together. The Record holds the complete Charter, per-repository bindings, manifests/coverage, behavioral evidence, three verification layers, prior chain/closure, and applicable appendices. Reference it instead of copying its tables. Omit mutable, drift, or miss appendices when inapplicable; keep empty collections as `[]`.

## Shared terminal header and approval conditions

```markdown
# Code Review — {verdict}

- Review Record: {complete EMBEDDED_REVIEW_RECORD or readable path@version + sha256}
- Record verification: READ_AND_HASH_VERIFIED (including canonical Scope Lock digest recomputation)
- P0 / P1 / P2: {n / n / n}
- Required remediation IDs: [] (confirmed P0/P1 only)
- Required decisions / inputs: [] (SD / EB IDs)

{Applicable A–E body only; F or G references the Record according to mode}
```

Read and verify the Record, its prior terminal/history, and referenced item bodies; a digest, summary, or count cannot replace them. Verify, decode, and read embedded prior terminals with `terminal_artifact_envelope.py`. Do not issue a verdict on mismatched Record versions/fixed bindings. Pre-charter unknowns use the Charter's closed sentinels while preserving main Reviewer identity and all available exact fields.

Precedence is `EVIDENCE_BLOCKED > SCOPE_DECISION_REQUIRED > CHANGES_REQUIRED > APPROVED`. `APPROVED` requires P0=P1=0, all SD/EB closed, every prior blocking item CLOSED, required source/local evidence COMPLETE, stable Candidate bindings, complete reconciled initial full coverage, and `[]` for unclassified and both gap lists. Report CI/environment separately; undeployed state or CI NOT_RUN is not a source defect. Create a standard finding only when evidence proves a Candidate violation of a frozen invariant.

P2 is optional: without explicit selection it does not become remediation, enter mandatory closure, extend review, or invite a bundled request to "fix them all this round." Selection does not automatically make it blocking. No source verdict authorizes CI triggers, merge, Secret, migration, deployment, live smoke, or release.

## Item bodies (stored once in the Record registry)

### P0/P1 finding

Structured items still contain explicit `finding_id`, `severity`, and `scope_classification: in_scope | scope_violation`. A human-readable heading is presentation only; do not infer counts by guessing from headings.

```markdown
### {CR-P0/P1-ID} — {title}

- provenance: {allowed by review-policy.yaml and matched to mode}
- violated_frozen_invariant: {exact approved baseline requirement}
- exact_evidence: {repo + Candidate + path:line/symbol}
- reproducer_or_failure_path: {reproducible inputs and failure path}
- impact: {user/system effect}
- minimum_boundary_preserving_fix: {minimum repair; justify any added operational/gate complexity}
- architecture_surface_delta: none / within_approved_budget
```

Add `architecture_budget_reference` only for `within_approved_budget`. When the Candidate crossed a boundary and deletion/revert correctly restores compliance, use a P1 titled `scope violation`; the minimum fix is deletion/revert only, with net surface delta `none`, not an Owner proposal. Never silently change prior acceptance or approved scope to support a new finding.

### SD scope proposal

```markdown
### {SD-ID}

- scope_proposal_id: {original ID}
- trigger: baseline_conflict / ambiguous_baseline / minimum_correct_fix_requires_unapproved_surface
- provenance: {closed provenance matched to mode}
- conflicting_or_ambiguous_baselines: [] / {exact references}
- approved_budget_reference: {exact Charter row / NONE}
- exact_evidence: {repo + Candidate + path:line/symbol}
- why_revert_or_delete_is_not_a_correct_fix: {evidence-backed reason}
- contaminated_paths_or_ranges: [] / {exact ranges}
- minimum_owner_question: {one concrete decision}
- boundary_preserving_recommendation: {one recommendation}
- expansion_option_consequence: {baselines to update + new Scope Lock / full review}
```

Generic best practices and directly removable Candidate scope violations are not SD. Before the Owner decision, do not convert a proposal to P0/P1 or derive new requirements from it. Each contaminated range must map one-to-one to the Record's `scope_decision_blocked_ranges`; keep the array empty when the proposal does not impede remaining coverage.

### Conditional provenance (shared by findings/proposals; emit only when applicable)

| Condition | Required evidence or exact Record reference |
|-----------|----------------------------------------------|
| `previously_unavailable_evidence` | `prior_evidence_blocker_id`, `prior_evidence_blocker_restoration_evidence`, `why_not_discoverable_previously`; the prior EB must cover the same invariant/range, otherwise use miss handling |
| `post_terminal_new_ci_env` | `prior_terminal_chain_reference` containing `POST_TERMINAL_NEW_CI_ENV`, `underlying_item_prior_source_nondiscoverability_evidence`, `why_not_discoverable_previously`; the chain binds first availability/source/time and cannot relabel an issue discoverable in old source as new evidence |
| `reviewer_miss` | `prior_terminal_chain_reference`, `prior_candidate_discoverability_evidence`; follow the Record's independent-review rules |
| continued / late cause | `causal_history` references unified closure: `original_unfixed / introduced_by_fix / pre_existing_unreported_cause`, old/new code, first visibility, prior acceptance/status, and Reviewer responsibility |

The same ID does not exempt miss accountability. An extra cause of the same OPEN issue is not automatically a formal miss, but a previously unreported blocking item or unsupported CLOSED/APPROVED path requires miss assessment. Mode/provenance follows the closed matrix in [review-policy.yaml](review-policy.yaml); a new ID or scope cannot evade responsibility.

### EB and environment-only note

| Type | Required fields |
|------|-----------------|
| EB | `evidence_blocker_id`, `blocker_kind`, `frozen_invariant`, `repository_identity`, `affected_paths_or_ranges`, `missing_input`, `smallest_restoration_evidence`, `status` |
| Additional `review_process_integrity` fields | `prior_exception_terminal_artifact`, `second_missed_item_id_type_and_evidence`, `implicated_reviewer_identities`; exact references to the Record's miss appendix are allowed |
| Environment-only note | `note_id`, `exact_evidence`, `readiness_gap`, `source_verdict_effect: NONE` |

EB kinds are limited to `candidate_binding / approved_baseline / source_access / verification_evidence / review_process_integrity`. Even at Gate 0 retain available repo/range fields and `NOT_FROZEN`; other EB kinds omit empty process-only fields. Missing evidence is not itself a source defect. All IDs are unique within the shared Review ID, and original issues keep their IDs. Counts must equal actual findings; summaries/counts cannot discard items.

## A. Review Comment / CHANGES_REQUIRED

```markdown
Confirmed findings: {exact Record P0/P1 item references and concise impact}
Required remediation: {only those P0/P1 IDs; retain each boundary}
Verdict: CHANGES_REQUIRED
```

Use for at least one confirmed P0/P1 with no higher-precedence SD/EB. If blocked ranges remain, use B/C and preserve every confirmed finding. P2 cannot enter required remediation.

## B. SCOPE_DECISION_REQUIRED

```markdown
Owner decision: {Record SD ID + minimum_owner_question}
Recommendation: {boundary-preserving recommendation; baseline/Scope Lock effect of expansion}
Confirmed findings: [] / {Record item references}
Verdict: SCOPE_DECISION_REQUIRED
```

Use B only without evidence gaps. A local scope decision does not stop independently reviewable ranges. After the decision, assess delta eligibility using complete Record coverage, source evidence, closure of all SD/EB, and [evidence-reuse.md](evidence-reuse.md). Do not categorically reject verified snapshots or automatically inherit prior approval.

## C. EVIDENCE_BLOCKED

```markdown
Missing inputs: {Record EB ID + smallest_restoration_evidence}
Completed checks / confirmed findings / scope proposals: {exact Record references; [] when empty}
Verdict: EVIDENCE_BLOCKED
```

Preserve every confirmed P0/P1 and SD, including Owner questions, despite EB precedence. Bind every evidence/assignment gap to EB. The minimum restoration for `review_process_integrity` is explicit user authority for a new independent main outside the implicated set to begin an initial full review from the review root. Candidate changes, tests, or ordinary evidence cannot close it, and this attempt is never delta eligible.

## D. Code Review Approval Certificate (all repositories immutable)

```markdown
# Code Review Approval Certificate

Scope: {Record exact immutable Candidate/tree bindings}
Source verdict: APPROVED
Readiness: {Record references for separate exact-SHA CI / environment status}
```

Use only when every approval condition is met and every repository binds an exact immutable commit/tree. P2 may remain non-blocking; the certificate does not authorize deployment or other external operations.

## E. Mixed / Mutable Worktree Review Comment / APPROVED

```markdown
# Mixed / Mutable Worktree Code Review

Scope: {Record per-repository Candidate/tree or WORKTREE snapshot bindings}
Source verdict: APPROVED
Artifact type: REVIEW COMMENT — NOT AN IMMUTABLE CANDIDATE CERTIFICATE
```

If any repository remains mutable, use E for the entire multi-repository artifact. Immutable repositories retain their real SHA/tree, never fabricated snapshots. Actual mutable repositories require the Record's complete Mutable Binding Appendix and both MATCH rechecks. The verdict binds only the specified snapshot/baseline; explicitly excluded third-party WIP and non-Candidate ignored files are outside that binding.

A snapshot change or partial/full commit requires a new Review ID and bindings. Uncommitted repositories may remain verified mutable; D is available only when all are immutable. An old comment cannot automatically become a certificate. Reuse eligible source/local evidence only item by item under evidence-reuse; live status never carries over and CI does not transfer to another SHA.

## F. Remediation delta section (remediation mode only)

Reference the Record's single `blocking_items` closure, delta binding, and behavioral evidence instead of appending separate P0/P1, SD, and EB tables. For each original ID state status, causal classification, minimum fix, and relevant regression. The previous Candidate may be immutable or a verified reconstructable snapshot; every reuse prerequisite must hold.

Ordinary delta late items follow policy for remediation-introduced problems or new evidence restored from a prior EB. A miss cannot masquerade as ordinary delta; post-terminal CI/environment follows its own cause and strict prior nondiscoverability proof. Composed causes accumulate constraints and resolve in one review, not duplicate reports.

## G. Exceptional reviewer-miss full review (never append F)

Reference the Record's Reviewer-miss Appendix, full root→Candidate coverage, original-ID closure, and the A/B/C/D/E terminal body matching the verdict. The first independent review reconstructs production paths/assumptions before checking author PASS and uses a different evidence method; changing a Reviewer ID alone is not independent evidence.

One exceptional full review consolidates every finding/proposal/blocker into one verdict. History contains only a readable verified prior reference plus new recovery bindings. A second miss against the same missed lock requires `review_process_integrity` and user authority for a new independent initial full review; NEW/rebind cannot reset the quota.
