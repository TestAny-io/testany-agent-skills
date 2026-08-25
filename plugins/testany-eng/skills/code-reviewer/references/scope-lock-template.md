# Code Review Charter / Scope Lock 模板

在阅读实现细节前填写。无法确认的字段不得猜测；它们若影响结论，应返回 `EVIDENCE_BLOCKED` 或 `SCOPE_DECISION_REQUIRED`。

## 1. Review identity

| 字段 | 内容 |
|------|------|
| Review mode | `initial_full_review` / `remediation_delta_review` / `exceptional_full_review_after_reviewer_miss` |
| Review round | Round N |
| Review ID | `CRV-<UUIDv4>`（本 attempt 唯一；不得重绑） |
| Main Reviewer identity | `{稳定 identity/task；每轮必填}` |
| Prior reviewer-miss recovery history | `{按时间排序的 missed/recovery Scope Lock ID+digest + review ID + terminal artifact + prior/current Reviewer identities / []}` |
| Global prior exception count | `{全 history 长度；非负整数}` |
| Immediate-prior Scope Lock recovery count | `{按 immediate-prior terminal 的 ID/digest过滤 missed lock的长度；0 或 1}` |
| Scope Lock ID | `{稳定 ID}` |
| Scope Lock content SHA-256 | `{必填摘要}` |
| Persisted charter | `{path@version + file SHA-256 / FULL_CANONICAL_PAYLOAD_EMBEDDED}` |
| Output language | zh-CN / en |
| User objective | `{用户本轮明确要求}` |

摘要必须由本 Skill 的 `scripts/scope_lock_digest.py <payload.json>` 生成，不得手工选择 JSON shape 或排序。输入是以下 closed payload（没有列出的 key 一律拒绝）：

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

脚本对文本做 NFC + 首尾空白归一化，把所有 array 当作无序集合并按每项 canonical JSON 排序，`required_gates` 同样排序；重复项、缺失/额外 key、语义 key 冲突、非 full lowercase Git SHA、错误类型或未知枚举均 fail closed。每个 `repository_identity` 只能绑定一个 `review_root_base`，每个 verification layer（source/ci/environment）必须恰好一行，每个 budget surface boundary 只能有一条事实。source 固定 required=true；CI/environment 固定 required=false 并使用上方 closed effect enum，Reviewer 不能用 Scope Lock 把环境缺口改造成源码阻断。`repository_identity` 使用批准的仓库 slug/UUID，或去除 userinfo、query、fragment 后的 canonical remote host/path；没有 remote 时由用户批准稳定 ID。绝对 checkout path、attempt-specific excluded WIP、摘要自身、当前/上一 Candidate、review mode、coverage 与 verdict 不在 closed payload 中；excluded WIP 由本轮 snapshot/terminal artifact 独立绑定。Candidate/tree 由每轮 Exact Git boundary 单独绑定，因此换 worktree/host或正常整改不会改变同一 Scope Lock。

## 2. Exact Git boundary

| Repository identity | Path | Review root base | Base / Previous Candidate | Candidate | Tree / Snapshot | Worktree state/ownership |
|---------------------|------|------------------|---------------------------|-----------|-----------------|--------------------------|
| `{stable slug/UUID/sanitized remote}` | `{absolute path, not hashed}` | `{initial approved base SHA}` | `{SHA}` | `{SHA or WORKTREE}` | `{tree SHA or WORKTREE@sha256}` | `{clean / classified WIP}` |

规则：

- `initial_full_review`：Base → Candidate。
- `remediation_delta_review`：Previous Candidate → Current Candidate，并列出上一轮 finding IDs。
- `exceptional_full_review_after_reviewer_miss`：`review_root_base` → Current Candidate；表中的 Base/Previous、changed-path manifest 命令和所有 reviewed range 都必须使用 `review_root_base`，不得只审上一 delta。
- 可评审 mutable worktree，但必须用本 Skill 目录下 `scripts/snapshot_worktree.py` 的**解析后绝对路径**绑定 manifest/摘要，并不得签发 immutable Candidate certificate。
- staged/unstaged/untracked 文件必须明确归属，不能默认属于 Candidate。

