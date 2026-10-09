# 代码复核报告（第 2 轮，窄范围）：阶段 3 评审意见的修复（`1343a5e`、`3bddac7`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 上一轮 | [39-cross-agent-phase3-code-review.md](39-cross-agent-phase3-code-review.md)（CHANGES_REQUESTED：PH3-P1-01、PH3-P1-02，PH3-P2-01～13） |
| 范围 | 只看 `1343a5e`（修复）与 `3bddac7`（计划文档）的改动及其直接影响。`git diff 325b13e..3bddac7 -- plugins`：17 个文件，增 419 行、删 119 行，diff sha256 前缀 `9083d8b56f0e` |
| Candidate | `3bddac7`（tree `747b80f7…`），分支 `feature/skilldock-0.11-cross-agent`（本地） |
| 事实源 | 与上一轮相同且未改动：PRD `34`（sha256 `e061ec25…`）、HLD `35` v1.16（`2bd0c5b9…`）、契约 `36c`（`980f6306…`）；实施计划 `37` 现为 `0ae1e22d…`（本轮被审） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-09 |
| 工作区绑定 | 开始与结束时 HEAD 均为 `3bddac7`；开始时工作区干净，结束时只多本报告（未提交） |

## 2. 结论

**CHANGES_REQUESTED**

- P0：0
- P1：1（新）
  - PH3R2-P1-01：Codex 只读时，手动“检查更新”仍会改写 Codex 的 `config.toml`。修复只去掉了 `marketplace upgrade`，同一检查路径中按 SkillDock 记录的附带技能选择写配置的一步没有拦住（第 4 节）。因此 PH3-P1-01 只是部分关闭。
- P2：6（新，PH3R2-P2-01～06，见第 5 节），都不阻断
- 上一轮 15 项：关闭 9 项，部分关闭 6 项（PH3-P1-01、PH3-P2-03、07、08、11、13），未关闭 0 项（第 3 节）
- 1 版客户端（不带 `multiAgent`、不带 `agent`）：除 Codex 只读时检查结果的文字多了一句附注外，行为与改动前一致。兼容矩阵、原生入口、启动器测试共 87 项全部通过
- 计划中登记的挪动（共用技能的 2 版规则随阶段 4 实现）合理，没有破坏“Claude 只读是安全中间状态”。破坏 Codex 只读承诺的是 PH3R2-P1-01，不是这项挪动
- 是否需要 Owner 决定：不需要。PH3R2-P1-01 可在 HLD 与契约现有规则内修复

修复 PH3R2-P1-01 后，只需对改动部分做增量复核。本结论不授予推送、合并或发布权限。

## 3. 上一轮各项的判定

