# Code Review Output Templates

## Mandatory Mutable Binding Appendix for every WORKTREE verdict

Whenever A/B/C/E/G binds `WORKTREE@...`, include this appendix in the same terminal artifact. The canonical Scope Lock payload excludes these attempt-specific facts and cannot replace these tables. Immutable-only D is not applicable.

| Repository | Root / immutable base / HEAD | Snapshot schema / SHA | Resolved script path + file SHA-256 | Exact argv (all options) | Changed-path digest | Post-validation / pre-verdict |
|------------|------------------------------|-----------------------|------------------------------------|--------------------------|---------------------|--------------------------------|
| `{mutable repo only}` | `{absolute root / full SHA / full SHA}` | `testany.code-reviewer.worktree-snapshot.v1 / WORKTREE@{sha256}` | `{absolute snapshot_worktree.py / sha256}` | `{argv array: --repo, --base, every --exclude, --candidate-ignored, --mutable-baseline}` | `{manifest.candidate_changed_paths_sha256}` | `{MATCH/DRIFT / MATCH/DRIFT}` |

| Repository | Binding class | Exact path | Exact option | Ownership / reason / bound digest |
|------------|---------------|------------|--------------|-----------------------------------|
| `{repo}` | `candidate_untracked` | `{path / none}` | `automatic untracked capture` | `{Candidate / N/A}` |
| `{repo}` | `candidate_ignored` | `{path / none}` | `--candidate-ignored` | `{Candidate / N/A}` |
| `{repo}` | `excluded_wip` | `{path / none}` | `--exclude` | `{owner + evidence-backed reason / N/A}` |
| `{repo}` | `mutable_baseline` | `{absolute path / none}` | `--mutable-baseline` | `{sha256 / N/A}` |

Use one row per actual path; when empty, retain one `none` row for each class. Any `DRIFT` invalidates the current Review ID and forbids a verdict based on the old snapshot.

## Mandatory Prior Terminal Chain Appendix when an immediate prior terminal exists

A/B/C/D/E/G must preserve every blocking item from the immediate prior terminal whenever one exists. F is only extra ordinary-remediation delta detail and cannot replace this appendix. Use `N/A / none` for a true first attempt with no prior terminal.

| Prior Review ID | Terminal artifact | Transition causes | Per-cause evidence / first-available source or time | Prior/current Candidate | Prior mode / main Reviewer | Current Review ID / mode / main Reviewer | Prior Scope Lock ID / digest | Current Scope Lock ID / digest | Effect |
|-----------------|-------------------|-------------------|-----------------------------------------------------|-------------------------|----------------------------|------------------------------------------|------------------------------|--------------------------------|--------|
| `{CRV-UUID}` | `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}` | `{unique subset of the closed cause enum}` | `{cause → exact evidence + source/time}` | `{exact bindings}` | `{mode / identity}` | `{this attempt's exact root fields}` | `{id / digest}` | `{id / digest}` | `SAME / NEW` |

| Blocking item ID / type | Prior invariant / repository / range / status | Closure evidence or Owner authority | Current status | Required next disposition |
|-------------------------|-----------------------------------------------|-------------------------------------|----------------|---------------------------|
| `{CR-P0/P1, SD, or EB ID + type}` | `{exact immediate-prior terminal row}` | `{exact delta/restoration/decision/process authority}` | `OPEN / CLOSED` | `{delta / initial full review / new Scope Lock}` |

Approval requires every prior **blocking** item `CLOSED`; P2 never enters blocking closure. Only one canonical prior-terminal reference is allowed. After reading/verifying it, all copied prior/current fields must exactly match both authoritative endpoints, and recovery history must separately match the missed and recovery Scope Locks. Causes are a unique closed set with independent evidence; compatible causes compose in one attempt and all constraints accumulate. Without a scope-changing cause the effect is `SAME`; exactly one of the three scope-changing causes is required for `NEW`. Fixed mode precedence is repeated reviewer miss → initial full + incomplete coverage + `EVIDENCE_BLOCKED`, process reset → initial full, reviewer miss → exceptional full, other NEW/rebind/post-CI/partial → initial full, then eligible delta. This closes process-reset/scope-change/rebind or reviewer-miss/post-CI combinations once without allowing one cause to erase another.

## Mutable Snapshot Drift Lineage without a terminal

