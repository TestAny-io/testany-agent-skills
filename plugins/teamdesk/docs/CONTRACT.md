# TeamDesk 本地契约 0.3.0

0.1.0 首次 main 发布增加统一安装流程，0.2.0 修复下载入口的临时目录/链接路径识别，0.3.0 明确并校验启动器最低系统版本与架构；见 [安装设计](INSTALLATION.md)。以下业务接口和 0.0.13 恢复/历史语义保持兼容。

## 0.0.13 协作观察契约

- `GET /api/collaboration?taskRef=&departmentId=&at=&before=&limit=`：只读业务投影。at 为完整事务的末尾序号；缺省为当前，范围外或事务中间序号返回 400。before 为排他分页上界，limit 为 1–200，默认 100。返回 scope、historical、cutoff、at（观察时间）、range（baselineSeq/maxSeq/startedAt）、snapshot、edges、counts、timeline 与 nextBefore。
- 范围内的部门/成员/请求/任务详情均按同一 cutoff 还原。部门过滤显示该部门参与的业务及其跨部门伙伴；不只保留本部门节点。基线之前无法完整还原，不伪造过去组织结构。只读查询可将旧版进程漏记的当前 metadata 补充到内部索引，不创建业务输入。
- SQLite `collaboration_history`：seq/at/entity/entity_id/task_ref/data/reason/commit_seq；reason 为 baseline/change/reconciled。每个事务中的记录使用同一个 commit_seq；回滚不留下记录，同值投影去重，删除为 null。新增 runtime 表持久化员工绑定作用域内最后观察到的 status/turnId/taskRef；实时运行状态不等同业务完成。
- 请求新增 claimedAt/claimedThreadId/claimedBindingVersion、nativeReceivedAt、receiptRecovered、acceptanceRecovered；员工发起请求记录双方 threadId/bindingVersion。已有 receivedAt 不追溯伪造成领取或原始接收时间。原生 tool 发送结果与独立接收证据保留各自来源。
- `health.recovery`：not_started/recovering/ready/partial/disconnected，包含 generation、phase、起止时间、各员工核验结果和错误；online 仅表示共享连接已核验。`health.startup` 提供受限启动阶段，不返回任意日志正文。原 `POST /api/connection/reconnect` 在在线时也重新恢复状态，仍不重发 uncertain 输入。
- 历史日志禁止保存业务 instruction、普通原生正文、提问/答案、工具参数/结果与 skill 全文。报告摘要最多 1,000 字，处理摘要最多 500 字；原生链接及证据 ID 可追溯。现有 Host/Origin、写操作 token/幂等、hook 人类信任规则不变。

## 0.0.12 本机启动入口

`launch.sh install-icon` 构建用户目录中的 TeamDesk.app 与桌面链接。图标解析当前安装版本，调用 `one-click.mjs`，输出 `{status,url,message}`；status 为 connected / restart_required / connection_pending / launch_failed，错误为 error 且非零退出。url 仅允许本机 HTTP loopback 服务。已有普通模式 Desktop 不被强制关闭；仅已核验身份的旧 TeamDesk 服务可因插件升级被替换。没有新增浏览器可任意执行命令的接口。

## 0.0.10 Codex 接入版本

CLI 数字版本基线 ≥0.155.0（含同基线预发布构建），不设 minor/major 上限。低版本返回 unsupported_codex，无法解析的输出返回 unrecognized_codex_version，连接状态展示对应原因。版本门槛合格之后仍须通过现有的共享连接和同实例核验，后续原生调用依实际回执处理。

## 0.0.9 员工模型默认配置

- `GET /api/model-catalog`：当前共享 App Server 的模型目录，包含各模型支持的思考深度和速度档位。目录不持久化为固定模型列表。
- `GET /api/employees/:id/models`：不覆盖配置的原生 resume 读回，返回绑定版本、配置摘要、revision、同步时间及待核对操作。离线拒绝刷新，列表仍标明显示最近同步值。
- `POST /api/employees/:id/models`：仅接受 `{bindingVersion, revision, model, effort, serviceTier}`；原生模型 ID、支持的 effort、null（标准速度）或目录里的 service tier ID。CSRF 与 Idempotency-Key 必需。
- 读取最新配置校验 revision 和绑定，调用 `thread/settings/update`，再次读回一致才返回 saved。变更只作用于之后的原生轮次，包括排队中的输入；不触发业务或入职探测，不切换当前轮次。
- ACK 丢失、ACK 成功但读回失败/不一致均保留 uncertain，禁止自动写重试；显式刷新读到期望值标 verified，读到其他值标 different 并展示实际值，用户可重新选择保存。换绑不继承旧会话的缓存。原生侧 `thread/settings/updated` 事件同步到 UI；不维护独立的强制覆盖策略。
- metadata 只投影 model/modelProvider/effort/serviceTier 与证据时间、来源，不返回其他配置或对话正文。此配置不是逐轮模型执行遥测。
- 原生 `serviceTier: "default"` 归一为标准速度 null，原始值保留为 nativeServiceTier。当前宿主实测 Fast 在冷加载后恢复过 default，界面提示此限制并重新读回；不会用缓存静默覆盖原生值。
- 新建任务保留“仅为此任务调整”Coming soon；不实现任务覆盖，不改变原生 FIFO/steer。

