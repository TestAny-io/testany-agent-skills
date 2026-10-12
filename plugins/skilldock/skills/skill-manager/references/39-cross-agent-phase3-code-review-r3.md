# 代码复核报告（第 3 轮，窄范围）：PH3R2-P1-01 与第 2 轮 P2 的修复（`fe66fa2`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 上一轮 | [39-cross-agent-phase3-code-review-r2.md](39-cross-agent-phase3-code-review-r2.md)（CHANGES_REQUESTED：PH3R2-P1-01，PH3R2-P2-01～06；部分关闭 PH3-P1-01、PH3-P2-03、07、08、11、13） |
| 范围 | 只看 `fe66fa2` 的改动及其直接影响。`git diff 149dcad..fe66fa2 -- plugins`：13 个文件，增 133 行、删 76 行，diff sha256 前缀 `ba71ccbb8048` |
| Candidate | `fe66fa2`（tree `7eebc7b8…`），分支 `feature/skilldock-0.11-cross-agent`（本地） |
| 事实源 | 与上一轮相同且未改动：PRD `34`（sha256 `e061ec25…`）、HLD `35` v1.16（`2bd0c5b9…`）、契约 `36c`（`980f6306…`）、实施计划 `37`（`0ae1e22d…`，本提交未改） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-09 |
| 工作区绑定 | 开始与结束时 HEAD 均为 `fe66fa2`；开始时工作区干净，结束时只多本报告（未提交） |

## 2. 结论

**APPROVED**（带 P2）

- P0：0
- P1：0。PH3R2-P1-01 已关闭：Codex 只读时，经 HTTP 或后台能到达的检查路径都不再执行带 mutation 的命令，也不再改写 Codex 根下的任何文件（第 4.1 节，实验 E1/E2 按文件与目录逐项比对）
- P2：1（新，PH3R3-P2-01，见第 4 节），不阻断
- 上一轮列出的 13 项：关闭 11 项，部分关闭 2 项（PH3R2-P2-02 的残余并入 PH3R3-P2-01；PH3R2-P2-06 与 PH3-P2-13 的测试缺口仍在），未关闭 0 项（第 3 节）
- 1 版客户端（不带 `multiAgent`、不带 `agent`）：Codex 可管理时行为不变；只读时检查结果不可应用，界面上没有应用入口；技能目标受 PH3R3-P2-01 影响（第 5.2 节）
- 英、日界面：本提交新增与改写的服务端与界面文字（连同 3 条对照共 18 条），用生产翻译器渲染后没有中文残留（第 5.3 节）
- 是否需要 Owner 决定：不需要

PH3R3-P2-01 与第 3 节列出的测试缺口建议在阶段 3 收尾或阶段 4 开始前处理，不需要再开完整评审轮次。本结论不授予推送、合并或发布权限。

## 3. 上一轮各项的判定

