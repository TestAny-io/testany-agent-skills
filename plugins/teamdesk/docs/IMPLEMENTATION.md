# TeamDesk 0.1.0 实现基线

0.1.0 首次 main 发布增加统一安装流程；见 [安装设计](INSTALLATION.md)。以下业务接口和 0.0.13 恢复/历史语义保持兼容。

## 0.0.13 连接恢复、回执与协作观察

设计与范围见 [增量设计](RELIABILITY-COLLABORATION-0.0.13.md)。`SharedConnection` 按连接代次忽略迟到握手/事件；`NativeGateway` 恢复 hook、员工订阅、最近最多 80 轮的结构化问题/答案和投递回执。实时轮次状态优先于较早的异步查询；单个员工失败单独列出，恢复期间不派发未核验员工。未找到回执的 uncertain 输入仍需核对，不会自动重发。超过近期范围的问题仍可由原有本地 trace 观察器补充；未恢复的原生回调留在 Codex 处理。

`launcher.mjs` 对服务启动加独占锁，核验已有进程命令、数据目录与版本，失败只清理自己启动的未核验服务。`one-click.mjs` 记录 service/shared_instance/metadata_recovery 阶段；部分恢复不会报告 connected。团队设置展示两个独立状态和阶段时间，窗口/浏览器的系统打开回执不等于实际可见。

`delivery.js` 提供共用的回执投影。claimedAt 与 nativeReceivedAt 分开；恢复观察的时间明确标注，不用于计算原始延迟。工作结果必须按请求/任务/双方匹配，发起方处理证据与业务验收分离。旧 receivedAt 保留来源未细分，工具接受不冒充 FIFO 或已读。

`metadata-history.mjs` 白名单投影写入 SQLite 追加日志，与业务事务一起提交；commit_seq 标识完整事务，不允许回放半个事务。首次升级记基线；旧 hook 的迟到写入以 reconciled 观察补账。回放不复制原生正文、答案、工具参数或权限。历史中保留当时姓名、部门、绑定、任务、验收和有限工作摘要；本轮接入服务断开后的运行状态为未确认。

`collaboration-view.mjs` 对同一历史截止序号还原实体并计算范围/关系。`collaboration-ui.js` 用 SVG/DOM 显示部门分组、员工有向通信、负责人任务卡、明确父请求交接和旁侧回执；支持任务/部门筛选、事务播放/暂停、缩放、原生滚动和键盘。部门筛选包含参与同一业务的外部同事；历史只读。画布任务/工作卡各最多 12 项，显示提示并保留消息列表入口；员工上限沿用在职 32 人。短消息动画仅在新事件或播放时发生，可关闭，尊重减少动态效果偏好。

## 0.0.12 macOS 启动图标

AppKit 的 TeamDesk.app 通过 LaunchServices 查找 Codex/Safari，离线枚举本机唯一 TeamDesk 安装目录，核对缓存 manifest 与入口路径，再调用该版本的 one-click.mjs。不运行 plugin list；出现多个版本不猜测最新版本。Node 运行时逐项检查版本和 node:sqlite。图标与桌面链接由 install-launcher.mjs 构建；已有不同身份的应用不覆盖。

图标附带 launch-codex 组件，使用 NSWorkspace.openApplication 并仅为本次启动传入 CODEX_CLI_PATH / CODEX_APP_SERVER_FORCE_CLI；发出正常的打开应用事件并激活窗口。启动完成后再请求显示已有 Codex 窗口，随后打开 Safari。组件不结束已有 Codex。没有安装图标的旧共享启动入口保留原有直接启动方式。launcher.log 保存阶段与命令错误，不记录对话或凭证。

one-click 以数据目录中的 PID 文件防止重复启动，先核对/启动服务，再决定复用共享 Desktop、启动共享 Desktop 或提示退出普通 Desktop。旧服务升级须核对精确进程参数、PID 和 bootstrap 数据目录，只替换 TeamDesk 服务；保留端口。原生连接 online 经同实例握手后才返回 connected。Safari 用 NSWorkspace 明确指定打开，不请求 AppleScript 浏览器控制。启动器不生成模型输入、不改 hook 信任。

## 0.0.9 员工模型设置

`EmployeeModels` 在 gateway 上读取/更新原生设置，以 `meta` 保存绑定作用域内的最近观察值及写入结果。原生设置是默认值的唯一来源；新员工原生创建仍不覆盖 model/config/permission。`thread/resume` 和 `thread/settings/updated` 提供读回与事件同步；连接代次、绑定版本和配置 revision 检查用于拒绝过期表单。

