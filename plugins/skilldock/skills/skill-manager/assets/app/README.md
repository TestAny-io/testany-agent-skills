# SkillDock

一个在 Codex 右侧浏览器面板或普通浏览器中运行的本地技能管理器。支持中文、英文、日文，以及浅色、深色和跟随系统外观；包含技能库、插件、市场来源、更新和操作记录。打开即加载本机技能库，直接查看与管理自己的安装。

此目录是可复现的 app 源码，随独立 `skilldock` 插件分发，仅包含一个 `skill-manager` 入口。当前版本 0.4.1 修复历史更新结果被误报为当前后台失败的问题，并为执行记录增加插件、版本和发生时间；保留 0.4.0 的 macOS 独立后台更新任务；保留更新进度、本机标签及筛选、插件更新入口和私仓认证支持；保留 CLI 回退、项目选择、GitHub 目录链接、逐行更新 diff 和同名技能按路径选择移除。

## 管理同名技能

在同名 skill 的卡片或详情中选择“管理同名技能”。按完整安装路径勾选要移除的一份或多份；默认全部保留，保留项的文件和启用状态保持原样。预览会分别列出将移除和将保留的路径，确认后移至可恢复区。操作记录展示实际路径，可单独恢复其中任意一份。

此操作支持个人及项目中可移除的安装。插件附带技能、系统内容和未核实缓存逐项说明限制，不会把选中某份 skill 扩大为卸载整个插件。路径别名指向同一份内容，移除链接仅移动链接；若移除实际目录，指向它的别名可能失效。预览后清单或选中内容变化时，需要重新选择和预览。

## CLI 选择

先实际执行 `codex --version` 和 `codex plugin --help`。损坏 wrapper 或缺少插件能力时，启动引导会继续尝试 ChatGPT/Codex 的 `Contents/Resources/codex` 和 Codex 管理的副本，并输出最终绝对路径。可用 `SKILLDOCK_CODEX_APP_DIR` 指定自定义应用位置，或用 `SKILLDOCK_CODEX_BIN` 指定明确的 CLI 文件；显式覆盖无效时不会悄悄换文件。

取得完整源码后，在本 skill 的目录运行 `/bin/sh scripts/launch.sh cli --print-path` 可读取最终 CLI 路径；`launch.sh cli plugin ...` 复用相同发现规则执行安装命令，不安装应用依赖。源码获取前按仓库 README 中的候选列表验证实际 CLI。应用目录只是实测候选，并非固定宿主 API。

## 从仓库安装与更新

下文 `CODEX_CLI` 使用上一步验证通过的绝对路径，或从完整 skill 目录用 `CODEX_CLI="$(/bin/sh scripts/launch.sh cli --print-path)"` 取得。

```bash
printf 'Using Codex CLI: %s\n' "$CODEX_CLI"
"$CODEX_CLI" plugin marketplace add TestAny-io/testany-agent-skills
"$CODEX_CLI" plugin add skilldock@testany-agent-skills
```

开启新的 Codex 任务，用 `$skill-manager 打开技能管理面板` 启动。这只安装独立 SkillDock 应用，不会安装 testany-eng 研发工具集。CLI 版本缺少 `plugin add` 时，可在 Codex 插件页面从同名市场安装。

获取新版本先执行 `"$CODEX_CLI" plugin marketplace upgrade testany-agent-skills`，再执行同一条 `"$CODEX_CLI" plugin add` 更新安装副本，之后在新任务调用 `$skill-manager`。源码、市场目录和已安装副本各有自己的生命周期；只执行 `git pull` 不保证已安装缓存同步。源码包下载是 AGPL 对应源码，不能当 marketplace 注册包直接安装。