| ID | 判定 | 依据 |
|----|------|------|
| PH3R2-P1-01 | **关闭** | `preparePluginUpdate` 在 `local` 模式下自行读取只读状态（`service.mjs:429-430`）：只读时强制 `refreshMarketplace = false`，并跳过 `writePluginSkills`（`:502`），不改 `pluginSkillPreferences`。所有调用方都受约束，包括 `verifySynchronized`。实验 E1：Git 与本地 marketplace，1 版与 2 版请求，`config.toml` 与 Codex 根下全部文件、目录逐字节不变，配置备份区不新增，没有任何命令；对照组（可管理）照常追加 `[[skills.config]]` 并执行 `marketplace upgrade`，说明夹具确实走到了写入路径。变异 X01（去掉 `!readOnly`）、X02、X03 都被测试发现。`HOST_WRITES` 的注释已如实改写 |
| PH3R2-P2-01 | 关闭 | `markReadOnly` 对 Codex 的更新项置 `canApply/canAutoApply` 为假，对操作记录置 `canRestore` 为假（`multi-agent.mjs:60-61`），只在多 Agent 快照中执行。只读时检查的响应也置 `canApply` 为假（`service.mjs:1148`）。实验 E3：多 Agent 快照中插件与技能更新项都不可应用，操作记录不可恢复；`update.apply` 返回 `AGENT_READ_ONLY`。有测试（X04、X05 被发现）。没有给出单独原因，见观察 2 |
| PH3R2-P2-02 | **部分关闭** | 结果为 `available` 时，附注已说明“需要启用 Codex 管理后才能更新”，不再说“结果以本机现有副本为准”。但附注仍对每次只读检查无条件追加“这次检查没有刷新来源”：本地 marketplace 本来就不刷新；本提交又把附注扩到技能目标，而技能检查确实读取了来源。残余并入 PH3R3-P2-01 |
| PH3R2-P2-03 | 关闭 | 确认框新增 `affectedTitle`，Claude 与 Codex 的启用确认把位置列在“启用后 SkillDock 可能写入的位置”下，不再显示计数；说明改为“启用这一步本身不会改动任何文件”，与列表不再矛盾（`AgentEnvironments.tsx:34-36`，`App.tsx:2028-2029`）。没有测试（X12、X14 存活） |
| PH3R2-P2-04 | 关闭 | 技能根读取失败（ENOENT、ENOTDIR 以外）记入 `problems`，写成完整句子“技能目录 … 无法读取（EACCES）。”，Claude 因此为“无法确认”（`claude-catalog.mjs:158`）。有测试（X06 被发现），英、日翻译齐全 |
| PH3R2-P2-05 | 关闭 | 右键菜单的“管理更新”与技能详情的标签条都按 `objectAgents(item).includes("codex")` 禁用（`App.tsx:713`、`:1726`），与卡片、详情页其他入口一致。没有测试（X10、X11 存活） |
| PH3R2-P2-06 | **部分关闭** | 新增测试覆盖了本提交的服务端修复（X01～X06、X09 被发现）。仍未覆盖：M11（去掉启用后的读回）、M14（`overriddenBy` 只看 user 层）、N08（去掉 Claude 原因的嵌套槽登记）仍存活。提交说明称已覆盖“managed 覆盖 local”，但新测试的夹具中 user 层对 `b@m` 同样给出不同的值，M14 下仍得出 `overriddenBy: 'managed'`，分不出 local 层是否参与。本提交新增的 X07（检查响应不置 `canApply` 为假：测试中的结果本来就是 `current`）、X08、X10～X14（界面与嵌套槽 X13）都没有测试 |
| PH3-P1-01 | 关闭 | 同 PH3R2-P1-01 |
| PH3-P2-03 | 关闭 | 同 PH3R2-P2-01 |
| PH3-P2-07 | 关闭 | 同 PH3R2-P2-05(b) |
| PH3-P2-08 | 关闭 | 同 PH3R2-P2-05(a) |
| PH3-P2-11 | 关闭 | 同 PH3R2-P2-03 |
| PH3-P2-13 | **部分关闭** | 同 PH3R2-P2-06 |

## 4. 新问题

### PH3R3-P2-01 只读时检查技能，结果被记为“已是最新”，并写入持久的更新观察记录

- **位置**：`service.mjs:1145-1150`（只读附注块对所有 `update.check` 生效，包括技能目标，并执行 `result.update.available = false`）→ `:1156-1158`（技能的更新项由 `result.update` 推导：`status: result.update.available ? 'available' : 'current'`）→ `:1160`（`scheduler.observe` 把它写入 `updates.json` 的 `observations`）；`sources.mjs:91`（以后的快照沿用观察记录中的 `status` 与 `canAutoApply`）。
- **依据**：PRD 5.3（更新页如实显示检查结果）、5.1.4（只读是“清单可看，写操作禁用并提示”，不是改写检查结果）；本提交自己的说明“the result cannot be applied and says so accurately”。
- **复现（实验 E3c，导出副本，沙箱）**：Codex 可管理时从本地来源安装一个技能（来源已追踪），随后来源中有 2 个文件变化，把 Codex 设为只读，在更新页对该技能执行 `update.check`：
  - 响应的 `updateItem` 为 `status: 'current'`、`canApply: false`、没有 `previewId`，但 `changes` 为 2 项，`message` 为“2 个文件有变化；更新前会保留旧版本。”；只读附注只进了 `result.message`，而 0.11 与 0.10.x 的更新页在响应带 `updateItem` 时都不显示 `result.message`。界面上的预览框因此同时显示“已是最新”、“2 个文件有变化”和变化列表，没有任何只读说明。
  - 附注说“这次检查没有刷新来源”，而技能检查确实读取了来源（Git 来源会重新克隆到暂存区）。
  - 1 版快照与多 Agent 快照都显示该技能为 `current`；重新启用 Codex 管理后仍为 `current`，直到下一次检查。
  - `result.update.available = false` 没有其他作用：旧的更新预览框（`UpdateDialog`）只由技能详情的 `skill.checkUpdate` 打开，这条路径不经过附注块；`App.tsx` 也只在请求带 `id` 时保存 `result.update`，而 `update.check` 不带 `id`。所以这一句唯一的效果就是把状态推导成 `current`。
