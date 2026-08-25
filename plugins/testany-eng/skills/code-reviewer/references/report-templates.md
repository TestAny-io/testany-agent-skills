# Code Review 输出模板

## 所有 WORKTREE verdict 的强制 Mutable Binding Appendix

A/B/C/E/G 任一模板绑定 `WORKTREE@...` 时，都必须在同一 terminal artifact 加入本 appendix；canonical Scope Lock payload 不包含这些 attempt-specific 事实，不能替代本表。immutable-only D 不适用。

| Repository | Root / immutable base / HEAD | Snapshot schema / SHA | Resolved script path + file SHA-256 | Exact argv (all options) | Changed-path digest | Post-validation / pre-verdict |
|------------|------------------------------|-----------------------|------------------------------------|--------------------------|---------------------|--------------------------------|
| `{mutable repo only}` | `{absolute root / full SHA / full SHA}` | `testany.code-reviewer.worktree-snapshot.v1 / WORKTREE@{sha256}` | `{absolute snapshot_worktree.py / sha256}` | `{argv array: --repo, --base, every --exclude, --candidate-ignored, --mutable-baseline}` | `{manifest.candidate_changed_paths_sha256}` | `{MATCH/DRIFT / MATCH/DRIFT}` |

| Repository | Binding class | Exact path | Exact option | Ownership / reason / bound digest |
|------------|---------------|------------|--------------|-----------------------------------|
| `{repo}` | `candidate_untracked` | `{path / none}` | `automatic untracked capture` | `{Candidate / N/A}` |
| `{repo}` | `candidate_ignored` | `{path / none}` | `--candidate-ignored` | `{Candidate / N/A}` |
| `{repo}` | `excluded_wip` | `{path / none}` | `--exclude` | `{owner + evidence-backed reason / N/A}` |
| `{repo}` | `mutable_baseline` | `{absolute path / none}` | `--mutable-baseline` | `{sha256 / N/A}` |

每个实际 path 单独一行；没有路径时仍为每个 class 填一行 `none`。任一摘要 `DRIFT` 使当前 Review ID失效，不得输出基于旧 snapshot 的 verdict。

## 有 immediate prior terminal 时的强制 Prior Terminal Chain Appendix

A/B/C/D/E/G 只要存在 immediate prior terminal 都必须逐项保留其 blocking items；F 只是 ordinary remediation 的额外 delta 明细，不能替代本 appendix。无 prior terminal 的真正首次 attempt 写 `N/A / none`。

| Prior Review ID | Terminal artifact | Transition causes | Per-cause evidence / first-available source or time | Prior/current Candidate | Prior mode / main Reviewer | Current Review ID / mode / main Reviewer | Prior Scope Lock ID / digest | Current Scope Lock ID / digest | Effect |
|-----------------|-------------------|-------------------|-----------------------------------------------------|-------------------------|----------------------------|------------------------------------------|------------------------------|--------------------------------|--------|
| `{CRV-UUID}` | `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}` | `{unique subset of the closed cause enum}` | `{cause → exact evidence + source/time}` | `{exact bindings}` | `{mode / identity}` | `{this attempt's exact root fields}` | `{id / digest}` | `{id / digest}` | `SAME / NEW` |

| Blocking item ID / type | Prior invariant / repository / range / status | Closure evidence or Owner authority | Current status | Required next disposition |
|-------------------------|-----------------------------------------------|-------------------------------------|----------------|---------------------------|
| `{CR-P0/P1, SD, or EB ID + type}` | `{exact immediate-prior terminal row}` | `{exact delta/restoration/decision/process authority}` | `OPEN / CLOSED` | `{delta / initial full review / new Scope Lock}` |

