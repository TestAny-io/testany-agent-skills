# Code Reviewer Checklist

本清单用于源码审查和整改复核。它是**按触达面启用的检查库**，不是新增需求清单。某一检查项只有满足以下任一条件才启用：

1. Candidate 修改了该生产路径；
2. 批准基线明确要求该 invariant；
3. Candidate delta 可证明影响该路径。

未触达、未批准的检查域记录为 `NOT_APPLICABLE`，不能因此产生 finding。

## 使用方法：先行为，再证据

先独立确认关键生产路径和假设，再核对作者的修复/PASS 叙述。只对触达的关键 invariant 补一行行为证据，可复用同一行关联多个 finding；不要为每文件填全套矩阵。

| 核查 | 必须分清的证据问题 |
|------|--------------------|
| 生产输入 | 实际入口/命令是谁？resource loader、parser、工具退出码、字段格式与测试是否相同？ |
| 执行逻辑 | 实际执行哪个 helper？替身替换的是外部 I/O，还是恰好把被审逻辑换掉？ |
| 独立 oracle | 预期来自批准基线/独立原始观察，还是由本次输出倒算？后者不能证明批准绑定。 |
| 正反成对 | 合法输入/正常状态变化能接受？非法能拒绝？工具故障与权限拒绝有区分？拒绝前后有什么 effect？ |
| 完整行为链 | 哪些直接 caller/branch/target 用同一规则？普通与续跑是否都走它？跨两次尝试留下的状态是否被正确处理？ |
| 限制 | 实际证明到哪一层？哪些必要路径仍缺证？实际 PG/Kind 不自动证明生产输入与调用链一致。 |

例子只用于识别语义差异，不是给所有项目增加规则：生产记录可能包含资源路径而测试只提供 basename；正常 status 更新会改变 RV；Failed/Succeeded 历史 Pod 不等于仍在工作的 terminating Pod；`exit=1, stdout=no` 可能是工具的合法拒绝。具体接受集合以字段/工具的生产 authority 为准，不能为 review 另造 parser 或将所有错误归成安全拒绝。

## A. Candidate 与生产路径

- [ ] diff 边界与 Candidate/tree 精确绑定
- [ ] review note 的声明能在实际生产入口中找到
- [ ] 测试辅助路径未被误当作生产实现
- [ ] mutable worktree、用户 WIP 与 Candidate 已分离
- [ ] mutable worktree 已绑定 snapshot，验证后与 verdict 前摘要均保持一致
- [ ] 新增/删除文件均能追溯到 frozen scope
- [ ] initial full review 已覆盖完整 in-scope diff，未因第一批 finding 提前停止
- [ ] changed-path manifest 每个 entry 已分类；`raw_worktree_vs_index`、`worktree_mode_vs_index` 和 `submodule_head_vs_index` 均有明确 ownership/证据

## B. 功能与状态语义

- [ ] 主流程满足批准 acceptance criteria
- [ ] 输入边界、状态转换和终态行为与 Contract/LLD 一致
- [ ] retry/replay/duplicate 请求不会产生违反基线的二次 effect
- [ ] stateful recovery/compensation 已检查相关连续尝试，而不只是每次从空状态开始
- [ ] response loss 后可按批准语义读取或重试
- [ ] 关闭态/default-off 路径保持批准的零副作用
- [ ] 错误映射没有把授权、冲突、数据损坏或暂时失败混为同一结果

## C. 身份、安全与隐私（仅触达时）

- [ ] caller identity、audience、subject、resource scope 精确绑定
- [ ] 认证/授权发生在任何受保护 effect 前
- [ ] fail-closed 与错误 envelope 符合批准 Contract
- [ ] 同一校验的合法路径可成功；拒绝非法输入没有误杀正常操作
- [ ] key purpose、signer/verifier、rotation overlap 与批准 authority 一致
- [ ] 敏感数据未进入日志、错误响应、Git 或不获准的持久层
- [ ] retention/purge/legal-hold 只按批准语义实现

不得因为一般安全偏好要求新增 key、Secret、HSM、ledger、RBAC role 或服务；这些属于 architecture surface。

## D. 数据、事务与并发（仅触达时）

- [ ] owner 与 source-of-truth 唯一且与批准设计一致
- [ ] 事务边界内没有未经设计允许的网络等待
- [ ] claim/finalize、CAS、fence、revision 或 idempotency 语义与基线一致
- [ ] 并发、过期、partial failure、restart、redelivery 不破坏 frozen invariant
- [ ] DB clock/application clock 权威符合批准设计
- [ ] migration 可前向执行、失败边界清楚，并保持批准的兼容窗口
- [ ] cleanup/purge 按 exact identity/generation 执行，不扩大删除范围

不得自动要求新表、outbox、队列、scheduler 或通用 replay 平台。

## E. API、Event 与 Wire（仅触达时）