- **同类的较轻情形（插件）**：只读检查得到的 `canAutoApply: false` 与只读附注也写进了观察记录。重新启用 Codex 管理后，该插件的更新项仍显示“Codex 为只读：…”，`canAutoApply` 仍为假（`sources.mjs:91` 沿用 `prior.canAutoApply === false`），勾选“自动应用”时计划表单不把它列为可选目标，直到下一次检查（实验 E3c 的 `afterEnable`）。不影响后台计划：计划运行时用的是当次检查的结果。
- **影响**：只影响 Codex 只读期间的手动检查，不写 Codex，也不影响后台计划的实际更新；但会让用户误以为技能已是最新，并在重新启用后继续显示过时的状态。
- **建议**：
  1. 不改写检查得到的状态：去掉 `result.update.available = false`；“不可应用”只在响应中表达（`updateItem.canApply = false`），并让多 Agent 快照按当时的管理状态计算（`markReadOnly` 已经这样做）。写入观察记录前不要带上只读专属的 `canAutoApply: false` 与附注，或在重新启用时不沿用它们。
  2. 附注按目标区分：插件且确实跳过了刷新（Git 或单插件来源）时才说“没有刷新来源”；技能与本地 marketplace 只说“没有改动 Codex；需要启用 Codex 管理后才能更新”。附注应进入 `updateItem.message`，技能目标也一样。
  3. 补测试：只读时检查有变化的技能，`status` 仍为 `available`、`canApply` 为假、`updateItem.message` 含只读说明；重新启用后插件的 `canAutoApply` 恢复。

## 5. 按委托重点的核查

### 5.1 Codex 只读时可达路径中的宿主改动（重点 1）

逐一核对了 `service.mjs` 中所有 `adapter.command(…, { mutation: true })`、`toggleConfig`、`toggleSkillConfigs`（只在 `writePluginSkills` 中）、`writePluginSkills`，以及把文件移动、复制到 Codex 根的调用点。`plugin.checkUpdate` 与 `plugin.update` 不在 `ACTION_FIELDS` 中，只能经 `update.check`、`update.apply` 转译或 `verifySynchronized` 进入。

| 调用点 | 所属操作 | 只读时（`fe66fa2`） |
|--------|----------|--------------------|
| `:439` `marketplace upgrade`；`:438` `refreshDirectSource`（只移动 SkillDock 自管的单插件来源目录） | `plugin.checkUpdate`（经 `update.check`，或经 `reconcileBinding` → `verifySynchronized`） | 跳过：`preparePluginUpdate` 在 `local` 模式下按只读强制不刷新（`:429-430`） |
| `:509` `writePluginSkills` → `toggleSkillConfigs` 改写 `config.toml` | 同上 | 跳过（`:502`）。实验 E1 与 E2 证实 |
| `:629`、`:633`、`:636`；`:615-619` 复制 | `plugin.installSource` | 拒绝（`HOST_WRITES`） |
| `:677`、`:689`、`:691` | `plugin.update`（只经 `update.apply`） | 拒绝（`update.apply` 在 `HOST_WRITES`，`assertAgentWritable` 是 `executeRequest` 的第一步，内部调用同样经过） |
| `:741`、`:746` | `skill.toggle` | 拒绝 |
| `:836` | `plugin.toggle` | 拒绝 |
| `:854`、`:870`、`:898` | `plugin.install`、`plugin.remove` | 拒绝 |
| `:917`、`:938`；`:927` | `marketplace.add`、`marketplace.refresh`、`marketplace.remove` | 拒绝 |
| `:729`、`:768-769`、`:776`、`:793`、`:820-825`；`:339` 建技能根 | `skill.install`、`skill.update`、`skill.remove`、`skill.removeSelected`、`activity.restore` | 拒绝 |
| `:382`、`:474` | 各类预览、检查 | 只写 SkillDock 的暂存区 |

后台与计划相关的路径：

- `reconcileBinding` / `verifySynchronized`：手动检查插件时（`:1141`）以及计划运行中都可能进入。实验 E2：计划已绑定、插件内容外部同步后，只读时手动检查走到 `verifySynchronized`（计划活动中出现 `schedule.reconcile`），Codex 根不变、没有命令；改写的只有 SkillDock 自己的计划绑定与 `pluginBaselines`。
- `afterOwnerRefresh`：只在 `updatedDuringCheck` 时调用，它要求检查中刷新过 Git marketplace 且版本升高；只读时不刷新，`plugin` 不会被重新读取，所以不会进入。它本身也只写计划绑定。
- 后台 `tickScheduler` 与 `updates.run`：Codex 目标先判为暂停（`AGENT_PAUSED`），在调和与检查之前（实验 E2 的计划运行一组）。
- `update.apply`、`activity.restore`：在 `HOST_WRITES` 中，返回 `AGENT_READ_ONLY`（实验 E3）。
- `onInstallationChange`：插件检查后会请求自我更新检查，它只读 SkillDock 自己的安装与 Codex 插件缓存，不写 Codex，本提交未改。
- 与上一轮相同、未在本轮核实：`plugin.connectionStatus` 调用 Codex app-server 的 `app/list`（`forceRefetch`），是否会让 Codex 改写自己的缓存，不能运行真实 Codex，无法核实。

