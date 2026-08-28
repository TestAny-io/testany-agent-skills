# Code Review 输出模板

每份 terminal 使用一份 [Review Record](scope-lock-template.md) 和下列适用正文；A–G 是选择器，不是要求全部输出。Record 保存完整 Charter、逐仓 binding、manifest/coverage、行为证据、三层验证、prior chain/closure 与适用附录。报告引用它，不再复制这些表；无 mutable、drift 或 miss 就不输出相应附录，空集合仍保留 `[]`。

## 共用 terminal 头与批准条件

```markdown
# Code Review — {verdict}

- Review Record: {完整 EMBEDDED_REVIEW_RECORD 或可读 path@version + sha256}
- Record verification: READ_AND_HASH_VERIFIED（含 canonical Scope Lock digest 重算）
- P0 / P1 / P2: {n / n / n}
- Required remediation IDs: []（仅已确认 P0/P1）
- Required decisions / inputs: []（SD / EB ID）

{仅适用的 A–E 正文；F 或 G 按 mode 引用 Record}
```

Record、其 prior terminal/history 和被引用 item 的正文必须实际读取并校验，不能用 digest、summary、计数替代；内嵌 prior terminal 使用 `terminal_artifact_envelope.py` 验证、解码读取。Record 版本/固定绑定不一致时不得签发结论。pre-charter 未绑定输入使用 Charter 的 closed sentinels，并保留 main Reviewer identity 与其他可得精确字段。

统一优先级：`EVIDENCE_BLOCKED > SCOPE_DECISION_REQUIRED > CHANGES_REQUIRED > APPROVED`。`APPROVED` 仅在 P0=P1=0、SD/EB 全关闭、所有 prior blocking items CLOSED、required source/local evidence COMPLETE、Candidate binding 稳定、initial full coverage 完整并对账、unclassified 与两类 gap 均为 `[]` 时成立。CI/environment 独立报告，不把未部署或 CI NOT_RUN 当源码缺陷；只有证明 Candidate 违反 frozen invariant 才另列标准 finding。

P2 是可选建议：未明确选择不进入整改、不结转 mandatory closure、不延长评审，也不催促本轮“顺便全部修完”；被选择也不自动成为 blocker。任何源码结论都不授权 CI trigger、merge、Secret、migration、deployment、live smoke 或 release。

## Item 正文（在 Record registry 中只存一次）

### P0/P1 finding

结构化条目仍显式包含 `finding_id`、`severity`、`scope_classification: in_scope | scope_violation`；人读标题只是显示方式，计数不靠解析标题猜测。

```markdown
### {CR-P0/P1-ID} — {title}

- provenance: {review-policy.yaml 允许且与 mode 匹配的来源}
- violated_frozen_invariant: {批准基线中的精确要求}
- exact_evidence: {repo + Candidate + path:line/symbol}
- reproducer_or_failure_path: {可复现输入与失败路径}
- impact: {用户/系统影响}
- minimum_boundary_preserving_fix: {最小修复；说明新增操作/门禁复杂度是否必要}
- architecture_surface_delta: none / within_approved_budget
```

只有 `within_approved_budget` 时补 `architecture_budget_reference`。Candidate 自行越界且删除/回退能正确恢复合规时，作为标题含 `scope violation` 的 P1；最小修复只写删除/回退，净 surface delta 为 `none`，不伪装成 Owner proposal。不得为了新发现静默改变原 acceptance 或批准范围。

### SD scope proposal

```markdown
### {SD-ID}

- scope_proposal_id: {原 ID}
- trigger: baseline_conflict / ambiguous_baseline / minimum_correct_fix_requires_unapproved_surface
- provenance: {与 mode 匹配的 closed provenance}
- conflicting_or_ambiguous_baselines: [] / {精确引用}
- approved_budget_reference: {精确 Charter 行 / NONE}
- exact_evidence: {repo + Candidate + path:line/symbol}
- why_revert_or_delete_is_not_a_correct_fix: {证据支持的理由}
- contaminated_paths_or_ranges: [] / {精确范围}
- minimum_owner_question: {一个具体决定}
- boundary_preserving_recommendation: {一个建议}
- expansion_option_consequence: {需更新的基线 + 新 Scope Lock / full review}
```

