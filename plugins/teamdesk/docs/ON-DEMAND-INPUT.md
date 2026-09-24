# GUI 输入必须按需投递

本文保留 2026-09-17 的调查与 PoC 过程；下文“当前/尚未集成”指当时阶段。共享 App Server 已在后续 MVP 中正式集成，0.1.0 的现行使用说明与验证边界见 [README](../README.md) 和 [VERIFICATION](VERIFICATION.md)。

两条可行候选的比较与有条件推荐见 [按需输入路线比较](INPUT-ROUTE-COMPARISON.md)。UI 托管位置和原生执行接入层是两个独立决定。

2026-09-17 用户纠正：GUI 提交新输入应直接触发既有 Codex 的原生执行，不能周期性唤醒模型检查是否存在输入。此要求覆盖此前文档中的每分钟 heartbeat 安装建议。

## 当前状态

- 已暂停既有 TeamDesk 原生接入 heartbeat；暂停检查时没有 pending、leased 或 uncertain 的投递操作。
- 原生员工当前工作和 Stop hook 记账继续运行。metadata 读取不依赖该 heartbeat。
- 原生托管界面的最小按需入口 PoC 已通过，尚未集成进正式 TeamDesk。因此暂停后的正式 GUI 新输入只保存，不会自动投递；这部分应视为尚未通过 MVP 验收。
- 先前工程问答往返的记录证明轮询链路能工作，不证明按需接入已通过。

## 2026-09-17 按需入口 PoC

| 路径 | 证据 | 当前结论 |
| --- | --- | --- |
| CLI `queue` 显式连接现有共享 socket | 实际执行返回 exit 1 / socket 不存在；前后均未出现 socket，没有启动 daemon | 在当前桌面运行方式下未打通；不等于所有版本/配置都不支持 |
| 单独运行内置 codex-app-tools MCP server | initialize 成功；tools/list 实际返回 `Codex app tools pipe closed` | 不能作为已验证的外部 GUI API；源码还要求 executor 调用身份，不能借用原生任务身份投递 |
| 既有任务深链接 | 本机解析/导航代码读取 prompt 并设置 prefillPrompt；已准备独立测试链接 | 原生发送步骤仍由人执行；尚未计为端到端通过 |
| Codex 托管界面的消息桥 | 用户真实点击现有 visualize 入口；原生 UserMessage 记录 visualization 来源；现有任务原生转交；员工真实接收与最终 ACK；回执页未刷新自动显示新事件 | 最小链路通过，保留为候选；不能扩大为完整 MCP App 或普通网页提交均已通过 |
| 桌面与 TeamDesk 共用 App Server | 受控重开桌面，通过临时连接适配器连接同一个监听进程；真实 GUI 提交、原生 ACK、FIFO/steer、技能交接、人工问题、hook 与运行中断线重连已验证 | 核心按需链路通过，详见共享 App Server 报告；正式集成、防重和启动/回退生命周期仍需实现 |
| 原生任务内调用 send_message_to_thread（对照） | 既有员工产生真实接收事件及最终 ACK，已在回执页显示 | 只证明后半段可用，不能代替 GUI 入口证据 |

OpenAI 官方 App Server 协议提供 turn/start 与 turn/steer，但协议存在不能证明外部程序已接入当前桌面使用的同一个执行实例。不得用另启 App Server 替代验证。

本轮使用原生对话内的最小按钮，通过现有 visualize 宿主桥完成真实点击验证，不新装 MCP App、不改正式 GUI。它只能证明这类托管界面入口的行为，完整插件 UI 仍需另行集成测试。普通 localhost 网页实测没有该桥。

### 本轮闭环证据

1. 用户点击后，现有接入任务启动新一轮执行。原生 UserMessage 的 `text_elements` 包含 `codex-untrusted-app-input:` v1 包装，来源为 visualization，带本次关联标记。
2. 接入任务调用原生 send_message_to_thread，将同一标记交给已有测试员工，没有创建新任务。
3. 测试员工的原生记录同时出现接收事件和严格匹配标记的最终 ACK；原生 wait_threads/read_thread 确认该轮 completed。本机 read_thread 此次返回空 items，ACK 正文以原生 AgentMessage 事件核验，不能声称该工具返回了正文。
4. 文件观察器产生接收/ACK metadata，并通过 SSE 推送。真实浏览器在不刷新时从三条事件更新到五条（两条原生工具对照，三条本次托管输入链路）。

初版观察器只读 UserMessage 的普通文本，因此漏掉了应用输入包装。本轮按实际原生事件结构修正解析，并从原生记录重放生成回执；没有手工写入成功记录。组件输入仍是应用来源的内容，不因解析包装而成为更高权限的指令。