### Mutable worktree snapshot（仅适用于 WORKTREE）

| 字段 | 内容 |
|------|------|
| Snapshot schema / SHA-256 | `testany.code-reviewer.worktree-snapshot.v1 / {...}` |
| Snapshot command | `{完整命令与 base}` |
| Candidate-owned untracked | `{paths / none}` |
| Candidate-owned ignored | `{--candidate-ignored paths / none}` |
| Excluded WIP | `{path + owner + reason / none}` |
| Mutable baseline files | `{path + digest / none}` |
| Post-validation recheck | `MATCH / DRIFT / NOT_RUN` |
| Pre-verdict recheck | `MATCH / DRIFT / NOT_RUN` |

发生 `DRIFT` 时当前 Review ID/attempt 立即失效；保持同一语义 Scope Lock digest，生成新 Review ID并绑定新 snapshot后重跑本轮全部 required source/local validation，旧验证不可复用；否则返回 `EVIDENCE_BLOCKED`。只有批准边界/基线变化才建立新 Scope Lock。

## 2A. Prior terminal chain 与 blocking-item closure

存在 immediate prior terminal artifact 时必填；无 prior terminal 的真正首次 attempt 写 `N/A / none`。snapshot drift 导致的无 terminal 失效 attempt 使用下方独立 lineage，不能伪装成首次 attempt或 terminal。

| Prior Review ID | Terminal artifact | Transition causes | Per-cause evidence / first-available source or time | Prior/current Candidate | Prior mode / main Reviewer | Current Review ID / mode / main Reviewer | Prior Scope Lock ID / digest | Current Scope Lock ID / digest | Effect |
|-----------------|-------------------|-------------------|-----------------------------------------------------|-------------------------|----------------------------|------------------------------------------|------------------------------|--------------------------------|--------|
| `{CRV-UUID}` | `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}` | `{unique subset of the closed cause enum}` | `{cause → exact evidence + source/time}` | `{exact bindings}` | `{mode / identity}` | `{this attempt's exact root fields}` | `{id / digest}` | `{id / digest}` | `SAME / NEW` |

- Prior reviewer-miss recovery history / global count / immediate-prior Scope Lock recovery count: `{ordered missed+recovery-lock-bound artifacts / n / 0|1}`

| Blocking item ID / type | Prior invariant / repository / range / status | Closure evidence or Owner authority | Current status | Required next disposition |
|-------------------------|-----------------------------------------------|-------------------------------------|----------------|---------------------------|
| `{CR-P0/P1, SD, or EB ID + type}` | `{exact immediate-prior terminal row}` | `{delta/restoration/decision evidence}` | `OPEN / CLOSED` | `{delta / initial full review / new Scope Lock}` |

Immediate prior terminal 的每个 P0/P1、SD、EB 都必须出现；P2 不进入 closure。只允许一个 canonical terminal reference；读取/验证后，全部 prior/current copied fields必须逐字匹配两端权威字段，recovery history分别绑定被漏审与 recovery Scope Lock。causes是去重闭集且每项有独立证据；兼容 causes可在一轮组合并累加约束。无 scope-changing cause只能 `SAME`；三个 scope-changing causes中恰好一个出现才可 `NEW`。Mode固定优先级：repeated reviewer miss → initial full + coverage incomplete + `EVIDENCE_BLOCKED`；process reset → initial full；reviewer miss → exceptional full；其他 NEW/rebind/post-CI/partial → initial full；最后才是 eligible delta。pre-charter prior terminal未绑定字段使用 closed `NOT_BOUND / NOT_DETERMINED / NOT_FROZEN`，不得与无 prior terminal 的 `N/A` 混用。

### Invalidated attempt lineage（仅 mutable snapshot drift 且无 terminal）

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

