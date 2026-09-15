---
name: skill-manager
description: 打开 SkillDock 本地 GUI，浏览和管理 Codex skills、plugins 与 marketplace 来源；适用于技能库、安装更新、启禁、移除恢复的可视化管理。普通任务只需使用某个 skill 时不触发。
---

# SkillDock

本 skill 随独立的 `skilldock` 插件分发，仅打开本地技能管理应用。将本地技能管理器打开在宿主浏览器面板中。GUI 按钮直接调用本地服务，打开即加载本机技能库。用户只要求打开界面时，不替其安装、禁用或移除实际技能。

## 启动与打开

从本次实际加载的 `SKILL.md` 所在目录定位 `scripts/launch.sh`，不要假定仓库 checkout 或插件缓存路径。macOS 启动器自动复用 Codex 的 Node.js/npm；缺少可用组合时准备应用专用运行环境，不要求用户先安装全局 Node.js。

```bash
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" start --project "/用户项目的绝对路径"
```

启动前确定用户项目目录，并用 `--project` 显式传入；不要先切换到下载目录或安装目录再把它作为用户项目。未指定时依次使用 `SKILLDOCK_PROJECT_DIR`、界面保存的项目、调用工作目录。界面“切换项目”可保存新的扫描选择。可用 `SKILLDOCK_STATE_DIR` 指定独立应用数据目录、`PORT` 指定端口；默认数据位于 `~/.local/share/skilldock`，默认端口 4771。启动器把源文件复制到应用数据目录，按 lockfile 安装依赖并构建，不向安装的插件缓存写入运行数据。首次启动需要 npm registry 可达；需专用运行环境时还访问 nodejs.org 并校验固定摘要，后续复用已准备的环境和相同构建。

CLI 逐个验证 PATH、桌面应用内置 CLI 与 Codex 管理的副本；损坏的旧 wrapper 会被跳过。指定 `SKILLDOCK_CODEX_BIN` 时必须是有效的绝对路径。CLI 诊断也包含在 `doctor` 中，实际来源说明见 [应用安装说明](assets/app/README.md)。

运行环境发现失败时先执行 `launch.sh doctor`。宿主若提供 `load_workspace_dependencies`，可读取其返回的真实 Node 路径，以 `SKILLDOCK_NODE_BIN` 指定；自定义 Codex 应用位置使用 `SKILLDOCK_CODEX_APP_DIR`。不要修改 Codex 的签名或用户 shell 配置来绕过加载限制。诊断及兼容边界见 [运行环境接入](references/18-codex-node-runtime.md)。

核对启动前后打印的请求目录和最终扫描目录、目录来源与 Codex CLI 绝对路径。真实路径与请求路径不同会有符号链接说明；若最终目录不符合用户意图，修正 `--project` 后重新打开，不把 HTTP 200 当作扫描目录正确的证据。

读取启动器返回的实际 URL。宿主提供 `open_in_codex` 时，以 browser target、`placement: right` 打开 URL；否则使用已提供的浏览器工具，或给出可点击链接。工具不存在时不伪造面板已打开。不承诺原生左侧栏自定义扩展入口。

默认读取本机已知技能根和可用 CLI 证据，不声称扫描整台磁盘。界面显示每个对象的可用操作和原因。已运行 Codex 会话不保证即时重新加载配置；按应用反馈提示重启/新会话。

## 状态与停止

```bash
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" status
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" stop
```

启动是后台服务操作，中断调用不一定停止已创建的服务；先用 `status` 核实实际结果，需要停止时执行 `stop`。

仅停止启动器记录且健康检查确认匹配的服务；不要按端口或进程名称杀掉其他程序。出现端口占用、不可核实 PID 或 CLI 不可用时，保留实际错误并按 [应用说明](assets/app/README.md) 排查。更新 app 源码后的 `start` 会重建并重启已核实的此实例。

用户将所属插件加入自动更新计划后，SkillDock 在整批更新结束时准备新版并自动重启，浏览器自动重连；同一安装跨版本保留原数据目录。构建失败保留旧服务，启动失败尝试恢复旧运行目录。失败时检查日志与重启状态，不删除数据目录或手改所有权记录来绕过校验。实现及验证见 [自身更新重启](references/17-self-update-restart.md)。

## 从旧版迁移

旧版 SkillDock 0.1.0 属于 testany-eng。独立插件首次接续旧数据时，在明确打开新插件的请求下，用本 skill 的真实路径执行 `start --project "/用户项目" --migrate-from testany-eng`；启动器只接续同一 marketplace 和 Codex 根的固定旧身份。保留旧计划与历史，不自动卸载整个 testany-eng。新旧同名 skill 共存时以独立 skilldock 的安装路径为准；更新旧工具集到 2.4.1 会移除旧应用入口。旧计划的 testany-eng 目标保留，新应用自更新须选择 skilldock 目标。

## 使用示例

- “打开技能管理面板” → 启动并打开 GUI，交由用户选择对象。
- “设置技能自动更新” → 打开更新页的计划设置；让用户选择对象、间隔与自动应用开关。仅打开界面不代表授权创建本机计划。
- “查看这个项目有哪些同名技能” → 将项目目录作为扫描根，打开技能库并筛选重名项。
- “SkillDock 无法启动” → 读取启动结果、服务日志及 [应用说明](assets/app/README.md)，只处理该实例。

## 维护与完成标准

本轮独立分发与项目选择整改见 [种子反馈记录](references/19-seed-feedback.md)。维护源码时读取 [工程设计](references/03-engineering-design.md) 与 [测试计划](references/04-test-plan.md)；需求或交互变更分别读取 [PRD](references/01-product-requirements.md) 与 [界面设计](references/02-interface-design.md)。第一轮 UAT 的主题、三语言、来源及定时更新变更见 [变更基线](references/07-uat-round1-changes.md)。最新产品边界与验证见 [第三轮整改交付](references/14-uat-round3-delivery.md)；Sandbox 已从产品移除，隔离夹具仅供开发测试使用。本软件许可为 [AGPL-3.0-only](LICENSE)，第三方材料保留自己的许可。

启动成功须有实际健康检查和可访问页面；操作成功须由后端读回证明。缓存目录存在不等于有效安装，市场刷新不等于技能/插件升级；保护系统和来源不明确的托管组件。失败、部分完成、恢复和用户 UAT 各自如实报告。
