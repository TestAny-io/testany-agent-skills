# Code Review Record / Charter Template

Maintain one Review Record per attempt: embed it in full or reference a readable `path@version + sha256`. Recipients must read it, verify its file hash, and recompute the Scope Lock digest; an ID/digest alone is insufficient. Freeze the Charter before implementation review, add coverage/evidence as work proceeds, and bind the terminal to the final version. Children reference frozen input/assignment versions; the final Record references verified inputs and results. The main Reviewer reconciles fixed bindings before merging deltas, never overwriting referenced versions or asking children to compute a self-referential final Record digest.

Unknown inputs that affect the decision require `EVIDENCE_BLOCKED` or `SCOPE_DECISION_REQUIRED`. Before Charter binding, use `NOT_BOUND` only for genuinely unknown fields, `NOT_DETERMINED` for mode, and `NOT_FROZEN` for Scope Lock; preserve every known exact field. Keep empty collections as `[]`; do not emit walls of `N/A` or inapplicable appendices.

## 1. Identity and canonical Charter

| Field | Value |
|-------|-------|
| Review ID / main Reviewer | `CRV-<UUIDv4> / stable identity/task` (unique to this attempt; never rebound) |
| Mode / round | `initial_full_review / remediation_delta_review / exceptional_full_review_after_reviewer_miss`; Round N |
| Scope Lock ID / digest | `{stable ID / sha256}` |
| User objective / output language | `{explicit request / en or zh-CN}` |
| Prior exception history | `[] / one readable, verified history reference + new entries` |
| Global / immediate-prior lock recovery count | `{expanded history length / entries whose missed lock matches the immediate-prior terminal, 0 or 1}` |

Keep the complete closed payload below in the Charter, without separate copies of baseline, scope, budget, or verification tables. Generate the canonical payload/digest with this Skill's `scripts/scope_lock_digest.py <payload.json>`; the v1 schema is unchanged:

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

The script normalizes NFC/surrounding whitespace, sorts unordered sets, and rejects duplicates, missing/extra keys, semantic conflicts, non-full lowercase Git SHAs, wrong types, and unknown enums. Each repository has one root, each of the three layers one row, and each budget surface boundary one fact. Source is fixed to required=true; CI/environment to false and the effects above, which attempt text cannot override. Repository identity is an approved slug/UUID or canonical remote host/path without userinfo/query/fragment; without a remote, a stable ID requires user approval.

Author notes, self-test PASS, and Candidate claims are not approved baselines. Unbudgeted surfaces cannot be ADD/MODIFY/DELETE; retaining a surface without byte or semantic change needs no additional authority. Absolute checkout paths, Candidate/tree, mode, coverage, verdict, the digest itself, and excluded WIP are outside the payload. Ordinary remediation or moving a checkout does not change the semantic Scope Lock.

## 2. Exact repository binding

One row per repository; reference `review_root_base` directly from its Charter repository row instead of creating another authority.

| Repository / root reference | Absolute checkout | Reviewed from | Candidate | Tree / snapshot | Exact reviewed range / ownership |
|-----------------------------|-------------------|---------------|-----------|-----------------|----------------------------------|
| `{Charter repository row}` | `{absolute path}` | `{exact base / previous Candidate}` | `{full SHA / WORKTREE}` | `{full tree SHA / WORKTREE@sha256}` | `{exact endpoints / clean or classified staged, unstaged, untracked, ignored}` |

- Initial: approved base → Candidate. Exceptional: each `review_root_base` → Candidate; manifests/ranges must have that same start.
- Remediation: previous Candidate → current Candidate. The previous Candidate may be an immutable commit/tree or a verified reconstructable snapshot under [evidence-reuse.md](evidence-reuse.md), with bound reconstruction/comparison evidence. A snapshot digest is not a Git SHA; the snapshot tool's `--base` remains an immutable SHA.
- Modes, transitions, and full-review triggers follow [review-policy.yaml](review-policy.yaml). Snapshot changes and mutable→immutable transitions require a new Review ID, binding, and verdict; old approval does not convert automatically.

### Mutable Binding Appendix (actual mutable repositories only)

| Repository reference | Immutable base / HEAD | Snapshot schema | Resolved snapshot script + file sha256 | Exact argv | Post-validation / pre-verdict recheck |
|----------------------|-----------------------|-----------------|----------------------------------------|------------|---------------------------------------|
| `{section 2 row}` | `{full SHA / full SHA}` | `testany.code-reviewer.worktree-snapshot.v1` | `{resolved absolute path to this Skill's scripts/snapshot_worktree.py / sha256}` | `{--repo, --base, and every --exclude, --candidate-ignored, --mutable-baseline}` | `MATCH / MATCH` |

- `candidate_untracked: []`; actual entries contain the exact path and Candidate-ownership evidence.
- `candidate_ignored: []`; actual entries contain the exact path, ownership evidence, and `--candidate-ignored`.
- `excluded_wip: []`; actual entries contain the path, owner, evidence-backed reason, and `--exclude`.
- `mutable_baselines: []`; actual entries contain the absolute path, sha256, and `--mutable-baseline`.