需要固定版本时，向 `marketplace add` 传递已发布的 `--ref`（tag 或 commit）。仓库支持的安装格式依据 [OpenAI Package your plugin](https://developers.openai.com/plugins/build/plugins)，已存在的 Claude-compatible marketplace 可以继续使用。

## 启动

macOS 用户无需先手动安装 Node.js/npm。启动器优先复用 Codex Workspace Dependencies 中的 Node.js，并可搭配应用包自带的 npm；已有兼容环境也可使用。没有完整可用组合时，自动在 SkillDock 数据目录中准备固定版本、经过 SHA-256 校验的官方 Node.js 运行环境。应用内部要求 Node.js **22.12 或更新版本**。

首次运行需要获取 lockfile 锁定的 npm 依赖；必要时从 nodejs.org 下载专用运行时。不会修改用户 shell 配置、系统 Node 或 Codex 签名。应用没有远程字体、云端数据库或外部分析服务。

明确指定希望扫描的项目，脚本路径按实际安装位置替换：

```bash
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" start --project "/用户项目的绝对路径"
```

启动打印请求目录、最终扫描目录和 Codex CLI；请求中存在符号链接时解释真实路径。选择优先级为 `--project`、`SKILLDOCK_PROJECT_DIR`、GUI 保存选择、调用工作目录。界面“当前项目”旁可切换目录，非法路径保留原状态；选择会保存，切换后核对计划中的项目目标。

成功后返回实际 URL，默认 [http://127.0.0.1:4771](http://127.0.0.1:4771)。在 Codex 中可让 agent 将该 URL 用 browser target 打开在右侧面板。普通浏览器也可以直接访问。

启动器将源码复制到应用数据目录并安装、构建，避免把依赖或运行状态写到已安装插件中。相同源码复用构建和服务；源码或项目目录改变时，重启经过核实的本实例。`status` 查询状态，`stop` 停止，`restart` 主动重启：

```bash
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" status
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" stop
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" doctor
```

| 变量 | 默认 | 用途 |
|---|---|---|
| `SKILLDOCK_PROJECT_DIR` | 界面保存选择或启动工作目录 | 当前项目的扫描上下文 |
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

关联或安装 Git 技能时，可直接粘贴 GitHub 的目录地址，例如 `https://github.com/TestAny-io/testany-agent-skills/tree/main/plugins/testany-llm/skills/prompt-optimizer`。应用根据实际 refs 解析仓库、分支/标签及子目录，预览时列出结果；填写“分支或标签”会覆盖链接中的版本，保持同一子目录。对于仓库根地址或其他 Git 托管服务，可展开“高级：手动指定子目录”；GitHub 目录链接无需填写此项。原有来源记录和 SSH 地址继续可用。

有变更的来源关联、技能更新和可应用的插件更新预览都提供“查看代码差异”。默认折叠，展开后点选文件加载 unified diff，显示增删颜色、旧/新行号和上下文。预览基线变化或过期时需重新检查；查看差异不应用更新。二进制/非 UTF-8、符号链接、超过 256 KB 或含超长行的文件显示省略原因，复杂 diff 有计算上限，最多显示 2000 行。设计与验证见 [链接与 diff 整改记录](../../references/20-source-links-and-diff.md)。

## 私有 Git 仓库

安装技能、关联更新来源和添加 Git marketplace 均可使用私仓，前提是**运行 SkillDock 的这台电脑已经有对应的 Git 访问权限**。浏览器能打开仓库不能证明 Git 已登录。

- HTTPS 仓库和 GitHub 目录链接复用本机 Git credential helper，例如 macOS Keychain、Git Credential Manager 或 GitHub CLI。已安装 GitHub CLI 时，可以先在自己的终端运行 `gh auth login`、`gh auth setup-git`；后一条会将 GitHub CLI 配置为 Git 的认证 helper。参见 [GitHub CLI 官方说明](https://cli.github.com/manual/gh_auth_setup-git)。其他 Git 托管服务使用它们对应的 Git 登录配置。
- SSH 支持 `git@github.com:owner/repo.git`、`ssh://git@github.com/owner/repo.git` 等地址。先在终端验证主机，确保所需密钥已解锁、可通过 ssh-agent 使用。技能子目录可在“高级：手动指定子目录”中填写。
- 组织私仓可能还需要组织/SSO 授权。认证失败、仓库不存在或账号不可见、SSH 主机未验证有不同提示。表单内的“私有仓库访问设置”提供同样说明。

手动和定时更新使用同一组本机凭据。服务不弹出终端认证请求；凭据到期、密钥不可用或权限撤销时记录失败，完成认证后可以重试。如果更换了 ssh-agent 或服务启动时的认证环境，需重启 SkillDock 后再试。应用不要求在页面输入密码/token，不把它们保存到来源记录，也不接受地址中嵌入凭据。

Git 下载阶段读取用户/system 配置以使用认证、代理与企业 CA，文件检出阶段仍禁用全局/system filters 和 hooks。Codex 管理的 marketplace/插件操作继续委托当前 Codex CLI；不同 CLI 版本的服务端支持以执行结果为准。验证细节见 [导航与私仓访问记录](../../references/23-navigation-and-private-git.md)。

## 本机标签

技能和插件卡片上的“添加标签”/“编辑”可以维护标签；技能详情也提供同样入口。点击弹窗中的标签文字可修改，叉号移除，保存后生效。每个对象最多 12 个标签，每个标签最多 32 个字符，忽略大小写去重。

两个清单均有“标签筛选”，可搜索、多选、查看无标签对象，并与原有文字搜索、来源/市场、状态筛选组合。多选匹配任一选中标签，清空按钮恢复全部标签范围。

标签保存在 SkillDock 的本机数据中，不改技能正文、Codex 配置或插件源码。个人/项目技能按安装路径分别保存；插件及其附带技能按插件身份和包内路径保留到后续版本。插件标签和技能标签各自维护，不自动继承；实际来源身份、包内路径或独立技能安装位置改变时不猜测归属。

## 自动更新

“检查全部”会显示实时进度：准备状态、已处理/总数、当前对象、耗时，以及最新/有更新/已更新/跳过/失败数量。进度按更新对象计数，插件及其附带技能算一个对象。刷新页面或离开后返回可继续看到后台批次；断线时保留最后进度并重试，不将断线当成检查完成。

插件卡片上的“管理更新”会在更新页定位该插件。更新插件是按整个包更新，包内技能随包一起更新；同名的独立技能副本不在此范围。宿主管理、来源无法核实或本地修改等原因仍会明确说明。

在更新页选择“设置计划”，选择安装对象、周期和是否自动应用，再启用计划。默认关闭；个人选择以外的新安装不自动加入。界面以小时显示：预设1、24、168小时；只有选择自定义时才显示小时输入框，范围0.25–168小时且可换算成整数分钟。既有计划周期保持不变。从每轮完成时计算间隔；时区用于显示，并非每日当地固定时刻。

macOS 用户级 LaunchAgent 每五分钟启动一次短任务，未到期时不扫描或联网，到期时执行一批并退出，不启动 HTTP 服务。网页服务和 Codex 可关闭；登录后恢复，睡眠错过的 calendar 触发在唤醒后补做，关机错过的计划在登录后补做一次。失败按 5、10、20…分钟退避，上限为计划周期或约 5 小时 20 分钟。关闭计划移除 LaunchAgent，当前单项安全收尾后不再启动后续对象。已选择的来源或安装身份变化后会跳过并要求重新选择；本地修改、未知版本顺序和不可调用的宿主更新不会自动覆盖。

最近更新记录包含每个对象的结果，区分已更新、无变化、可用更新、跳过与失败。上次进程中断的批次标记结果未确认，重新检查真实状态，不直接重放旧写请求。第三轮 UAT 已移除产品 Sandbox；旧演练数据保留在原目录，但不再加载或调度，本机计划保持原设置。

SkillDock 自身随独立的 `skilldock` 插件更新。将该插件加入计划并启用自动应用后，整批更新结束时会准备新版并自动重启 SkillDock；手动更新也适用。浏览器会自动重连并重新加载，保留外观、语言和当前页面；服务保留同一数据目录、项目、端口、更新计划与历史。未提交的预览需要重新检查，不会重放写请求。

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

可选真实 CLI 自升级演练：设置 `SKILLDOCK_TEST_CODEX_BIN` 为已验证的 Codex CLI 路径后执行 `node tests/self-update-smoke.mjs`；增加 `SKILLDOCK_SMOKE_GIT=1` 测试本地 HTTP Git 来源，增加 `SKILLDOCK_SMOKE_BOOTSTRAP=1` 使用 shell 安装入口。脚本在新的临时配置、市场与状态目录安装两个版本，验证切换项目后自动重启及下一轮计划，并停止测试服务；保留临时目录作为证据，不修改用户安装。

可选独立分发演练：在 macOS 执行 `node tests/seed-distribution-smoke.mjs`，模拟损坏的 PATH wrapper，通过桌面应用 CLI 安装本仓库的 skilldock，并验证只有一个 skill、安装文件字节及执行权限与源码一致。旧版迁移演练：设置上述 CLI 变量与 `SKILLDOCK_LEGACY_PLUGIN`（已发布 testany-eng 2.4.0 的插件目录绝对路径），执行 `node tests/seed-migration-smoke.mjs`；验证显式迁移、保留计划和历史，再单独更新旧工具集到 2.4.1，确认其余 21 个技能保留。两种演练均使用新的临时 Codex 配置，不操作用户安装。

可选 macOS 无系统 Node/npm 演练：`node tests/runtime-smoke.mjs` 验证 Codex 环境复用；增加 `SKILLDOCK_SMOKE_PRIVATE=1` 验证工作区依赖缺失时的官方运行时下载、构建及重启。测试子进程 PATH 排除 Homebrew/nvm，并使用独立源码副本、数据目录与端口。专用运行时下载测试需要网络。

可选真实 GitHub 地址演练：`node tests/github-source-smoke.mjs` 在全新临时配置中访问上面的公开目录链接，验证规范来源、实际 commit、diff、关联不覆盖文件，以及后续检查更新；不会使用或修改用户技能目录。浏览器测试中的同一 GitHub 传输由本机 Git 夹具替代，解析、clone、关联与更新仍走真实服务逻辑。

`npm run dev` 启动 Vite 开发界面，另开终端运行默认端口的 `npm start` 提供 API。正式体验使用构建后的同源 `npm start` 服务或上述启动器。

[产品需求](../../references/01-product-requirements.md)、[界面设计](../../references/02-interface-design.md)、[工程设计](../../references/03-engineering-design.md)、[测试计划](../../references/04-test-plan.md)、[验证记录](../../references/05-verification.md)、[最新 UAT 手册](../../references/14-uat-round3-delivery.md) 按交付阶段保留独立证据。

## 排查

- 端口占用：设置其他 `PORT`；启动器不会停止不属于它的进程。
- CLI 不可用：技能清单仍可查看，插件动作显示具体限制。用 `SKILLDOCK_CODEX_BIN` 指定已验证的可执行文件；应用不修复系统的 wrapper。
- 启动失败：先执行 `launch.sh doctor`，并查看启动输出及数据目录的 `server.log`。若依赖下载失败，检查 npm registry/nodejs.org 网络连通性后重新 `start`；未完成的构建会重试。不要为了解决原生模块加载失败而重签名 Codex 的 Node。
- 中断调用不一定会停止后台服务：先执行 `status`，读取健康检查和日志；需要停止时明确执行 `stop`。
- 启动被强制中断且提示锁存在：确认没有另一个启动器在运行后，移除该数据目录里的 `launcher.lock`。不要删除整个数据目录作为常规修复，它包含来源记录和可恢复备份。
- 本地文件冲突：保留界面显示的原因；先检查自己的改动，再重新预览。系统和托管组件的只读限制不能靠前端按钮绕过。

## 旧版数据迁移

testany-eng 2.4.0 用户先安装独立 skilldock，再用新插件中的启动器执行 `start --project "/用户项目" --migrate-from testany-eng`。仅同一 Codex 根和 testany-agent-skills marketplace 的旧应用身份可接续，原计划、历史和备份保留。更新 testany-eng 2.4.1 后旧 skill 被移除；不要自动卸载其他研发能力。这次拆包不会由旧版定时更新自动完成迁移。旧计划对 testany-eng 的选择保持原意，迁移后需把新 skilldock 插件加入目标，并启用计划和“自动应用”。0.4.0 的独立任务不依赖网页服务运行。

## 独立后台更新（0.4.0）

启用时注册 `~/Library/LaunchAgents/io.testany.skilldock.update.<实例摘要>.plist`；固定入口、Node/npm/CLI 路径、所选项目与执行状态位于数据目录 `background/`。不写入令牌，不保存临时 SSH agent socket。支持用户已配置的 Git HTTPS/SSH 认证；登录钥匙串或授权不可用时显示原始失败原因，退避重试。

更新页显示实际注册状态和最近唤起。系统禁用后台任务时须恢复系统权限，应用不会擅自重新启用。运行环境缺失时使用实际安装位置的 `launch.sh start` 修复，再重新保存计划。旧版已有启用计划在 0.4.0 首次启动时自动迁移；更新后的自动重启也会注册系统任务，无需额外手动打开。仅更新了插件文件、尚未运行过新版时，才需手动启动一次。未启用的计划不会因升级而自动开启。`launch.sh stop` 仅停止网页服务。

可复现的系统集成测试（只创建并清理临时数据与测试 LaunchAgent）：

```bash
node tests/background-launchd-smoke.mjs
```

测试覆盖真实系统启动、补做、退出、自更新到测试版本再由下一次系统调用运行，以及删除测试来源后的任务清理。运行时需 macOS 登录会话、Node/npm 和依赖下载能力。设计及执行证据见 [0.4.0 后台更新记录](../../references/24-background-updates.md)。

### 后台状态与检查结果（0.4.1）

“最近唤起”表示系统启动了后台任务，不代表实际执行了更新。未到期时显示本次未执行更新；后台状态只报告运行环境、系统注册和任务执行自身的问题。单个插件/技能的失败或跳过保留在带时间的更新记录中，并在更新页单独展示。

新记录保存当时比较的已安装版本、来源版本和对象标识。旧记录没有这些字段时显示“尚未记录”，不拿当前版本补写过去。升级会自动识别 0.4.0 混入后台状态的旧批次消息；真实运行错误和原计划、历史记录保持有效。修复与验证见 [0.4.1 后台状态记录](../../references/25-background-status.md)。
