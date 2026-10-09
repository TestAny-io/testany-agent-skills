# 代码评审报告：阶段 3（Agent 环境层与 Claude 只读清单）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 范围 | 阶段 3 首轮代码评审：`d599c8d`（3a）、`9256420`（3b）、`12af853` 与 `3620cf0`（3c）、`36cfc75` 与 `b7e6699`（3d）、`e560716`（计划文档） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-09 |
| 仓库 / 分支 | `testany-agent-skills`，`feature/skilldock-0.11-cross-agent`（本地） |
| Candidate | `e560716`（tree `7418d58e…`），基线 `3bb82dd`。`git diff 3bb82dd..e560716 -- plugins`：27 个文件，增 1805 行、删 144 行，diff sha256 前缀 `c688b3e0d3f1` |
| 事实源 | PRD `34`（sha256 `e061ec25…`）5.1、5.2、5.6、AC-001～003、附录 A；HLD `35` v1.16（`2bd0c5b9…`）3.1、3.2、3.4、3.6、3.7（第 701 行）、3.8、4.1～4.3、5.1、6.4、7.1、7.2；契约 `36c`（`980f6306…`）第 4～10 节；实施计划 `37`（`5d883612…`）阶段 3 与“进度”表 |
| 兼容基线 | 0.10.2 = `ab6856f`，0.10.3 = `337547a` |
| 工作区绑定 | 开始与结束时 HEAD 均为 `e560716`；开始时工作区干净，结束时只多本报告 |

## 2. 结论

**CHANGES_REQUESTED**

- P0：0
- P1：2
  - PH3-P1-01：Codex 设为只读后，手动“检查更新”仍会执行 `codex plugin marketplace upgrade`（带 mutation 标记，可能顺带更新已装插件），只读承诺被打破。
  - PH3-P1-02：Claude 配置根不存在、但命令行可用时，多 Agent 快照仍运行 `claude plugin list` 与 `marketplace list`。HLD 3.7 已记录“列表会创建配置”，违反 HLD 3.1“发现与读取一律不得创建任何 Agent 的根目录”。
- P2：13（PH3-P2-01～13，见第 5 节）
- 与 0.10.2、0.10.3 及 1 版客户端的兼容：未发现回退。不带 `multiAgent` 的快照逐字段不变，紧随多 Agent 快照之后读取也没有缓存污染；兼容矩阵 55/55 通过。
- 计划中挪到后续阶段的四项本身合理，不破坏安全中间状态；但还有一组未登记的挪动（PH3-P2-12）。破坏“只读是安全中间状态”的是两个 P1，不是这些挪动。
- 是否需要 Owner 决定：不需要。两个 P1 都可在 HLD 现有规则内修复。建议修复 P1 之后，Owner 再做阶段 3 的 UAT。

修复后只需对改动部分做 delta 复核。本结论不授予推送、合并或发布权限。

## 3. 逐项核查（按委托重点）

### 3.1 与 0.10.2、0.10.3 及 1 版客户端的兼容（36c §5、§9）