The snapshot binds these collections; never assume all dirty files belong to the Candidate. Excluded WIP must disappear from the manifest and cannot exclude immutable diffs, committed Candidate paths in `base..HEAD`, or their ancestors/descendants. A path still in the manifest is not excluded WIP. Capture all Candidate-owned ignored files with `--candidate-ignored`; `--mutable-baseline` cannot substitute. Uncertain ownership cannot be silently ignored. A `DRIFT` recheck invalidates the attempt and forbids a verdict on the old snapshot; missing rechecks or unstable bindings require EB.

### Invalidated attempt lineage (pre-terminal drift only)

| Invalidated Review ID | Old / new snapshot | Snapshot script digest / exact argv | Drift evidence | Specific evidence reuse decision |
|-----------------------|--------------------|------------------------------------|----------------|----------------------------------|
| `{old CRV ID; no terminal}` | `{both digests}` | `{readable evidence reference}` | `{exact mismatch}` | `{section 4 reuse record / []}` |

The reason is always `MUTABLE_SNAPSHOT_DRIFT_REBIND`. An invalidated attempt is not a terminal and cannot be hidden as a true first attempt; preserve this lineage even after an immutable commit. Only individually verified evidence can be reused, never the invalidated verdict.

## 3. Manifest and coverage

| Repository reference | Manifest source / exact range | Raw manifest SHA-256 |
|----------------------|-------------------------------|----------------------|
| `{section 2 row}` | `{exact command / snapshot field; reconstruction comparison evidence when needed}` | `{sha256}` |

For immutable Git endpoints, first require both `refs/replace` and legacy `info/grafts` absent; resolve commits/trees and run diff with `GIT_NO_REPLACE_OBJECTS=1`. Directly SHA-256 raw stdout from `git diff --name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none <reviewed-from> <candidate> --`. WORKTREE uses `manifest.candidate_changed_paths` and `manifest.candidate_changed_paths_sha256`; retain separate exact evidence for reconstructed-snapshot delta comparisons, never disguise them as Git SHA ranges.

| Repo-qualified manifest path / layers / status | Classification | Scope/budget reference / evidence | Assignment |
|-----------------------------------------------|----------------|-----------------------------------|------------|
| `{each path, including all manifest layers}` | `in_scope / scope_violation / verified_filtered_baseline` | `{exact row; filtered requires filter/EOL + prior-raw evidence}` | `{main / child task ID}` |

Immutable paths permit only the first two classes. `verified_filtered_baseline` is limited to WORKTREE paths whose sole change is `raw_worktree_vs_index/RAW`, with evidence of both an existing filter/EOL representation and prior raw bytes. Classify `worktree_mode_vs_index` and `submodule_head_vs_index` too, but never as filtered. Excluded WIP is not a classification value.

| Assignment / exact repository range | Paths / components / risk domains | Reviewer | Complete | Typed gaps |
|------------------------------------|----------------------------------|----------|----------|------------|
| `{unique assignment ID / section 2 range reference}` | `{complete diff allocation}` | `{identity/task}` | `YES / NO` | `[] / exact SD- or EB-bound ranges` |

- `initial_full_coverage_complete: YES / NO`; source: `{this review or verified prior coverage}`.
- `coverage_reconciled: YES / NO` (all repositories, manifests, assignments, and shared Scope Lock).
- `unclassified: []`; `scope_decision_blocked_ranges: []`; `evidence_or_assignment_gaps: []`.

Each scope-blocked range maps one-to-one to a closed SD proposal's contaminated range; each missing-evidence/unassigned range binds EB. The former requires `SCOPE_DECISION_REQUIRED`, the latter `EVIDENCE_BLOCKED`; EB takes precedence when both exist without dropping SD. APPROVED or later delta reuse requires complete reconciled coverage and empty unclassified and both gap collections.

## 4. Behavioral evidence and verification results

Independently map production paths and assumptions before checking author PASS. Use the table only for critical surfaces touched by this change, not a full matrix per file. Identify the production entry, actual helper, stub/mock/substitution boundaries, and uncovered behavior; test expectations alone are not an independent oracle.

| Frozen invariant | Production entry / parser | Actual helper + substitutions | Independent oracle / source | Legal / illegal / failure outcome | Direct callers / branches / targets / retry sequence; uncovered boundaries |
|------------------|---------------------------|-------------------------------|-----------------------------|-----------------------------------|--------------------------------------------------------------------------|
| `{approved baseline row}` | `{path:symbol and entry inputs}` | `{actual calls and substitution boundaries}` | `{independent approved semantics/reference}` | `{applicable inputs, expected and observed evidence}` | `{checked propagation paths and explicit gaps}` |

State/resourceVersion, historical terminal Pods, exit codes, and similar examples apply only when touched and governed by approved semantics; do not derive new scope from examples.