When pre-terminal snapshot drift occurred, add one row per invalidated attempt to the same A/B/C/D/E/G artifact. Even if the later Candidate is committed and produces immutable D, do not represent an invalidated attempt as either a terminal or a first attempt.

| Invalidated Review ID | Terminal | Transition reason | Old/new snapshot | Resolved script path + digest | Exact argv | Drift evidence | Prior validation reusable |
|-----------------------|----------|-------------------|------------------|-------------------------------|------------|----------------|---------------------------|
| `{CRV-UUID}` | `N/A` | `MUTABLE_SNAPSHOT_DRIFT_REBIND` | `{old / new WORKTREE digests}` | `{absolute path / sha256}` | `{full argv}` | `{exact mismatch}` | `NO` |

## A. Review Comment / CHANGES_REQUIRED

```markdown
# Lead Dev Code Review

## 1. Exact binding

| Repository | Review root base | Reviewed from | Candidate | Tree / Snapshot | Reviewed range |
|------------|------------------|---------------|-----------|-----------------|----------------|
| `{repo}` | `{initial approved base SHA}` | `{base / previous SHA / review root for exceptional}` | `{sha or WORKTREE}` | `{tree or WORKTREE@sha256}` | `{reviewed-from..candidate}` |

- Review mode: `initial_full_review` / `remediation_delta_review` / `exceptional_full_review_after_reviewer_miss`
- Review ID: `CRV-<UUIDv4>`
- Main Reviewer identity: `{stable identity/task}`
- Prior reviewer-miss recovery history / global count / immediate-prior Scope Lock recovery count: `{ordered entries each with missed+recovery Scope Lock IDs/digests + terminal artifact + prior/current Reviewer identities / []} / {n>=0} / {0|1}`
- Scope Lock ID / content digest: `{id / sha256}`
- Persisted Charter: `{path@version + file sha256 / FULL_CANONICAL_PAYLOAD_EMBEDDED}`
- Canonical Scope Lock payload: `{full script output when embedded / N/A when persisted Charter is bound}`
- Approved baselines: `{paths/SHA/decision records}`
- Worktree ownership: `{clean / classified WIP}`

## 2. Scope decision

- In Scope: `{summary}`
- Out of Scope: `{summary}`
- Must Not Change / Regress: `{summary}`
- Architecture budget: `{approved surface delta}`
- Unapproved scope proposal: `none`

## 3. Findings

### [P0/P1] `CR-{severity}-{nnn}` - {title}

- `violated_frozen_invariant`: `{approved invariant}`
- `provenance`: `initial_review / remediation_delta / previously_unavailable_evidence / reviewer_miss / post_terminal_new_ci_env`
- `prior_evidence_blocker_id`: `EB-... / N/A`
- `prior_evidence_blocker_restoration_evidence`: `{exact prior EB closure / N/A}`
- `prior_terminal_chain_reference`: `{prior Review ID + cause row / N/A}`
- `underlying_item_prior_source_nondiscoverability_evidence`: `{exact evidence / N/A}`
- `why_not_discoverable_previously`: `{exact reason / N/A}`
- `exact_evidence`: `{absolute/repository path:line or symbol, commit}`
- `reproducer_or_failure_path`: `{minimal deterministic path}`
- `impact`: `{user/system impact}`
- `minimum_boundary_preserving_fix`: `{smallest repair}`
- `architecture_surface_delta`: `none / within_approved_budget`
- `architecture_budget_reference`: `{N/A or exact Scope Lock row}`

When the Candidate itself crossed an explicit boundary and revert/delete restores compliance, use a standard `P1` finding titled `scope violation`; `minimum_boundary_preserving_fix` is only revert/delete and `architecture_surface_delta: none`.

### P2 (non-blocking)

- `CR-P2-{nnn}` `{evidence-backed suggestion}`

## 4. Separate readiness notes

- Source/local gates: `{status}`
- Exact-SHA CI: `{SUCCESS / FAILED / NOT_RUN}`
- Environment/deployment gaps: `{separate list; not source findings}`
- Initial full coverage complete: `YES`
- Per-repository changed-path manifests / digests: `{repo → source / sha256}`
- Unclassified changed-path manifest entries: `[]`
- Scope-decision-blocked ranges: `[]`
- Evidence/assignment gaps: `[]`

## 5. Verdict

`CHANGES_REQUIRED`

- P0: `{n}`
- P1: `{n}`
- P2: `{n}` (non-blocking)
- Required remediation: `{finding IDs only}`
- Scope Lock for next round: `UNCHANGED`
- Initial full coverage complete: `YES`
```