更新仅发送 threadId/model/effort/serviceTier；不发送 collaborationMode、权限、工具配置或全局 config，不触发模型工作。原生接口没有配置 compare-and-swap；保存前读取与保存后核验能发现已观察到的并发修改，不能承诺与桌面同时编辑的原子锁定。后续原生事件继续作为实际值显示。

员工详情提供独立设置表单，档位由实时 model/list 驱动。新建/编辑员工说明继承原生配置及设置入口；新建任务显示 deferred 覆盖入口。首次原生轮次前没有 rollout 的新会话需等待入职检查后再设置，不通过假输入制造历史。

实测原生 Fast 保存读回可用，但专用会话冷加载后出现恢复 `default`；model/effort 保留。`default` 归一为 null，保留 nativeServiceTier 原值。界面展示与上次保存不同的读回值；不把本地观察缓存作为重连时的强制设置，也不宣称有逐轮 service tier 或速度性能遥测。

## 0.0.8 本地资料与旧会话升级

- `writing-sources.mjs` 提供按用户请求定位、目录、字面搜索、UTF-8 文件读取。支持常见目录内仓库名，分隔符/常见单复数差异及用户明确父目录提示；找不到或多候选时由面板补路径/选择。定位只扫描目录名；正文按工具请求读取。
- 文件来源仅由真实 read 返回记录形成；完成状态检查引用覆盖，不能由模型摘要宣称绕过。仅读取所需片段不表示全仓库审计或事实验证通过。
- 每轮保留来源和历史，重新查读；取消/断连语义及原 client message ID 幂等恢复继续适用。
- 本机 ThreadResumeParams 不能追加 dynamicTools。旧助手续写前确认原生任务不活动，再创建具备新版工具的专用撰写任务，将历史人类意图/答案和最近建议传入；旧任务不删除，各轮保留原链接。所有操作只在显式续写时触发。
- 现有员工接入/原生权限不改；资料工具仅用于表单助手。没有定时触发模型、团队资料自动发布或表单自动保存。


## 0.0.7 任务目标与完成标准

复用 WritingAssistant、专用原生任务、幂等投递及结构化建议通道。新增 task 类型，仅服务新 FIFO 业务；请求保存当前负责人、指定协作者及两项原文，不创建任务或改变人员选择。任务 schema 同时要求 draft（目标）与 acceptanceCriteria，分别限制 12,000/4,000 字符。

上下文查询包含所选负责人与协作者的能力描述、工作要求和相关部门生效资料；其他部门仍只提供职责/岗位。这是人类表单配置助手的显式参与者范围，不改变员工之间的查询权限。GUI 提供两个独立采用勾选、分别对比；所有上下文字段一致才可采用。原输入 API、FIFO/steer、队列与业务任务权限保持现有语义。

基线 origin/main：6000b8b6631fcced189ae98e320aa96ffc697323；候选分支 codex/teamdesk-mvp。用户授权实现完整 MVP 与按需接入，0.0.3 纳入部门、资料查询与版本、精简上下文及验收通知，验证后交 UAT。后续按用户约定：本地迭代升 patch、合并远程 main 升 minor，major 由用户决定。候选未提交/推送。

## 保留的业务边界

32 位在职员工；任意岗位、部门和 skill 流程。负责人建立业务编号、名称、类别、阶段、状态。协作者报告独立，人类验收独立。员工在本机 Codex 原生任务中使用现有插件和原生跨任务工具。全 GUI 页面保留，未实现功能显示 Coming soon。

## 0.0.1 接入

- shared-connection.mjs 核验桌面进程、实际 socket、App Server 进程 ID。只接受桌面使用的本地实例；CLI 数字版本基线低于 0.155.0 或无法解析时拒绝接入；更高版本继续实际握手。
- app-server-client.mjs 处理初始化、请求超时、断线与原生事件，不在传输层自动重试写操作。
- native-gateway.mjs 领取本机持久化意图（由 HTTP 提交事件触发），每员工顺序投递、多员工并发。没有模型轮询或统筹线程。
- FIFO 使用 thread/queue/add 和原生队列；steer 使用 turn/steer 的轮次条件。原生 clientUserMessageId 不是服务端幂等保证，因此先持久化一次性操作，再核对回执。
- 断线/重启后的 sending 标为 uncertain。先用队列或有界历史查询匹配原 client ID，未找到不会盲目重发。
- hook-trust.mjs 提供当前定义和脚本审查。仅真实人类确认后写当前 hook 的 trusted_hash，读回验证；变化、过期、管理员配置拒绝写入。已信任共享定义复用。
- 原生结构化问题和审批回调保留精确来源；用户选择与原生请求结束分别记账。原生结束通知本身不证明接受了哪个客户端的选择。
- SSE 只推送变更通知，浏览器重新读取 metadata。SQLite/原生日志的轻量观察用于自动记账和跨任务消息证据，不调用模型。