泛化最佳实践和可直接删除的 Candidate 越界不是 SD。未获决定前不把 proposal 转成 P0/P1，也不从 proposal 衍生新要求。每个 contaminated range 必须一一出现在 Record 的 `scope_decision_blocked_ranges`；不阻碍其余覆盖时保持空数组。

### Conditional provenance（finding / proposal 共用，仅适用时输出）

| 条件 | 必需证据或 Record 精确引用 |
|------|----------------------------|
| `previously_unavailable_evidence` | `prior_evidence_blocker_id`、`prior_evidence_blocker_restoration_evidence`、`why_not_discoverable_previously`；prior EB 必须覆盖同一 invariant/range，否则按 miss 处理 |
| `post_terminal_new_ci_env` | `prior_terminal_chain_reference`（含 `POST_TERMINAL_NEW_CI_ENV`）、`underlying_item_prior_source_nondiscoverability_evidence`、`why_not_discoverable_previously`；chain 绑定首次可得来源/时间，不能把旧源码可发现的问题洗成新证据 |
| `reviewer_miss` | `prior_terminal_chain_reference`、`prior_candidate_discoverability_evidence`；按 Record 的独立复核规则处理 |
| continued / late cause | `causal_history` 引用统一 closure：`original_unfixed / introduced_by_fix / pre_existing_unreported_cause`，旧/新代码、首次可见性、prior acceptance/status 与 Reviewer 责任 |

相同 ID 不豁免漏审问责；对仍 OPEN 的同 issue 补原因不自动触发正式 miss，但新发现已漏 blocking item 或无依据的 CLOSED/APPROVED 路径必须评估 miss。mode 与来源按 [review-policy.yaml](review-policy.yaml) closed matrix，不用更换 ID 或新 scope 逃避责任。

### EB 与 environment-only note

| 类型 | 必填字段 |
|------|----------|
| EB | `evidence_blocker_id`、`blocker_kind`、`frozen_invariant`、`repository_identity`、`affected_paths_or_ranges`、`missing_input`、`smallest_restoration_evidence`、`status` |
| `review_process_integrity` 额外字段 | `prior_exception_terminal_artifact`、`second_missed_item_id_type_and_evidence`、`implicated_reviewer_identities`；可精确引用 Record miss appendix |
| environment-only note | `note_id`、`exact_evidence`、`readiness_gap`、`source_verdict_effect: NONE` |

EB kind 仅允许 `candidate_binding / approved_baseline / source_access / verification_evidence / review_process_integrity`。Gate 0 也必须保留所有可得 repo/range 与 `NOT_FROZEN`；其他 EB 不输出 process-only 空字段。missing evidence 本身不是源码缺陷。所有 ID 在共享 Review ID 内唯一，原问题保留原 ID；计数必须等于实际 findings，不能按 summary/count 丢弃条目。

## A. Review Comment / CHANGES_REQUIRED

```markdown
Confirmed findings: {Record 中 P0/P1 item 的精确引用与简短影响}
Required remediation: {仅这些 P0/P1 ID；每项边界保持不变}
Verdict: CHANGES_REQUIRED
```

适用于至少一个确认的 P0/P1 且无更高优先级 SD/EB；若仍有阻断覆盖的范围，用 B/C 并保留所有已确认 findings。不得用 P2 凑 required remediation。

## B. SCOPE_DECISION_REQUIRED

```markdown
Owner decision: {Record 中 SD ID + minimum_owner_question}
Recommendation: {边界保持建议；扩范围时的基线/Scope Lock 后果}
Confirmed findings: [] / {Record item 引用}
Verdict: SCOPE_DECISION_REQUIRED
```

