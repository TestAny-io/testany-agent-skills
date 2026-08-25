# Code Review Charter / Scope Lock Template

Complete this before reviewing implementation details. Do not guess unknown fields; return `EVIDENCE_BLOCKED` or `SCOPE_DECISION_REQUIRED` when an unknown changes the decision.

## 1. Review identity

| Field | Value |
|-------|-------|
| Review mode | `initial_full_review` / `remediation_delta_review` / `exceptional_full_review_after_reviewer_miss` |
| Review round | Round N |
| Review ID | `CRV-<UUIDv4>` (unique to this attempt; never rebound) |
| Main Reviewer identity | `{stable identity/task; required every attempt}` |
| Prior reviewer-miss recovery history | `{ordered missed/recovery Scope Lock IDs+digests + review ID + terminal artifact + prior/current Reviewer identities / []}` |
| Global prior exception count | `{full history length; nonnegative integer}` |
| Immediate-prior Scope Lock recovery count | `{history filtered by missed lock equal to the immediate-prior terminal ID/digest; 0 or 1}` |
| Scope Lock ID | `{stable ID}` |
| Scope Lock content SHA-256 | `{required digest}` |
| Persisted charter | `{path@version + file SHA-256 / FULL_CANONICAL_PAYLOAD_EMBEDDED}` |
| Output language | en / zh-CN |
| User objective | `{the user's explicit objective for this review}` |

Generate the digest with this Skill's `scripts/scope_lock_digest.py <payload.json>`; reviewers must not choose their own JSON shape or ordering. The input is this closed payload (unlisted keys are rejected):

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

The script normalizes text to NFC and trims surrounding whitespace, treats every array as an unordered set sorted by each item's canonical JSON, and sorts `required_gates` the same way. Duplicate entries, missing/extra keys, semantic-key conflicts, non-full lowercase Git SHAs, wrong types, and unknown enums fail closed. Each `repository_identity` binds exactly one `review_root_base`; each verification layer (source/ci/environment) has exactly one row; each budget surface boundary has one fact. Source is fixed to required=true; CI/environment are fixed to required=false with the closed effect enums above, so a Reviewer cannot turn missing environment evidence into a source blocker through the Scope Lock. Use an approved repository slug/UUID for `repository_identity`, or canonical remote host/path after removing userinfo, query, and fragment; without a remote, use a user-approved stable ID. Absolute checkout paths, attempt-specific excluded WIP, the digest itself, current/previous Candidate, review mode, coverage, and verdict are absent from the closed payload; excluded WIP is bound separately by this attempt's snapshot/terminal artifact. Candidate/tree remain separately bound by each round's Exact Git boundary, so moving between worktrees/hosts or ordinary remediation does not change the same Scope Lock.

## 2. Exact Git boundary

| Repository identity | Path | Review root base | Base / Previous Candidate | Candidate | Tree / Snapshot | Worktree state/ownership |
|---------------------|------|------------------|---------------------------|-----------|-----------------|--------------------------|
| `{stable slug/UUID/sanitized remote}` | `{absolute path, not hashed}` | `{initial approved base SHA}` | `{SHA}` | `{SHA or WORKTREE}` | `{tree SHA or WORKTREE@sha256}` | `{clean / classified WIP}` |

Rules:

- `initial_full_review`: Base → Candidate.
- `remediation_delta_review`: Previous Candidate → Current Candidate, with previous finding IDs.
- `exceptional_full_review_after_reviewer_miss`: `review_root_base` → Current Candidate. Base/Previous, every changed-path manifest command, and every reviewed range must use `review_root_base`, never only the previous delta.
- A mutable worktree may be reviewed only when bound by the manifest/digest from the resolved absolute path to this Skill's `scripts/snapshot_worktree.py`; it cannot receive an immutable Candidate certificate.
- Classify staged, unstaged, and untracked files; do not assume they belong to the Candidate.

### Mutable worktree snapshot (WORKTREE only)