| ID | 判定 | 依据 |
|----|------|------|
| PH3-P1-01 | **部分关闭** | `marketplace upgrade` 已不再执行：只读时以 `refreshMarketplace: false` 检查（`service.mjs:1138-1144`），1 版与 2 版请求都覆盖，测试会在回退时失败（变异 N01、N14 被测试发现）。但同一检查仍会经 `writePluginSkills` 改写 `config.toml`，见 PH3R2-P1-01 |
| PH3-P1-02 | 关闭 | `claudeCatalog` 先检查配置根（`claude-catalog.mjs:197-211`），根不存在时不运行任何列表命令。实验 R2：多 Agent 快照、启用 Claude 管理、读取 Claude 项目技能详情三条路径，替身命令行均未被调用，`~/.claude` 未被创建。测试会在回退时失败（N02） |
| PH3-P2-01 | 关闭 | 启用前强制刷新读取一次 Claude 清单，列表失败时返回 `AGENT_UNCONFIRMED`，不写入（测试，N05）。配置根缺失时的情况见第 6 节观察 1 |
| PH3-P2-02 | 关闭 | 未安装但存有记录的环境可以停用；从未记录的仍返回 `AGENT_NOT_INSTALLED`（测试，N06） |
| PH3-P2-03 | **部分关闭** | 多 Agent 快照中，Codex 的技能、插件、市场已按只读置为不可写并给出原因，1 版快照不变（测试，N03）。更新页与操作记录中的写入口仍然可用，见 PH3R2-P2-01 |
| PH3-P2-04 | 关闭 | (a) 无法识别的可见性取值记入 `problems`，环境为“无法确认”，该技能 `enabled: null` 且不给 `visibility`；(b) 托管追加目录读取失败（ENOENT/ENOTDIR 以外）记入 `problems`（测试，N09、N10）。上一轮没有列出的同类情形见 PH3R2-P2-04 |
| PH3-P2-05 | 关闭 | 命令行列出的 `名称@skills-dir` 不再走普通插件分支；技能目录插件一律按所在目录派生 ID 与 `installation.skillsDir`，命令行只按名称与作用域补启用状态；用户与项目目录的同名插件都保留（测试，N11、N15） |
| PH3-P2-06 | 关闭 | 带 `agent: "claude"` 的请求，除 `AGENT_FLAG_ONLY` 中的全局、多目标操作外一律返回 `UNSUPPORTED_FOR_AGENT`（`service.mjs:1026-1032`）。前端改为发送对象所属的一侧（`agent-requests.ts`）。测试覆盖服务端与前端（N04、N12） |
| PH3-P2-07 | **部分关闭** | 技能卡片、插件卡片与右键菜单已对不含 Codex 的对象禁用标签编辑；服务端对 `agent: "claude"` 的 `tags.set` 返回 `UNSUPPORTED_FOR_AGENT`，不再是令人困惑的 `NOT_FOUND`。但技能详情面板的标签条没有禁用（`App.tsx:1725`），见 PH3R2-P2-05。界面改动没有测试（N18） |
| PH3-P2-08 | **部分关闭** | 详情页改为显示 `skillCount` 与说明，并隐藏“管理更新”。右键菜单仍对 Claude 对象提供“管理更新”，见 PH3R2-P2-05 |
| PH3-P2-09 | 关闭 | marketplace 地址经 `publicSource`，去掉用户名、密码与查询参数（测试，N07） |
| PH3-P2-10 | 关闭 | 原因与问题都改为完整句子，并补了英、日翻译；外层模板登记在 `messageSlots`，嵌套翻译正确。实验 R3：27 条相关服务端文字（新增或改写的原因、问题、附注、错误与结果）在英、日界面都没有残留中文，只有 `AGENT_READ_ONLY` 的 message 例外，它经错误码由 `errors.json` 翻译，原文放在“原始信息”中，符合设计。嵌套槽没有回归测试（N08） |
| PH3-P2-11 | **部分关闭** | Claude 的确认框与提示已改为“这一版只读取，启用后在后续版本生效”，并列出受影响的位置。但这些位置显示在标题“受影响的技能（N）”下，见 PH3R2-P2-03 |
| PH3-P2-12 | 关闭 | `37` 进度表登记了共用技能 2 版规则的挪动（目标阶段 4，此前沿用 1 版语义），并给“Codex 无法确认”与“Codex 未安装时目标暂停”写明阶段 4。没有在 HLD 或契约中加注；契约描述的是 0.11.0 的发布目标，阶段性偏差记在实施计划中可以接受 |
| PH3-P2-13 | **部分关闭** | 上一轮未被发现的 10 个变异中，有 8 个现在会被测试发现（M01～M07、M12）；前端的接口版本判断与请求侧别也有了测试。M11（去掉读回）与 M14（`overriddenBy` 忽略 local）仍不会被发现，本轮新修复中也有几处没有测试，见 PH3R2-P2-06 |

## 4. P1

### PH3R2-P1-01 Codex 只读时，“检查更新”仍可能改写 Codex 的 `config.toml`