- [ ] path/method/status/error/request/response 与批准 Contract 一致
- [ ] required/optional/unknown-field/closed-set 语义一致
- [ ] version、compatibility、old caller 行为没有被暗改
- [ ] event routing key、headers、schema、ordering、dedupe 与批准设计一致
- [ ] proto/JSON/AAD/hash 的字段集合与 canonical encoding 一致
- [ ] 跨层比较采用字段 owner 的实际 parser，合法多种表示不造成比较绕过或误拒绝

Contract 需要改变时，返回 scope decision；Code Reviewer 不代替 API Reviewer 批准新 wire。

## F. 资源生命周期与清理

- [ ] 新增持久化数据有批准的生命周期语义
- [ ] 删除旧代码前已证明调用方/引用为零或满足批准 retirement 条件
- [ ] Candidate 没有保留同一 authority 的双路径或隐藏 fallback
- [ ] 本次明确要求的遗留代码清理已完成
- [ ] “看起来未使用”但缺少引用/运行证据的代码不被武断要求删除

## G. Frontend / Client（仅触达时）

- [ ] 用户动作 identity、重试和刷新语义符合批准行为
- [ ] loading/error/session 处理没有把资源错误升级为全局退出
- [ ] 主数据不会因辅助请求失败而丢失或被清空
- [ ] 客户端没有绕过批准的 token/proof/authority 链
- [ ] legacy fallback 只在批准兼容窗口内存在

## H. 配置、启动与部署代码（仅触达时）

- [ ] 默认值、feature state、startup gate 与批准状态一致
- [ ] Helm/rendered manifest 与源码配置键一致
- [ ] immutable image/provenance、Secret/RBAC、topology 只检查批准项
- [ ] 环境缺失项被分类为 deployment gap，而不是源码 finding
- [ ] 普通、continuation、各获准 target 的真实入口均受对应保护，PASS 只在所需后置条件成立后生成
- [ ] rollback/retry 的前置状态来自实际工具/控制器行为，不依赖只返回固定 RV/空列表的替身

## I. 验证质量

- [ ] 测试断言真实生产路径与外部可观察结果
- [ ] 未 mock 被审 helper、未用本次输出生成独立批准预期、未只用字符串位置断言分支语义
- [ ] negative/fault/concurrency case 与被保护 invariant 对应
- [ ] skipped/conditional test 没有被误报为已验证
- [ ] Candidate 的定向门禁与仓库标准命令一致
- [ ] exact-SHA CI 与环境证据分别标记，不混入 source verdict
- [ ] immutable certificate 只绑定 commit/tree；mutable approval 明确绑定 snapshot 且声明后续变化即失效
- [ ] 多仓/subagent coverage ledger 已按 shared Scope Lock digest 对账，unreviewed range 为零
- [ ] path coverage 未被当成行为覆盖；关键 caller/branch/target/连续尝试有实际证据
- [ ] subreviewer 收到完整可读取 Scope Lock 与 digest，而不是只有 digest
- [ ] 若本轮是 reviewer-miss 异常完整复核，已绑定失效 review、独立 Reviewer、count=1 和 review-root-base 全范围
- [ ] 漏审后已针对旧盲点改变验证方法，而非只换 reviewer identity 或重复同一绿色门禁
- [ ] 复用证据逐项核验内容/依赖/命令/配置/工具/基线，无法证明不变则不复用（见 evidence-reuse）

## 整改 closure

- [ ] 原 ID、invariant 和验收条件未改变；相关直接路径与恢复语义一起关闭，不仅看修复行
- [ ] 继续失败/晚发现原因区分 original_unfixed、introduced_by_fix、pre_existing_unreported_cause，并有旧/新源码证据
- [ ] 同 ID 不豁免晚发现原因的 reviewer 责任；仍 OPEN 的同问题补原因也不机械视为新正式 miss
- [ ] 被否证的 CLOSED/APPROVED 或新漏掉的 blocking item 按 policy 撤回对应 coverage/closure 并处理 miss
- [ ] P2/未来建议不混入 mandatory remediation，未选择的 P2 不结转为阻断

## Finding 合法性门禁

输出每条 P0/P1 前逐项确认：

- [ ] 它违反 Scope Lock 中的明确 invariant
- [ ] 它发生在 Candidate 或 Candidate 影响路径中
- [ ] 有精确代码证据和可复现 failure path
- [ ] 影响达到相应严重度
- [ ] 最小修复的 `architecture_surface_delta` 为 `none`，或严格落在 Scope Lock 已批准的 architecture budget 行内
- [ ] 即使没有新表/服务，新增操作步骤、门禁/审批/配置和维护负担也对既定 invariant 必要；优先更小修复或缩小不实声明
- [ ] Candidate 自行越界已作为完整 P1 scope-violation finding，最小修复仅删除/回退；真正的新 surface 要求保持 scope proposal
- [ ] 它不是环境输入缺失、未来优化、文档美化或通用最佳实践

任何一项为否，不能输出 P0/P1。
