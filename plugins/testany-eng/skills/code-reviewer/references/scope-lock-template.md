# Code Review Record

只维护一份权威记录，可内嵌或用可读 `path@version + sha256` 引用。同一版本首次读/验后缓存，复审按需读取相关原始证据；大 manifest、hash 和原始输出放机器附件，不反复复制进消息。摘要核验不能代替源码判断。未知字段用 `NOT_BOUND / NOT_FROZEN`，不生成不适用的空附录。

## Identity 与 scope

`review_id: CRV-<UUIDv4>`；稳定 reviewer identity；`mode: initial_full_review | remediation_delta_review | focused_recovery_review`；当前 binding revision；输出语言；最近有效 prior Record 引用。实质复审用新 ID；捕获重试、同内容提交绑定沿用 ID 并增加 binding revision。

用 `scripts/scope_lock_digest.py <payload.json>` 冻结下方 closed v1 payload，正常整改沿用。批准来自原始有权决定，不能来自作者自述或循环认证的旧 reviewer comment。canonical payload 只保存一次，后续引用 digest。

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

工具做 NFC/首尾空白规范化、无序集合排序，拒绝重复、额外 key、错误类型/枚举和冲突事实。repository identity 为已批准稳定 ID 或脱敏 canonical remote；checkout、Candidate、verdict、excluded WIP 不进入语义 scope。budget 包括职责、信任和依赖变化，不只物理资源。digest 不是授权。

## Candidate binding 与 coverage

每仓一行：

| Repository / scope row | Absolute checkout | Reviewed from | Candidate | Tree / snapshot | Manifest reference |
|---|---|---|---|---|---|
| exact identity | path | full base / verified prior binding | full commit / WORKTREE | full tree / WORKTREE@sha256 | version + digest |

- 首轮覆盖全部 In Scope diff。delta 审原 blocker、变化行为与直接影响，沿用可信旧覆盖；补审覆盖失效 invariant/同根因路径，只有共同假设错误或影响无法界定才扩大。
- immutable：拒绝 replace refs/grafts；`GIT_NO_REPLACE_OBJECTS=1`，使用 `git diff --name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none <from> <candidate> --`，raw manifest 摘要一次。
- mutable：保存 `snapshot_worktree.py` 解析路径/版本、完整 argv 和 JSON；注明 Candidate-owned untracked/ignored 与排除 WIP 的 owner。`--candidate-ignored` 与 `--mutable-baseline` 不混用，排除不得隐藏已提交变化。最后验证结束、verdict 前的同一次 MATCH 满足两处检查；后续有写入才重查。
- 机器 manifest 分类 `in_scope / scope_violation / verified_filtered_baseline`；filtered 仅用于 raw-worktree-versus-index，且有 filter/EOL 与 prior-raw 双证据，mode/gitlink 不可 filtered。main 每绑定校验一次，child 只验分配输入。
- 简短覆盖索引：可信首次完整覆盖引用、本轮路径/组件、实际使用的 assignment，以及 `unclassified / scope_decision_blocked_ranges / evidence_or_assignment_gaps`。scope gap 绑 SD，缺证/未分配 gap 绑 EB。批准要求完整可信覆盖且三集合为空；补齐缺口时保留可信已完成部分。

## Evidence 与 blocking items

只为触达关键 invariant 记录行为行：

`invariant → 生产入口/provider/parser → 实际 helper 与替身 → 独立 oracle → 合法/非法/失败结果 → 直接消费者/分支/targets/recovery`

同一结果可关联多个 finding。命令、精确输入、执行 owner、结果/原始证据引用、实际 skip/限制和复用理由记录一次。Writer/CI 执行等价昂贵门禁，Reviewer 核证据并做最小独立反例；默认不生成每文件测试矩阵、不重复运行。

原 P0/P1/SD/EB 只用一个 closure 表：稳定 ID、原 acceptance、status、受影响范围、新证据及适用的 `original_unfixed / introduced_by_fix / pre_existing_unreported_cause`。P2 分开且不自动结转为 blocker。只取本次相关历史，不抄整条历史链。

漏审记录被撤回的 closure、旧方法盲点、受影响/同根因路径及不同验证方法。次数不触发重启；full review 必须有具体 scope/coverage/共同假设理由，默认不换 main、不找 PM 批准复审。

## Terminal 与 binding receipt

短报告引用本 Record 一次。source/local、exact-SHA CI 和 environment 分层。复用及同内容 `binding_only` 见 [evidence-reuse.md](evidence-reuse.md)。

receipt：原 Review ID/有效 APPROVED 引用、每仓 old→new 精确绑定、脚本结果附件/digest、scope 与证据依赖未变、独立 CI/environment 状态。它不产生批准权限，较新 blocker/撤回使快捷路径失效。全部 immutable 绑定与仍有效 source approval 共同构成当前 exact-commit certificate，无需重复评审轮。旧版 Record 保留证据作用，不迁移历史、不沿用次数升级规则。