- **位置**：`service.mjs:497-505`（`preparePluginUpdate`：插件有 `registry.pluginSkillPreferences[id]` 时，检查也调用 `writePluginSkills`）；`service.mjs:537-558`（`writePluginSkills` → `toggleSkillConfigs(env.config, …)`）；`config.mjs:78-83`、`:85` 起（某个技能在 `config.toml` 中没有 `[[skills.config]]` 条目时追加条目并原子写回）。同一函数还经 `scheduler.reconcileBinding` → `verifySynchronized`（`service.mjs:1136`、`:1202-1209`）在手动检查中被调用。`keepCodex`（`:1139`）只传了 `refreshMarketplace: false`，没有拦这一步。`HOST_WRITES` 的注释写着“a plugin update check is kept read-only separately”，与实际不符。
- **依据**：36c §5 与 §8 的 `AGENT_READ_ONLY`、HLD 3.6、DEC-SDX-018。服务端对只读的承诺是“SkillDock 不会修改 Codex 中的技能和插件”；修复提交自己的测试也断言只读检查后 `config.toml` 不变（只是夹具中没有附带技能的选择记录）。
- **复现（实验 R1，导出副本，沙箱）**：插件来自 Git marketplace，注册表中有该插件的附带技能选择记录（`skills/example/SKILL.md: false`），`config.toml` 中没有对应条目。用 `agent.setManagement` 把 Codex 设为只读后执行 `update.check`（`agent: "codex"`）：结果为 `current`，附注“Codex 为只读，这次检查没有刷新来源”，没有执行任何 Codex 命令；但 `config.toml` 被追加了 `[[skills.config]] path = "…/example/2.4.1/skills/example/SKILL.md" enabled = false`，SkillDock 的配置备份区多了一份备份，即该插件的技能在 Codex 中被停用。本地 marketplace 的插件结果相同。Codex 可管理时也是这样写（这是 0.10.2 的既有行为，用于在外部同步后恢复用户的选择），问题只在只读时。
- **触发条件**：只要在 SkillDock 中给插件选过附带技能，就会留下选择记录（`plugin.install`/`plugin.installSource` 带 `enabledSkills`，或在 SkillDock 中启停过插件附带的技能，`:737-739`）。此后，`config.toml` 中只要缺少某个附带技能的条目，就会被追加。常见的情形是 Codex 自行把插件更新到新版本目录（条目路径含版本号），也包括用户手工删掉了条目。只读状态来自用户在“Agent 环境”页停用 Codex 管理，或“SkillDock 只装在 Claude 中”时的默认值；注册表与 0.10.x 共用，旧的选择记录会一直保留。后台计划会先判为暂停，所以只有手动检查（0.11 更新页与 0.10.x 界面）会触发。
- **建议**：在 `preparePluginUpdate` 内部按 Codex 是否只读决定（只在 `local` 模式下，这样所有调用方都受约束，包括 `verifySynchronized`）：只读时既不刷新来源，也不调用 `writePluginSkills`，不改动 `pluginSkillPreferences`。必要时在附注中说明“未按 SkillDock 记录的选择调整附带技能”。补一条测试：只读、有选择记录、`config.toml` 缺条目时检查，文件逐字节不变，备份区不新增。同时把 `HOST_WRITES` 的注释改为如实描述。

## 5. 新 P2（不阻断）