本提交没有改动 Codex 可管理时的路径：`readOnly` 为假时 `preparePluginUpdate` 与改动前相同，附注块与 `markReadOnly` 的新增行只在只读时执行（实验 E1、E2 的对照组）。

### 5.2 只读时检查结果不可应用的处理（重点 2）

- **0.11 界面（多 Agent 快照）**：检查插件后，预览框显示状态与带只读附注的说明，没有“应用”按钮（`canApply` 为假）；刷新后更新项仍不可应用（`markReadOnly`）。检查技能见 PH3R3-P2-01。技能详情的“检查更新”按钮在只读时禁用（`canUpdate` 为假），所以旧的更新预览框在 0.11 中不会出现。
- **1 版客户端（0.10.x 界面）**：0.10.2 的更新页与 0.11 相同，行内只有“检查”，“应用”只出现在检查后的预览框中，而检查响应 `canApply` 为假，所以看不到应用入口。1 版快照中插件更新项的 `canApply` 仍为真（`buildUpdateItems` 按预览是否存在重新计算），但在 0.10.x 界面中没有可见的入口用到它；即使通过其他方式发出 `update.apply`，也只得到 `AGENT_READ_ONLY`，其 `message` 是完整句子（契约第 89 行的例外）。0.10.x 的技能详情仍可“检查更新”（`skill.checkUpdate`，不经过附注块），旧的更新预览框显示可更新与“更新”按钮，点击后得到 `AGENT_READ_ONLY`，与上一轮相同，契约允许。技能目标在更新页检查时同样受 PH3R3-P2-01 影响：显示为“已是最新”。
- 只读期间生成的插件更新预览在内存中保留至多 30 分钟。重新启用后，预览仍在则可以直接应用；预览来自本机现有副本，内容与绑定都会在应用时重新核对，可以接受。

### 5.3 翻译（重点 3）

- 新附注模板“{v0} Codex 为只读：这次检查没有刷新来源，也没有改动 Codex；如有新版本，需要启用 Codex 管理后才能更新。”登记在 `messageSlots` 中，旧模板已从 `server-messages.json` 删除，代码中不再产生旧文字。
- 实验 E4（生产翻译器，导出副本）：8 种内层结果（插件 6 种、技能 2 种）各接上附注；Claude 技能根不可读的原因（含带空格的路径与 `UNREADABLE`），嵌套与单独两种形式；技能变化计数；确认框的新标题与两段新说明，以及原有的“受影响的技能（”等 3 条对照。共 18 条，英、日各一遍：英文结果中没有任何汉字，日文结果中没有简体专用字，也没有原样返回的条目。
- 0.10.x 的英、日界面不认识新附注，会原样显示中文（同上一轮观察 2，文字已换）。

## 6. 测试与实验

全部测试与实验都在沙箱 `phase2-review/hermetic.sb` 中运行（禁止执行本机 Codex/Claude 命令行，禁止非本机外连）。环境为 `env -i`，`HOME` 与 `TMPDIR` 指向 `scratchpad/verify/phase3-review-r3/`，并加载守卫，拒绝连接 4771 端口与非本机地址。守卫日志没有生成，即没有任何被拦截的连接。

| 运行 | 位置 | 结果 |
|------|------|------|
| 委托指定的定向测试：`plugin-reconciliation`、`agents`、`multi-agent`、`claude-catalog`、`agent-ui`、`i18n` | 工作区 `SKILL/assets/app` | 61/61 通过 |
| `compat-matrix`、`native-backend`、`launcher`、`backend-updates`（1 版行为与更新后端） | 工作区 | 105/105 通过 |
| 上述 6 个文件加 `native-backend`（变异基线） | `git archive fe66fa2` 的导出副本 | 68/68 通过 |
| `tsc --noEmit` | 导出副本 | 通过 |
| 实验 E1（只读检查与 `config.toml`，Git/本地 marketplace，1 版/2 版请求，含可管理对照组）；E2（计划绑定下外部同步后的手动检查与计划运行）；E1d（E1、E2 连同目录逐项比对） | 导出副本 | 见第 3 节与 5.1 节 |
| 实验 E3、E3b、E3c（只读检查插件与技能后的响应、两种快照、重新启用后的状态） | 导出副本 | 见第 4 节与 5.2 节 |
| 实验 E4（英、日渲染，生产翻译器，18 条） | 导出副本 | 无残留 |
| 变异实验 17 项（每项改动后运行上述 7 个测试文件，然后在副本中用 `git checkout` 恢复） | 导出副本 | 被发现 7 项（X01～X06、X09）。**未被发现 10 项**：X07 检查响应不置 `canApply` 为假、X08 不清 `update.available`、X10 右键“管理更新”、X11 详情标签条、X12 确认框标题、X13 附注嵌套槽、X14 Claude 确认框文案，以及沿用的 M11、M14、N08 |

