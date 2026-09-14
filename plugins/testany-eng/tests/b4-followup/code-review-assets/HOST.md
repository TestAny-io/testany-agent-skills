# 主持者执行约定（永不复制到被测任务根）

## 主持者设施预审前

用户已授权本轮第二项测试；当前状态是 `COORDINATOR_PREDISPATCH_REVIEW`，
不是重新等待用户授权。只需主持者预审设施后放行派发。

`python3 -B -m unittest discover -s plugins/testany-eng/tests/b4-followup -p test_code_review_case.py -v`

`python3 -B plugins/testany-eng/tests/b4-followup/code_review_case.py --batch output/gpt6-b4-followup-2026-09-14/code-review/prepared-facility-v2`

两者都不会派发模型。unit test 中的队列探针/修复应用不是被测模型 trajectory，
不得当作初审证据。prepare 生成两条独立的相同业务 Candidate，分别供 Astra/high
与 gpt-5.6-terra/high；runtime 只取冻结 B4v2，不从 live 技能树读入变化。

本版设施只用于未来新 batch 和设施回归，不迁移既有 `prepared-v1`、不重写其
eligibility/repair/phase，也不追溯改变旧模型判据。旧轨迹继续使用自己的
facility-snapshot；`prepared-facility-v2` 指设施升级，不是更换 B4v2 runtime。

## 主持者预审通过后

使用真实独立子 agent API，`fork_context:false`，严格按 trajectory-plan.json 的
model/high 和 dispatch_message 派发。整个场景至多一个被测 agent 活跃；初审结束
先不 close，同一 agent 接收 delta 用户消息，delta 终态采集后才 close。
不得新建用户任务；不得用另一模型或宿主顶替执行；不可访问外网、凭据和平台。

1. 真实初审完成后调用 `capture_turn(batch, receipt, agent_id, initial_message, "initial-complete")`。
2. 主持者先实际读取该安装的 `code-reviewer/SKILL.md`、`review-policy.yaml`、
   `scope-lock-template.md`、`report-templates.md`、`evidence-reuse.md`，再核对模型
   的真实 terminal/Record、canonical Scope Lock、manifest 与公开行为证据。
3. 通过 `record_eligibility(...)` 在 batch 的 `preflight/<run_key>/delta-eligibility.json`
   中保存显式 structured 判定，引用真实 phase/terminal/Record、原问题 ID 及原验收语义，
   不把这个主持者判定发给被测模型。Markdown 备忘录、关键词或非空文件均不能授权 repair。
   必须证明 initial_full_review 已完整覆盖两条 changed paths 和直接调用链，
   unclassified、scope_decision_blocked_ranges、evidence_or_assignment_gaps 为空，
   完整 coverage 可信、旧 Git 内容可重建、原 Scope Lock 可读可重算，且本场景缺陷
   已由实际初审提出。不能只检查字段、测试计数或出现 CHANGES_REQUIRED 字样。
4. 前提不满足时记录原始失败并停止普通 delta 场景，不伪造/润色初审，不隐瞒 miss，
   不自行派发额外修补轮，不用 expected 或 rubric 豁免 skill。本轮不是 miss 恢复测试。
5. 前提满足后调用 `apply_repair(batch, receipt, ".review/initial/<实际terminal文件>")`。
   此函数只应用预冻结 recipe，不按模型建议扩大整改。已生成过 mutation 时不得重跑覆盖。
6. 将函数返回的**完整原样字符串**作为真实用户消息发送至同一 agent，不加入 expected、
   主持者判定、预写 closure、前一模型答案。delta 只引用这个 agent 自己的真实初审。
7. 真实 delta 完成后 `capture_turn(..., actual_delta_message, "delta-complete")`，随后 close。
8. 保存真实 dispatch receipt，按现有 B4 collector 收集最终公开 evidence，再由其他人独立复核。

共享 collector 的 final.md 在多轮中合并多个 final，workspace 是采集时的最终状态。
初审状态只能引用 `phases/<run_key>/initial-complete/`；每个 phase 的完整公开会话
及快照/hash 不可被最终目录替代。`user-messages/` 分别保存两条实际观测到的 user 消息，
不是只保存拟发送模板。原始 session 不复制、不发布；不提取私有推理。

## Structured Eligibility 使用法

从本 batch 的 receipt JSON 读取 `receipt`；`batch` 使用规范化的绝对目录。
`terminal_relative`、`record_relative` 必须是该 run 自己的两个不同的真实文件，
位于 workspace 的 `.review/initial/` 下。下面仅示范完成语义核查后的调用形状，
不得未经检查照抄全 true/空 gap。前提不成立时明确写 `INELIGIBLE`，保留失败项和真实 gaps。