| ID | 问题 | 位置 / 依据 | 证据 | 建议 |
|----|------|-------------|------|------|
| PH3R2-P2-01 | Codex 只读时，更新页与操作记录的写入口仍然可用：检查得到 `available` 后，多 Agent 快照中的更新项仍为 `canApply: true`、`canAutoApply: true` 并带 `previewId`，点“应用”返回 `AGENT_READ_ONLY`。操作记录的“恢复”同理。`markReadOnly` 只处理技能、插件与市场，不处理 `updates`、`activity` | `multi-agent.mjs:50-60`；`service.mjs:247`（更新项在标记之前生成）；PRD 5.1.4，AC-001 | 实验 R4 | 只在多 Agent 快照中，对 Codex 的更新项置 `canApply/canAutoApply` 为假并给出原因，对可恢复的操作记录给出不可恢复的原因；或者在计划中登记到阶段 4 的能力对照 |
| PH3R2-P2-02 | 只读检查的附注不总是准确：本地 marketplace 本来就不刷新（可管理时也一样），附注仍说“这次检查没有刷新来源，结果以本机现有的 marketplace 副本为准”，暗示结果可能过时；结果为 `available` 时，前半句仍是“通过 Codex 重新安装并恢复原启用状态”，而只读时无法应用 | `service.mjs:1141-1144`；`:432` 的刷新条件 | 实验 R4：本地 marketplace 下检查结果为 `available`，并带上述两句 | 只在确实跳过了刷新时（Git 或单插件来源，且 `canRefresh`）追加附注；`available` 时说明需先启用 Codex 管理才能应用 |
| PH3R2-P2-03 | 启用确认框列出的是“位置”，却显示在标题“受影响的技能（4）”下（英文为“Affected skills (4)”）。另外，同一个框里说“这不会改动 Claude 自身的设置”，下面却列出 `.claude/settings.json` 与 `settings.local.json`，两处措辞互相矛盾 | `AgentEnvironments.tsx:29-36`；`App.tsx:2024-2033`；PRD 5.1.3（写明会写入哪些位置） | 代码核对 | 给 `ConfirmSpec` 增加列表标题（例如“会写入的位置”），或单独渲染；把“自身的设置”改为更准确的说法（例如“不改动 Claude 的其他设置项”） |
| PH3R2-P2-04 | Claude 技能根不可读（例如 `~/.claude/skills` 无权限）时，环境仍为已确认，技能显示 0 个，只多一条诊断“`<路径>：EACCES`”。这条诊断不是完整句子，也无法翻译 | `claude-catalog.mjs:157`；HLD 3.2“任一主证据不可得…整体为‘无法确认’”（技能的 `statusEvidence` 正是技能目录） | 实验 R5 | ENOENT/ENOTDIR 以外的读取错误记入 `problems`，并写成完整句子（与设置文件的写法一致）。单个技能的元数据读取失败可以继续只记诊断 |
| PH3R2-P2-05 | Claude 对象仍有两个可点的入口：(a) 右键菜单对 Claude 技能与插件仍提供“管理更新”，跳到更新页后找不到该对象（PH3-P2-08 的残留）；(b) 技能详情面板的标签条仍为 `disabled={!!busy}`，对 Claude 技能可以打开标签对话框，保存时返回 `UNSUPPORTED_FOR_AGENT`（PH3-P2-07 的残留） | `App.tsx:711`、`:1725` | 代码核对 | 两处都按 `objectAgents(item).includes("codex")` 判断，与卡片、详情页的其他入口一致 |
| PH3R2-P2-06 | 测试缺口：M11（去掉启用后的读回）、M14（`overriddenBy` 只看 user 层）仍不会被发现。M14 的原因是夹具的 user 层对 `b@m` 也给出不同的值，测试分不出 project 层是否参与判断。本轮新修复中，`messageSlots` 的嵌套槽（N08）、Claude 确认框文案（N16）、详情页隐藏“管理更新”（N17）、Claude 对象禁用标签（N18）都没有测试 | `tests/claude-catalog.test.mjs`、`agents.test.mjs`、`agent-ui.test.mjs`、`i18n.test.mjs` | 第 7 节变异结果 | 为 M14 构造只有 project 层与 local 层冲突的条目；用替身让读回不一致，断言 `READBACK_FAILED`；在 `i18n.test.mjs` 中断言嵌套原因的英、日译文；用 `agent-ui.test.mjs` 的渲染方式覆盖确认框与 `requestAgent` 以外的界面改动 |

## 6. 按委托重点的核查

### 6.1 Codex 只读时的宿主改动（重点 1）

逐一核对了 `service.mjs` 中所有 `adapter.command(…, { mutation: true })`、`toggleConfig`/`toggleSkillConfigs`、文件移动与删除的调用点：