| Field | Value |
|-------|-------|
| Snapshot schema / SHA-256 | `testany.code-reviewer.worktree-snapshot.v1 / {...}` |
| Snapshot command | `{full command and base}` |
| Candidate-owned untracked | `{paths / none}` |
| Candidate-owned ignored | `{--candidate-ignored paths / none}` |
| Excluded WIP | `{path + owner + reason / none}` |
| Mutable baseline files | `{path + digest / none}` |
| Post-validation recheck | `MATCH / DRIFT / NOT_RUN` |
| Pre-verdict recheck | `MATCH / DRIFT / NOT_RUN` |

On `DRIFT`, invalidate the current Review ID/attempt. Keep the same semantic Scope Lock digest, create a new Review ID, bind the new snapshot, and rerun every required source/local validation for the attempt; no old validation is reusable. Otherwise return `EVIDENCE_BLOCKED`. Create a new Scope Lock only when an approved boundary/baseline changes.

## 2A. Prior terminal chain and blocking-item closure

Required when an immediate prior terminal artifact exists; use `N/A / none` only for a true first attempt with no prior terminal. A pre-terminal attempt invalidated by snapshot drift uses the separate lineage below and cannot be presented as either a first attempt or a terminal.

| Prior Review ID | Terminal artifact | Transition causes | Per-cause evidence / first-available source or time | Prior/current Candidate | Prior mode / main Reviewer | Current Review ID / mode / main Reviewer | Prior Scope Lock ID / digest | Current Scope Lock ID / digest | Effect |
|-----------------|-------------------|-------------------|-----------------------------------------------------|-------------------------|----------------------------|------------------------------------------|------------------------------|--------------------------------|--------|
| `{CRV-UUID}` | `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}` | `{unique subset of the closed cause enum}` | `{cause → exact evidence + source/time}` | `{exact bindings}` | `{mode / identity}` | `{this attempt's exact root fields}` | `{id / digest}` | `{id / digest}` | `SAME / NEW` |

- Prior reviewer-miss recovery history / global count / immediate-prior Scope Lock recovery count: `{ordered missed+recovery-lock-bound artifacts / n / 0|1}`

| Blocking item ID / type | Prior invariant / repository / range / status | Closure evidence or Owner authority | Current status | Required next disposition |
|-------------------------|-----------------------------------------------|-------------------------------------|----------------|---------------------------|
| `{CR-P0/P1, SD, or EB ID + type}` | `{exact immediate-prior terminal row}` | `{delta/restoration/decision evidence}` | `OPEN / CLOSED` | `{delta / initial full review / new Scope Lock}` |

Every P0/P1, SD, and EB from the immediate prior terminal must appear; P2 does not enter closure. Only one canonical terminal reference is allowed. After reading/verifying it, all copied prior/current fields must match both authoritative endpoints, and recovery history separately binds the missed and recovery Scope Locks. Causes are a unique closed set with independent evidence; compatible causes compose in one attempt and all predicates accumulate. Without a scope-changing cause the effect is `SAME`; exactly one of the three scope-changing causes is required for `NEW`. Fixed mode precedence is repeated reviewer miss → initial full + incomplete coverage + `EVIDENCE_BLOCKED`, process reset → initial full, reviewer miss → exceptional full, other NEW/rebind/post-CI/partial → initial full, then eligible delta. An unbound pre-charter prior terminal uses the closed `NOT_BOUND / NOT_DETERMINED / NOT_FROZEN` sentinels, never the `N/A` reserved for no prior terminal.

### Invalidated attempt lineage (mutable snapshot drift without a terminal only)

| Invalidated Review ID | Terminal | Transition reason | Old/new snapshot | Resolved script path + digest | Exact argv | Drift evidence | Prior validation reusable |
|-----------------------|----------|-------------------|------------------|-------------------------------|------------|----------------|---------------------------|
| `{CRV-UUID}` | `N/A` | `MUTABLE_SNAPSHOT_DRIFT_REBIND` | `{old / new WORKTREE digests}` | `{absolute path / sha256}` | `{full argv}` | `{exact mismatch}` | `NO` |

## 3. Approved baselines