| Layer | Exact evidence / command / result | Status |
|-------|-----------------------------------|--------|
| Source/local | `{Charter required_gates, actual environment/inputs, results linked to behavior rows}` | `COMPLETE / INCOMPLETE` |
| Exact-SHA CI | `{per-repository SHA and result; mutable is NOT_APPLICABLE_UNTIL_COMMIT}` | `{SUCCESS / FAILED / NOT_RUN}` |
| Environment/deployment | `{live source, time, and readiness gap; no inherited live status}` | `{observed status / NOT_RUN}` |

`evidence_reuse: []`; when used, record each prior evidence reference, prior/current bytes, affected range, proof that dependencies/commands/tools/configuration/baselines are identical or their delta reviewed, and retain/rerun decision. Evaluate reuse only under the same scope, prior complete coverage with both gap lists empty, and reconstructable prior bytes. Missing/unknown evidence is not reused: run the minimum check, or full review when the delta cannot be reliably bounded. CI proves only its original exact SHA, live status never carries over, and methods/evidence invalidated by reviewer miss cannot be reused. See [evidence-reuse.md](evidence-reuse.md).

## 5. Items, prior terminal, and unified closure

`findings: []`; `scope_proposals: []`; `evidence_blockers: []`; `environment_only_notes: []`. Keep each item's full body or readable verified reference once; fields and conditional provenance follow [report-templates.en.md](report-templates.en.md). Reports and children reference the same registry instead of copying the full history.

`prior_terminal_chain: []` only when no prior terminal truly exists. Otherwise bind one canonical terminal artifact: `{path@version + sha256 / verified, decoded, and read EMBEDDED_TERMINAL_ENVELOPE}`. Read the prior Review ID, Candidate, mode/main Reviewer, and Scope Lock from that reference instead of copying them.

| Transition cause | Exact authority / trigger / restoration evidence | First-available source or time |
|------------------|--------------------------------------------------|--------------------------------|
| `{closed cause from review-policy.yaml}` | `{independent evidence for each cause}` | `{exact source/time}` |

Causes are unique and compatible constraints accumulate; derive `SAME / NEW` and mode from policy. No scope-changing cause means SAME (both ID and digest equal); exactly one approved scope-changing cause permits NEW (both differ). Rebinding/new scope cannot erase history.

`blocking_items: []`; when a prior terminal exists, retain every original P0/P1, SD, and EB in one table under its original ID. P2 does not enter mandatory closure.

| Original item ID / type | Prior invariant / repo / range / status reference | Causal classification / old-new code / first visibility | Closure evidence / authority / regression | Current status / next disposition |
|-------------------------|--------------------------------------------------|-------------------------------------------------------|-------------------------------------------|-----------------------------------|
| `{CR-P0/P1 / SD / EB}` | `{exact prior terminal row reference}` | `{for code causes when applicable; otherwise []}` | `{minimum fix or restoration/Owner decision; relevant regression}` | `OPEN / CLOSED; required next step` |

Code causes use `original_unfixed / introduced_by_fix / pre_existing_unreported_cause`, binding old/new code, first visibility, prior acceptance/status, and Reviewer responsibility. Adding a cause to the same still-open issue does not automatically trigger a formal miss; an unreported blocking item or unsupported prior closure follows reviewer-miss handling. Reusing an ID does not remove accountability or permit silent changes to prior acceptance. Every prior blocking item must be CLOSED for approval; minimum fixes must also assess operational/gate complexity, not just added tables or services.

### Reviewer-miss Appendix (actual incidents only)

| Missed item / type | Prior-Candidate discoverability | Missed lock / prior terminal reference | Independent main / different evidence method |
|--------------------|--------------------------------|----------------------------------------|----------------------------------------------|
| `{CR/SD ID + P0/P1/scope_proposal}` | `{old path:symbol + failure path; unsupported-closure evidence when relevant}` | `{verified chain/history row}` | `{current main identity; independent paths/assumptions and a different verification method}` |

First miss: the same missed lock has recovery count=0; a main Reviewer different from the prior reviewer performs one exceptional full review from every repository's review root (ordinal=1). A new ID, replacement child, or rerun of author PASS is not independence. Store the current recovery only in non-self-referential `exceptional_review`; after the terminal digest is known, the next attempt appends the missed/recovery Scope Locks, prior/independent Reviewers, and artifact binding to readable history.

Another miss against the same missed lock creates `EB-*/review_process_integrity`, binding the prior exception artifact, second item/type/prior-Candidate evidence, and all implicated Reviewers. Coverage is incomplete and verdict `EVIDENCE_BLOCKED`. Only explicit user authority for a new independent main outside the implicated set to start a new initial full review from the review root can restore it; Candidate changes/tests/ordinary evidence cannot close it, and delta is forbidden. Other locks' history does not trigger this lock's quota; NEW/rebind cannot reset the old quota.

## 6. Charter decision

- Charter complete / candidate binding stable / full coverage plan complete: `YES / NO`.
- Unresolved baseline conflicts / unapproved proposals: `[] / exact item references`.
- Review may proceed: `YES / EVIDENCE_BLOCKED / SCOPE_DECISION_REQUIRED`.
- Continue independently reviewable ranges: `YES / NO + exact reason` (local proposals/gaps do not block the rest by default).