## B. SCOPE_DECISION_REQUIRED

```markdown
# Lead Dev Code Review - Scope Decision Required

## Exact binding

{same binding table}

- Review ID: `CRV-<UUIDv4>`
- Review mode: `{mode}`
- Main Reviewer identity: `{stable identity/task}`
- Prior reviewer-miss recovery history / global count / immediate-prior Scope Lock recovery count: `{ordered entries each with missed+recovery Scope Lock IDs/digests + terminal artifact + prior/current Reviewer identities / []} / {n>=0} / {0|1}`
- Scope Lock ID / content digest: `{id / sha256}`
- Persisted Charter: `{path@version + file sha256 / FULL_CANONICAL_PAYLOAD_EMBEDDED}`
- Canonical Scope Lock payload: `{full script output when embedded / N/A when persisted Charter is bound}`

## Frozen boundaries

| Boundary | Frozen value |
|----------|--------------|
| In Scope | `{complete summary or exact persisted Charter section}` |
| Out of Scope | `{complete summary or exact persisted Charter section}` |
| Must Not Change / Regress | `{complete summary or exact persisted Charter section}` |
| Architecture budget | `{complete KEEP/ADD/MODIFY/DELETE/NONE rows or exact persisted Charter section}` |

## Confirmed scope proposals / Owner decisions

### `SD-{nnn}`

- `scope_proposal_id`: `SD-{nnn}`
- `trigger`: `baseline_conflict / ambiguous_baseline / minimum_correct_fix_requires_unapproved_surface`
- `provenance`: `initial_review / remediation_delta / previously_unavailable_evidence / reviewer_miss / post_terminal_new_ci_env`
- `prior_evidence_blocker_id`: `EB-... / N/A`
- `prior_evidence_blocker_restoration_evidence`: `{exact prior EB closure / N/A}`
- `prior_terminal_chain_reference`: `{prior Review ID + cause row / N/A}`
- `underlying_item_prior_source_nondiscoverability_evidence`: `{exact evidence / N/A}`
- `why_not_discoverable_previously`: `{exact reason / N/A}`
- `conflicting_or_ambiguous_baselines`: `{exact references}`
- `approved_budget_reference`: `{exact Scope Lock row / NONE}`
- `exact_evidence`: `{path:line/symbol/commit}`
- `why_revert_or_delete_is_not_a_correct_fix`: `{evidence-backed reason}`
- `contaminated_paths_or_ranges`: `[] / {exact ranges}`
- `minimum_owner_question`: `{one concrete decision}`
- `boundary_preserving_recommendation`: `{one recommendation}`
- `expansion_option_consequence`: `{baselines to update + new Scope Lock/full review}`

## Review progress and reusable coverage

- Initial full coverage complete: `YES / NO`
- Initial full coverage source: `{this review / exact prior review ID / N/A}`
- Per-repository changed-path manifests / digests: `{repo → source / sha256 / NOT_COMPLETE}`
- Unclassified changed-path manifest entries: `[] / details`
- Coverage ledger reconciled: `YES / NO`
- Required source/local gates and exact results: `{commands + results / INCOMPLETE}`
- Required verification evidence: `COMPLETE / INCOMPLETE`
- Scope-decision-blocked ranges: `[] / exact proposal-bound ranges`
- Evidence/assignment gaps: `[]` (use template C when non-empty)
- Delta review eligible after decision: `YES only when coverage=YES, required evidence=COMPLETE, both range lists=[], every EB/SD item CLOSED, Scope Lock unchanged, and this terminal Candidate is an immutable commit/tree; WORKTREE is always NO / NO`

## Confirmed findings from independently reviewable scope

`none`, or repeat the complete P0/P1 finding fields from section A for every confirmed item, including validated P1 scope violations.

- Confirmed P0 / P1 / P2: `{n / n / n}`
- Required remediation IDs: `{IDs / none}`

## Product/Architecture Owner decision

Decide only this minimum question: `{one concrete decision}`.

Options:

1. `{boundary-preserving option}` (recommended) — `{impact}`
2. `{explicit scope expansion}` — update `{PRD/API/HLD/LLD/Guardrails}` and freeze a new Scope Lock first

Until that decision exists, the Reviewer will not convert the proposal into P0/P1 or derive more requirements from it.

Verdict: `SCOPE_DECISION_REQUIRED`
```

