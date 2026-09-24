# TeamDesk 0.2.0 种子测试指南

## 1. 安装

需要已安装并正常打开过的 macOS Codex Desktop。请在「终端」复制运行：

```sh
curl -fL https://raw.githubusercontent.com/TestAny-io/testany-agent-skills/main/install-teamdesk.sh -o install-teamdesk.sh &&
sh install-teamdesk.sh
```

按顺序看到依赖检查、插件安装、图标创建、图标核验四步通过后，安装完成。缺少 Xcode Command Line Tools 时先执行 `xcode-select --install`，完成系统安装后重跑；缺少 Node 时按提示安装或指定已有版本。不需要安装整个研发技能集；员工所需业务技能可自行添加。

如果已经 clone 仓库，更新到 main 后在仓库根运行 `sh ./install-teamdesk.sh`。下载入口使用 GitHub 来源，clone 入口使用本地来源；同名 marketplace 已绑定其他来源时，按提示明确选择，不重复安装两份 TeamDesk。

## 2. 第一次打开

1. 找到用户「应用程序」或桌面的 `TeamDesk.app`，可拖到 Dock。
2. 若 Codex 已普通启动，先完成/保存正在做的工作并正常退出 Codex，再点 TeamDesk 图标。应显示 Codex 窗口，并在 Safari 打开工作台。
3. 团队设置中核对版本 0.2.0、共享连接和状态恢复。页面打开不等于原生连接成功。
4. 审查共享 hook 的命令和脚本，由你明确点击信任。安装程序不会自动批准。

安装仅创建图标；连接使用当前 Codex 同一个 App Server，已有任务保留。数据存放在 `~/Library/Application Support/TestAny/TeamDesk`。关闭网页不会结束员工任务。

## 3. 最小业务闭环

1. 建一个部门，填写职责；添加两名测试员工，指定岗位、工作说明和已安装技能。
2. 等待两名员工的原生入职/记账检查通过。
3. 给员工 A 一项小任务，并勾选员工 B 协作；观察原生任务、协作图、回执与共享记录。
4. 原生提问应进入「需要你的决定」，回答后应回到同一员工/任务。
5. 负责人报告完成后核对交付物，验收通过或退回；负责人应收到原生通知，计数应准确。

然后测试正常退出后再次一键启动、重复点击图标、重启服务后数据保留；完整清单见 [UAT](UAT.md)。32 人是容量上限，不代表 32 路满负荷吞吐已验证。

## 4. 反馈

请通过仓库 [问题反馈](https://github.com/TestAny-io/testany-agent-skills/issues/new/choose) 提供：

- TeamDesk 版本、macOS 版本、Apple Silicon / Intel、Codex Desktop 版本及内置 CLI 版本。
- 安装来源（下载脚本 / clone）、失败阶段、操作步骤、期望与实际结果。
- 必要截图及错误片段。先检查并遮盖业务内容、令牌、私有路径与任务信息。

安装结果保存在 Codex 配置目录的 `teamdesk-install-result.json`（默认 `~/.codex`）；启动日志在 TeamDesk 数据目录的 `launcher.log`。不要上传整个 Codex 配置目录、业务数据库或完整对话。

本机隔离安装和自动测试不能替代另一台机器验证。当前尤其需要反馈：完整冷启动、不同 Codex 版本、Intel Mac、较早 macOS、路径/运行时差异。安装不兼容时请保留具体错误，不反复派发同一项业务。