| Baseline | Exact version/path/SHA | Approval evidence | Governs |
|----------|------------------------|-------------------|---------|
| PRD / User decision | `{...}` | `{...}` | Product scope |
| API Contract | `{...}` | `{...}` | Wire behavior |
| HLD / LLD | `{...}` | `{...}` | Architecture and implementation boundary |
| Guardrails | `{...}` | `{...}` | Project defaults |
| Other | `{...}` | `{...}` | `{...}` |

An author note, self-test report, or Candidate claim is not an approved baseline.

## 4. Frozen scope

### In Scope

- `{approved capability/component/repository/behavior}`

### Out of Scope

- `{feature, repository, phase, or environment excluded from this review}`

### Must Not Change / Must Not Regress

- `{compatibility behavior, legacy caller, disabled state, data boundary, etc.}`

## 5. Architecture budget

List only approved surface deltas. A surface omitted from this table is not authorized for `ADD`, `MODIFY`, or `DELETE`; retaining an existing surface with no byte or semantic change needs no additional authorization.

| Surface | Allowed action | Approved source | Exact boundary |
|---------|----------------|-----------------|----------------|
| service/workload | KEEP/MODIFY/ADD/DELETE/NONE | `{baseline}` | `{boundary}` |
| endpoint/RPC/event/wire | ... | ... | ... |
| table/schema/durable authority | ... | ... | ... |
| queue/topic/outbox | ... | ... | ... |
| crypto purpose/key authority | ... | ... | ... |
| Secret/RBAC identity | ... | ... | ... |
| publisher/consumer | ... | ... | ... |
| deployment topology/shared infra | ... | ... | ... |

## 6. Verification boundary

| Layer | Required in this review | Evidence available | Effect on code verdict |
|-------|-------------------------|--------------------|------------------------|
| Source/local tests | `YES — canonical payload required_gates` | `{exact results / missing}` | `MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT` |
| Exact-SHA CI | `NO` | `{status / NOT_RUN}` | `REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING` |
| Environment/deployment | `NO` | `{status / NOT_RUN}` | `REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING` |

This section only echoes the canonical Scope Lock payload's closed three-layer semantics. Do not re-enter `yes/no` or override required/effect through attempt text. Evidence status may change without changing the semantic Scope Lock.

## 7. Coverage ledger

- Bind a separate Candidate changed-path manifest and digest for every repository. For an immutable Candidate, first require both `refs/replace` and legacy `info/grafts` to be absent, then directly SHA-256 the raw stdout from `GIT_NO_REPLACE_OBJECTS=1 git diff --name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none <reviewed-from> <candidate> --`; resolve commits/trees under the same replacement-disabled environment. For WORKTREE, use snapshot `manifest.candidate_changed_paths` and `manifest.candidate_changed_paths_sha256`. `reviewed-from` is base for initial, previous Candidate for remediation, and `review_root_base` for exceptional review.

| Repository identity | Manifest source/range | Manifest SHA-256 |
|---------------------|-----------------------|-----------------|
| `{stable repo ID}` | `{raw immutable command / WORKTREE snapshot field}` | `{sha256}` |

| Repository identity | Candidate-owned path | Manifest layer/status | Classification | Scope/budget reference / evidence | Reviewer assignment |
|---------------------|----------------------|-----------------------|----------------|-----------------------------------|---------------------|
| `{stable repo ID}` | `{path}` | `{base_to_candidate:M / ...}` | `in_scope / scope_violation / verified_filtered_baseline (mutable raw-only)` | `{row / filter+prior-raw evidence}` | `{main/subagent}` |

An immutable path can only be `in_scope` or `scope_violation`. `verified_filtered_baseline` is allowed only for a WORKTREE path whose sole change is `raw_worktree_vs_index/RAW` and that has both filter/EOL and prior-raw evidence. Mutable `excluded_wip` must be removed from the manifest through snapshot `--exclude` and recorded separately in the sections 1/2 ledger; it is not a changed-path classification.

| Repository / Range | Assigned path/component/risk domain | Reviewer | Reviewed complete | Typed blocked/gap ranges |
|--------------------|-------------------------------------|----------|-------------------|-----------------|
| `{repo base..Candidate}` | `{complete diff allocation}` | `{main/subagent}` | `YES/NO` | `[] / details` |

