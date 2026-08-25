# Code Reviewer Subagent Result Extension

本文件是在共享 `../../../references/subagent-result-contract.md` 之上的强制扩展。发生冲突时，本扩展对 Code Review 优先。

## Closed status

保留共享契约的 `AGENT-RESULT` envelope 和字段。Code Reviewer 子任务只允许：

- `status: success | failed | needs_input`（禁止 `partial`）
- `verdict: pass | fail`（禁止 `conditional_pass`）

这里的 verdict 只代表分配范围，不签发整体批准；主 Reviewer 完成 coverage 对账后统一判定。非空 scope proposal 或 scope violation 使用 `verdict: fail`；主 Reviewer 分别汇总为 `SCOPE_DECISION_REQUIRED` 或 `CHANGES_REQUIRED`。

## Required binding

```yaml
<!-- AGENT-RESULT:BEGIN -->
role: code-reviewer
status: success | failed | needs_input
output_files: []
verdict: pass | fail
p0_count: 0
p1_count: 0
p2_count: 0
blocking_issues: []
warnings: []
needs_retry: false
needs_user_input: false
summary: "..."
review_id: CRV-<UUIDv4>
review_mode: initial_full_review | remediation_delta_review | exceptional_full_review_after_reviewer_miss
main_reviewer_identity: <stable identity/task>
scope_lock_id: <stable Scope Lock ID>
scope_lock_digest: sha256:...
prior_terminal_chain:
  prior_review_id: <CRV-UUID or N/A>
  prior_terminal_artifact: <path@version+sha256 or canonical EMBEDDED_TERMINAL_ENVELOPE JSON or N/A>
  transition_causes:
    - cause: <closed cause enum>
      exact_trigger_authority_or_restoration_evidence: <exact evidence>
      first_available_source_or_time: <exact source/time>
  prior_candidate: <exact binding, NOT_BOUND for a pre-charter terminal, or N/A for no prior terminal>
  current_candidate: <exact binding or N/A for no prior terminal>
  prior_mode: <review mode, NOT_DETERMINED for a pre-charter terminal, or N/A>
  prior_main_reviewer_identity: <identity/task or N/A>
  current_review_id: <this root review_id or N/A>
  current_mode: <this root review_mode or N/A>
  current_main_reviewer_identity: <this root main_reviewer_identity or N/A>
  prior_scope_lock_id_and_digest: <id + digest or N/A>
  current_scope_lock_id_and_digest: <id + digest or N/A>
  scope_lock_effect: SAME | NEW | N/A
  blocking_items:
    - item_id: <CR-P0/P1, SD, or EB ID>
      item_type: finding | scope_proposal | evidence_blocker
      prior_invariant_repository_range_and_status: <exact prior terminal row>
      closure_evidence_or_owner_authority: <exact evidence or N/A>
      current_status: OPEN | CLOSED
      required_next_disposition: <delta | initial full review | new Scope Lock | N/A>
invalidated_attempt_lineage:
  - invalidated_review_id: <CRV-UUID>
    terminal_artifact: N/A
    transition_reason: MUTABLE_SNAPSHOT_DRIFT_REBIND
    old_snapshot_digest: <WORKTREE@sha256>
    new_snapshot_digest: <WORKTREE@sha256>
    resolved_snapshot_script_path_and_digest: <absolute path + sha256>
    exact_argv: [...]
    exact_drift_evidence: <mismatch>
    invalidated_validation_may_be_reused: false
prior_exception_history:
  - review_id: <exceptional CRV UUID>
    missed_scope_lock_id_and_digest: <exact immediate-prior lock id + sha256 that was missed>
    recovery_scope_lock_id_and_digest: <exact root lock id + sha256 of the recovery terminal>
    terminal_artifact: <path@version+sha256 or canonical EMBEDDED_TERMINAL_ENVELOPE JSON>
    invalidated_prior_review_id: <CRV UUID>
    invalidated_prior_main_reviewer_identity: <identity/task>
    independent_main_reviewer_identity: <identity/task>
prior_exception_count: <nonnegative integer equal to global history length>
immediate_prior_scope_lock_recovery_count: 0 | 1
exceptional_review:
  invalidated_prior_review_id: <CRV-UUID or N/A>
  invalidated_prior_terminal_artifact: <path@version+sha256 or canonical EMBEDDED_TERMINAL_ENVELOPE JSON or N/A>
  invalidated_prior_main_reviewer_identity: <identity/task or N/A>
  triggering_missed_item_id: <CR/SD ID or N/A>
  triggering_missed_item_type: P0 | P1 | scope_proposal | N/A
  missed_scope_lock_id_and_digest: <exact immediate-prior lock id + sha256 or N/A>
  prior_candidate_discoverability_evidence: <exact prior Candidate evidence or N/A>
  current_exception_ordinal: 1 | 0
  independent_main_reviewer_identity: <identity/task or N/A>
repositories:
  - identity: <stable-repository-id>
    path: /absolute/path
    review_root_base: <sha>
    reviewed_from: <initial base | previous Candidate | review_root_base for exceptional>
    candidate: <sha-or-WORKTREE@digest>
    tree: <sha-or-N/A>
    reviewed_range: <base..candidate-or-previous..candidate>
assignment:
  paths_or_components: [...]
  risk_domains: [...]
coverage:
  changed_path_manifests:
    - repository_identity: <stable-repository-id>
      source: <immutable raw git command or WORKTREE snapshot field>
      sha256: sha256:...
  path_classification:
    - repository_identity: <stable-repository-id>
      path: <repository-relative-path>
      manifest_changes: [{layer: base_to_candidate | base_to_index | index_to_worktree | untracked | candidate_ignored | raw_worktree_vs_index | worktree_mode_vs_index | submodule_head_vs_index, status: <Git status | ? | RAW | MODE | SUBMODULE>}]
      classification: in_scope | scope_violation | verified_filtered_baseline
      scope_or_budget_reference: <exact row or N/A>
      evidence: <filter/prior-raw evidence or N/A>
  unclassified: []
  excluded_wip_reconciliation:
    - repository_identity: <stable-repository-id>
      path: <repository-relative path absent from changed-path manifest>
      snapshot_excluded: true
      attempt_charter_or_terminal_artifact_reference: <exact excluded_wip row outside canonical Scope Lock payload>
  reviewed_paths_or_components: [...]
  reviewed_diff_complete: true | false
  scope_decision_blocked_ranges: []
  evidence_or_assignment_gaps: []
evidence_blockers:
  - evidence_blocker_id: EB-...
    blocker_kind: candidate_binding | approved_baseline | source_access | verification_evidence | review_process_integrity
    frozen_invariant: <exact invariant or NOT_FROZEN>
    repository_identity: <stable-repository-id or N/A>
    affected_paths_or_ranges: [...]
    missing_input: <exact missing item>
    smallest_restoration_evidence: <one concrete item>
    implicated_reviewer_identities: [<identity/task; empty unless review_process_integrity>]
    prior_exception_terminal_artifact: <path@version+sha256 or canonical EMBEDDED_TERMINAL_ENVELOPE JSON; N/A unless review_process_integrity>
    second_missed_item_id_type_and_evidence: <CR/SD ID + P0/P1/scope_proposal + exact prior-Candidate evidence; N/A unless review_process_integrity>
    status: OPEN
findings:
  - finding_id: CR-P1-...
    severity: P1
    scope_classification: in_scope | scope_violation
    provenance: initial_review | remediation_delta | previously_unavailable_evidence | reviewer_miss | post_terminal_new_ci_env
    prior_evidence_blocker_id: EB-... | N/A
    prior_evidence_blocker_restoration_evidence: <exact closure evidence or N/A>
    prior_terminal_chain_reference: <prior Review ID + cause row or N/A>
    underlying_item_prior_source_nondiscoverability_evidence: <exact evidence or N/A>
    why_not_discoverable_previously: <N/A for initial/delta-caused, otherwise exact reason>
    violated_frozen_invariant: "..."
    exact_evidence: "..."
    reproducer_or_failure_path: "..."
    impact: "..."
    minimum_boundary_preserving_fix: "..."
    architecture_surface_delta: none | within_approved_budget
    architecture_budget_reference: "..."
scope_proposals:
  - scope_proposal_id: SD-...
    trigger: baseline_conflict | ambiguous_baseline | minimum_correct_fix_requires_unapproved_surface
    provenance: initial_review | remediation_delta | previously_unavailable_evidence | reviewer_miss | post_terminal_new_ci_env
    prior_evidence_blocker_id: EB-... | N/A
    prior_evidence_blocker_restoration_evidence: <exact closure evidence or N/A>
    prior_terminal_chain_reference: <prior Review ID + cause row or N/A>
    underlying_item_prior_source_nondiscoverability_evidence: <exact evidence or N/A>
    why_not_discoverable_previously: <N/A for initial/delta-caused, otherwise exact reason>
    conflicting_or_ambiguous_baselines: [<exact reference>]
    approved_budget_reference: <exact Scope Lock row or NONE>
    exact_evidence: <path:line/symbol/commit>
    why_revert_or_delete_is_not_a_correct_fix: <evidence-backed reason>
    contaminated_paths_or_ranges: []
    minimum_owner_question: <one concrete decision>
    boundary_preserving_recommendation: <one recommendation>
    expansion_option_consequence: <baselines to update and review reset required>
environment_only_notes:
  - note_id: ENV-...
    exact_evidence: <source/status>
    readiness_gap: <CI/environment/deployment gap>
    source_verdict_effect: NONE
commands_run: []
<!-- AGENT-RESULT:END -->
```