## 运行

本地 Node HTTP + SQLite WAL，无需 npm install；技能 frontmatter 由随插件分发的 js-yaml 4.1.1（MIT、FAILSAFE_SCHEMA）解析。默认 127.0.0.1:4322。应用不展示完整会话。适配器仅为桌面直接启动的 App Server 将 stdio 转接到 loopback WebSocket；辅助 CLI 原样透传，不改变原生权限与工具 pipe。

协作记录采用任务下的 work/result/note 请求关联，parentRequestId 记录分工来源，replyToRequestId 记录实际回复对象；不新增业务统筹者或工作流调度器。员工通过 workspace.mjs 按需查询：同部门可读取已绑定技能能力说明，跨部门只提供部门职责、岗位和联系入口；保存的原始快照供人类查看，员工读取时按当前部门投影。用户指定员工与动态参与者分开；具体业务分工仍由技能与任务目标决定。collaboration.js 统一推导协作完整性，不改写原负责人报告。metadata 不等于内容质量审查，也不保证员工不会提出循环等待；员工协议要求明确依赖边界，阻塞时上报。

首次共享启动必须先正常退出桌面，按钮不会强行结束工作。适配器运行文件在用户数据目录，不依赖仓库 output 或插件缓存寿命。直接打开 Codex 恢复默认启动方式；TeamDesk 重启不影响员工运行。

## 验证层次

单元/HTTP 集成覆盖业务约束、32 人容量/并发记账、去重、断线、FIFO/steer、问题、审批归属、hook 审查和来源排除。真实原生联调另存忽略目录并在 VERIFICATION.md 汇总；夹具测试不冒充真实 hook 或人工批准。最终视觉与业务验收由用户依 UAT.md 完成。

## 0.0.3 组织与资料

部门、资料和资料版本增加独立表。organizationV1 事务迁移原 group 至稳定 departmentId，原 rules 迁移至 DOC-team-rules 的生效版本；历史业务、绑定、验收与产物不回填或重建。资料每次编辑追加不可变版本，草案可与上一生效版并存，归档停止员工查询。系统协议随插件发布，GUI 和 CLI 共用资料服务。

acceptance_notice / acceptance_rework 与验收在同一事务创建，使用现有原生投递通道。通过通知的 worklog 只产生 acceptance_receipt，不能更新业务、交付、协作或决定；界面业务状态排除通知轮次。退回继续同一任务的整改。无后续任务规划器。

## 0.0.4 部门生命周期

支持单人移出、转部门以及删除部门时明确批量安排去向。成员使用可空 departmentId 和乐观并发 departmentRevision；删除同时核对部门 revision 和完整成员快照，所有修改在一个事务内完成。部门删除采用可恢复标记，历史对象和资料版本不重写；恢复部门不回调员工。调动不创建入职轮次或改变队列、绑定、技能、任务。未分配员工互相不暴露技能描述，query 空部门语义明确。旧字段和 /archive 兼容保留。

## 0.0.5 团队资料管理

资料删除、恢复与发布复用不可变版本表和事务；不删除旧版本或重写任务引用。以当前 revision 防止过期操作，HTTP 幂等防止重复生成版本。恢复只产生草案，查询同时检查当前文档生命周期与 effectiveRevision；直接索取历史版本不能绕过已删除/未重新发布状态。系统内置协议由版本维护，并向界面提供明确只读原因。

## 0.0.6 表单 AI 撰写

writing-assistant.mjs 复用同一个 SharedConnection，以专用原生任务承接配置撰写。动态只读工具按轮次快照查询组织、已选技能 description 和生效资料；outputSchema 接收结构化澄清和建议。writing_sessions 单独持久化意图、答案、建议历史、来源与原生关联，普通对话不进入工作台。

writing-ui.js 在部门/员工原表单中展开，包含澄清、假设/冲突、差异和历史。新编辑使旧建议失效；采用仅修改原 textarea，AI 控件不参与原保存。提交使用幂等键和独立 client message ID，丢失回执或重连只核对，停止只作用于助手当前轮次。详见 [AI-WRITING.md](AI-WRITING.md)。