| 条目 | 实现 | 证据 | 判断 |
|------|------|------|------|
| 不带 `multiAgent` 的 `/api/state` 不变 | `index.mjs` 只在 `multiAgent === '1'` 时开启。`service.mjs:252-259` 只在开启时合并 Claude 对象并给出 `agents`。Codex 清单缓存经 `structuredClone` 返回，合并不会改写缓存 | 实验 E3：先取 1 版快照，再取多 Agent 快照（不强制刷新），再取 1 版快照，三者在技能、插件、市场与 `agents` 上一致；测试 `version-1 snapshots are unchanged` | 一致 |
| 不带 `agent` 的请求按 Codex 处理 | `validateAction` 只放开 `agent` 键并校验取值；各操作处理器不读 `agent` | 兼容矩阵 55/55 | 一致 |
| 放开 `agent` 的副作用 | 请求对象不会整体写入持久数据（`stageSource` 等只取各自字段）；`agent.*` 必须带 `agent`；`settings.*` 不要求带 | 代码核对 | 没有发现副作用。但 `agent: "claude"` 在非宿主写操作上会被静默按 Codex 执行，见 PH3-P2-06 |
| 1 版客户端收到的 `AGENT_READ_ONLY` | message 为“Codex 环境当前为只读，SkillDock 不会修改 Codex 中的技能和插件。请在 SkillDock 的“Agent 环境”页启用 Codex 管理后重试。”，HTTP 409。0.10.3 界面对 409 没有特殊处理，会原样显示 message | 测试断言 `/Agent 环境.*启用 Codex 管理/`。变异：删去该句会被测试发现（第 6 节） | 完整，可以独立理解，并说明了下一步 |
| 1 版的计划执行 | Codex 只读时，各目标记为 `skipped`，原因码 `AGENT_PAUSED`，不计入失败，不触发退避（`scheduler.mjs` 中 `retry` 只看 `error`） | 测试与变异 M09 | 一致 |
| 原生入口白名单（36c §9） | `native-backend.mjs`：`/api/state` 增加 `multiAgent`（只允许 `1`）；`/api/skill`、`/api/updates/progress`、`/api/plugin-icon` 增加 `agent`（只允许 `codex`、`claude`）；写请求原样转发 | 测试 `the native entry passes multiAgent=1 and agent=codex\|claude only` | 一致。原生界面构建记录 `assets/native/build.json` 的 50 个输入哈希与 HEAD 源码一致 |

### 3.2 发现、取锁与读取不得创建 Agent 根目录；Claude 根目录的保存（HLD 3.1，DEC-SDX-024）

- 发现过程（`agents.mjs:64-83`）只读取；取锁沿用阶段 1 的做法：Codex 根存在时才加 Codex 锁。实验 E7（只装 Codex 的世界）：经过多 Agent 快照、`agent.setManagement`、读取 `claude:` 技能详情之后，`~/.claude` 与 `state/agents/` 都没有出现。测试也断言了 Codex 根不被创建。
- **例外**：Claude 被判为“已安装”只需要命令行可用（`agents.mjs:69`）。此后 `claudeCatalog` 一律运行两条列表命令（`claude-catalog.mjs:190-201`），不检查配置根是否存在。见 PH3-P1-02。
- 首次发现即保存根目录：`installed.claude && !saved` 时写 `agents/claude-root.json`（测试与变异 M08 都覆盖了）。
- 会话目录不同不自动覆盖：启动器记录 `agents/claude-session-root.json`；`resolveClaudeRoot` 优先返回已保存的值；`environments()` 在两者不同时给出说明。测试覆盖。

### 3.3 Claude 读路径（HLD 3.2、3.4；36c §10）