规则：

- `scope_lock_digest` 不匹配即拒收结果。
- `review_id`、`main_reviewer_identity` 必须与 assignment 完全一致；Candidate/snapshot、mode 或 reviewed-from 改变后不得复用旧 Review ID。
- 存在 immediate prior terminal 时，`prior_terminal_chain` 必须完整绑定其 Review ID、artifact digest、Candidate、mode/Reviewer、prior/current Scope Lock 与 `SAME|NEW`，并使用去重的 closed `transition_causes[]`；每个 cause 都有自己的精确证据与首次可得来源。逐项列出该 terminal 的所有 P0/P1、SD、EB；任何 blocking item 不得静默消失。只允许一个 canonical prior terminal artifact reference。所有 `prior_*` 字段必须与已验证 immediate-prior terminal逐字一致；所有 `current_*` 字段必须与本结果 root逐字一致。pre-charter terminal 只把**当时确实不可得的单个** repo/Candidate/tree/range 字段写为 `NOT_BOUND`，其余可得字段仍须保留精确值；mode固定为 `NOT_DETERMINED`、Scope Lock固定为 `NOT_FROZEN`，不能与“无 prior terminal”的 `N/A` 混用。artifact 若不使用 persisted path/version，就必须由 `terminal_artifact_envelope.py` 编码、验证并解码读取。P2 不进入 closure。真正首次 attempt 使用 `N/A`、空 causes和空 `blocking_items`。
- `scope_lock_effect: SAME` 要求 prior/current Scope Lock ID 与 digest 分别逐字相等且不存在 scope-changing cause；`NEW` 要求 ID 和 digest 都不同，并且 `SCOPE_DECISION_RESOLVED_CHANGED_OR_EXPANDED`、`APPROVED_BASELINE_OR_SCOPE_CHANGED`、`PRECHARTER_INPUTS_RESTORED_AND_SCOPE_LOCK_FIRST_FROZEN` 三个 cause中恰好一个出现。`NEW` 必须从新 review root做 full review；若同时有 `REVIEWER_MISS`，mode按优先级为 exceptional full，否则为 initial full。digest 漂移却写 `SAME` 的结果一律拒收。
- mutable 或 mixed approval 被 commit 后必须包含 `MUTABLE_TO_IMMUTABLE_REBIND`，逐仓从各自 immutable `review_root_base` 重审。`scope_lock_effect` 仍由完整 cause 集合推导：共存且恰好一个批准的 scope-changing cause时为 `NEW`，否则为 `SAME`；mode仍按全局优先级推导：共存 `REVIEWER_MISS` 时为 exceptional full，否则 rebind触发 initial full。至少一仓必须从 prior `WORKTREE@...` 转成 current exact immutable SHA/tree，且 current 的所有仓库都必须 immutable；prior 已 immutable 的仓库必须逐字保留原 Candidate/tree，若也发生变化则必须有另一个适用的 transition cause及独立证据。不得把 mutable/mixed comment 转成 certificate或把它作为 delta base。
- mode由 cause集合机械推导：`REPEATED_REVIEWER_MISS` → `initial_full_review` from review root + coverage incomplete + `EVIDENCE_BLOCKED`；否则 `PROCESS_AUTHORITY_RESET` → independent initial full；否则 `REVIEWER_MISS` → independent exceptional full；否则任何 NEW/rebind/post-CI/partial cause → initial full；只有没有更高优先 cause且 delta eligibility完整时才可 remediation delta。多个兼容 cause可以同轮出现且各自约束累加，例如 process reset + scope change + rebind，或 reviewer miss + post-CI + scope change。
- mutable snapshot 在 terminal 前漂移时，将每个失效 attempt 写入 `invalidated_attempt_lineage`：terminal 固定 `N/A`，reason 固定 `MUTABLE_SNAPSHOT_DRIFT_REBIND`，绑定 old/new snapshot、脚本摘要、完整 argv 和 drift evidence，且 `invalidated_validation_may_be_reused=false`。不得把它伪装成 prior terminal或真正首次 attempt。
- `prior_exception_history` 与 global `prior_exception_count` 在**每种 mode** 都必须携带并机械相等。每项分别绑定 missed immediate-prior Scope Lock和 recovery terminal Scope Lock；接收方读取/验证 artifact，并要求 Review ID、两套 Scope Lock、invalidated prior Review/Reviewer 与 independent Reviewer逐字一致。`immediate_prior_scope_lock_recovery_count` 等于按当前 immediate-prior terminal Scope Lock过滤 `missed_scope_lock` 的历史长度，且最多一项；`NEW` 或 rebind不能清零。
- exceptional mode 要求 `immediate_prior_scope_lock_recovery_count=0`，并完整填写 `exceptional_review`：invalidated prior review/artifact/Reviewer、missed prior Scope Lock、missed item ID/type、prior-Candidate证据、ordinal=`1` 及独立 Reviewer。其他 mode 使用 `N/A/0`；global history/count仍保留。
- `status: partial` 或 `verdict: conditional_pass` 即拒收结果。
- `repositories` 中任一 identity/path/review_root_base/reviewed_from/reviewed_range/Candidate/tree 或 assignment 不匹配即拒收结果；跨仓子任务必须逐仓列出，不能用一个“组合仓库”占位。remediation mode 的 `reviewed_from` 必须是 full immutable previous Candidate commit，不能是 `WORKTREE@...`；exceptional mode 的 `reviewed_from` 和 range start 必须逐仓等于 `review_root_base`。
- `changed_path_manifests` 必须与 `repositories` 按 `repository_identity` 一一对应；任一摘要不匹配、任一 manifest path 缺少 repo-qualified 分类或 `unclassified` 非空即拒收结果。
- immutable path 的 `classification` 只允许 `in_scope | scope_violation`。`verified_filtered_baseline` 只允许 mutable manifest 中唯一 `manifest_changes` 为 `raw_worktree_vs_index/RAW` 且 `evidence` 同时绑定 filter/EOL 与 prior raw bytes；否则拒收。
- `excluded_wip_reconciliation` 只用于 mutable snapshot `--exclude` 后已从 manifest 消失的路径，并必须引用本 attempt Charter/terminal artifact 中、位于 canonical Scope Lock payload 之外的 exact ledger row；immutable diff、`base..HEAD` 已提交 Candidate path（含 ancestor/descendant）或仍出现在 manifest 的 path 不能标成 excluded WIP。
- 非空 `evidence_or_assignment_gaps` 必须由主 Reviewer 重新分配或补证；未补齐前整体为 `EVIDENCE_BLOCKED`。`scope_decision_blocked_ranges` 必须与 closed proposals 的 `contaminated_paths_or_ranges` 精确一一对应：此类 range 使 coverage incomplete并触发 `SCOPE_DECISION_REQUIRED`，但不冒充 evidence gap。两类 range 都为空才可完整 coverage/APPROVED/delta reuse。
- 每个 `evidence_or_assignment_gaps` range 必须绑定一个上述 closed `EB-*`；即使 blocked input 发生在 Gate 0，仍要用 `NOT_FROZEN` 和所有可得 repo/range 标识。后续 `previously_unavailable_evidence` 只能引用这里已登记的 ID。
- 每条 P0/P1 候选必须包含 frozen invariant、exact evidence、failure path、impact、minimum fix、`architecture_surface_delta` 与 `architecture_budget_reference`。
- provenance 与 root `review_mode` 使用 closed matrix：initial full允许 `initial_review | post_terminal_new_ci_env`；delta只允许 `remediation_delta | previously_unavailable_evidence`；exceptional full允许 `initial_review | remediation_delta | previously_unavailable_evidence | reviewer_miss`，且当 causes同时含 `POST_TERMINAL_NEW_CI_ENV` 时允许严格满足不可发现证据要求的 `post_terminal_new_ci_env`。finding 与 scope proposal 同样适用。
- `previously_unavailable_evidence` finding/proposal 必须引用上一 terminal中覆盖同一 invariant/range 的 `EB-*` 及精确恢复证据；否则是 reviewer miss。`post_terminal_new_ci_env` 必须引用包含 `POST_TERMINAL_NEW_CI_ENV` cause 的 chain，绑定首次可得来源/时间并证明 prior source不可发现；单独时 initial full，与 `REVIEWER_MISS` 同时出现时只做一次 exceptional full。旧源码已足以发现则仍是 reviewer miss。
- Candidate 已实现且可删除/回退的 budget 外 delta 作为 `scope_classification: scope_violation` 的完整 P1 finding 返回；主 Reviewer 复核后计入 P1 并输出 `CHANGES_REQUIRED`。其最小修复只能删除/回退，净 `architecture_surface_delta: none`。
- 基线冲突/含糊或最小正确修复需要未批准 surface 的 `scope_proposal` 不得写入 findings；只交回主 Reviewer 汇总为 `SCOPE_DECISION_REQUIRED`。
- `scope_proposals` 每项必须使用上述 closed fields。主 Reviewer 必须验证 trigger、provenance、批准 budget、exact evidence，以及“删除/回退为何不能正确恢复合规”；泛化最佳实践或可直接删除的 Candidate 越界不得作为 proposal。普通 delta 新 proposal 只允许由 remediation delta 或当时客观不可得的新证据触发；后者必须引用覆盖同一 range 的 prior `EB-*`。可在上一轮发现的 reviewer miss 必须进入一次 exceptional full review。非空 `contaminated_paths_or_ranges` 必须逐项出现在 `scope_decision_blocked_ranges`；空数组表示该提案未阻止其余完整覆盖。
- `environment_only_notes` 只接受上述 closed fields，`source_verdict_effect` 固定为 `NONE`；环境事实只有在可复现地证明 Candidate 违反 frozen invariant 时才能另行形成标准 finding。
- 仅当 `immediate_prior_scope_lock_recovery_count == 1`（按当前 immediate-prior terminal 对应的**被漏审 Scope Lock**过滤 history）后又出现该锁下 reviewer miss 时，才必须返回 `EB-*/review_process_integrity`：在专用字段绑定 prior exception terminal artifact，以及第二个 missed item 的 ID/type/exact prior-Candidate evidence，并在 `implicated_reviewer_identities` 至少列出被失效的初始 Reviewer 和 exceptional Reviewer；count=`0` 时必须使用 `REVIEWER_MISS` 并做一次 exceptional full review。其他 Scope Lock 的 history 不能触发本锁 blocker，新建 Scope Lock 也不能清零旧锁 quota。`smallest_restoration_evidence` 只能是用户明确授权由**不在该集合内**的 main Reviewer 从 review root 启动新的 independent initial full review。其他 blocker kind 的两个专用字段固定为 `N/A`。Candidate/测试/普通补证不能关闭，且不得标为 delta eligible。
- 所有 finding/proposal/note ID 在整个共享 Review ID 内必须唯一。`p0_count/p1_count/p2_count` 必须分别等于 findings 中对应 severity 的数量；任何 P0/P1、scope violation、scope proposal、OPEN evidence blocker，或非空 `scope_decision_blocked_ranges` / `evidence_or_assignment_gaps` 存在时 `verdict` 必须为 `fail`。只有这些集合全空且 assigned coverage 完成时才能为 `pass`；`status` 仍须按可用枚举准确表达是否需要输入。任何不一致结果一律拒收，不能按 summary/count 静默丢 finding/blocker。