`scope_lock_verified` 不仅表示 digest 重算相同：须用公开动作顺序确认语义 payload
在阅读实现细节前已冻结，并逐项确认 Candidate/tree/attempt ID 不进入该 payload。
这些值应在本轮评审绑定中记录；不能用“修后重新测试了”豁免稳定范围被旧 SHA 固定的问题。
在 rationale 引用实际冻结动作、首次实现读取和 payload 位置；未满足原 skill 要求则保持 false。
这不禁止稳定仓库身份、`review_root_base` 或批准基线的合法 SHA/ID 引用。

```python
path = code_review_case.record_eligibility(
    batch, receipt,
    decision="ELIGIBLE",
    terminal_relative=".review/initial/<actual-terminal-file>",
    record_relative=".review/initial/<actual-record-file>",
    checks={
        "initial_full_coverage_complete": True,
        "scope_lock_verified": True,
        "previous_candidate_reconstructable": True,
        "original_defect_reported": True,
        "unclassified": [],
        "scope_decision_blocked_ranges": [],
        "evidence_or_assignment_gaps": [],
    },
    assessed_by="<actual-coordinator-or-independent-reviewer>",
    rationale="<actual-evidence-references, finding-ID and acceptance reasoning>",
)
message = code_review_case.apply_repair(
    batch, receipt, ".review/initial/<actual-terminal-file>"
)
```

`record_eligibility` 自动绑定 receipt 的 `run_key`、实际 session/agent ID、
`initial-complete` 相对路径及 hashes.json SHA-256、terminal/Record 的路径和 SHA-256。
它验证完整 phase inventory、completed terminal 状态、精确观测 user message、实际
model/high、独立 user-message 收据，以及任务内初审材料与 capture 的字节一致性。
原始 `.review/input.json` 还须匹配初审快照和输入 receipt。调用不自动决定 coverage 或准出。

`apply_repair` 只接受闭合 schema `code-review-delta-eligibility.v1` 和明确的
`decision: ELIGIBLE`；所有 flags 必须是 bool true，三类 gap 必须为空数组。
未知/缺失字段、重复 JSON key、非 bool、INELIGIBLE 或任何 run/agent/phase/artifact
绑定偏移均 fail closed。人工填写的 checks/rationale 不是机器证明；主持者仍须阅读完整
Record 和原批准证据。Hash 只防止绑定后漂移，不替代语义审查或独立真实性确认。

## Collection 预检边界

共享 `capture_phase` 在产生任何输出前验证调用参数与持久 receipt/manifest 的完整
身份一致性、输入摘要/path 格式、task 与 batch 不重叠、复制树无越界/悬空/循环链接，
以及唯一 session 的 ID、完成状态和 session 路径。receipt、batch/task 根及其祖先、
phase 输出路径、session 及其祖先不允许 symlink。普通 task 内部安全别名仍可收集。
Code Review 的精确消息/model 检查和 delta 同一 agent 检查也在 phase 输出前完成。

batch/task/session 根使用真实绝对路径，先由调用方规范化可信路径，勿传入 `/tmp` 等
系统别名路径。默认 session 根来自本机 `.codex/sessions`；`sessions_root` 参数只用于
隔离的合成单元测试，不能用它制造真实模型轨迹。原 collector 未改动。
复制期间的 I/O 失败可能留下没有 hashes.json 完成标记的部分 phase，后续拒绝覆盖，
应保留诊断并使用新的 batch，而非把部分输出认定完成。预检不是防御并发恶意文件系统
替换的沙箱，也不能认证主持者同时重写 receipt、manifest 和全部 hash 的行为。

## 预期语义（仅主持者/独立复核）

首轮作者 4 项测试通过，但真实 batch 在 handler 失败前 pop，`[a,b,c]` 中 b 失败后
队列仅剩 c，违反批准的失败项保留/后续重试承诺。初审应完整审完后给源码
CHANGES_REQUIRED，证据支持 P1，不要求新增 durable queue/自动重试。
recipe 仅把 batch 执行改为复用 run_next，并加入队首/中途失败与重试测试。
delta 应验证原问题、真实调用链和相关回归，保存同一 Scope Lock、新 Review ID、
原 ID closure，源码 APPROVED 后停止。CI/environment 均 NOT_RUN，P2 不阻断。
任何独立识别的真实额外缺陷应按事实处理，不以本预期强行批准。