| 调用点 | 所属操作 | 只读时 |
|--------|----------|--------|
| `:434` `marketplace upgrade` | `plugin.checkUpdate`（只能经 `update.check` 进入）、`verifySynchronized` | 已跳过（`keepCodex`；`verifySynchronized` 本来就用 `refreshMarketplace: false`） |
| `:433`、`:922` `refreshDirectSource`（移动 SkillDock 自管的单插件来源目录） | 同上；`marketplace.refresh` | 检查时已跳过；`marketplace.refresh` 在 `HOST_WRITES` 中 |
| `:504` `writePluginSkills` → 改写 `config.toml` | `plugin.checkUpdate`、`verifySynchronized` | **未拦住**，见 PH3R2-P1-01 |
| `:624`、`:628`、`:631` | `plugin.installSource` | 拒绝（`HOST_WRITES`） |
| `:672`、`:684`、`:686` | `plugin.update`（只能经 `update.apply` 进入） | 拒绝 |
| `:736`、`:741` | `skill.toggle` | 拒绝 |
| `:831` | `plugin.toggle` | 拒绝 |
| `:849`、`:865`、`:893` | `plugin.install`、`plugin.remove` | 拒绝 |
| `:912` | `marketplace.add` | 拒绝 |
| `:933` | `marketplace.refresh`、`marketplace.remove` | 拒绝 |
| `:724`、`:763-764`、`:771`、`:788`、`:815-820`；`:338` 建技能根 | `skill.install`、`skill.update`、`skill.remove`、`skill.removeSelected`、`activity.restore` | 拒绝 |

其余不在 `HOST_WRITES` 中的操作（各类预览、`skill.checkUpdate`、`skill.connectSource`、`tags.set`、`preview.diff`、`project.*`、`schedule.configure`、`updates.run`）只写 SkillDock 自己的暂存区、注册表或计划；`updates.run` 中的 Codex 目标会先判为暂停。`plugin.connectionStatus` 调用 Codex app-server 的 `app/list`（`forceRefetch`），不带 mutation 标记；它是否会让 Codex 改写自己的缓存，本轮不能运行真实 Codex，未核实。

不刷新来源时的检查结果可信度：结果反映的是本机现有的 marketplace 副本（Git marketplace 的本机克隆、SkillDock 自管的单插件来源）。`current` 可能比远端旧，`available` 则说明副本中确有新版本，附注已说明这一点。不准确的情形见 PH3R2-P2-02。检查本身仍会更新 SkillDock 的 `pluginBaselines` 与计划中的观察记录，属于 SkillDock 自己的数据。

### 6.2 Claude 读路径与“无法确认”（重点 2）

- 配置根缺失时不运行任何列表命令（实验 R2）。发现阶段的 `claude --version` 探测是阶段 2 的既有行为，不在本轮改动之内；HLD 3.7 记录的“会创建配置”只针对列表命令。
- “无法确认”的来源：设置文件不可读、不是 JSON、格式未知、三个键的类型不对；托管追加目录不可读；可见性取值无法识别；两条列表失败、输出无法解析或形状未知。原因取第一条问题，其余进入诊断，都是完整句子。仍未降级的情形：技能根不可读（PH3R2-P2-04）。`known_marketplaces.json` 损坏时，自动更新的显示静默回落为默认值（观察 5）。
- 翻译器：外层“无法确认 Claude 中的插件状态：{v0}”与检查附注“{v0} Codex 为只读，…”都登记在 `messageSlots` 中，内层再按模板翻译。模板按固定文字长度排序，没有出现错配。实验 R3 中英、日结果都正确（含路径中的空格、命令行原始错误）。命令行原始错误（如 `Command failed: …`）原样保留，属于外部信息。

### 6.3 `AGENT_FLAG_ONLY` 与前端的侧别判断（重点 3）