## 0.0.8 本地撰写资料

`writing_sessions.rounds[]` 增加 `localReferences`（用户原始引用、定位状态/候选、用户选择或跳过）、`threadId`（各轮原生关联）；文件读取来源包含 type=local、referenceId、path、行范围、读取时间、mtime 与 SHA-256，不存全文件正文。

`POST /api/writing/:id/continue` 可携带 `referenceChoices: {LOCAL-ID: absolutePath}` 和 `skipReferenceIds: [LOCAL-ID]`。仅接受当前记录中的引用 ID；跳过需显式人类提交，模型工具没有此操作。版本和幂等约束沿用原接口。

新增终态 `needs_sources`：指定资料没有可核验正文读取记录时，建议保留且不能采用；定位、列目录和搜索不算读取。后续轮次重新读取以记录当前文件版本；跳过的引用持续显示，用户再次明确提及时恢复必读。

原生动态工具 `teamdesk_local_sources` 支持 locate/list/search/read。工具调用校验任务/轮次、用户提出的来源、规范路径/链接范围和普通文本类型。自定义工具执行在 TeamDesk 服务，边界由该服务实现，不依赖原生 Shell 沙盒。


## 0.0.7 任务表单撰写

`POST /api/writing` 新增 kind:task；targetId 必须为空，form 包含 employeeId、participants、mode:fifo、text（目标）、acceptanceCriteria。负责人/协作者必须是在职员工；最多 31 个协作者，去重并排除负责人。当前目标及标准可留空。

此类型的完成输出沿用通用建议字段，draft 作为任务目标（最多 12,000 字符），额外要求 acceptanceCriteria（最多 4,000 字符）。draft 状态两项均不能为空；clarify 状态可暂为空且必须提供问题。原 department/employee 输出格式不变。

只读上下文按当前选定负责人及协作者提供能力和相关部门的生效资料，快照与来源沿用现有轮次记录。采用的字段由 GUI 明确勾选，回填不会调用业务输入 API。只有原表单提交至 `/api/inputs` 才创建业务；助手输入、选择勾选与确认控件不进入 FormData。steer 不提供此入口，API 同样拒绝。

## 0.0.6 配置撰写

- `POST /api/writing`：kind 为 department/employee；可空 targetId、当前 form（name/role/departmentId/skills/text）、instruction。创建独立撰写记录并按需触发；同一幂等键不重复创建。
- `GET /api/writing/:id`：当前状态、原生关联、表单快照、revision 及结构化 rounds 历史；不返回完整查询正文快照或普通原生对话。
- `POST /api/writing/:id/continue`：revision、instruction、answers（按问题 ID）；回答完整且 revision 匹配、上一轮结束才允许继续，同一原生任务最多 20 轮。
- `POST /api/writing/:id/sync|cancel`：核对既有轮次或停止当前轮次；结果不明不自动重发。cancel 校验 revision。
- 原生专用任务只调用 `teamdesk_writing_context`，按 current thread/turn 验证；overview 返回组织、技能描述及资料索引，resource 返回本轮范围内的生效快照。
- 最多同时 4 项未结束撰写。草案长度沿用部门 4,000、员工 8,000 字符限制；澄清最多 3 问。所有变更沿用 Host/Origin、CSRF 与幂等保护。
- GET 状态快照只提供 writing 的 id/state/updatedAt；建议采用在客户端回填，仍由原部门/员工保存接口负责业务校验和持久化。

## 权威

employee.id 是永久身份，threadId 可换绑，bindingVersion 递增。TASK UUID 由应用接收新业务时创建；businessId/title/category/stage/status 由指定负责人报告。协作者报告不覆盖负责人字段，人类验收绑定业务 revision。

request：saved → native_queued / native_accepted → received → in_progress / recorded。接受、接收、记账的时间分别保留，迟到事件不能覆盖终态。FIFO 创建独立业务，steer 指向负责人已有业务；活动轮次需匹配 expectedTurnId 与业务归属。

operation：pending → sending → done / failed / uncertain。旧 pending 迁移为 paused，旧 leased 为 uncertain；发送中服务重启也变 uncertain。明确失败可恢复，uncertain 只能核对原生回执。原生队列重复使用 clientUserMessageId 可能仍创建重复项，因此不把该字段当服务端幂等保证。

