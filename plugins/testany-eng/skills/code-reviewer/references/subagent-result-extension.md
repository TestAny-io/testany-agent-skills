# Code Reviewer Subagent Result Extension

本扩展优先于共享 [subagent-result-contract.md](../../../references/subagent-result-contract.md)。使用时读取派发的完整 Review Record、[review-policy.yaml](review-policy.yaml) 及所选语言 report template 的 Item 正文（[中文](report-templates.md) / [English](report-templates.en.md)）；摘要或 digest 不是审查输入。

子任务只引用已冻结的输入/assignment 版本或完整内嵌块。主 Reviewer 聚合时引用已校验输入和子任务结果，不覆盖被引用版本，也不要求子任务计算尚不存在的最终 Record digest。不复制全量 identity、repositories、history、prior closure 或无适用事实的附录。

## Compact AGENT-RESULT

保留共享 envelope；Code Review 的 `status` 仅允许 `success | failed | needs_input`，`verdict` 仅允许 `pass | fail`，禁止 `partial / conditional_pass`。下列是空结果示意；实际集合必须来自已完成的分配范围，不能用空数组掩盖未审范围。

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
record_verification: READ_AND_HASH_VERIFIED
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

`EMBEDDED_INPUT_RECORD` 要求同一产物中有完整可读输入 Record，不是只有该标记。无法读取/校验时 `record_verification: FAILED`，报告具体 EB 和可得绑定，不得声称 pass 或输出可复用 coverage。主 Reviewer 拒收其审查结论，但保留缺证事实。

## 增量内容

- 结构化 finding 保留显式 `finding_id`、`severity`、`scope_classification: in_scope | scope_violation`，不是只给标题；计数按真实条目 severity 对账。
- `path_classification`：每项引用 repo-qualified `manifest_entry_ref`（含该 path 所有 layers/status），填写 `classification: in_scope | scope_violation | verified_filtered_baseline` 与 `scope_or_budget_reference`；filtered 时另附 filter/EOL 和 prior-raw 双证据。不抄整个 manifest。
- `behavior_evidence`：只为触达关键面提交 `invariant_ref`、`production_entry_and_parser`、`actual_helper_and_substitutions`、`independent_oracle_and_source`、`legal_illegal_failure_outcomes`、`direct_callers_branches_targets_retry_and_uncovered`。期望/实测须有精确来源；未覆盖边界不得留作暗示。
- `causal_closure_updates`：只提交分配给本任务的原 `item_id`、prior row 引用、`causal_history`、closure/authority/regression evidence、`current_status` 和 next disposition；主 Reviewer 合并进 Record 的单一 closure，不抄全部 prior items。因果历史绑定 `original_unfixed / introduced_by_fix / pre_existing_unreported_cause`、旧/新代码、首次可见性、prior acceptance/status 与 Reviewer 责任。
- `findings / scope_proposals / evidence_blockers / environment_only_notes`：新增项用 report template 的完整核心字段和适用的 conditional fields；已在 Record 中的项用精确 item 引用。适用性之外的字段不输出 `N/A`，但空集合保留 `[]`。
- `commands_run`：记录实际命令、输入/环境、退出状态/结果与可读证据引用；本地行为检查、exact-SHA CI、live/environment 分层，不以作者 PASS 替代检查。

## 接收与汇总规则

