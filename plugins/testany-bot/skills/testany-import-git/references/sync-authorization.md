# 同步操作：预览、授权、提交与验证

适用于 sync / switch / relation / retry。API 名中的 `confirm` 是提交动作，不是已获人类批准。
本页是这些操作的授权决策 authority；具体字段仍以当前工具 schema 和 workflow.md 为准。

## 决策表

| 操作 | 提交前证据 | 是否再问用户 | 提交限制与验证 |
|---|---|---|---|
| 只查 diff/状态 | 读取 import、preview 或候选列表 | 不问已知参数，不提交 | 返回本次差异与限制 |
| managed sync | 获取本轮完整 preview，核对 from/to commit、所有 changes、对象/字段影响；no_changes 时结束 | 当前授权覆盖全部实际差异时不重复问；新增、删除、visibility/owner 或环境/集合扩大未获许可则停 | confirm 由镜像整体决定，不能靠 file_selections 做窄同步；提交前重查 import 状态/目标，提交后核对 record、实际 commit 与 failed_items |
| switchCommit | 检查 pinned 前置条件、明确 target_commit 并 preview | 用户已批准该精确目标和影响则不再问；新增差异只问扩大部分 | 保持 target_commit；仅 sync_link 支持 file_selections；检查实际落点 |
| switchMode | preview 从 pinned 回 latest 的目标和差异 | 授权必须包含改变跟踪模式，不能从一次 sync 推导 | 按模式使用真实字段；核对 sync_mode、commit 和每项结果 |
| addFiles | summary 可用、list 完整候选及 snapshot_commit | 已授权精确新增集合和元数据时不再问；新增其他文件/扩大可见性则停 | 仅提交选定 selected_files，原样回传 list 的 snapshot_commit，核对新增绑定 |
| sourceDeleted | summary、list 的 file_binding_id、关联 case 和 snapshot_commit | 必须有这些绑定及实际删除/下线影响的许可；「同步脚本」不包含删除 | 参数是 file_binding_ids，不是 file_path；原样回传 snapshot_commit；核对实际处理结果，不猜测等于物理删除 case |
| retry | 获取原 record 的 failed_items、影响范围和当前状态 | 原任务已明确允许该范围重试才继续；否则报告失败并请求必要许可 | 仅支持的 import_mode 可用，绑定原 sync_record_id；不重跑已成功项，不无界重试 |

## 冲突、漂移与能力限制

- 预览是安全取证，不是又一个无条件人类审批步骤。必须取得完整差异/候选；分页未读完、影响不明时不能猜测授权已覆盖。
- 已知越界删除或新增时，不能提交整体 managed diff，也不能偷偷改模式、切 commit、调用另一条 relation 路径绕过范围。可建议调整镜像或请用户决定新范围；只暂停受影响动作。
- 审批绑定本轮对象、目标、差异/候选与影响。发生版本/候选漂移时重新取证；超出许可就暂停，不能复用旧批准或自行扩权。
- addFiles/sourceDeleted 必须原样使用后端提供的 snapshot_commit。并发拒绝后重新 list、重新核对范围；不只换新 snapshot 就无条件重试。
- 当前 managed confirm 只接收 import_history_id 等 schema 已有字段，**没有证据支持任意传 target_commit / snapshot_commit / file_selections 来锁定 preview**。提交前 get 只能缩小竞态窗口，不能证明原子绑定。普通 latest 同步按本轮完整差异及新鲜状态核对授权；若用户要求必须精确锁定某版/候选，或已发现并发/漂移而接口无法保证该边界，则停止并披露能力缺口，不声称已锁定。若要改用支持钉住版本的路径，须符合原操作前提且获对应授权。
- 不修改平台幂等策略。工具默认生成 idempotency_key；若同一提交响应不明，先查 record/状态。只有能复用同一逻辑提交的合法 key 且授权仍有效时才考虑重试；新 key 不能证明不会重复执行。

## 完成证据

无变更、待范围决定、提交失败、部分完成、已完成且核验是不同结果。对照 preview/候选核对
实际 commit、文件/绑定、数量和 failed_items；工具缺少读回能力则报告核验缺口，不造结果。
不要因提交 2xx 就说所有 case 已同步/已可执行。失败不自动授权删除已创建对象、换模式或测试执行。