## C. EVIDENCE_BLOCKED

```markdown
# Lead Dev Code Review - Evidence Blocked

| Repository | Review root base | Reviewed from | Candidate | Tree / Snapshot | Reviewed range |
|------------|------------------|---------------|-----------|-----------------|----------------|
| `{repo / NOT_BOUND}` | `{SHA / NOT_BOUND}` | `{SHA / NOT_BOUND}` | `{SHA/WORKTREE / NOT_BOUND}` | `{tree/snapshot / NOT_BOUND}` | `{range / NOT_BOUND}` |

- Review ID: `CRV-<UUIDv4>`
- Review mode: `{mode / NOT_DETERMINED}`
- Main Reviewer identity: `{stable identity/task; always required}`
- Prior reviewer-miss recovery history / global count / immediate-prior Scope Lock recovery count: `{ordered entries each with missed+recovery Scope Lock IDs/digests + terminal artifact + prior/current Reviewer identities / []} / {n>=0} / {0|1}`
- Scope Lock ID / content digest: `{id / sha256 / NOT_FROZEN}`
- Persisted Charter: `{path@version + file sha256 / FULL_CANONICAL_PAYLOAD_EMBEDDED / NOT_BOUND before Gate 0}`
- Canonical Scope Lock payload: `{full script output / N/A / NOT_BOUND before Gate 0}`
| Evidence Blocker ID / kind | Frozen invariant | Repository / affected range | Missing/ambiguous input | Prior exception terminal artifact | Second missed item ID/type/evidence | Smallest restoration evidence | Implicated Reviewer identities | Status |
|----------------------------|------------------|-----------------------------|-------------------------|-----------------------------------|-------------------------------------|-------------------------------|-------------------------------|--------|
| `EB-... / {closed kind}` | `{exact invariant / NOT_FROZEN}` | `{repo + paths/ranges / all available binding}` | `{exact Candidate/base/baseline/source/process input}` | `{path@version+sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON / N/A}` | `{CR/SD ID + P0/P1/scope_proposal + exact prior-Candidate evidence / N/A}` | `{one concrete input}` | `{[] / all implicated identities for review_process_integrity}` | `OPEN` |

The two dedicated columns are required only for `review_process_integrity`; every other blocker kind uses `N/A`.

## Frozen boundaries

Use the closed `NOT_BOUND` sentinel when `Scope Lock: NOT_FROZEN`; otherwise embed or reference all rows:

| Boundary | Frozen value |
|----------|--------------|
| In Scope | `{complete summary / NOT_BOUND}` |
| Out of Scope | `{complete summary / NOT_BOUND}` |
| Must Not Change / Regress | `{complete summary / NOT_BOUND}` |
| Architecture budget | `{complete rows / NOT_BOUND}` |

- Checks already completed: `{read-only evidence}`
- Required source/local gates and exact results: `{commands + results / INCOMPLETE}`
- Required verification evidence: `COMPLETE / INCOMPLETE`
- Initial full coverage complete: `YES / NO`
- Initial full coverage source: `{this review / exact prior review ID / N/A}`
- Per-repository changed-path manifests / digests: `{repo → source / sha256 / NOT_COMPLETE}`
- Unclassified changed-path manifest entries: `[] / details`
- Coverage ledger reconciled: `YES / NO`
- Scope-decision-blocked ranges: `[] / exact proposal-bound ranges`
- Evidence/assignment gaps: `[] / exact EB-bound ranges`
- Review-process-integrity blocker open: `YES / NO`
- Delta review eligible when evidence is restored: `YES only when coverage=YES, required evidence=COMPLETE, both range lists=[], every EB/SD item CLOSED, Scope Lock unchanged, this terminal Candidate is an immutable commit/tree, and no review_process_integrity blocker ever required a process reset; WORKTREE is always NO / NO`

A `review_process_integrity` blocker can be restored only by explicit user authority for a new independent initial full review from the review root. Candidate changes, tests, or ordinary evidence cannot close it, and this attempt is never delta eligible.

## Confirmed findings from completed checks

`none`, or repeat the complete P0/P1 finding fields from section A; do not discard confirmed findings merely because the terminal verdict is `EVIDENCE_BLOCKED`.

- Confirmed P0 / P1 / P2: `{n / n / n}`
- Required remediation IDs: `{IDs / none}`

## Confirmed scope proposals / Owner decisions

`none`, or preserve every closed proposal field from section B. A higher-precedence `EVIDENCE_BLOCKED` verdict must not discard an already confirmed scope decision. Every contaminated range must also appear in `scope_decision_blocked_ranges`.

- Confirmed proposal IDs: `{IDs / none}`
- Minimum Owner questions and recommendations: `{exact questions / none}`
- No source defect conclusion was inferred from the missing evidence.

Verdict: `EVIDENCE_BLOCKED`
```

