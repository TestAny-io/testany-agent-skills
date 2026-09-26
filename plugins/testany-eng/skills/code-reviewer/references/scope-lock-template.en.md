# Code Review Record

Keep one authoritative record, embedded or referenced by readable `path@version + sha256`. Read and verify a version once; load only relevant primary evidence on follow-up. Put large manifests/hashes/raw output in machine appendices, not repeated chat messages. Digest verification does not replace reviewing the source evidence. Unknown inputs use `NOT_BOUND / NOT_FROZEN`; omit inapplicable appendices.

## Identity and scope

`review_id: CRV-<UUIDv4>`; stable reviewer identity; `mode: initial_full_review | remediation_delta_review | focused_recovery_review`; current binding revision; output language; latest valid prior record reference. A substantive review gets a new ID. Capture retries and proven same-content commit binding keep the ID and add a binding revision.

Freeze this closed v1 payload using `scripts/scope_lock_digest.py <payload.json>`. Normal remediation preserves it. Original authorized decisions, not author notes or recycled reviewer comments, establish approval. Keep the canonical payload once and reference its digest thereafter.

```json
{
  "schema": "testany.code-reviewer.scope-lock.v1",
  "repositories": [{"repository_identity": "host/org/repo", "review_root_base": "0000000000000000000000000000000000000000"}],
  "approved_baselines": [{"baseline_type": "User decision", "exact_reference": "path@version", "approval_evidence": "decision-id", "governs": "Product scope"}],
  "in_scope": ["exact approved behavior"],
  "out_of_scope": ["deployment"],
  "must_not_change_or_regress": ["existing wire"],
  "architecture_budget": [{"surface": "endpoint", "allowed_action": "MODIFY", "approved_source": "decision-id", "exact_boundary": "internal endpoint only"}],
  "verification_boundary": [
    {"layer": "source", "required_in_code_review": true, "required_gates": ["unit"], "evidence_boundary": "local Candidate", "effect_on_code_verdict": "MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT"},
    {"layer": "ci", "required_in_code_review": false, "required_gates": [], "evidence_boundary": "exact SHA after push", "effect_on_code_verdict": "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"},
    {"layer": "environment", "required_in_code_review": false, "required_gates": [], "evidence_boundary": "live activation", "effect_on_code_verdict": "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"}
  ]
}
```

The tool normalizes NFC/whitespace, sorts unordered sets and rejects duplicates, unknown keys/enums, invalid types and conflicting facts. Repository identity is a stable approved ID or sanitized canonical remote identity. Checkout path, Candidate, verdict and excluded WIP are not semantic scope. Budget includes changes to responsibility, trust and dependencies, not only resources. Scope digest is not authorization.

## Candidate bindings and coverage

One row per repository:

| Repository / scope row | Absolute checkout | Reviewed from | Candidate | Tree / snapshot | Manifest reference |
|---|---|---|---|---|---|
| exact identity | path | full base or verified prior binding | full commit / WORKTREE | full tree / WORKTREE@sha256 | version + digest |

- Initial review covers the entire in-scope diff. Delta covers original blockers, changed behavior and direct impact; retain trusted prior coverage. Recovery covers the invalidated invariant and related paths, expanding only for demonstrated shared assumptions or unbounded impact.
- Immutable diff: reject replace refs/grafts; use `GIT_NO_REPLACE_OBJECTS=1` and `git diff --name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none <from> <candidate> --`. Hash the raw manifest once.
- Mutable: save `snapshot_worktree.py` resolved path/version, complete argv and full snapshot JSON. Record candidate-owned untracked/ignored files and excluded WIP ownership. `--candidate-ignored` and `--mutable-baseline` are distinct; exclusion cannot hide committed changes. One final snapshot MATCH after the last validation may serve both post-validation and pre-verdict. New writes require a new check.
- Machine manifest classifies paths as `in_scope / scope_violation / verified_filtered_baseline`. The last applies only to raw-worktree-versus-index changes with filter/EOL and prior-raw proof; never to mode/gitlink changes. Main verifies the manifest once per binding; children verify assigned inputs.
- Compact coverage index: trusted initial coverage reference, new reviewed paths/components, assignments only if used, and `unclassified / scope_decision_blocked_ranges / evidence_or_assignment_gaps`. Bind scope gaps to SD and evidence/assignment gaps to EB. Approval requires all empty and trustworthy complete coverage. Existing trustworthy partial work is preserved while gaps are completed.

## Evidence and blocking items

Only touched critical invariants need a behavior row:

`invariant → production entry/provider/parser → actual helper and substitutions → independent oracle → legal/illegal/failure results → direct consumers/branches/targets/recovery`

A result can support several findings. Record command, exact inputs, owner, result/evidence reference, meaningful skip/limitation and reuse reason. Writer/CI owns an equivalent expensive run; Reviewer validates evidence and makes the minimum independent probe. No per-file test matrix or duplicate run by default.

Keep one closure table for original P0/P1/SD/EB: stable ID, original acceptance, status, affected range, new evidence and any `original_unfixed / introduced_by_fix / pre_existing_unreported_cause`. P2 is separate and never automatically carried as a blocker. Read only relevant prior history; do not copy it into every round.

For a reviewer miss, note invalidated closure, why the old check missed it, affected/sibling paths and the different validation method. A count does not trigger a reset. Full review needs a concrete scope/coverage/assumption reason; PM approval and a new main are not default recovery steps.

## Terminal and binding receipt

Reference this record once from the short report. Source/local, exact-SHA CI and environment remain separate. Use [evidence-reuse.md](evidence-reuse.md) for reuse decisions and same-content `binding_only`.

A binding receipt contains original Review ID/valid APPROVED reference, old→new exact per-repo bindings, script result artifact/digest, unchanged scope and evidence dependencies, and separate CI/environment status. It carries no new approval authority. A newer blocker or withdrawal invalidates the fast path. All immutable bindings plus the still-valid source approval form the exact-commit certificate without a duplicate review round. Legacy records remain evidence; do not migrate history or revive count-based escalation.