作者 note、自测报告或 Candidate 自述不等于批准基线。

## 4. Frozen scope

### In Scope

- `{批准能力/组件/仓库/行为}`

### Out of Scope

- `{本轮明确不处理的功能、仓库、阶段或环境}`

### Must Not Change / Must Not Regress

- `{兼容行为、旧调用方、关闭态、数据边界等}`

## 5. Architecture budget

只列出本轮**已获批准**的 surface delta。没有列出的 surface 默认不得 `ADD`、`MODIFY` 或 `DELETE`；无字节/语义变化地保留既有 surface 不需要额外授权。

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
| Source/local tests | `YES — 使用 canonical payload 的 required_gates` | `{exact results / missing}` | `MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT` |
| Exact-SHA CI | `NO` | `{status / NOT_RUN}` | `REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING` |
| Environment/deployment | `NO` | `{status / NOT_RUN}` | `REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING` |

本节只能回显 canonical Scope Lock payload 的 closed 三层语义；不得再次填写 `yes/no` 或用 attempt 文本覆盖其 required/effect。实际 evidence 状态可以变化，但不会改变语义 Scope Lock。

## 7. Coverage ledger

- 每个仓库单独绑定 Candidate changed-path manifest 与摘要：immutable 先确认 `refs/replace` 与 legacy `info/grafts` 均不存在，再使用 `GIT_NO_REPLACE_OBJECTS=1 git diff --name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none <reviewed-from> <candidate> --` 的 raw stdout并直接做 SHA-256；commit/tree 解析也必须使用相同 replacement-disabled 环境。WORKTREE 使用 snapshot 的 `manifest.candidate_changed_paths` 与 `manifest.candidate_changed_paths_sha256`。`reviewed-from` 在 initial 是 base，在 remediation 是 previous Candidate，在 exceptional 必须是 `review_root_base`。

| Repository identity | Manifest source/range | Manifest SHA-256 |
|---------------------|-----------------------|-----------------|
| `{stable repo ID}` | `{raw immutable command / WORKTREE snapshot field}` | `{sha256}` |

| Repository identity | Candidate-owned path | Manifest layer/status | Classification | Scope/budget reference / evidence | Reviewer assignment |
|---------------------|----------------------|-----------------------|----------------|-----------------------------------|---------------------|
| `{stable repo ID}` | `{path}` | `{base_to_candidate:M / ...}` | `in_scope / scope_violation / verified_filtered_baseline (mutable raw-only)` | `{row / filter+prior-raw evidence}` | `{main/subagent}` |

immutable path 只能是 `in_scope` 或 `scope_violation`。`verified_filtered_baseline` 只适用于 WORKTREE 中唯一变化为 `raw_worktree_vs_index/RAW` 且有 filter/EOL 与 prior-raw 双证据的 path。mutable `excluded_wip` 必须通过 snapshot `--exclude` 从 manifest 移除，并在第 1/2 节 ledger 单独记录；它不是 changed-path classification。

| Repository / Range | Assigned path/component/risk domain | Reviewer | Reviewed complete | Typed blocked/gap ranges |
|--------------------|-------------------------------------|----------|-------------------|-----------------|
| `{repo base..Candidate}` | `{complete diff allocation}` | `{main/subagent}` | `YES/NO` | `[] / details` |

- Initial full coverage complete: `YES / NO`
- Shared Scope Lock digest reconciled: `YES / NO / N/A`
- All repositories/ranges reconciled: `YES / NO`
- Unclassified changed-path manifest entries: `[] / details`
- Scope-decision-blocked ranges: `[] / exact SD-bound details`
- Evidence/assignment gaps: `[] / exact EB-bound or unassigned details`