本轮耗时含人工点击等待和观察器诊断，不用来承诺生产投递延迟。空闲时观察器没有模型调用；定时 heartbeat 持续暂停。

回执观察器只监听指定原生事件文件，提取测试标记、任务/轮次、阶段、时间，再通过 SSE 推到独立查看页。它不调用模型，也不轮询唤醒原生任务。原生对话正文不会展示或复制进回执文件。

原生托管 UI 已有可行证据，但最终接入方式暂不锁定。在改造 GUI 前，先完成下面的共享 App Server 兼容性 PoC。若最终选用托管 UI，codex-app-tools 仍只由原生任务执行；普通网页不会因增加宿主方法名而获得宿主能力。只监听 metadata 的工作台部分可以保留本地服务。

下一步集成需单独覆盖：完整 MCP App 的安装与宿主上下文、持久请求 ID 与重复点击处理、失败/结果不明的恢复、明确的 FIFO/steer 选择、任意员工目标与多项目关联、重启后连接恢复。本 PoC 没有宣称这些生产行为已完成。

## App Server 补充调查与后续实测

此前 CLI queue 失败只排除了当前共享 socket 连接，不能排除整个 App Server 路线。

2026-09-17 补充检查发现：

- 当前桌面确实拥有一个 App Server 子进程，以默认 stdio 模式和桌面进程通信；没有 TCP listener 或具名 Unix socket。
- `app-server daemon version` 与 `app-server proxy --sock <当前默认路径>` 实测均因 socket 不存在而失败。未启动 daemon，未切换或重启桌面连接。
- 当前桌面代码存在 `CODEX_APP_SERVER_WS_URL` / host `websocket_url` 的 WebSocket 客户端入口，以及条件更严格的 `CODEX_APP_SERVER_USE_LOCAL_DAEMON` 分支。后者要求没有额外 config overrides；当前桌面启用 codex-app-tools 的 override 会影响该分支，不能声称设置一个开关就足够。
- 官方资料没有在本次搜索中确认这些桌面开关是稳定公开配置。官方 App Server 文档本身将 WebSocket transport 标记为 experimental/unsupported。
- 已从本机 CLI 生成匹配版本的协议 schema，确认 thread/read、thread/loaded/list、thread/resume、turn/start、turn/steer 的字段。`turn/steer` 要求 expectedTurnId；不能把 turn/start 的行为直接当成 FIFO 已通过。

值得优先验证的是：桌面 Codex 与 TeamDesk 成为同一个 App Server 的两个客户端。只有桌面真实连到同一个实例，并保留原生任务、工具、权限和 hook 行为，才能将其视为本项目可选接入。另开进程只读到相同历史不构成这项证据。

完整测试范围：

1. 连接与身份：核对监听进程、桌面实际连接、loaded threads 和既有任务 ID，排除只共享磁盘历史的第二个运行实例。
2. 投递与显示：外部提交 turn/start；桌面显示同一输入/轮次；原生事件产生关联回执。再验证运行中的 FIFO、steer 和重复请求。
3. 原生能力：已有 skills/plugins、codex-app-tools 跨任务通信、用户问题/审批归属、hook 信任和自动记账均可用。
4. 生命周期：双客户端并行、断线重连、桌面重启及回退。

以上是切换前的调查结论。用户随后明确授权了受控切换；共享 App Server 的核心闭环已完成实测。桌面重开后的实际版本为 26.911.61220，CLI 为 0.155.0-alpha.2.6；不能把这些实测结论归到切换前的旧版本。结果、原生队列不提供防重的证据，以及仍需正式实现的部分，见 [共享 App Server PoC](SHARED-APP-SERVER-POC.md)。

## 必须补齐的验收

- GUI 提交产生一次按需投递；无新输入时不启动模型轮次。
- 使用原有桌面任务、技能、工具、权限和 hook。
- FIFO 与 steer 的业务关联、重复提交及投递失败可见。
- 原生收到输入，执行结果通过真实 metadata/Stop hook 返回。
- 不依赖打开本安装会话，不借用或伪造另一原生任务的调用身份。
- 未验证入口不回退为隐藏的定时轮询；如采用需要原生确认的交互，应先明确向用户展示这个额外步骤。

官方协议参考：[App Server](https://learn.chatgpt.com/docs/app-server)、[MCP UI 消息桥](https://developers.openai.com/plugins/build/chatgpt-ui)、[组件桥参考](https://developers.openai.com/plugins/reference)。本机版本与检查证据保存在 Git 忽略的 output/teamdesk-on-demand 中。