## D. Code Review Approval Certificate (immutable commit/tree only)

```markdown
# Code Review Approval Certificate

| Repository | Review root base | Reviewed from | Candidate | Tree | Reviewed range |
|------------|------------------|---------------|-----------|------|----------------|
| `{repo}` | `{initial approved base SHA}` | `{base / previous SHA / review root for exceptional}` | `{exact SHA}` | `{exact tree}` | `{reviewed-from..Candidate}` |

| Field | Value |
|-------|-------|
| Review ID | `CRV-<UUIDv4>` |
| Review mode | `{mode}` |
| Main Reviewer identity | `{stable identity/task}` |
| Prior reviewer-miss recovery history / global count / immediate-prior Scope Lock recovery count | `{ordered entries each with missed+recovery Scope Lock IDs/digests + terminal artifact + prior/current Reviewer identities / []} / {n>=0} / {0|1}` |
| Scope Lock ID / content digest | `{id / sha256}` |
| Persisted Charter | `{path@version + file sha256 / FULL_CANONICAL_PAYLOAD_EMBEDDED}` |
| Canonical Scope Lock payload | `{full script output when embedded / N/A}` |
| Repository Candidate(s) | `{exact SHA/tree table}` |
| Approved baselines | `{exact references}` |
| Previous finding IDs (delta only) | `{IDs / N/A}` |
| Initial full coverage source | `{this review / exact prior review ID}` |
| Initial full coverage complete | `YES` |
| Per-repository changed-path manifests / digests | `{repo → source / sha256}` |
| Unclassified changed-path manifest entries | `[]` |
| Coverage ledger | `RECONCILED; scope_decision_blocked_ranges=[]; evidence_or_assignment_gaps=[]` |
| Required source/local gates | `{commands + exact results; COMPLETE}` |
| Required verification evidence | `COMPLETE` |
| Unresolved scope proposals | `0` |
| Open evidence blockers | `0` |
| P0 / P1 / P2 | `0 / 0 / {n}` |
| Source verdict | `APPROVED` |
| Exact-SHA CI | `{status; may be NOT_RUN}` |
| Environment/deployment | `NOT AUTHORIZED BY THIS CERTIFICATE` |

## Confirmed boundaries

| Boundary | Frozen value |
|----------|--------------|
| In Scope | `{complete summary or exact persisted Charter section}` |
| Out of Scope | `{complete summary or exact persisted Charter section}` |
| Must Not Change / Regress | `{complete summary or exact persisted Charter section}` |
| Architecture budget | `{complete KEEP/ADD/MODIFY/DELETE/NONE rows or exact persisted Charter section}` |

- The Candidate implements the approved scope without an unapproved architecture surface.
- No evidence-backed P0/P1 remains inside the frozen Scope Lock.
- P2 items, if any, are non-blocking and do not require another review round.
- CI, merge, Secret, migration, deployment, live smoke, and release remain separately authorized actions.

Verdict: `APPROVED`
```

## E. Mixed / Mutable Worktree Review Comment / APPROVED

