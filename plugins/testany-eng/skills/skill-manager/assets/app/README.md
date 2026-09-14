# SkillDock

一个在 Codex 右侧浏览器面板或普通浏览器中运行的本地技能管理器。支持中文、英文、日文，以及浅色、深色和跟随系统外观；包含技能库、插件、市场来源、更新和操作记录。打开即加载本机技能库，直接查看与管理自己的安装。

此目录是可复现的 app 源码，随 `testany-eng/skill-manager` 分发。本轮三轮 UAT 已结束，先以 SkillDock 0.1.0 随 `testany-eng` 2.4.0 通过 Git 仓库分发；能力以界面的状态证据和可用操作为准。

## 从仓库安装与更新

```bash
codex plugin marketplace add TestAny-io/testany-agent-skills
codex plugin add testany-eng@testany-agent-skills
```

开启新的 Codex 任务，用 `$skill-manager 打开技能管理面板` 启动。这会安装整个 `testany-eng` 插件；SkillDock 的入口是其中的 `skill-manager`。CLI 版本缺少 `plugin add` 时，可在 Codex 插件页面从同名市场安装。

获取新版本先执行 `codex plugin marketplace upgrade testany-agent-skills`，再执行同一条 `codex plugin add` 更新安装副本，之后在新任务调用 `$skill-manager`。源码、市场目录和已安装副本各有自己的生命周期；只执行 `git pull` 不保证已安装缓存同步。源码包下载是 AGPL 对应源码，不能当 marketplace 注册包直接安装。