界面执行进度是只读投影：匹配当前员工绑定、requestId、原生 turn 和 taskRef，不能单凭员工忙碌推断所有业务开工。投影不会修改 owner 的业务状态、名称或验收；本轮结束不等于业务完成。

决定和业务状态独立。业务决定通过原生输入通知负责人。原生问题回答保留 questionItemId；有无业务关联都按原提问员工投递。原生审批保留 thread/turn/request/binding/connection 归属，只有真实用户可选择。原生请求结束不推断人类选择。

## HTTP

监听 127.0.0.1；Host 与当前端口一致，Origin 存在时必须同源。POST 需要 JSON、X-TeamDesk-Token、Idempotency-Key；同 key 不同内容 409；上限 64 KiB。重复与并发相同 key 返回同一结果。持久化事务不跨 RPC 等待。

GET：

- /api/bootstrap、/api/state：版本、团队 metadata、健康与 token（仅 bootstrap）。
- /api/stream：SSE connected/changed 通知，不包含会话正文。
- /api/catalog：原生显示名称、ID、cwd、时间；不以 preview/首条输入代替名称。
- /api/skills、/api/export、/api/artifact/:recordId/:index：技能列表、metadata 导出、带 SHA-256 复核的产物下载。
- /api/resources/:id[?revision=N]、/api/resources/:id/history：人类查看当前或历史版本；状态快照只含索引。
- /api/hooks/review：当前 TeamDesk hook 定义、被审查脚本、文件摘要、短期票据。

POST：

- /api/employees：姓名、岗位、departmentId、技能、约定；bindingMode existing + threadId 或 new。
- /api/employees/:id/edit、/archive、/bind、/probe；/new-thread {confirmed:true} 新建并换绑，保留创建回执和旧绑定历史。
- /api/inputs：employeeId、mode fifo/steer、instruction；FIFO 可带 participants/acceptanceCriteria；steer 带 taskRef/expectedTurnId。
- /api/tasks/:id/accept：revision、collaborationRevision、verdict accepted/rejected、note。新版业务通过前核对最新协作证据；有未完成指定协作或交接时拒绝 accepted，仍可退回整改。
- /api/decisions/:id/answer：revision、answer、业务决定的 action resolve/needs_info；原生异步问题按原问题编号回答。
- /api/decisions/:id/native-answer：revision、decision accept/decline/cancel 或逐题 answers，仅当前原生回调可用；普通命令需有完整可审查内容。文件修改、额外权限/网络范围或私密输入保留来源并转回原生界面。
- /api/hooks/trust：ticket、confirmed:true；重新核对代码/定义，写当前自有 hook 的 trusted_hash 并读回。无任意配置入口。
- /api/connection/reconnect；/api/connection/launch {confirmed:true}：重连已有实例，或在桌面已退出后启动共享连接。
- /api/settings：teamName/enabled；旧 rules 输入兼容发布至版本化团队约定。
- /api/departments、/api/departments/:id/edit：name/responsibilities/contactEmployeeId；编辑/恢复校验 revision，联系人须为在职本部门成员。
- /api/employees/:id/department：departmentId 为有效部门 ID 或 null（未分配），revision 为员工 departmentRevision，旧数据按 0。仅改归属，清理原联系人，不创建原生轮次；资料和能力查询立即按新归属投影。
- /api/departments/:id/delete：revision、members:[{id,revision}]；有在职成员时必须明确 targetDepartmentId（有效其他部门 ID 或 null）。按当前成员集合及归属版本校验，并在一个事务中转移/移出全部成员、删除部门。旧 /archive 仅兼容空部门。删除为可恢复的 archived 标记，保留 deletedAt、原 ID 和历史引用；恢复不改变员工当前归属。
- /api/resources、/api/resources/:id/edit：title/kind/content/departmentId/status/revision。kind rules/sop/reference/proposal；status draft/effective/archived。
- /api/operations/:id/recover：retry/cancel（明确失败/暂停）或 reconcile（不确定结果）。

没有任意原生 RPC、codex-app-tools 或 worklog 写入 HTTP 端点。本机同用户进程是可信边界。

## 原生 CLI、hook 与事件

CLI：query、paths、inbox <requestId|--identity>、peer-request。以宿主 CODEX_THREAD_ID 定位身份。inbox 必须提供当前 requestId 或 --identity；传入请求 ID 不能跨员工，不领取未来队列业务。旧 connection-* 命令拒绝执行。

新业务保存 collaborationVersion:1、requiredCollaboratorIds（人类明确选择）、requiredCollaboratorsSnapshot（当时的已绑定技能 name/description/path/sha256）、collaborationRevision。participants 还包含后来加入的员工，不自动解释为人类指定要求。旧业务不补造要求或交接历史。