无 evidence gap 才使用 B；局部 scope 决策不阻止独立可审范围继续。决定后的 delta eligibility 依据 Record 的完整 coverage、source evidence、所有 SD/EB closure 与 [evidence-reuse.md](evidence-reuse.md) 评估，不把 verified snapshot 一概排除，也不自动继承旧批准。

## C. EVIDENCE_BLOCKED

```markdown
Missing inputs: {Record EB ID + smallest_restoration_evidence}
Completed checks / confirmed findings / scope proposals: {Record 精确引用；空集合为 []}
Verdict: EVIDENCE_BLOCKED
```

保留全部已确认 P0/P1 与 SD 及其 Owner 问题，不能因 EB 优先而丢弃。每个 evidence/assignment gap 绑定 EB。`review_process_integrity` 的最小恢复只能是用户明确授权不在 implicated 集合内的新独立 main 从 review root 开始 initial full；Candidate 修改、测试或普通补证不能关闭，本 attempt 不得 delta eligible。

## D. Code Review Approval Certificate（所有仓库均 immutable）

```markdown
# Code Review Approval Certificate

Scope: {Record 的 exact immutable Candidate/tree bindings}
Source verdict: APPROVED
Readiness: {Record 的 exact-SHA CI / environment 独立状态引用}
```

仅当全部批准条件满足、每仓都绑定 exact immutable commit/tree 时使用。P2 可保留为非阻断建议；certificate 不是部署或其他外部操作授权。

## E. Mixed / Mutable Worktree Review Comment / APPROVED

```markdown
# Mixed / Mutable Worktree Code Review

Scope: {Record 的逐仓 Candidate/tree 或 WORKTREE snapshot bindings}
Source verdict: APPROVED
Artifact type: REVIEW COMMENT — NOT AN IMMUTABLE CANDIDATE CERTIFICATE
```

任一仓仍 mutable，整个多仓产物都使用 E；immutable 仓保留真实 SHA/tree，不能伪造 snapshot。Record 的实际 mutable 仓必须具有完整 Mutable Binding Appendix 及两次 MATCH。结论只适用于绑定 snapshot/baseline；明确排除的他人 WIP 与非 Candidate ignored 不属于绑定范围。

snapshot 改变或部分/全部提交都要求新 Review ID 和新绑定；未提交仓可保持 verified mutable，只有全部 immutable 才能使用 D。旧 comment 不自动转 certificate；仅按 evidence-reuse 逐条复用合格 source/local evidence，live 不继承，CI 不转移到另一 SHA。

## F. Remediation delta section（仅 remediation mode）

引用 Record 的单一 `blocking_items` closure、delta binding 和行为证据，不再追加 P0/P1、SD、EB 三套表。逐个原 ID 说明状态、因果分类、最小修复和相关回归；previous Candidate 可为 immutable 或 verified reconstructable snapshot，所有复用前提必须满足。

普通 delta 的 late item 仅按 policy 接受整改引入或 prior EB 恢复的新证据。miss 不能伪装成 ordinary delta；post-terminal CI/environment 按自己的 cause 及严格不可发现证明处理。causes 组合时约束累加、一次 review 统一收敛，不复制多份报告。

## G. Exceptional reviewer-miss full review（不得追加 F）

引用 Record 的 Reviewer-miss Appendix、全 root→Candidate coverage、原 ID closure 与 A/B/C/D/E 对应 terminal body。首次独立复核先自己重建生产路径/假设，再检查作者 PASS，并使用不同验证证据方法；仅换 Reviewer ID 不构成独立证据。

一次 exceptional full 必须合并全部 findings/proposals/blockers 并给出一个 verdict。history 仅保留可读已校验 prior 引用 + 新增 recovery 绑定；同 missed lock 的第二次 miss 转 `review_process_integrity` 和用户授权的新独立 initial full，NEW/rebind 不重置 quota。