- Initial full coverage complete: `YES / NO`
- Shared Scope Lock digest reconciled: `YES / NO / N/A`
- All repositories/ranges reconciled: `YES / NO`
- Unclassified changed-path manifest entries: `[] / details`
- Scope-decision-blocked ranges: `[] / exact SD-bound details`
- Evidence/assignment gaps: `[] / exact EB-bound or unassigned details`

An initial review requires `YES` with both range lists empty before `APPROVED` or coverage reuse. A scope-blocked range mapped one-to-one to a closed proposal returns `SCOPE_DECISION_REQUIRED`; a missing-evidence or unassigned range returns `EVIDENCE_BLOCKED`. When both exist, evidence precedence applies while every proposal remains reported. Delta-only review requires prior coverage=YES and both range lists empty.

Paths in `raw_worktree_vs_index`, `worktree_mode_vs_index`, and `submodule_head_vs_index` must also be classified. Use `verified_filtered_baseline` only for the first layer when it has no other manifest layer and evidence proves both an existing clean/smudge/EOL representation and prior raw bytes; mode/submodule mismatches can only be `in_scope` or `scope_violation`.

## 8. Remediation closure (`remediation_delta_review` only)

- Previous Review ID: `{CRV-UUID}`
- Previous terminal artifact: `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}`

| Finding ID | Frozen invariant | Expected minimum fix | Allowed surface delta |
|------------|------------------|----------------------|-----------------------|
| `CR-P1-001` | `{...}` | `{...}` | `none / exact approved budget row` |

Prior initial full coverage complete: `YES / NO`. If `NO`, this round cannot use `remediation_delta_review`.

| Prior Scope Proposal ID | Owner decision evidence | Disposition | Scope Lock effect |
|-------------------------|-------------------------|-------------|-------------------|
| `SD-...` | `{exact decision}` | `CLOSED / OPEN` | `UNCHANGED / NEW_SCOPE_LOCK_INITIAL_REVIEW_REQUIRED` |

| Prior Evidence Blocker ID | Missing input | Restoration evidence | Status |
|---------------------------|---------------|----------------------|--------|
| `EB-...` | `{exact input}` | `{exact restored source}` | `CLOSED / OPEN` |

List the prior Review ID, readable terminal artifact and digest, Candidate, finding IDs, scope proposal IDs, and evidence blocker IDs. No prior item may disappear silently.

## 9. Reviewer-miss exception binding (`exceptional_full_review_after_reviewer_miss` only)

| Field | Value |
|-------|-------|
| Invalidated prior review ID | `{exact ID}` |
| Invalidated prior terminal artifact | `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}` |
| Invalidated prior main Reviewer identity | `{stable identity/task}` |
| Missed immediate-prior Scope Lock ID / digest | `{exact prior terminal lock ID / sha256}` |
| Triggering missed item | `{CR/SD ID + P0/P1/scope_proposal}` |
| Prior-Candidate discoverability evidence | `{exact prior Candidate path:line/symbol + failure path}` |
| Global prior exception history / count | `{may contain other Scope Locks / n}` |
| Immediate-prior Scope Lock recovery count | `0` (otherwise this mode is forbidden) |
| Current independent main Reviewer identity | `{identity/task; must differ from prior}` |
| Current exception ordinal | `1` |
| Full range | `{review_root_base..current Candidate per repo}` |

This section is independent of section 8. The current artifact records only a non-self-referential recovery block. After its digest is known, the next attempt adds both the missed immediate-prior Scope Lock and this artifact's recovery Scope Lock to global history. Quota is filtered by the missed lock; another miss against that lock creates a `review_process_integrity` blocker, and `NEW` cannot reset it.

## 10. Charter decision

- Charter complete: YES / NO
- Unresolved baseline conflict: `{none / details}`
- Unapproved scope proposal already present: `{none / details}`
- Candidate binding stable: YES / NO (use YES for immutable SHA/tree)
- Initial full coverage plan complete: YES / NO
- Review may proceed: YES / `EVIDENCE_BLOCKED` / `SCOPE_DECISION_REQUIRED`
- Proceed with independently reviewable ranges: `YES / NO + exact reason` (default YES for a local proposal/gap)