- `AGENT_FLAG_ONLY` = `schedule.configure`、`updates.run`、`skill.previewRemoval`、`skill.removeSelected`、`project.select`、`project.chooseDirectory`，再加上在 `action()` 中提前分流、不经过 `assertAgentWritable` 的 `settings.*`，与 36c §6“2 版请求的判定”的封闭列举一致。这些操作的顶层 `agent` 不触发 `UNSUPPORTED_FOR_AGENT`。`skill.removeSelected` 在 Codex 只读时仍返回 `AGENT_READ_ONLY`，依据是目标（这一版只能是 Codex 对象）所属一侧，而不是顶层 `agent`，与契约一致。
- 与契约的差别（这一版可以接受，阶段 4 须改）：创建类操作带 `agent: "claude"` 时，契约要求按该侧返回 `AGENT_NOT_INSTALLED/READ_ONLY/UNCONFIRMED`；以预览为准的操作，契约要求侧别不一致时返回 `STALE_PREVIEW`。这一版两者都统一返回 `UNSUPPORTED_FOR_AGENT`。
- 前端 `requestAgent`：请求自带 `agent` 时直接使用；否则按 `id` 或 `target.id` 在快照中找对象，共用对象与找不到的对象都取 `codex`，只属于 Claude 的对象取 `claude`。全局与多目标操作、`activity.restore`（`id` 是操作记录 ID）、`settings.*` 都落到 `codex`。`action()` 是每次渲染新建的普通函数，用的快照不会过期。`stateUrl` 只在 `apiVersion ≥ 2` 时带 `multiAgent=1`。两者都有测试。

### 6.4 1 版客户端（重点 4）

- 不带 `agent` 时，`assertAgentWritable` 的判定顺序与改动前相同；`markReadOnly` 只在多 Agent 快照中执行，1 版快照的 `canToggle` 仍为真（测试）；Claude 读路径、`agent.*`、`settings.*` 都不出现在 1 版路径上。兼容矩阵 55 项与原生入口、启动器测试一并通过（共 87 项）。
- 唯一可见的差别：Codex 只读时，1 版的插件检查不再刷新来源，结果 `message` 多了一句中文附注。0.10.x 的英、日界面认不出拼接后的文字，会原样显示中文（观察 2）。只读本身就是契约第 5 节列出的例外状态，可以接受。

### 6.5 计划中登记的挪动（重点 5）

- 挪到阶段 4 的内容：共用技能在 2 版请求下的确认（`CONFIRMATION_REQUIRED` + `nativeRules`，AC-003）、`expectedRevision`/`SNAPSHOT_STALE`、`SOURCE_CONFLICT`、跨侧影响提示；在此之前，这类请求沿用 1 版语义。理由成立：这些规则多数要等 Claude 侧写操作出现才有意义，而且需要与对象 ID 迁移一起设计。
- 是否破坏“Claude 只读是安全中间状态”：没有。这一版对 Claude 对象的写请求一律被拒绝。经 Codex 一侧移除或更新共用技能时，若真实目录也被 Claude 使用，Claude 会随之受影响，但效果与 0.10.2 相同（移除进可恢复区，可从操作记录恢复）。这是挪动接受的过渡风险。建议在阶段 3 的 UAT 说明中写明“移除或更新标有两侧标识的技能，同时影响 Claude，目前不另行提示”，以免验收时误判。
- 进度表写着“P1 2 项、P2 13 项已在 `1343a5e` 修复”。PH3R2-P1-01 修复后，请同步改正这句。

## 7. 测试与实验

全部测试与实验都在沙箱 `hermetic.sb` 中运行（禁止执行本机 Codex/Claude 命令行，禁止非本机外连）。环境为 `env -i`，`HOME` 与 `TMPDIR` 指向 `scratchpad/verify/phase3-review-r2/`，并加载守卫，拒绝连接 4771 端口与非本机地址。守卫日志为空，没有任何被拦截的连接。沙箱的 PATH 中没有 `claude`；`codex` 位于被禁止执行的路径中。

| 运行 | 位置 | 结果 |
|------|------|------|
| 委托指定的定向测试：`agents`、`claude-catalog`、`multi-agent`、`agent-ui`、`i18n`、`plugin-reconciliation` | 工作区 `SKILL/assets/app` | 59/59 通过 |
| `compat-matrix`、`native-backend`、`launcher` | 工作区 | 87/87 通过 |
| 上述 6 个文件加 `native-backend`（变异基线） | `git archive 3bddac7` 的导出副本 | 66/66 通过 |
| 实验 R1（只读检查改写 `config.toml`）、R2（无配置根时各读路径）、R4（只读时的更新项与应用）、R5（技能根不可读、市场记录损坏） | 导出副本 | 结论见第 3～6 节 |
| 实验 R3：英、日渲染（生产翻译器，27 条相关服务端文字） | 导出副本 | 见 PH3-P2-10 |
| 变异实验 32 项（每项改动后运行上述 7 个测试文件，然后在副本中用 `git checkout` 恢复） | 导出副本 | 被发现 26 项。**未被发现 6 项**：M11 去掉读回、M14 `overriddenBy` 只看 user 层、N08 去掉嵌套槽登记、N16 Claude 确认框恢复为承诺写入、N17 详情页恢复“管理更新”、N18 Claude 对象可设标签 |