Approval 要求所有 prior **blocking** items 为 `CLOSED`；P2 不进入阻断 closure。只允许一个 canonical prior terminal reference；读取/验证后，全部 prior/current copied fields必须逐字匹配两端权威字段，recovery history还必须分别匹配 missed 与 recovery Scope Lock。causes 是去重闭集且每项有独立证据；兼容 causes可在一轮组合，所有约束累加。无 scope-changing cause只能 `SAME`；三种 scope-changing cause恰好一个出现才可 `NEW`。Mode 固定优先级为 repeated reviewer miss → initial full + coverage incomplete + `EVIDENCE_BLOCKED`、process reset → initial full、reviewer miss → exceptional full、其他 NEW/rebind/post-CI/partial → initial full，最后才是 eligible delta。这样 process reset/scope change/rebind或 reviewer miss/post-CI可一次闭合，任何 cause 都不能洗掉另一个约束。

## 无 terminal 的 Mutable Snapshot Drift Lineage

发生过 pre-terminal snapshot drift 时，A/B/C/D/E/G 同一 artifact 逐条加入下表；即使后续 Candidate 已提交并输出 immutable D，也不能把失效 attempt 伪装成 terminal或首次 attempt。

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

Candidate 自行越界且可删除/回退时使用标准 `P1` finding，标题标注 `scope violation`，`minimum_boundary_preserving_fix` 只能是删除/回退，`architecture_surface_delta: none`。

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
- Initial full coverage source: `{this review / prior exact review ID / N/A}`
- Per-repository changed-path manifests / digests: `{repo → source / sha256 / NOT_COMPLETE}`
- Unclassified changed-path manifest entries: `[] / details`
- Coverage ledger reconciled: `YES / NO`
- Required source/local gates and exact results: `{commands + results / INCOMPLETE}`
- Required verification evidence: `COMPLETE / INCOMPLETE`
- Scope-decision-blocked ranges: `[] / exact proposal-bound ranges`
- Evidence/assignment gaps: `[]`（非空时使用 C 模板）
- Delta review eligible after decision: `YES only when coverage=YES, required evidence=COMPLETE, both range lists=[], every EB/SD item CLOSED, Scope Lock unchanged, and this terminal Candidate is an immutable commit/tree; WORKTREE is always NO / NO`

## Confirmed findings from independently reviewable scope

`none`，或逐条使用 A 节的完整 P0/P1 finding 字段（包括已验证的 P1 scope violation）。

- Confirmed P0 / P1 / P2: `{n / n / n}`
- Required remediation IDs: `{IDs / none}`

## Product/Architecture Owner decision

请只决定以下最小问题：`{one concrete decision}`。

建议选项：

1. `{boundary-preserving option}`（推荐）— `{impact}`
2. `{explicit scope expansion}` — 需要先更新 `{PRD/API/HLD/LLD/Guardrails}`，再重新冻结 Scope Lock

在决定前，本 Reviewer 不会把该提案转成 P0/P1，也不会继续衍生新要求。

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

两个专用列只在 `review_process_integrity` 时必填；其他 blocker kind 固定为 `N/A`。

## Frozen boundaries

当 `Scope Lock: NOT_FROZEN` 时填写 closed sentinel `NOT_BOUND`；否则必须完整内嵌或引用：

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
- Initial full coverage source: `{this review / prior exact review ID / N/A}`
- Per-repository changed-path manifests / digests: `{repo → source / sha256 / NOT_COMPLETE}`
- Unclassified changed-path manifest entries: `[] / details`
- Coverage ledger reconciled: `YES / NO`
- Scope-decision-blocked ranges: `[] / exact proposal-bound ranges`
- Evidence/assignment gaps: `[] / exact EB-bound ranges`
- Review-process-integrity blocker open: `YES / NO`
- Delta review eligible when evidence is restored: `YES only when coverage=YES, required evidence=COMPLETE, both range lists=[], every EB/SD item CLOSED, Scope Lock unchanged, this terminal Candidate is an immutable commit/tree, and no review_process_integrity blocker ever required a process reset; WORKTREE is always NO / NO`

`review_process_integrity` blocker只能由用户明确授权从 review root 启动新的 independent initial full review来恢复；Candidate 修改、测试或普通补证不能关闭它，且本 attempt 永远不得标为 delta eligible。

## Confirmed findings from completed checks