原生界面构建记录 `assets/native/build.json` 中 51 个输入哈希、4 个产物哈希都与 HEAD 文件一致；`ui.html` 中包含新增的英文文案。作者报告的完整套件 383 项，本轮没有重跑，只运行了上表中的部分。

## 7. 观察（不计入问题）

1. 实施计划 `37` 的进度表仍写“P1 2 项、P2 13 项已在 `1343a5e` 修复，沙箱中完整套件 381 项通过”，没有登记第 2、3 轮复核与 `fe66fa2`；上一轮建议在阶段 3 的 UAT 说明中写明“移除或更新标有两侧标识的技能会同时影响 Claude”，也还没有写。建议在阶段 3 收尾时一并更新。
2. `markReadOnly` 把更新项置为不可应用、把操作记录置为不可恢复时没有给出原因。更新页中，只有只读期间检查过的插件在说明里带只读附注；操作记录的“恢复”按钮直接隐藏。“Agent 环境”页与对象卡片上有通用的只读原因，可以接受。
3. 多 Agent 快照中 Codex 只读时，技能详情“检查更新”按钮的提示仍是“仅对本应用追踪来源的独立技能提供更新”，原因不对。这来自 `1343a5e` 中 `markReadOnly` 把 `canUpdate` 置为假，不是本提交引入的。
4. 英文中，`available` 的内层句“Codex will reinstall it and restore its previous enabled state.”后面紧跟只读附注，前后略显矛盾，但附注已说明需先启用管理。
5. 只读状态在第一次多 Agent 快照或启用、停用操作之前不会写入（`discover` 才写默认值），`codexReadOnly()` 只读已存的状态。这是阶段 3 的既有设计，不在本提交范围内；0.11 界面打开时第一次快照就会写入。

## 8. 操作披露与结束状态

- 没有向 `127.0.0.1:4771` 发请求；没有读写或列出真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`；没有用真实 HOME 运行测试或实验；没有运行 `launchctl`；没有下载；没有执行真实的 Claude 或 Codex 命令行。实验中的 Codex 适配器与 Claude 命令行都是替身。
- 在沙箱外、以默认环境运行的辅助操作（均未访问上述位置）：
  - 常规 git 命令：`rev-parse`、`status`、`log`、`show`、`diff`、`archive`、`tag`；读取历史提交 `ab6856f`（0.10.2）中的界面源码作对照；在 scratchpad 的导出副本中执行 `git init`/`add`/`commit`/`checkout`，并为副本建立指向工作区 `node_modules` 的符号链接（只读使用）；
  - 用 `node -e` 核对 `build.json` 的哈希、汇总实验输出；用 `grep`、`sed` 读取仓库文件；用 `shasum` 计算事实源与 diff 的哈希；
  - 变异实验的调度脚本：只改导出副本，测试本身在沙箱中运行；
  - `ls` 查看 nvm 的 `bin` 目录；`ps` 查看进程命令行。
- 进程：本轮启动的测试与实验进程都已结束，没有遗留。以下 SkillDock 相关进程不是本轮启动的，未做任何处理：
  - 开始时：pid 65806、48439（0.10.2 原生入口 `assets/native/server.mjs`，父进程为 Codex 应用 pid 2850），pid 38415（`~/.local/share/skilldock/runtimes/…/server/index.mjs`）；
  - 结束时：48439 已退出；新出现 pid 63650（同为 0.10.2 原生入口，11:58:53 由 pid 2850 拉起，不是本会话的子进程）；65806、38415 仍在。另有若干 ChatGPT 应用自带的 `cua_node … ./server.mjs` 进程，与 SkillDock 无关。
- 实验材料在 `scratchpad/verify/phase3-review-r3/`（导出副本、`exp/` 下的脚本与输出、`run-*.out`、进程快照）。
- 结束时 HEAD 为 `fe66fa2`，工作区只多本报告（未提交）。