需要固定版本时，向 `marketplace add` 传递已发布的 `--ref`（tag 或 commit）。仓库支持的安装格式依据 [OpenAI Package your plugin](https://developers.openai.com/plugins/build/plugins)，已存在的 Claude-compatible marketplace 可以继续使用。

## 启动

macOS 用户无需先手动安装 Node.js/npm。启动器优先复用 Codex Workspace Dependencies 中的 Node.js，并可搭配应用包自带的 npm；已有兼容环境也可使用。没有完整可用组合时，自动在 SkillDock 数据目录中准备固定版本、经过 SHA-256 校验的官方 Node.js 运行环境。应用内部要求 Node.js **22.12 或更新版本**。

首次运行需要获取 lockfile 锁定的 npm 依赖；必要时从 nodejs.org 下载专用运行时。不会修改用户 shell 配置、系统 Node 或 Codex 签名。应用没有远程字体、云端数据库或外部分析服务。

在希望扫描的项目目录执行，脚本路径按实际安装位置替换：

```bash
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" start
```

成功后返回实际 URL，默认 [http://127.0.0.1:4771](http://127.0.0.1:4771)。在 Codex 中可让 agent 将该 URL 用 browser target 打开在右侧面板。普通浏览器也可以直接访问。

启动器将源码复制到应用数据目录并安装、构建，避免把依赖或运行状态写到已安装插件中。相同源码复用构建和服务；源码或项目目录改变时，重启经过核实的本实例。`status` 查询状态，`stop` 停止，`restart` 主动重启：

```bash
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" status
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" stop
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" doctor
```

| 变量 | 默认 | 用途 |
|---|---|---|
| `SKILLDOCK_PROJECT_DIR` | 启动时工作目录 | 当前项目的扫描上下文 |
| `SKILLDOCK_STATE_DIR` | `~/.local/share/skilldock` | 来源、历史、备份、隔离构建与日志 |
| `PORT` | `4771` | IPv4 loopback 端口 |
| `SKILLDOCK_CODEX_BIN` | 运行时自动探测 | 显式可执行 Codex CLI 路径 |
| `SKILLDOCK_CODEX_APP_DIR` | 标准 Applications 目录 | 自定义安装位置的 Codex/ChatGPT `.app` 绝对路径 |
| `SKILLDOCK_WORKSPACE_RUNTIME` | Codex 标准运行环境缓存 | 宿主工作区依赖根目录，内含 `dependencies/node/bin/node` |
| `SKILLDOCK_NODE_BIN` | 自动选择 | 显式 Node 可执行文件绝对路径；错误配置会明确失败 |
| `SKILLDOCK_NPM_CLI` | 自动选择 | 显式 `npm-cli.js` 绝对路径，由选定 Node 执行 |

运行数据不存到 Git。服务只绑定 `127.0.0.1`；不要用公网反向代理发布。应用不会替用户注册开机启动。

`doctor` 仅报告环境选择，不下载或构建；`status` 和 `stop` 也不准备依赖。启动记录保存实际 Node 路径和版本。应用包内受 macOS 签名限制的 Node 仅用于启动引导程序，不能直接拿它构建依赖原生模块的 Vite 项目。详见 [运行环境设计及验证](../../references/18-codex-node-runtime.md)。

## 使用范围

- **技能库**：扫描已知用户、当前项目、系统与插件来源；搜索、过滤、重名提示、详情及状态证据。不会声称扫描磁盘上所有目录。
- **个人与项目技能**：按技能目录管理，与按整个包管理的插件附带技能区分。本地目录或 Git 来源可预览安装；已有技能可关联来源，再检查更新及文件变化；移除进入隔离备份，可在操作记录恢复。已有本地修改或恢复位置被占用时拒绝覆盖。
- **启用状态**：受支持技能按 `SKILL.md` 路径更新 Codex 配置；插件按包开关。配置读回成功与已运行 Codex 会话生效分开；可能需要重启 Codex。
- **插件和市场**：本机操作复用检测到的 CLI。支持的来源可添加、移除、刷新以及安装插件；有已核实本地包来源的插件可通过 Codex 再次安装更新，并恢复原有禁用状态。远程平台或系统内置项展示所属管理器与具体更新渠道，不能以覆写内置文件代替宿主更新。

“刷新市场”更新目录来源，不等于已安装的所有技能或插件都升级。更新页展示已有安装的路径、来源、版本、管理器和证据；无原始记录的手工安装需关联来源，不能从文件名或修改时间猜测安装方式。关联窗口列出已检测的来源地址、仓库内目录、分支/标签和commit；普通复制安装可能没有保存这些字段，会明确解释空白原因。已有Git工作区自动预填可读信息，当前HEAD不等于原安装commit。

## 自动更新

在更新页选择“设置计划”，选择安装对象、周期和是否自动应用，再启用计划。默认关闭；个人选择以外的新安装不自动加入。界面以小时显示：预设1、24、168小时；只有选择自定义时才显示小时输入框，范围0.25–168小时且可换算成整数分钟。既有计划周期保持不变。从每轮完成时计算间隔；时区用于显示，并非每日当地固定时刻。

调度运行在本地后台服务中，关闭浏览器页面后仍运行。电脑休眠或服务停止时暂停，恢复后仅补一次检查；重启电脑后需再次启动 SkillDock，不自动注册开机启动。关闭计划会让在途单项完成安全收尾，但不再启动后续对象。已选择的来源或安装身份变化后会跳过并要求重新选择；本地修改、未知版本顺序和不可调用的宿主更新不会自动覆盖。

最近更新记录包含每个对象的结果，区分已更新、无变化、可用更新、跳过与失败。上次进程中断的批次标记结果未确认，重新检查真实状态，不直接重放旧写请求。第三轮 UAT 已移除产品 Sandbox；旧演练数据保留在原目录，但不再加载或调度，本机计划保持原设置。

SkillDock 自身随所属的 `testany-eng` 插件更新。将该插件加入计划并启用自动应用后，整批更新结束时会准备新版并自动重启 SkillDock；手动更新也适用。浏览器会自动重连并重新加载，保留外观、语言和当前页面；服务保留同一数据目录、项目、端口、更新计划与历史。未提交的预览需要重新检查，不会重放写请求。

新版先构建再停机，构建失败继续运行旧版；新版启动失败时尝试恢复已验证的旧运行目录，并在界面显示失败原因。即使 Codex 删除旧版本插件缓存，也可以使用已记录的安装身份和保留的运行目录恢复。准备过程中明确停止 SkillDock 会取消该次自动重启。直接通过 `npm start` 运行且没有 launcher 所有权记录的开发实例不自动接管。

Git 来源使用 Codex 的市场刷新能力；该 CLI 可能在刷新过程中同步已安装包，应用会核实并记录实际结果，并保留同来源的后续更新计划。本地 clone 来源只检查工作区已有内容，不会自动 pull 用户工作区。

## 开源许可与对应源码

SkillDock 自有代码、启动器和相关材料使用 **AGPL-3.0-only**；见 [完整许可证](../../LICENSE) 与 [第三方声明](../../THIRD_PARTY_NOTICES.md)。本目录是仓库默认 MIT 的例外；历史已获 MIT 授权的版本不追溯改变。仅使用本工具管理技能或开发独立软件，不会改变那些软件的许可证。

“外观与语言”中可以下载完整许可证和对应当前构建的源码包。构建会使用同一份源码快照生成运行文件和 `skilldock-source.tar.gz`，包括前后端、构建配置、依赖锁文件、测试、启动器与声明；排除本机状态、已安装技能、凭证、依赖缓存和含本机验证路径的记录。源码在构建中变化时构建失败，重新执行即可。

## 开发与验证

在本目录执行：

```bash
npm ci
npm run build
npm test
npm run test:e2e
SKILLDOCK_PROJECT_DIR="/你的项目路径" npm start
```

浏览器自动化需要 Playwright Chromium。缺少时执行 `npx playwright install chromium`；可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已有兼容 Chromium。测试使用临时数据目录，不操作当前用户的真实技能或配置。隔离 Sandbox 仅通过测试 harness 的 `enableTestSandbox: true` 程序参数开启，正式启动、环境变量、URL 或浏览器偏好均不能开启；生产 API 拒绝旧 Sandbox 请求，不会回落为本机操作。

可选本机只读核验：`SKILLDOCK_PROJECT_DIR="/你的项目路径" node tests/local-smoke.mjs`。它读取真实清单和一份技能正文，在临时目录保存应用状态；比较已知用户/项目技能根及 Codex 配置的前后内容散列。此脚本不会调用写入 API，也不包含在默认测试中；符号链接只比较链接本身，插件缓存不做全量字节断言。

可选真实 CLI 自升级演练：设置 `SKILLDOCK_TEST_CODEX_BIN` 为已验证的 Codex CLI 路径后执行 `node tests/self-update-smoke.mjs`；增加 `SKILLDOCK_SMOKE_GIT=1` 测试本地 HTTP Git 来源，增加 `SKILLDOCK_SMOKE_BOOTSTRAP=1` 使用 shell 安装入口。脚本在新的临时配置、市场与状态目录安装两个版本，验证自动重启及下一轮计划，并停止测试服务；保留临时目录作为证据，不修改用户安装。

可选 macOS 无系统 Node/npm 演练：`node tests/runtime-smoke.mjs` 验证 Codex 环境复用；增加 `SKILLDOCK_SMOKE_PRIVATE=1` 验证工作区依赖缺失时的官方运行时下载、构建及重启。测试子进程 PATH 排除 Homebrew/nvm，并使用独立源码副本、数据目录与端口。专用运行时下载测试需要网络。

`npm run dev` 启动 Vite 开发界面，另开终端运行默认端口的 `npm start` 提供 API。正式体验使用构建后的同源 `npm start` 服务或上述启动器。

[产品需求](../../references/01-product-requirements.md)、[界面设计](../../references/02-interface-design.md)、[工程设计](../../references/03-engineering-design.md)、[测试计划](../../references/04-test-plan.md)、[验证记录](../../references/05-verification.md)、[最新 UAT 手册](../../references/14-uat-round3-delivery.md) 按交付阶段保留独立证据。

## 排查

- 端口占用：设置其他 `PORT`；启动器不会停止不属于它的进程。
- CLI 不可用：技能清单仍可查看，插件动作显示具体限制。用 `SKILLDOCK_CODEX_BIN` 指定已验证的可执行文件；应用不修复系统的 wrapper。
- 启动失败：先执行 `launch.sh doctor`，并查看启动输出及数据目录的 `server.log`。若依赖下载失败，检查 npm registry/nodejs.org 网络连通性后重新 `start`；未完成的构建会重试。不要为了解决原生模块加载失败而重签名 Codex 的 Node。
- 启动被强制中断且提示锁存在：确认没有另一个启动器在运行后，移除该数据目录里的 `launcher.lock`。不要删除整个数据目录作为常规修复，它包含来源记录和可恢复备份。
- 本地文件冲突：保留界面显示的原因；先检查自己的改动，再重新预览。系统和托管组件的只读限制不能靠前端按钮绕过。