初次评审必须为 `YES` 且两类 range 都为空才可输出 `APPROVED` 或把覆盖作为后续 delta 的复用依据。与 closed proposal 一一对应的 scope-blocked range 返回 `SCOPE_DECISION_REQUIRED`；缺证/未分配 range 返回 `EVIDENCE_BLOCKED`。两类都非空时遵循 evidence 优先级但完整保留 proposal。复审只有在上一轮 coverage=YES 且两类 range 都为空时才能使用 delta-only。

`raw_worktree_vs_index`、`worktree_mode_vs_index` 和 `submodule_head_vs_index` path 也必须分类。只有前者没有其他 manifest layer 且能证明是既有 clean/smudge/EOL 工作区表示、并绑定 prior raw bytes 时，才可使用 `verified_filtered_baseline`；mode/submodule mismatch 只能按 `in_scope` 或 `scope_violation` 分类。

## 8. Remediation closure（仅 `remediation_delta_review`）

- Previous Review ID：`{CRV-UUID}`
- Previous terminal artifact：`{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}`

| Finding ID | Frozen invariant | Expected minimum fix | Allowed surface delta |
|------------|------------------|----------------------|-----------------------|
| `CR-P1-001` | `{...}` | `{...}` | `none / exact approved budget row` |

上一轮 initial full coverage complete: `YES / NO`。若为 `NO`，本轮不能使用 `remediation_delta_review`。

| Prior Scope Proposal ID | Owner decision evidence | Disposition | Scope Lock effect |
|-------------------------|-------------------------|-------------|-------------------|
| `SD-...` | `{exact decision}` | `CLOSED / OPEN` | `UNCHANGED / NEW_SCOPE_LOCK_INITIAL_REVIEW_REQUIRED` |

| Prior Evidence Blocker ID | Missing input | Restoration evidence | Status |
|---------------------------|---------------|----------------------|--------|
| `EB-...` | `{exact input}` | `{exact restored source}` | `CLOSED / OPEN` |

上一 Review ID、可读取的 terminal artifact及摘要、Candidate、finding IDs、scope proposal IDs和evidence blocker IDs必须全部列出；任何 prior item 不得静默消失。

## 9. Reviewer-miss exception binding（仅 `exceptional_full_review_after_reviewer_miss`）

| Field | Value |
|-------|-------|
| Invalidated prior review ID | `{exact ID}` |
| Invalidated prior terminal artifact | `{path@version + sha256 / canonical EMBEDDED_TERMINAL_ENVELOPE JSON}` |
| Invalidated prior main Reviewer identity | `{stable identity/task}` |
| Missed immediate-prior Scope Lock ID / digest | `{exact prior terminal lock ID / sha256}` |
| Triggering missed item | `{CR/SD ID + P0/P1/scope_proposal}` |
| Prior-Candidate discoverability evidence | `{exact prior Candidate path:line/symbol + failure path}` |
| Global prior exception history / count | `{可含其他 Scope Lock 的历史 / n}` |
| Immediate-prior Scope Lock recovery count | `0`（非此值不得进入本模式） |
| Current independent main Reviewer identity | `{identity/task；必须不同于前任}` |
| Current exception ordinal | `1` |
| Full range | `{review_root_base..current Candidate per repo}` |

本节独立于第 8 节。当前 artifact只记录非自引用 recovery block；下一 attempt等 digest已知后，把 missed immediate-prior Scope Lock与本 artifact的 recovery Scope Lock一并加入 global history。quota按 missed lock过滤；同一 missed lock再次漏审创建 `review_process_integrity` blocker，`NEW` 不得清零。

## 10. Charter decision

- Charter complete: YES / NO
- Unresolved baseline conflict: `{none / details}`
- Unapproved scope proposal already present: `{none / details}`
- Candidate binding stable: YES / NO（immutable SHA/tree 也填写 YES）
- Initial full coverage plan complete: YES / NO
- Review may proceed: YES / `EVIDENCE_BLOCKED` / `SCOPE_DECISION_REQUIRED`
- Proceed with independently reviewable ranges: `YES / NO + exact reason`（存在局部 proposal/gap 时默认 YES）