原生界面构建记录 `assets/native/build.json` 中 51 个输入哈希、4 个产物哈希都与 HEAD 文件一致；`ui.html` 中包含新增的英文文案。作者报告的完整套件 381 项，本轮没有重跑，只运行了上表中的部分。

## 8. 观察（不计入问题）

1. 配置根不存在、命令行可用时，启用 Claude 管理会成功：没有运行列表，空清单被当作已确认（实验 R2）。这一版没有 Claude 写操作，没有影响。阶段 4 开放写操作前，应决定启用时是否要求配置根存在。
2. 0.10.x 的英、日界面中，Codex 只读时的检查结果会以中文显示（见 6.4）。
3. 命令行不可用时，`problems` 的第一条既不进原因也不进诊断，其余进诊断。改动前是全部丢弃，算不上回退，但不一致。
4. 命令行列出、但 SkillDock 扫描的目录中找不到的 `名称@skills-dir`，会被静默丢弃，没有诊断。
5. `known_marketplaces.json` 无法解析时，Claude marketplace 的自动更新状态静默回落为默认值，并标为 `isDefault: true`（实验 R5）。
6. Claude 对象的标签按钮被禁用后仍显示“添加标签”，没有单独的原因；卡片上有通用的只读原因。
7. `markReadOnly` 会用 Codex 只读的原因覆盖对象原有的原因（例如系统技能的保护说明），重新启用后恢复。

## 9. 操作披露与结束状态

- 没有向 `127.0.0.1:4771` 发请求；没有读写或列出真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`；没有用真实 HOME 运行测试或实验；没有运行 `launchctl`；没有下载；没有执行真实的 Claude 或 Codex 命令行。实验中的“Claude 命令行”是写在临时目录中的替身脚本。
- 在沙箱外、以默认环境运行的辅助操作（均未访问上述位置）：
  - 常规 git 命令：`rev-parse`、`status`、`log`、`show`、`diff`、`archive`；在 scratchpad 的导出副本中执行 `git init`/`add`/`commit`/`checkout`，并为副本建立指向工作区 `node_modules` 的符号链接（只读使用）；
  - 用 `node -e` 核对 `build.json` 的哈希、汇总实验输出，以及用 `grep` 检查翻译表与 `ui.html`，只读仓库文件与 scratchpad；
  - 变异实验的调度脚本：只改导出副本，测试本身在沙箱中运行；
  - `ls` 查看 nvm 的 `bin` 目录与几个系统路径中是否有 `claude`/`codex`；`ps` 查看进程命令行。
- 进程：本轮启动的测试与实验进程都已结束，没有遗留。以下 SkillDock 相关进程不是本轮启动的，未做任何处理：
  - 开始时：pid 30478、65806、83019（0.10.2 原生入口 `assets/native/server.mjs`，父进程为用户的 Codex 应用 pid 2850），pid 38415（`~/.local/share/skilldock/runtimes/…/server/index.mjs`）；
  - 结束时：30478、83019 已退出；新出现 pid 47451（同为 0.10.2 原生入口，11:38:12 由 Codex 应用 pid 2850 拉起，不是本会话的子进程）；65806、38415 仍在。
- 实验材料在 `scratchpad/verify/phase3-review-r2/`（导出副本、`exp/` 下的脚本与输出、`run-*.out`）。
- 结束时 HEAD 为 `3bddac7`，工作区只多本报告（未提交）。