`none`，或逐条使用 A 节的完整 P0/P1 finding 字段；不得因最终 verdict 是 `EVIDENCE_BLOCKED` 而丢弃已确认 findings。

- Confirmed P0 / P1 / P2: `{n / n / n}`
- Required remediation IDs: `{IDs / none}`

## Confirmed scope proposals / Owner decisions

`none`，或逐项保留 B 节的完整 closed proposal 字段；不得因 `EVIDENCE_BLOCKED` 优先级更高而丢弃已经确认的 scope decision。每个 contaminated range 必须同时出现在 `scope_decision_blocked_ranges`。

- Confirmed proposal IDs: `{IDs / none}`
- Minimum Owner questions and recommendations: `{exact questions / none}`
- No source defect conclusion was inferred from the missing evidence.

Verdict: `EVIDENCE_BLOCKED`
```

## D. Code Review Approval Certificate（仅 immutable commit/tree）

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
| Initial full coverage source | `{this review / prior review exact ID}` |
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

- Candidate implements the approved scope without unapproved architecture surface.
- No evidence-backed P0/P1 remains inside the frozen Scope Lock.
- P2 items, if any, are non-blocking and do not require another review round.
- CI, merge, Secret, migration, deployment, live smoke, and release remain separately authorized actions.

Verdict: `APPROVED`
```

## E. Mixed / Mutable Worktree Review Comment / APPROVED

```markdown
# Mixed / Mutable Worktree Code Review

只要任一仓库是 mutable worktree，整个多仓批准产物都使用本 Comment；每个 immutable 仓库仍须保留其 exact Candidate/tree，不能伪造 WORKTREE snapshot。下面两张 snapshot/WIP 表只填写实际 mutable 的仓库。

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
| Initial full coverage source | `{this review / prior review exact ID}` |
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

- 本结论只适用于上述 worktree snapshot；任何已绑定 Candidate/baseline 状态变化都会使其失效。明确排除的他人 WIP 与非 Candidate ignored 文件不在绑定范围内。
- 这不是 immutable Candidate certificate。提交后必须建立新的 immutable SHA/tree binding；不得把 mutable 结论自动转换成 certificate。
- P2 如有，保持非阻断，不要求另一轮源码评审。

Verdict: `APPROVED`
```

## F. Remediation delta section

复审报告在上述模板中追加：

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

纯 reviewer miss 不能填入上述表作为普通 delta finding/proposal；它加入 `REVIEWER_MISS` cause并启动一次独立异常完整复核。普通 delta中未引用 prior `EB-*` 的 `previously_unavailable_evidence` 同样处理。符合严格不可发现条件的 post-terminal CI/环境证据加入 `POST_TERMINAL_NEW_CI_ENV` cause：单独出现时做 initial full；与首次 reviewer miss 同时出现时两个 causes组合，只做一次 exceptional full；两者都不填写本节。旧源码已足以发现则仍是 reviewer miss。

```

## G. Exceptional reviewer-miss full review（独立模板；不得追加 F）

本模式使用下列独立 integrity block，并同时使用与最终 verdict 对应的 A/B/C/D/E terminal body；不得填写 F 的 remediation delta closure。

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
| Current independent main Reviewer identity | `{must equal this attempt's main Reviewer and differ from invalidated prior Reviewer}` |
| Current exception ordinal | `1` |
| Initial full coverage complete | `YES / NO` |
| Scope-decision-blocked ranges | `[] / details` |
| Evidence/assignment gaps | `[] / details` |
| Required source/local gates and exact results | `{commands + results / INCOMPLETE}` |
| Required verification evidence | `COMPLETE / INCOMPLETE` |

本报告必须合并本次完整复核的全部 items并输出一个 verdict。当前 artifact只在非自引用 `exceptional_review` block记录本次 recovery；下一 attempt在 digest 已知后，把 missed immediate-prior Scope Lock与本 artifact的 recovery Scope Lock一起加入 history。对同一 missed Scope Lock再次出现 reviewer miss时创建 `review_process_integrity` blocker；`NEW` 不能重置这个 quota。
```