1. 实际读/验 Record、canonical Scope Lock、manifest 和被引用 artifact。assignment 版本与当前 Record 的 Review ID、main identity、mode、Scope Lock、逐仓 identity/path/base/Candidate/tree或snapshot/range 必须一致；任何不一致拒收。固定绑定变化需要新 Review ID；合法结果聚合不改变输入绑定。跨仓 assignment 逐仓核验，不能用“组合仓库”代替。
2. `manifest_verification` 覆盖 assignment 中每仓。每个 assigned changed path 必须有可追溯分类，`unclassified` 非空不得算完成。immutable 仅允许 `in_scope / scope_violation`；filtered 仅允许 mutable 的唯一 `raw_worktree_vs_index/RAW`，并有既有 filter/EOL 与 prior raw bytes 双证据。mode/submodule mismatch 不能 filtered。
3. 读取 Record 的 mutable 归属与 snapshot 参数。excluded WIP 必须经 `--exclude` 从 manifest 消失，不能覆盖 immutable diff、`base..HEAD` 已提交 Candidate path 及其 ancestor/descendant；仍出现在 manifest 的 path 不能排除。Candidate-owned ignored 必须经 `--candidate-ignored` 捕获，`--mutable-baseline` 不能替代；归属未知形成 EB，不能静默过滤。无 mutable 仓不复制这些集合。
4. 每个 `scope_decision_blocked_ranges` 与 SD 的 `contaminated_paths_or_ranges` 精确一一对应；每个 `evidence_or_assignment_gaps` range 绑定 EB。前者不是 evidence gap，后者须补证或重分配；整体 EB 优先但保留 SD 与所有已确认 findings。Gate 0 仍保留可得 repo/range，仅未知字段用 `NOT_BOUND / NOT_FROZEN`。
5. 先独立重建生产路径和假设，再核作者 PASS；真实 entry/parser/helper、替换边界、独立 oracle 与直接 callers/branches/targets/retry propagation 要落实到证据。状态/resourceVersion、历史终态 Pod、exit code 仅按触达的批准语义适用，不扩成每文件矩阵或新 scope。
6. P0/P1 必须有 provenance、frozen invariant、exact evidence、failure path、impact、minimum boundary-preserving fix、surface delta；within-budget 才要求 budget 行引用。最小修复要评估操作/门禁复杂度。可删除/回退的 Candidate 越界是完整 P1 `scope_violation`，净 surface delta 为 none；基线含糊/冲突或最小正确修复需要未批准 surface 才是 SD，不可混用。
7. provenance 必须匹配 policy 的 mode matrix。`previously_unavailable_evidence` 引用 prior terminal 中同 invariant/range 的 EB 及恢复证据，否则按 miss；`post_terminal_new_ci_env` 引用对应 cause、首次可得来源/时间和旧源码不可发现证明，旧源码已可发现仍是 miss。所有条件证据可引用已读且校验的 Record 行，不复制全 prior chain。
8. 同 ID 补充原因仍须 causal history；仍 OPEN 的同 issue 额外原因不自动构成正式 miss，已漏 blocking item 或无依据 prior closure/approval 必须评估 Reviewer 责任。不得静默改变原 acceptance，不能靠同 ID、新 scope 或新 binding 清除 miss。子任务只报告新增触发证据；main 从 Record 的可读已校验 history 推导 quota。
9. 首次 miss 需要不同 main 的一次独立 exceptional full，从逐仓 review root 覆盖并使用不同验证证据方法；仅换 child/ID 或复跑作者 PASS 不满足。相同 missed lock 再次 miss 返回 `EB-*/review_process_integrity`，绑定 prior exception artifact、第二个 item/type/旧 Candidate 证据与全部 implicated identities；最小恢复仅是用户授权不在该集合内的新独立 main 做 initial full。Candidate 修改/测试不能关闭，不能 delta；其他 lock 的历史不误触发本锁，NEW/rebind 不清零旧 quota。
10. 需要复用时读取 [evidence-reuse.md](evidence-reuse.md)：新 snapshot/commit 要新 Review ID，不继承 verdict。只有同 scope、旧完整 coverage 且两类 gap 空、prior bytes 可重建、所有受影响依赖/命令/工具/配置/基线同一或其 delta 已审时，才复用具体 source/local evidence。unknown 不复用，补最小检查，无法可靠划界则 full；live 不继承，CI 只证明原 SHA，miss 污染证据不能复用。previous delta base 可为 immutable 或已验证可重建 snapshot，snapshot `--base` 仍 immutable。
11. 所有 item ID 在共享 Review ID 内唯一；原问题保留原 ID。counts 必须等于 findings 对应 severity 数量。任何 P0/P1、scope violation、SD、OPEN EB 或非空两类 gap 都使 `verdict: fail`；只有 assigned coverage 完成、unclassified 空且上述 blockers 全无才可 pass。P2 不阻断、不自动结转或催促一起修。`status` 准确表达完成/失败/需输入；共享契约要求 failed 时 blocking_issues 非空，success 时为空。不一致结果一律拒收，不能凭 summary/count 丢 item。

子任务 verdict 只覆盖 assignment，不签发整体批准，也不授权改代码、改外部状态或部署。主 Reviewer 完成 Record coverage/closure 对账后，按同一 source/CI/environment 边界输出唯一 terminal。