peer-request 在员工原生身份下登记元数据，不负责发送。kind:work 必须有同业务且本人已收到的 parentRequestId；kind:result 必须有 replyToRequestId，回到原 work 的 fromEmployeeId，outcome 为 completed/blocked；kind:note 表示无需结果的通知。每条有新 requestId，实际消息仍由原生 send_message_to_thread 发送。任意任务参与者可继续联系另一员工，owner 不变。两条分支找同一员工仍各有自己的请求与回复。负责人收到别人的局部 work 时，以及处理该 work 下游的 result 时，也只产生 contributor_report；整项业务报告使用其原始业务输入或该层的结果，避免局部完成改写整体状态。

worklog 可带 handledResults:[{resultRequestId,disposition:accepted|changes_requested|blocked,summary}]。只有结果的真实接收者领取后可记录处理，同业务、同来源校验；受阻结果不能接受为完成。work 报告自动关联当时最新的 producedResultRequestId，旧工作报告或旧处理不能证明新结果已完成。收件回执、结果回传、工作报告、发起方处理四者独立；报告内容仍由员工负责，人类验收独立。

collaboration.js 为 inbox/UI/验收共用的只读证据投影。所有新版必要 work 已取得完成报告及结果处理，并且每位指定员工在其中完成实际工作后，协作才完整。结果回到各自发起方，不要求所有回复到负责人。负责人 prematurely completed 原报告保留，显示「负责人报告完成 · 协作待完成」，不计入待验收。协作变化递增独立 revision，使旧人类验收不能套到新协作证据上。

Stop hook 从原生 session_id/turn_id/cwd/last_assistant_message 读取明确 teamdesk_worklog。只为当前 active 绑定记账，按 thread/turn/index 去重，全批事务校验。没有摘要最多一次请求补记，之后保存失败。无业务的入职探测允许空 entries。

产物 realpath 限当前员工 cwd 或 artifacts，每条最多 8 个文件、每文件 4 MB，保存大小和 SHA-256。符号链接越界拒绝。

App Server 与本地日志事件按白名单归档：时间、来源、线程/轮次、原生工具名、目标、状态、路由编号。结构化问题/答案、待审批命令是用户明确需要的决策数据；普通对话、推理和原始工具结果不入库。原生日志按 inode/绑定/offset 恢复观察，App Server 事件按来源 ID 幂等。

信任记录、hook 实际记录和对应轮次完成是不同证据。员工就绪要求当前版本摘要和绑定匹配，历史通过不保证未来每轮一定成功。

## 按需发现与验收反馈

query 支持 me/departments/department/employees/employee/resources/resource/task/records/decisions；列表支持 search、limit 1–50、offset；resource 可指定历史生效 revision。身份沿用 CODEX_THREAD_ID。任务查询限本人参与；资料默认生效版；部门资料限本部门。员工详情和能力快照按当前部门投影，跨部门省略 skills/path/hash。GUI 不受该信息层次限制。

accept 同一证据版本、结论、说明重复提交复用 notificationRequestId。accepted 在原任务上生成 acceptance_notice（FIFO），rejected 生成 acceptance_rework（steer）；不创建新 TASK。accepted 回执仅需 requestId/summary；系统固定验收引用和 authority:acceptance_receipt，禁止决定/产物/结果处理，保持原任务及验收版本。历史验收不会自动补发。

未分配使用 departmentId:null；多个未分配员工不构成同部门。query me/employee 的 department 可为 null；未指定 ID 的 query department 在本人未分配时返回空成员列表。部门被删除后，其资料仍供人类按原范围查阅，不随员工移动，不自动扩大为全团队；重新发布需恢复部门或明确修改范围。

## 0.0.5 资料生命周期

`POST /api/resources/:id/publish|delete|restore` 只接收当前 revision，沿用 CSRF 和 Idempotency-Key。publish 仅允许草案，复制已审阅内容并新增生效版本；delete 新增 deleted 版本，清空 effectiveRevision；restore 仅允许 deleted/archived，保留 ID、内容与部门范围，新增草案且 effectiveRevision:null。系统 SYS-* 协议返回 readOnlyReason，所有变更入口拒绝。

GUI 编辑固定保存草案，发布为独立确认。旧 archived 状态保留并提供恢复入口，普通编辑接口不能跳过恢复直接修改或发布已删除/归档内容。员工查询在 deleted/archived 或无有效生效版本时不可用，显式请求旧生效 revision 同样不可绕过；人类仍可读取全部历史。恢复后需重新发布才重新开放员工查询。默认列表显示在用资料，可筛选已删除/已归档。
