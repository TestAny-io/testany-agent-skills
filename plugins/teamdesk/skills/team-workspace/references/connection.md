# TeamDesk 0.0.12 连接说明

## 同一个 Codex 实例

本地工作台是现有桌面 App Server 的另一个客户端。它不运行模型，不克隆员工会话，也不冒充 Codex Desktop 或员工。连接核验包括桌面进程归属、实际 socket、server/diagnostics 进程 ID。

正常运行 launch.sh start。已有共享连接会自动发现。没有共享连接时，在工作台正常退出桌面后点击「以共享接入启动 Codex」。适配器仅处理桌面直接启动的后端；浏览器策略检查等辅助 CLI 保持原行为。只监听 127.0.0.1，原生服务拒绝外站 Origin。不要增加不受限转发或全局启动修改。

TeamDesk.app 图标调用已安装版本的 scripts/one-click.mjs，先启动/复用服务，再在 Codex 未运行时调用同一共享启动路径，最后交给 Safari。当前 Codex 位置由 macOS 的 com.openai.codex 注册信息提供；仅为本次子进程设置 TEAMDESK_CODEX_APP。0.0.12 离线定位插件；图标附带的 launch-codex 使用 LaunchServices 打开 Codex 窗口并传入共享环境变量。已有连接也发出显示窗口请求；最后在 Safari 打开工作台。并发启动用 PID 锁去重；普通模式 Desktop 已运行时提示正常退出，不替换它。安装及使用见插件 README。

连接断开时保留本地请求，使用有上限的指数退避恢复**传输连接**，不调用模型检查任务。重新连接先用队列和带 clientId 的原生记录核对回执。没有找到记录不证明未送达；不确定的操作禁止重发。

## 原生操作

- 新建员工：thread/start → 持久化原生 threadId → 绑定 → thread/name/set → 入职探测。
- FIFO：thread/queue/add → 原生队列；空闲时 thread/queue/start 只启动已有队列项。
- steer：turn/steer，携带 expectedTurnId；目标轮次与业务需要吻合。已有业务空闲时，补充作为该业务的新轮次排队。
- 事件：App Server 推送经过白名单投影的 metadata；Stop hook/已有本地日志用于补账和原生工具交接证据，不把全文传给页面。
- 原生问题：保留 questionItemId，实际人类回答送回同一员工。阻塞问题与可完整展示的普通命令审批按当前原生请求 ID 回传；文件修改、额外权限、网络范围和私密输入转回 Codex 原生界面；过期、换绑、断线时不使用旧回调。
- hook：hooks/list → 显示配置与脚本 → 人类确认 → 对当前 hook 的 trusted_hash 做 config/batchWrite → hooks/list 读回。管理员配置不得覆盖；脚本/定义变化使审查票据失效。

GUI 没有任意 RPC、任意配置写入或 codex-app-tools 调用入口。员工之间仍由各自原生任务调用原生工具。

## 旧版升级

旧版用于轮询的 heartbeat 必须保持暂停或由用户明确删除。新版本不登记新的接入 thread。旧 connection-* CLI 拒绝执行。

旧待派操作显示「已暂停」，用户核对后恢复；旧租约/发送中操作显示「结果待核对」。不要通过重新提交或更换 requestId 回避去重。

Codex CLI 数字版本基线须 ≥0.155.0，接受该基线及更新版本的预发布构建（如 0.155.0-alpha.9.2），后续 minor/major 不设上限。不能解析或低于门槛时明确拒绝；版本合格后仍核验桌面进程、实际 socket、原生 initialize 和 server/diagnostics 同实例。当前真实验证宿主为 0.155.0-alpha.9.2；接受更高版本不等于已经测试其全部接口。WebSocket 与队列仍具实验性质，原生操作失败保留具体错误及不确定回执，不能静默创建第二个 App Server。