| 条目 | 判断 |
|------|------|
| 设置文件只取 `enabledPlugins`、`skillOverrides`、`extraKnownMarketplaces` 三个键，其他键不进入返回值；出错信息只含文件路径与固定文字 | 一致（测试，变异会被发现）。另外，`known_marketplaces.json` 与命令行输出中的 marketplace 地址未脱敏，见 PH3-P2-09 |
| 主证据失败、输出形状未知、设置文件不可解析时，整个环境为“无法确认” | 列表失败、形状未知、JSON 无效、三个键的类型不对都会进入 `problems`（测试）。未知的可见性取值、读不出的托管追加目录不会，见 PH3-P2-04 |
| 首屏不调用联网命令 | 只运行 `plugin list --json` 与 `plugin marketplace list --json`，并带 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`、`DISABLE_AUTOUPDATER=1`。没有任何测试断言参数，加 `--available` 或换成 `marketplace update` 都不会被发现（M01、M12），见 PH3-P2-13 |
| 命令行运行环境 | `claudeCliEnvironment`：只传白名单变量，固定传 `CLAUDE_CONFIG_DIR`，缓存目录不是默认值时传 `CLAUDE_CODE_PLUGIN_CACHE_DIR`；工作目录是项目目录；剔除会话变量（测试，替身命令行记录了环境与 `pwd`） |
| 托管设置与 `@synced` 的保护 | `managed-settings.json` 与 `managed-settings.d/*.json` 按名称顺序合并，托管层决定的条目为 `locked`、`protection: managed`；`名称@synced` 为 `synced` 并锁定（测试） |
| 层级顺序 | `LAYERS = managed > local > project > user`，与 Claude 官方顺序一致；命令行参数一层按会话决定，不在文件中。文件推断与命令行实际值不一致时给出原因。local 与 project 互换、`overriddenBy` 忽略 local 层，测试都发现不了（M02、M14） |
| 可见性四档 | `on/off/name-only/user-invocable-only` 分别映射为 `enabled/disabled/name-only/user-invocable-only`，后两档的 `enabled` 为 `null`（测试）。按技能 frontmatter 中的名称取值，改成按目录名取值测试发现不了（M07） |
| 项目技能从项目目录向上到仓库根 | `projectSkillRoots` 遇到 `.git` 就停；没有仓库时只看项目目录本身；主目录作项目时不重复计入。越过仓库根继续向上，测试发现不了（M03） |
| 技能目录插件（`名称@skills-dir`） | 带 Claude manifest 的目录按插件处理，不当作技能（测试）。命令行列出它时，或用户与项目技能目录中有同名插件时，对象形态不对，见 PH3-P2-05 |

### 3.4 管理状态（HLD 3.6、6.4）

| 条目 | 判断 |
|------|------|
| 首次出现的默认值 | `defaultManagement`：装有 SkillDock 的一侧为已启用；Codex 只在 SkillDock 仅装在 Claude 中时为只读，开发副本保持已启用（MR-SDX-001）。默认值持久化在 `settings/agents.json`（测试） |
| 停用后计划目标暂停、不算失败 | Codex 一侧有测试覆盖。Claude 目标在这一版无法进入计划（启用计划时返回 `TARGET_NOT_READY`，手动执行时为 `TARGET_MISSING`） |
| 启用前的核验与读回 | 只检查命令行可用，不检查主证据，见 PH3-P2-01。读回只是重读 `agents.json`，删去读回步骤测试发现不了（M11） |
| 未安装但曾启用的环境 | 仍会列出，并带说明（测试）。但无法停用，界面上的“停用管理”按钮会报错，见 PH3-P2-02 |
| Codex 只读时拒绝哪些操作 | `HOST_WRITES` 拒绝 14 个改动宿主的操作；预览、标签、来源、计划、项目、设置类操作只改 SkillDock 自身数据，不受影响（没有误伤）。缺 `update.check`，见 PH3-P1-01。只读状态没有反映到快照的能力标记上，见 PH3-P2-03 |

### 3.5 统一视图（36c §6）

- 只合并独立技能：Codex 侧只看 `user/project` 作用域、没有 `pluginId`、按 SKILL.md 的真实路径合并；Claude 侧只有独立技能（测试，变异会被发现）。
- 共用对象取 Codex 的 ID 与顶层字段，顶层不出现 `visibility/enablement`；`perAgent` 两侧独立；顶层 `revision` 覆盖两侧（测试）。
- Claude 对象 ID：`claude:plugin:<id>:<scope>[:<项目路径摘要>]`、`claude:skill:<scope>:<目录摘要>`、`claude:marketplace:<name>`。项目目录在 `project-context` 中已取真实路径，ID 稳定。技能目录插件的 ID 见 PH3-P2-05。
- Claude 写操作：技能、插件、市场的 `canToggle/canRemove/canInstall/canRefresh/canUpdate` 均为假，并带原因（测试）；`HOST_WRITES` 内的操作带 `agent: "claude"` 时返回 `UNSUPPORTED_FOR_AGENT`。其他操作带 `agent: "claude"` 时不会被拒，而是按 Codex 执行，见 PH3-P2-06；给 Claude 对象设标签会失败，见 PH3-P2-07。

### 3.6 前端（HLD 4.1～4.3）

- 只有多于一个已安装的环境时才显示筛选与标识（`showsAgents`，测试覆盖）。
- 先读 `/api/health`，`apiVersion < 2` 时不发 `multiAgent`、不加 `agent`，并提示“服务版本较旧”。写请求一律补上 `agent: "codex"`（`App.tsx:538`）。这两点都没有测试（PH3-P2-13）；补的值不是对象实际所属的一侧（PH3-P2-06）。
- “Agent 环境”页：只读且已安装时提供“启用管理”，已启用时提供“停用管理”，两者都先弹确认框；无法确认时不提供按钮；Claude 根目录切换与 Node 设置不需要确认。问题见 PH3-P2-02、PH3-P2-11。
- 三语：新增界面文案 63 条中，除 `Node.js` 外都有英、日翻译。服务端新增模板都能被翻译器解析（`i18n.test.mjs` 通过）。嵌在模板里的中文片段没有翻译，见 PH3-P2-10。

## 4. P1

### PH3-P1-01 Codex 只读时，“检查更新”仍会改动 Codex 的 marketplace 与插件

- **位置**：`service.mjs:56-57`（`HOST_WRITES` 不含 `update.check`）；`service.mjs:1110-1121` 把 `update.check` 转成 `plugin.checkUpdate`；`service.mjs:418-427`（`preparePluginUpdate` 的 `refreshMarketplace` 默认为 `true`，对 Git marketplace 执行 `adapter.command(['plugin','marketplace','upgrade',…], { mutation: true })`）；`service.mjs:482-488`（“Codex 已在刷新市场时更新包”）。
- **依据**：36c §5 与 §8 的 `AGENT_READ_ONLY`；HLD 3.6；DEC-SDX-018。服务端自己的 message 也承诺“SkillDock 不会修改 Codex 中的技能和插件”。
- **复现（实验 E2）**：插件来自 Git marketplace，用 `agent.setManagement` 把 Codex 设为只读。此后 `marketplace.refresh` 返回 `AGENT_READ_ONLY`，但 1 版与 2 版的 `update.check` 都返回 `current`，替身适配器两次收到 `plugin marketplace upgrade fixture-market --json`（`mutation: true`）。后台计划会先判为暂停，不受影响；手动检查（0.11 更新页与 0.10.x 界面都能触发）会受影响。只读是“从 Claude 安装 SkillDock、本机另有 Codex”时 Codex 的默认状态。
- **建议**：Codex 只读时，插件的 `update.check` 二选一：要么以 `refreshMarketplace: false` 检查（只对比现有 marketplace 副本，并在结果中说明“未刷新来源”），要么返回 `AGENT_READ_ONLY`。补一条测试：只读状态下检查更新不调用任何 `mutation` 命令。同时按“是否会调用带 mutation 的宿主命令”把操作清单再核一遍，并写进 `HOST_WRITES` 的注释。

### PH3-P1-02 Claude 配置根不存在时仍运行列表命令，可能创建 Claude 的根目录

- **位置**：`agents.mjs:69`（只要命令行可用就判为已安装）；`service.mjs:254`（已安装就读取 Claude 清单）；`claude-catalog.mjs:190-201`（命令行可用就运行两条列表命令，不检查 `configDir` 是否存在）。
- **依据**：HLD 3.1“发现、取锁与读取一律不得创建任何 Agent 的根目录”。HLD 3.7（第 701 行）与 `claude-cli.mjs:97-100` 已记录：`claude plugin list` 在配置目录缺失时会创建配置，所以只能在根已存在时调用。
- **复现（实验 E10）**：`~/.claude` 不存在，替身命令行可用。多 Agent 快照依次调用了 `plugin list --json` 与 `plugin marketplace list --json`，替身记录到的 `CLAUDE_CONFIG_DIR` 当时都不存在（`existed=no`）。按 HLD 记录的宿主行为，真实命令行会在这里创建 Claude 配置。触发条件是命令行能被发现（PATH、桌面应用自带、会话记录）而配置根不存在，例如从未用过 Claude Code 的机器。
- **建议**：`claudeCatalog` 先检查 `configDir` 是否存在；不存在时不运行任何列表命令，返回空清单（没有配置根就不可能有插件、市场或个人技能），或标为“无法确认”并说明原因。两种做法都可以，但不能运行命令行。补一条测试：替身命令行在配置根缺失时不被调用。

## 5. P2（不阻断）

| ID | 问题 | 位置 / 依据 | 证据 | 建议 |
|----|------|-------------|------|------|
| PH3-P2-01 | 启用管理时不检查主证据：Claude 的插件列表失败（环境为“无法确认”）时，`agent.setManagement enabled` 仍然成功，返回“已启用 Claude 管理。”，并持久化为 `enabled` | `service.mjs:1063-1072`：调用 `agentLayer.effective(agent, found)` 时没有传入 `unconfirmed`，实际只检查了命令行。契约 36c 7.2 写明启用前“验证主证据可读…并读回”，主要错误含 `AGENT_UNCONFIRMED`；HLD 3.6、6.4 | E1：启用前后显示的状态都是 `unconfirmed`，但存储值变成了 `enabled`。界面只在“只读”状态显示启用按钮，所以只能经接口或在清单变化的间隙触发；这一版也没有 Claude 写操作，眼下没有实际影响 | 启用前取一次 Claude 清单（强制刷新），`unconfirmed` 非空时返回 `AGENT_UNCONFIRMED`。补测试。必须在阶段 4 开放写操作之前修复 |
| PH3-P2-02 | 曾启用、现已未安装的环境无法停用：卡片上显示“停用管理”，点击后返回 `AGENT_NOT_INSTALLED` | `service.mjs:1065` 不区分启用与停用；`AgentEnvironments.tsx:53` | E4 | 停用不要求已安装（契约只把 `AGENT_NOT_INSTALLED` 列为启用时的错误）；或者未安装时隐藏按钮。二者择一，并补测试 |
| PH3-P2-03 | Codex 只读没有反映到快照：多 Agent 快照中 Codex 对象的 `canToggle/canRemove` 仍为真、没有原因，界面上的开关可以点击，每次都返回 `AGENT_READ_ONLY` | 只读拒绝只在 `executeRequest` 中执行。PRD 5.1.4“写操作禁用并提示”；AC-001“未启用管理的环境中写操作不可用并说明原因” | E11 | 只在多 Agent 快照中，按 Codex 的管理状态把能力标记置为假，并给出原因（1 版快照不变）；或者在计划中明确挪到阶段 4 的能力对照 |
| PH3-P2-04 | 格式未知时没有降级为“无法确认”：(a) 无法识别的可见性取值只记一条诊断，技能仍显示为可见（`enabled: true`）；(b) `managed-settings.d` 读取失败（ENOENT 以外的错误）被静默忽略 | `claude-catalog.mjs:162-165`、`:59`；HLD 3.2“任一主证据不可得或格式未知时…整体为‘无法确认’”（可见性条目是主证据） | E5 | (a) 记入 `problems`，或把该技能的可见性记为未知并给出原因；(b) 只忽略 ENOENT，其他错误记入 `problems`。补测试 |
| PH3-P2-05 | 技能目录插件的身份：(a) 命令行列出 `名称@skills-dir` 时，对象走普通插件分支，缺 `installation.skillsDir`，ID 不按所在目录派生（`claude:plugin:sd@skills-dir:user`）；(b) 用户与项目技能目录中有同名插件时，按名称去重只留下一个 | `claude-catalog.mjs:205-252`，尤其是 `:244`；DEC-SDX-023（身份为“名称@skills-dir + 所在技能目录”）；36c `ClaudeInstallation.skillsDir`；HLD 3.3（同名遮蔽要能识别） | E9：未被列出时，只显示用户目录中的那个；被列出时，ID 与 `installation` 都没有目录信息 | 技能目录插件一律按目录派生；命令行条目只用来补启用状态（按名称与作用域匹配）；按目录去重，遮蔽留到阶段 4 处理，但不要丢掉对象 |
| PH3-P2-06 | `agent: "claude"` 被静默按 Codex 执行：`skill.previewInstall`、`plugin.previewInstall`、`skill.previewSource/connectSource`、`update.check` 等不在 `HOST_WRITES` 内，带 `agent: "claude"` 时按 Codex 执行。预览以 Codex 为目标，之后带 `agent: "codex"` 的安装成功装进 Codex。前端则对所有写请求一律补 `agent: "codex"`，而不是对象实际所属的一侧 | `service.mjs:1019-1025`；`App.tsx:538`；36c §6（创建类操作的 `agent` 指定作用的一侧；以预览为准的操作在两侧不一致时返回 `STALE_PREVIEW`）；7.3（来源记录写入请求所属一侧）；HLD 4.2 | E6：预览目标为 `~/.codex/skills/newskill`；`skill.install`（`agent: "claude"`）返回 `UNSUPPORTED_FOR_AGENT`，同一预览用 `agent: "codex"` 安装成功 | 这一版对任何带 `agent: "claude"` 的非全局操作（只读的除外）返回 `UNSUPPORTED_FOR_AGENT`；预览记录所属一侧。前端改为发送对象所属的一侧（共用对象发 `codex`） |
| PH3-P2-07 | 给 Claude 对象设标签失败：界面允许编辑，但 `tags.set` 在 1 版快照里找不到对象，返回 `NOT_FOUND`“未找到该对象，请刷新清单后重试。”。Claude 对象也不带标签，因为 `enrichTags` 在合并之前执行 | `service.mjs:639-642`、`:240` 与 `:255`；PRD 5.6（标签“提供”） | E8 | 这一版在界面上禁用 Claude 对象的标签编辑并说明原因；或者让 `tags.set` 按多 Agent 快照查找对象，并在合并后补标签。若选后者，须同时实现对象 ID 迁移（共用状态变化会改变 ID，见第 7 节） |
| PH3-P2-08 | Claude 插件的附带技能没有列出：详情页显示“附带技能（0）”，与实际数量不符；“管理更新”按钮可点，但更新页里没有这个对象 | `claude-catalog.mjs` 只给 `skillCount`；`App.tsx` 的 `PluginDetail`；AC-002“已安装插件（含技能）” | 代码核对 | 列出插件技能（只读），或者对 Claude 插件显示 `skillCount` 并隐藏“管理更新” |
| PH3-P2-09 | Claude marketplace 的地址原样返回：`source: String(item.repo \|\| item.url \|\| …)` 不经过 `publicSource`，地址中的用户名、密码与查询参数会进入快照（`/api/state` 只校验 Host/Origin） | `claude-catalog.mjs:265-266`；Codex 侧用 `files.mjs:112` 的 `publicSource`；36c §10“不返回任何凭证” | 代码核对 | 改用 `publicSource`，并补一条带凭证 URL 的测试 |
| PH3-P2-10 | 英、日界面残留中文：“Agent 环境”页的命令行错误（“未找到可用的 Codex CLI。”“未找到可用的 Claude 命令行。”），以及“无法确认”原因中的内部片段（“不是有效的 JSON”“…的输出形状未知”“claude … 失败：”）没有翻译 | `agents.mjs:89`；`service.mjs` 中 `codexCli` 的兜底文字；`claude-catalog.mjs:37-41、89-90、193、198`；HLD 4.3 | 渲染实验：en、ja 下都残留上述中文 | 补翻译条目，并把这些槽登记到 `messageSlots`；或者让 `problems` 只用可翻译的完整句子 |
| PH3-P2-11 | 确认框与提示的措辞超出这一版的能力：“启用后，SkillDock 可以…修改 Claude 中的技能、插件和 marketplace，并可以把它们加入后台更新计划”“启用后可更新插件与技能、加入后台计划。”，在这一版对 Claude 都不成立；PRD 5.1.3 还要求确认框写明“会写入哪些位置与影响范围” | `AgentEnvironments.tsx:30、43` | 代码核对 | 这一版对 Claude 说明“当前只读，启用后在后续版本生效”，或在 Claude 卡片上隐藏这句提示；确认框列出受影响的位置（配置根、技能根、项目设置） |
| PH3-P2-12 | 未登记的挪动：前端对每个写请求都补 `agent`，按 36c §6 它们都成了 2 版请求；但共用技能的 2 版写规则都没有实现：移走真实目录或更新时，`CONFIRMATION_REQUIRED` + `nativeRules`（AC-003“更新或移除前提示同时影响两侧”）；`expectedRevision`/`SNAPSHOT_STALE`；`SOURCE_CONFLICT`；跨侧影响提示。计划的“挪到后续阶段”只列了 4 项。另外，“Codex 的无法确认暂不计算”没有写目标阶段（Codex 未安装时目标暂停也随之未做） | `37` 进度表阶段 3 一行；`App.tsx:538`；36c §6、7.1 | 代码核对。移除共用技能时，确认框只有 0.10.2 的文字，不提 Claude；移除进可恢复区，可以恢复，与 0.10.2 的效果相同 | 在进度表中登记这些挪动与目标阶段（建议阶段 4），并在 HLD 或契约中注明，阶段 3 的 2 版请求在这些规则上暂时沿用 1 版语义 |
| PH3-P2-13 | 测试缺口：变异实验中 14 个变异有 10 个没有被发现（第 6 节）：命令行参数（`--available`、联网子命令）、local 与 project 的优先级、`overriddenBy`、仓库根截止、`HOST_WRITES` 中除 `skill.toggle` 外的条目、读回、按名称取可见性、只读环境卸载后是否列出；前端的接口版本判断与补 `agent` 也没有测试 | `tests/claude-catalog.test.mjs`、`agents.test.mjs`；前端没有对应用例 | 第 6 节 | 为上述行为补断言：替身命令行记录 argv 并断言只有两条列表命令；构造 local 与 project 冲突的场景；在仓库根之上放一个技能；对 `HOST_WRITES` 逐项断言；为 `App` 的请求构造补一个单元测试或浏览器用例 |

## 6. 测试与实验

全部在沙箱 `hermetic.sb` 中运行（禁止执行本机 Codex/Claude 命令行、禁止非本机外连）。环境为 `env -i`，`HOME` 与 `TMPDIR` 指向 `scratchpad/verify/phase3-review/`，并加载守卫（拒绝连接 4771 端口与非本机地址）。守卫日志为空，没有任何被拦截的连接。

| 运行 | 位置 | 结果 |
|------|------|------|
| 定向测试：`agents`、`claude-catalog`、`multi-agent`、`agent-ui`、`i18n`、`launcher`、`native-backend` | 工作区 `SKILL/assets/app` | 71/71 通过 |
| 兼容矩阵 `compat-matrix.test.mjs` | 工作区 | 55/55 通过 |
| 实验 E1～E11（临时世界、替身命令行、替身适配器） | `git archive e560716` 的导出副本 | 结论见第 3～5 节 |
| 英、日渲染实验（生产翻译器） | 导出副本中的临时测试文件，用后删除 | 见 PH3-P2-10 |
| 变异实验 14 项（每项改动后运行 5 个定向测试文件，然后 `git checkout` 恢复副本） | 导出副本 | 被发现 4 项：M08 根目录不保存、M09 暂停计入失败、M10 1 版快照带 `agents`、M13 Claude 对象可写。**未被发现 10 项**：M01 `--available`、M02 local/project 互换、M03 越过仓库根、M04/M05 从 `HOST_WRITES` 删除 `skill.remove`/`plugin.toggle`、M06 列出卸载后的只读环境、M07 按目录名取可见性、M11 去掉读回、M12 `marketplace update`、M14 `overriddenBy` 忽略 local |

作者在 `e560716` 上的完整套件为 372 项通过。本轮按委托只运行了定向测试与兼容矩阵。

## 7. 对计划中“挪到后续阶段”各项的判断

| 挪动 | 判断 |
|------|------|
| 对象 ID 迁移随阶段 4 实现 | 合理。核实过，Claude 对象这一版无法进入计划（`TARGET_NOT_READY`/`TARGET_MISSING`）、来源记录与标签（`NOT_FOUND`），没有需要迁移的记录；共用对象沿用 Codex ID。附带条件：若按 PH3-P2-07 的第二种做法开放 Claude 对象的标签，迁移必须同时实现 |
| Codex 的“无法确认”暂不计算 | 符合 MR-SDX-001，不破坏安全中间状态；但需写明目标阶段，或作为已知偏差登记（PH3-P2-12） |
| 一键更新另一侧 SkillDock 在阶段 5 | 合理。`agent.updateSkilldock` 返回 `UNSUPPORTED_FOR_AGENT` 并给出手动步骤；界面只在版本落后时显示手动步骤，不提供按钮 |
| 切换 Claude 根目录后刷新后台上下文，随阶段 5 | 合理。这一版没有 Claude 后台目标，旧的根目录记录不会被后台使用 |

这些挪动都不破坏“Claude 只读是安全中间状态”。破坏它的是 PH3-P1-01（只读的 Codex 仍会被改动）与 PH3-P1-02（读取可能创建 Claude 根目录）。

## 8. 观察（不计入问题）

- HLD 7.1 要求两侧并行扫描、Claude 两条列表并行；3.2 提到可以先展示文件证据再用命令行结果覆盖。目前两条列表串行执行（各自 20 秒超时），首屏要等它们完成。读取 `claude:` 技能详情也会触发一次完整的多 Agent 快照。建议在验证报告中记录首屏耗时。
- `settings.setClaudeRoot` 只检查目录是否存在，没有用命令行核验新目录（契约为这个操作列了 `AGENT_UNCONFIRMED`）。这一版可以接受。
- `agent.*`、`settings.*` 绕过 `executeRequest`：不检查 `APP_RESTARTING`，也不写操作记录。管理状态的变化目前不进操作记录，HLD 7.3 要求“每条写操作记录 Agent”，按是否算写操作再定。
- `discover()` 写入首次出现的默认值时不加锁。它与第一次 `agent.setManagement` 并发时，极小概率覆盖用户的选择。
- 测试模式下“Agent 环境”页显示“本机没有发现 Codex 或 Claude”，容易误解。
- 更新页的“上次的问题”会列出 `AGENT_PAUSED` 项。运行状态为成功，但列表仍把暂停的项当作问题显示。

## 9. 操作披露与结束状态

- 没有向 `127.0.0.1:4771` 发请求；没有读写或列出真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`；没有运行 `launchctl`；没有下载；没有执行真实的 Claude 或 Codex 命令行。没有启动界面测试实例。
- 测试与实验都在沙箱中、以临时 HOME 运行。有三类辅助操作在沙箱外、以默认环境运行，均未访问 HOME 下的上述位置：
  - 用 `node -e` 核对 `assets/native/build.json` 的输入哈希，并检查翻译表覆盖，只读仓库文件；
  - 变异实验的调度脚本：只改导出副本，并在副本中运行 `git checkout`，测试本身仍在沙箱中运行；
  - 常规 git 命令：`log`、`diff`、`show`、`archive`、`status`，以及在 scratchpad 导出副本中的 `git init`/`commit`。
- 为检查残留进程运行了 `ps`，只看进程命令行。用户自己的 SkillDock 进程都不是夹具，也不是本轮启动的，未做任何处理：
  - 开始时有 pid 19753、65806、83019（0.10.2 原生入口 `assets/native/server.mjs`）与 pid 38415（`~/.local/share/skilldock/runtimes/…/server/index.mjs`）；
  - 结束时 19753 已退出，新出现 pid 26843（同为 0.10.2 原生入口，11:08:06 由用户的 Codex 应用 pid 2850 拉起，不是本会话的子进程）。
  
  本轮启动的测试与实验进程都已结束，没有遗留。
- 结束时 HEAD 为 `e560716`，工作区只多本报告（未提交）。实验材料在 `scratchpad/verify/phase3-review/`。
