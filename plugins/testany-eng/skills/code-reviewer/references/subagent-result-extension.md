# Code Reviewer Subagent Result Extension

本扩展补充共享 [subagent-result-contract.md](../../../references/subagent-result-contract.md)。派发必须已有并行授权且有独立价值；child 读本 Skill、可读 Scope Lock、精确 assignment 与所需原始证据，不全量重读所有仓库和历史。引用版本首次核验后复用；主审提供已固定 manifest，child 核验自己的范围。

## Compact AGENT-RESULT

共享 envelope 的 `status` 只允许 `success | failed | needs_input`，`verdict` 只允许 `pass | fail`。下面仅为格式示例；空数组不能掩盖未审范围。

```yaml
<!-- AGENT-RESULT:BEGIN -->
role: code-reviewer
status: success
output_files: []
verdict: pass
p0_count: 0
p1_count: 0
p2_count: 0
blocking_issues: []
warnings: []
needs_retry: false
needs_user_input: false
summary: "<assigned-range result>"
review_record_ref: "<frozen input path@version + sha256 or EMBEDDED_INPUT_RECORD>"
record_verification: ASSIGNED_INPUT_READ_AND_VERSION_VERIFIED
assignment_ref: "<Record assignment ID>"
coverage:
  manifest_verification:
    - repository_ref: "<Record repository row>"
      manifest_ref: "<Record manifest row, source and digest>"
      verification: MATCH
  path_classification: []
  reviewed_paths_or_components: []
  reviewed_diff_complete: true
  unclassified: []
  scope_decision_blocked_ranges: []
  evidence_or_assignment_gaps: []
behavior_evidence: []
causal_closure_updates: []
findings: []
scope_proposals: []
evidence_blockers: []
environment_only_notes: []
commands_run: []
<!-- AGENT-RESULT:END -->
```

`review_record_ref` 标明冻结输入版本，`assignment_ref` 必须定位到完整可读任务。`record_verification` 仅声明自己所需输入已读/验，不声称复核全局历史。版本不匹配或原始必要输入不可读时报 EB，不用摘要替代。

## 增量内容与汇总

1. exact repo/range、Scope Lock 和 assignment 必须对应当前 binding；同内容提交可引用主审接受的 binding receipt，实质 delta 不得隐式沿用旧输入。item ID 在 Review ID 内唯一，原 blocker 保留 ID/验收。
2. 每个 assigned changed path 有可追溯分类；`verified_filtered_baseline` 仅允许 raw-worktree-versus-index 且有 filter/EOL + prior-raw 证据，mode/gitlink 不可 filtered。excluded WIP 不能隐藏已提交 Candidate，ignored 归属未知是 EB。main 对账一次，不让每个 child 重建全仓 hash。
3. coverage 的 scope-blocked range 对应 SD，evidence/assignment gap 对应 EB；未分类/未审范围不能 pass。汇总保留所有已确认 findings/SD/EB，优先级不吞掉其他结果。
4. `behavior_evidence` 只覆盖所审关键 invariant：真实入口/provider/parser、实际 helper/替身、独立 oracle、合法/非法/失败、直接 caller/branch/target/recovery。先重建路径再核作者 PASS，不以测试数量或真实依赖替代生产语义证据。
5. `findings` 使用 report template 的核心字段；新增 surface 在明确预算内才是正常修复。可回退的越界是 P1 scope violation；真正的批准歧义/新 surface 决策才是 SD。P2 不阻断、不捆绑整改、不自动结转。
6. `causal_closure_updates` 只返回分配的原项：original_unfixed / introduced_by_fix / pre_existing_unreported_cause、旧/新证据、current_status。旧源码可发现而漏掉须记录责任并撤回相关 closure；首次/重复 miss 均按根因影响补审，不要求新 main/全仓重审/PM 重启。
7. 测试结果按 evidence-reuse 核验输入、依赖、命令、配置、fixture/toolchain/oracle；沿用可信未受影响项，失效项补最小独立检查。等价昂贵测试设单 owner，不重复启动；CI 仅证明原 SHA，live 不继承。
8. `commands_run` 只列实际执行/复用的证据与边界。counts 与条目对账，任何 P0/P1/SD/OPEN EB/coverage gap 均 `fail`；只有分配范围完成且这些为空才 `pass`。`failed` 时 blocking_issues 非空，`success` 时为空；主审拒收不一致数据。

child 只对 assignment 给结论，不签整体批准、不授权外部操作。主审验输入绑定、疑点与关键 oracle、覆盖缺口和 prior closure 后聚合合格结果，不逐项重做子任务。只发送实质结果/阻塞变化，不回复 ACK 的 ACK。