```markdown
# Mixed / Mutable Worktree Code Review

If any repository is a mutable worktree, use this Comment for the entire multi-repository approval. Every immutable repository still retains its exact Candidate/tree; never fabricate a WORKTREE snapshot for it. Populate the next two snapshot/WIP tables only for repositories that are actually mutable.

| Repository | Review root base | Reviewed from (immutable) | Candidate | Tree / worktree snapshot | HEAD (mutable only) | Reviewed range |
|------------|------------------|---------------------------|-----------|--------------------------|---------------------|----------------|
| `{repo}` | `{initial approved base SHA}` | `{base / previous SHA / review root for exceptional}` | `{exact SHA or WORKTREE@sha256}` | `{exact tree SHA or WORKTREE@sha256}` | `{exact HEAD or N/A}` | `{reviewed-from..Candidate}` |

| Repository | Snapshot schema / SHA | Resolved script path + file SHA-256 | Exact argv (base and every option) | Changed-path digest | Post-validation / pre-verdict |
|------------|-----------------------|------------------------------------|------------------------------------|---------------------|--------------------------------|
| `{mutable repo only}` | `testany.code-reviewer.worktree-snapshot.v1 / WORKTREE@{sha256}` | `{absolute snapshot_worktree.py path / sha256}` | `{argv array including --repo, --base, every --exclude, --candidate-ignored, --mutable-baseline}` | `{manifest.candidate_changed_paths_sha256}` | `MATCH / MATCH` |

| Repository | Binding class | Exact path | Exact option | Ownership / reason / bound digest |
|------------|---------------|------------|--------------|-----------------------------------|
| `{mutable repo only}` | `candidate_untracked` | `{path / none}` | `automatic untracked capture` | `{Candidate / N/A}` |
| `{mutable repo only}` | `candidate_ignored` | `{path / none}` | `--candidate-ignored` | `{Candidate / N/A}` |
| `{mutable repo only}` | `excluded_wip` | `{path / none}` | `--exclude` | `{owner + evidence-backed reason / N/A}` |
| `{mutable repo only}` | `mutable_baseline` | `{absolute path / none}` | `--mutable-baseline` | `{sha256 / N/A}` |

| Field | Value |
|-------|-------|
| Review ID | `CRV-<UUIDv4>` |
| Review mode | `{mode}` |
| Main Reviewer identity | `{stable identity/task}` |
| Prior reviewer-miss recovery history / global count / immediate-prior Scope Lock recovery count | `{ordered entries each with missed+recovery Scope Lock IDs/digests + terminal artifact + prior/current Reviewer identities / []} / {n>=0} / {0|1}` |
| Scope Lock ID / content digest | `{id / sha256}` |
| Persisted Charter | `{path@version + file sha256 / FULL_CANONICAL_PAYLOAD_EMBEDDED}` |
| Canonical Scope Lock payload | `{full script output when embedded / N/A}` |
| Initial full coverage source | `{this review / exact prior review ID}` |
| Initial full coverage complete | `YES` |
| Per-repository changed-path manifests / digests | `{repo → immutable replacement-disabled raw git command or WORKTREE snapshot field / sha256}` |
| Unclassified changed-path manifest entries | `[]` |
| Coverage ledger | `RECONCILED; scope_decision_blocked_ranges=[]; evidence_or_assignment_gaps=[]` |
| Required source/local gates | `{commands + exact results; COMPLETE}` |
| Required verification evidence | `COMPLETE` |
| Unresolved scope proposals | `0` |
| Open evidence blockers | `0` |
| P0 / P1 / P2 | `0 / 0 / {n}` |
| Source verdict | `APPROVED` |
| Exact-SHA CI by repository | `{repo → exact-SHA CI status / NOT_APPLICABLE_UNTIL_COMMIT for mutable repo}` |
| Environment/deployment | `NOT AUTHORIZED BY THIS REVIEW` |

## Frozen boundaries

| Boundary | Frozen value |
|----------|--------------|
| In Scope | `{complete summary or exact persisted Charter section}` |
| Out of Scope | `{complete summary or exact persisted Charter section}` |
| Must Not Change / Regress | `{complete summary or exact persisted Charter section}` |
| Architecture budget | `{complete KEEP/ADD/MODIFY/DELETE/NONE rows or exact persisted Charter section}` |

- This verdict applies only to the stated worktree snapshot and is invalidated by any change to bound Candidate/baseline state. Explicitly excluded third-party WIP and non-Candidate ignored files are outside that binding.
- This is not an immutable Candidate certificate. After commit, establish a fresh immutable SHA/tree binding; do not automatically promote the mutable verdict into a certificate.
- P2 items remain non-blocking and do not require another source review round.

Verdict: `APPROVED`
```

## F. Remediation delta section

Append this section to a remediation report:

