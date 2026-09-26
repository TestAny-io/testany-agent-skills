# Short Code Review Report

Use one Review Record and one concise conclusion. The record may be embedded or a readable versioned reference. Expand only new findings, open items and key evidence, not scope/hashes/history or inapplicable appendices. Verify a referenced version once and fetch primary evidence as needed. Follow the user's output language.

```markdown
Review: {Review ID / mode / Record path@version + digest or embedded record}
Candidate: {exact commit/tree or WORKTREE@snapshot per repository; full manifest in appendix}
Source verdict: {APPROVED | CHANGES_REQUIRED | SCOPE_DECISION_REQUIRED | EVIDENCE_BLOCKED}
Blocking: {P0/P1 + OPEN SD/EB; [] if none}
Coverage/evidence: {new checks + reuse basis + actual gaps; primary evidence references}
Next: {minimum fix/evidence/Owner question; stop if APPROVED}
CI: {exact SHA + status}; Environment: {separate status}
Optional P2: {only real suggestions, never bundled into approval}
```

## Items

- **P0/P1**: `finding_id, severity, scope_classification, provenance, violated_frozen_invariant, exact_evidence, reproducer_or_failure_path, impact, minimum_boundary_preserving_fix, architecture_surface_delta`. Use `scope_classification: in_scope | scope_violation` and `provenance: initial_review | remediation_delta | previously_unavailable_evidence | reviewer_miss | post_terminal_new_ci_env`; keep causal explanation separate. Reference exact source, inputs and results. Add the budget row only for within-budget surface changes; restored evidence only for a prior EB; prior visibility, invalidated closure and changed validation method only for a reviewer miss. No N/A tables.
- **SD**: `proposal_id, conflicting_or_missing_approval, affected_range, smallest_owner_question`. When deleting/reverting an unauthorized Candidate change restores a clear baseline, issue a standard P1 scope violation instead of soliciting expansion.
- **EB**: `blocker_id, missing_input, affected_range_or_invariant, smallest_restoration_evidence`. Missing evidence is not a P1; a miss count is not an EB. Preserve all independently confirmed findings and SDs.
- **closure**: original ID and acceptance, CLOSED/OPEN and evidence; causal class if applicable. Unselected P2s are not carried as blockers. Delta/recovery expands only new content, not the full issue history.

## APPROVED

Require zero P0/P1, all prior blockers closed, no SD/EB, complete necessary source evidence, a stable Candidate and trusted complete coverage with no gaps. Stop once satisfied.

All immutable: `Code Review Approval Certificate`, referencing exact commits/trees. Any mutable: `Mixed / Mutable Worktree Review Comment — NOT AN IMMUTABLE CANDIDATE CERTIFICATE`, limited to bound snapshots. Source approval grants no push/CI/merge/deployment permission.

## binding_only receipt

```markdown
Binding revision: {original Review ID / revision; still-valid APPROVED reference}
Binding: {reviewed snapshot/commit → exact commit/tree per repository}
Proof: {verify_candidate_binding.py SAME_CONTENT receipt reference/digest}
Context: {same Scope Lock and necessary evidence dependencies, no newer blocker/withdrawal}
Source: {original APPROVED applies to these exact bindings}
CI: {actual new-SHA status}; Environment: {separate status}
```

All [evidence-reuse.md](evidence-reuse.md) preconditions apply; the tool receipt is not approval. No semantic delta means no new Review ID, unrelated test rerun or repeated approval round. All immutable bindings plus the original valid source approval form the current certificate; otherwise retain a mixed comment.

## focused_recovery_review

Record `invalidated closure/reviewer responsibility → root cause and directly affected range → different validation method → closure`. Both first and repeated misses follow impact, not counts. A full review needs concrete shared-assumption or coverage invalidation evidence. Legacy exceptional/reset records are historical evidence only.
