# Code Review 短报告模板

一份 Review Record + 一个短结论。Record 可内嵌或引用可读版本；只展开新 findings、未闭合项和关键证据，不重复 scope/全部 hash/历史/无适用事实的附录。首次核验引用后，同版本按需取证。输出语言跟随用户。

```markdown
Review: {Review ID / mode / Record path@version + digest 或内嵌}
Candidate: {逐仓 exact commit/tree 或 WORKTREE@snapshot；完整 manifest 见附件}
Source verdict: {APPROVED | CHANGES_REQUIRED | SCOPE_DECISION_REQUIRED | EVIDENCE_BLOCKED}
Blocking: {P0/P1 + OPEN SD/EB；无则 []}
Coverage/evidence: {本轮检查 + 复用依据 + 实际 gap；原始结果引用}
Next: {最小整改/缺证/Owner 问题；APPROVED 则停止}
CI: {exact SHA + 状态}；Environment: {独立状态}
Optional P2: {仅有实际建议时列出，不捆绑准出}
```

## Items

- **P0/P1**：`finding_id, severity, scope_classification, provenance, violated_frozen_invariant, exact_evidence, reproducer_or_failure_path, impact, minimum_boundary_preserving_fix, architecture_surface_delta`。`scope_classification` 使用 `in_scope | scope_violation`，`provenance` 使用 `initial_review | remediation_delta | previously_unavailable_evidence | reviewer_miss | post_terminal_new_ci_env`，因果解释另写。引用精确源码/输入/结果。只有 within-budget surface 才附 budget 行；旧 EB 恢复才附缺证恢复来源；漏审才附旧代码可见性、失效 closure 与新验证方法。不生成 N/A 表。
- **SD**：`proposal_id, conflicting_or_missing_approval, affected_range, smallest_owner_question`。已有明确边界且删/回退 Candidate 越界即可恢复时，使用标准 P1 scope violation，不诱导 Owner 扩张。
- **EB**：`blocker_id, missing_input, affected_range_or_invariant, smallest_restoration_evidence`。缺证不是 P1，漏审次数不是 EB；保留可独立判断的全部已确认 findings 和 SD。
- **closure**：原 ID、原验收、CLOSED/OPEN、相关证据，按需补 causal class。未选 P2 不结转。delta/recovery 只展开本轮增量，不重新生成整个问题库。

## APPROVED

P0/P1=0、原 blocker 关闭、无 SD/EB、必要源码证据完整、Candidate 稳定、完整覆盖可信且所有 gap 空，才可 APPROVED；满足即停止。

全部 immutable：`Code Review Approval Certificate`，引用精确 commit/tree。任一 mutable：`Mixed / Mutable Worktree Review Comment — NOT AN IMMUTABLE CANDIDATE CERTIFICATE`，只批准绑定 snapshot。源码准出不授予 push/CI/merge/deploy 权限。

## binding_only receipt

```markdown
Binding revision: {原 Review ID / revision；原有效 APPROVED 引用}
Binding: {每仓 reviewed snapshot/commit → exact commit/tree}
Proof: {verify_candidate_binding.py 的 SAME_CONTENT receipt 引用/digest}
Context: {Scope Lock 与必要证据依赖未变，无较新 blocker/withdrawal}
Source: {原 APPROVED 对上述 exact binding 继续适用}
CI: {新 SHA 的实际状态}；Environment: {独立状态}
```

需满足 [evidence-reuse.md](evidence-reuse.md) 全部前提；工具 receipt 本身不是批准。无语义 delta 不新建 Review ID、不重跑无关测试、不重做审批。全部 immutable 后，上述 receipt 与原有效 source APPROVED 组成当前 certificate；部分仍 mutable 时仍为 mixed comment。

## focused_recovery_review

写清 `失效 closure/漏审责任 → 根因与直接相关范围 → 不同验证方法 → closure`。首次与重复漏审均按影响范围判断，不因次数重启整轮。扩大到 full review 必须说明具体共同假设/覆盖失效证据。旧版 exceptional/reset 记录仅作历史证据。