```markdown
## Remediation closure

- Previous Review ID: `{CRV-UUID}`
- Previous terminal artifact: `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}`
- Previous immutable Candidate: `{exact SHA}`

| Finding ID | Previous evidence | Delta evidence | Regression checked | Status |
|------------|-------------------|----------------|--------------------|--------|
| `CR-P1-001` | `{old path}` | `{new path}` | `{targeted gate}` | CLOSED/OPEN |

| Scope Proposal ID | Owner decision evidence | Status | Scope Lock effect |
|-------------------|-------------------------|--------|-------------------|
| `SD-...` | `{exact decision}` | `CLOSED/OPEN` | `UNCHANGED / NEW_SCOPE_LOCK_INITIAL_REVIEW_REQUIRED` |

| Evidence Blocker ID / kind | Prior invariant / repository / range / missing input | Restoration evidence | Status |
|----------------------------|------------------------------------------------------|----------------------|--------|
| `EB-... / {kind}` | `{exact prior row}` | `{exact restored evidence}` | `CLOSED/OPEN` |

## Late findings

| Finding ID | Same frozen invariant | Trigger | Prior EB ID / restoration evidence | Why not discoverable previously | Surface delta / budget reference |
|------------|-----------------------|---------|------------------------------------|---------------------------------|----------------------------------|
| `{id or none}` | `{invariant}` | `remediation_delta / previously_unavailable_evidence` | `{EB-... + exact closure / N/A}` | `{explanation}` | `none / within_approved_budget + row` |

## Late scope proposals

| Proposal ID | Trigger | Provenance | Prior EB ID / restoration evidence | Why not discoverable previously | Disposition |
|-------------|---------|------------|------------------------------------|---------------------------------|-------------|
| `{ID or none}` | `{closed trigger}` | `remediation_delta / previously_unavailable_evidence` | `{EB-... + exact closure / N/A}` | `{exact explanation}` | `SCOPE_DECISION_REQUIRED / reviewer_miss_exception` |

A pure reviewer miss cannot enter these tables as an ordinary delta item; it adds the `REVIEWER_MISS` cause and starts one independent exceptional full review. `previously_unavailable_evidence` without a prior `EB-*` is treated the same way. Qualifying post-terminal CI/environment evidence adds `POST_TERMINAL_NEW_CI_ENV`: alone it starts an initial full review; disclosed with the first reviewer miss, both causes compose into one exceptional full review. Neither belongs here. If prior source was sufficient, it remains a reviewer miss.

```

## G. Exceptional reviewer-miss full review (standalone; never append F)

Use this independent integrity block together with the A/B/C/D/E terminal body matching the final verdict. Do not fill in F's remediation-delta closure.

```markdown
# Exceptional Reviewer-Miss Full Review

| Repository | Review root base | Reviewed from | Candidate | Tree / Snapshot | Full reviewed range |
|------------|------------------|---------------|-----------|-----------------|---------------------|
| `{repo}` | `{initial approved base SHA}` | `{same review_root_base}` | `{exact SHA or WORKTREE}` | `{tree or WORKTREE@sha256}` | `{review_root_base..current Candidate}` |

| Field | Value |
|-------|-------|
| Review ID | `CRV-<UUIDv4>` |
| Review mode | `exceptional_full_review_after_reviewer_miss` |
| Main Reviewer identity | `{stable identity/task}` |
| Scope Lock ID / content digest | `{id / sha256}` |
| Persisted Charter | `{path@version + file sha256 / FULL_CANONICAL_PAYLOAD_EMBEDDED}` |
| Invalidated prior review ID | `{exact ID}` |
| Invalidated prior terminal artifact | `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}` |
| Invalidated prior main Reviewer identity | `{stable identity/task}` |
| Missed immediate-prior Scope Lock ID / digest | `{exact prior terminal lock ID / sha256}` |
| Triggering missed item | `{CR/SD ID + P0/P1/scope_proposal}` |
| Prior-Candidate discoverability evidence | `{prior Candidate path:line/symbol + failure path}` |
| Global prior reviewer-miss recovery history / count | `{every entry binds missed+recovery Scope Locks / n>=0}` |
| Immediate-prior Scope Lock recovery count | `0` |
| Current independent main Reviewer identity | `{must equal this attempt's main Reviewer and differ from the invalidated prior Reviewer}` |
| Current exception ordinal | `1` |
| Initial full coverage complete | `YES / NO` |
| Scope-decision-blocked ranges | `[] / details` |
| Evidence/assignment gaps | `[] / details` |
| Required source/local gates and exact results | `{commands + results / INCOMPLETE}` |
| Required verification evidence | `COMPLETE / INCOMPLETE` |

The artifact must consolidate every item from this full review and emit one verdict. It records this recovery only in the non-self-referential `exceptional_review` block. After its digest is known, the next attempt adds both the missed immediate-prior Scope Lock and this artifact's recovery Scope Lock to history. Another reviewer miss against the same missed Scope Lock creates a `review_process_integrity` blocker; `NEW` cannot reset that quota.
```
