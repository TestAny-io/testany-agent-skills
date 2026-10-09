# 代码评审报告：阶段 4b1（Claude 技能可见性）与 4b2（Claude 技能文件事务）（`7346b69`、`89eab4f`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 范围 | `git diff 95fdb7a..89eab4f`：20 个文件，增 846 行、删 157 行，diff sha256 前缀 `5d8e4f21896f`。其中 4b1（`95fdb7a..7346b69`）15 个文件 +350/−38，4b2（`7346b69..89eab4f`）14 个文件 +505/−128。父提交 `95fdb7a`（阶段 4a）不在本次范围内，由 [42](42-cross-agent-phase4a-code-review.md) 评审 |
| Candidate | `89eab4f`（tree `ad5b8eaab773…`），中间提交 `7346b69`（tree `0bb9a52b05c6…`），分支 `feature/skilldock-0.11-cross-agent`（本地） |
| 事实源 | PRD `34`（sha256 `e061ec25…`，未改）；HLD `35` v1.17（`f5da9131…`，本范围改 3.4 与有限修订表）；契约索引 `36` 0.15（`73d5a32b…`）与分册 `36c` 0.14（`82fd5a64…`，本范围改 7.1）；实施计划 `37`（`e683bcb3…`，本范围改进度表）；`41` 界面待重新设计清单（`b663290f…`，未改） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-09 |
| 工作区绑定 | 开始时主工作区 HEAD 为 `89eab4f`。评审期间，主工作区出现了新提交 `e1d5603`（阶段 4a 评审意见的修复，16:11），不是本会话所为。本报告的全部测试与实验都在 `git archive 89eab4f` 的导出副本中进行，结论绑定 `89eab4f`。按差异阅读，`e1d5603` 没有改动本报告 P2-01～P2-03 所在的代码（`skill.toggle` 的确认顺序、`preview.diff`、`claudeSkillAction`），这些问题在 `e1d5603` 上应仍然存在，但没有在 `e1d5603` 上重新运行 |

## 2. 结论

**APPROVED**（带 P2）

- P0：0
- P1：0
- P2：4（PH4B-P2-01～04，见第 4 节）。不阻断后续开发；建议在开始 4c 之前、4b 交给 Owner 试用之前修复 P2-01～P2-03（改动都很小），P2-04 的测试随这次修复一起补
- P3：9（PH4B-P3-01～09）
- 委托重点的总体判定（详见第 3 节）：
  - 4b1 的结构化补丁满足“只改一项、写前再核对摘要、同目录临时文件原子替换、穿过链接写到目标、撤销只记旧值且不进快照”，异常输入都被拒绝。剩余的是细节（P3-01、P3-02）。
  - 4b1 的写入层选择符合 HLD 3.4 与 v1.17 修订，与 Claude 的优先级（托管 > 本地 > 项目 > 用户）一致；托管锁定、读回、`gitExclude` 都按预期工作。**问题是确认的顺序**：技能当前为中间两档、请求又指定写项目共享设置时，用户只会看到“中间档会被取消”的确认，确认后就直接写入共享设置，从未出现“会改动协作者共享的设置”的说明（P2-01）。
  - 4b2 的预览按一侧隔离（两个方向都返回 `STALE_PREVIEW`）；恢复按操作记录的一侧处理并检查该侧管理状态；回滚与错误记录正确；与 Codex 流程的忙碌标志、操作记录、来源记录互不干扰。但有两处功能缺陷：同一个预览隔离也挡住了 Claude 更新预览的**文件差异查看**（P2-02）；来源记录按真实目录做键，指向同一目录的链接被移除时，会删掉目标技能的来源记录，恢复这次移除又会把较旧的记录写回（P2-03）。
  - 边界核验大体与 Codex 路径同等，个别处较宽（技能根不在启动时固定、受保护根不含 Claude 的插件目录、可移除上级目录的项目技能），见 P3-04、P3-06。
  - 前端：两侧都启用管理时，安装对话框正确带上 `agent` 与 `scope`，Codex 的安装流程没有回归；只有 Claude 启用管理时直接装到 Claude 个人目录，不给位置选择（P3-07）。
  - 测试：变异实验 40 项中 18 项未被发现，主要是 Claude 文件事务中复制出来的保护（P2-04）。
- 是否需要 Owner 决定：不需要。P3-04 中“移除、更新是否包括上级目录的项目技能”需要实现者在文档中写明取舍。

本结论不授予推送、合并或发布权限。

## 3. 按委托重点的核查

### 3.1 4b1 `server/claude-settings.mjs`

| 项 | 判定 | 依据 |
|----|------|------|
| 只改一项、保留其他键 | 成立（语义上） | `:37-41` 只替换 `section[key]`；E1 中其他键都保留，原有的自有 `__proto__` 键原样写回，没有污染原型。**但整份文件经 `JSON.parse`/`JSON.stringify` 重写**：紧凑的数组与对象被展开、`é` 写成字面字符、`1.0` 写成 `1`、超过 2^53 的整数丢精度（`12345678901234567890` → `12345678901234567000`）、重复键只留最后一个、整数形的键被移到最前（P3-01） |
| 保留缩进与结尾换行 | 成立 | `:44-45`；四个空格、制表符都保留（测试与 E1）；没有缩进的单行文件改为两个空格 |
| 写前摘要核对的窗口 | 成立，窗口偏晚开始 | `:30` 第一次读取与 `:54-56` 第二次核对之间被检测（文件被改、被删、被新建都返回 `SNAPSHOT_STALE`，E1-l）。但 `skill.toggle` 的决定（写哪一层、要不要确认中间档）依据的是更早读取的 `state`，`state` 读取与补丁第一次读取之间的改动不会被发现（P3-02） |
| 原子替换：同目录临时文件 | 成立 | `:49-50`，`flag: 'wx'` |
| 权限 | 基本成立 | `:48` 取原文件权限，0600 保持 0600；但写临时文件受 umask 影响，0664 变为 0644（E1-h，P3-01） |
| 穿过链接写到目标 | 成立，悬空链接例外 | `:29`；绝对与相对链接都保留（测试、E1-i2）。目标不存在的悬空链接被替换为普通文件（E1-i）；硬链接的另一个名字仍是旧内容（E1-j）（P3-01） |
| 失败时清理临时文件 | 部分成立 | 核对失败、改名失败时清理（`:58`，测试）；但 `:50` 写临时文件本身失败（例如磁盘满）时文件已建、不在 `try` 内，残留 `.settings.json.skilldock-<uuid>.tmp`（E1-k，P3-01） |
| 撤销只记旧值且不进快照 | 成立 | `restore` 只含文件、键与旧值（`claude-actions.mjs:101`），从返回体中剔除（`:207`），只进操作记录；快照中的操作记录没有 `restore`（测试）。目前没有任何操作使用它（`canRestore` 恒为假），见 P3-08 |
| 异常输入 | 成立 | 顶层为数组、`null`、字符串、数字、带 BOM：`SETTINGS_FORMAT`；`skillOverrides` 为数组、字符串、`null`：`SETTINGS_FORMAT`；键为 `__proto__`、`prototype`、`constructor`、含控制字符、超过 200 字符：`INVALID_SETTING`（E1-d/e/f）。`constructor`、`prototype` 其实可以安全写入，拒绝它们会让这两个名字的技能无法切换（P3-01）。非对象两类拒绝没有测试（P2-04） |

### 3.2 4b1 `skill.toggle`（`server/claude-actions.mjs:79-102`）

| 项 | 判定 | 依据 |
|----|------|------|
| 写入层选择（HLD 3.4、v1.17） | 成立 | `:90-91`。个人技能：缺省或由用户设置决定 → 用户设置；由本地或共享设置决定 → 本地设置。项目技能 → 本地设置。E2 逐一验证，读回都成功 |
| 与 Claude 优先级一致 | 成立 | `claude-catalog.mjs:14` `LAYERS = managed, local, project, user`；`decidedBy` 取第一个有该键的层。写本地设置一定盖过项目与用户设置，写用户设置只在没有更高层决定时生效 |
| 中间两档的确认 | 成立，但顺序有缺口 | `:86-87`。见 P2-01 |
| 共享设置的确认 | 单独请求时成立，与中间档同时出现时缺失 | `scopeChecks` `:60` 只在 `!request.confirm` 时要求确认；中间档的确认先发生，带 `confirm: true` 的第二次请求不再提示共享设置（E2-2，P2-01） |
| 本地设置的 `gitExclude` | 成立 | E2-1：新建的未被忽略的 `settings.local.json` 先要求选择；`gitExclude: true` 后写入 `.git/info/exclude`（`/sub/.claude/settings.local.json`）。4b 的测试世界中 git 总是失败，这条路径没有测试（P2-04，M15） |
| 读回 | 成立 | `:96-98`；强制写用户设置而项目决定时返回 `READBACK_FAILED`（测试、E2-5）。写入保留，见 P3-08 |
| 托管锁定 | 成立 | `claude-catalog.mjs:187-188` `canToggle` 为假并给原因；请求返回 `HOST_MANAGED`（测试） |
| 会不会写错文件 | 不会写到 Claude 不读的文件 | 读路径（`readClaudeSettings`）与写路径用同一个项目目录。上级目录 `.claude/skills` 中的项目技能（仓库根之下）的可见性写到**当前项目**的 `.claude/settings.local.json`，读回成功（E2-1）；效果只限于在当前项目目录启动的会话，结果文字没有说明是哪个项目，见 P3-04。同名技能共用一个条目，见 P3-03 |
| 共用技能的 Claude 一侧 | 未实现，错误码误导 | 返回 `NOT_FOUND`“请刷新后重试”，快照中 `perAgent.claude.canToggle` 却为真（E6，P3-05） |

### 3.3 4b2 `server/service.mjs`

| 项 | 判定 | 依据 |
|----|------|------|
| `assertPreview` 的 `agent` 参数 | 成立；`preview.diff` 漏传 | `:581-588`。Codex 请求用 Claude 预览、Claude 请求用 Codex 预览都返回 `STALE_PREVIEW`（测试、E3-A）。`preview.diff`（`:1332`）不传一侧，Claude 预览的文件差异因此一律失败（P2-02） |
| `claudeSkillRecord` 边界 | 与 Codex 基本同等 | `:333-347`：只属于 Claude、能力标记、`expectedRevision`、目录真实路径在其父目录内（链接只移动链接本身）、应用自身与 `.system`、更新时拒绝 Git 工作树（`.git` 为文件或目录都算）。差异：技能根在每次操作时才取（Codex 在启动时固定，根被换成指向别处的链接时拒绝），见 P3-06（E3-E）。真实路径检查对“技能根的直接子目录”只在竞态中才可能命中，变异不被发现是预期的 |
| 安装的边界 | 基本成立 | `:368-379`：受保护根（Codex 的插件与系统目录）、`verifyDirectoryRoot`、目标已存在。受保护根不含 Claude 自己的插件目录：个人技能根链接到 `~/.claude/plugins/cache/...` 时会写进插件缓存（E4-L，P3-06） |
| 恢复按操作记录的一侧，并检查该侧管理状态 | 成立 | `activityAgent`（`:1226-1229`）同时用于环境检查（`:1232`）与分发（`:1321`）。E4-H：Claude 只读时，无论请求带 `codex`、`claude` 还是不带，恢复 Claude 记录都返回 `AGENT_READ_ONLY`；Codex 只读时，带 `claude` 恢复 Codex 记录返回 `AGENT_READ_ONLY`，带 `codex` 恢复 Claude 记录成功 |
| 恢复的位置边界 | 成立，较 Codex 宽 | `:436-439` 父目录须为当前个人技能根，或以 `.claude/skills` 结尾；另有 `verifyRestoreParent`（父目录身份未变、不在受保护根）。Codex 要求父目录在启动时的受管根内。记录来自 SkillDock 自己的注册表，风险低（P3-06） |
| 来源记录按真实路径分区 | 链接与重命名下有缺陷 | 见 P2-03（E3-C、C2）。重命名：键变化，记录成为孤儿，`canUpdate` 变假（安全失败）。两侧共用状态变化：变为共用时记录保留、Claude 一侧拒绝操作（`UNSUPPORTED_FOR_AGENT`），恢复为只属于 Claude 后重新找到（E4-K）。`SKILL.md` 本身是指向另一个已登记技能的链接时，快照把来源算到被指向的目录，`canUpdate` 显示为真，检查更新时被 `OUTSIDE_SOURCE` 拦下（E3-F，安全失败，P3-06） |
| 回滚与错误记录 | 成立 | `:462-471`：失败时逆序回滚移动，写回操作前的注册表并追加错误记录（E3-G：移动失败后原目录仍在、记录为 `error`/`EIO`）；预览类与 `SNAPSHOT_STALE`、`STALE_PREVIEW` 等不记录，与 Codex 一致 |
| 与 Codex 流程互不干扰 | 成立 | 两条路径都在 `withOperation` 内（实例锁 → Codex 锁），Claude 路径再取 Claude 锁（DEC-SDX-010 的顺序）；并发的 Claude 移除与 Codex 预览，后者返回 `BUSY`（E4-I）。预览表共用，切换项目时一并清空（E4-J）；来源记录分区，Codex 的 `sources` 不变（测试）；1 版快照不含 Claude 的操作记录。`moveWarnings` 的清空时机不同，见 P3-06。完整套件中 Codex 的全部用例通过 |
| `move` 的额外边界 | 成立 | `:591-602`：额外边界只并入本次调用的边界表；Codex 的调用不传，行为不变 |

### 3.4 前端（`src/InstallDialog.tsx`、`src/App.tsx:1457`）

| 情形 | 请求 | 判定 |
|------|------|------|
| 两侧都启用管理，选 Codex（缺省） | 预览与安装都不带 `agent`，由 `requestAgent` 补为 `codex`，不带 `scope` | 与改动前相同，无回归 |
| 两侧都启用管理，选 Claude + 个人 / 当前项目 | 预览带 `agent: "claude"` 与 `scope: "user" \| "project"`；安装带 `agent: "claude"` 与 `previewId` | 成立；位置选择只在预览前显示，预览后改不了一侧，不会出现“预览与安装不同侧” |
| 只有 Codex 启用、两侧都未启用、1 版快照 | `agents` 不含 Claude，走 Codex | 无回归 |
| 只有 Claude 启用 | `agent` 初值为 `claude`，但不显示选择 | 直接装到 Claude 个人目录，不能选当前项目，也不说明是哪一侧（P3-07） |

`tsc --noEmit` 通过；`native/build.json` 的 52 个输入与 4 个产物哈希一致，`ui.html` 含新文案。

### 3.5 测试

见 P2-04 与第 6 节。新增两个测试文件覆盖了主路径；`tests/i18n-helper.mjs` 把翻译检查抽出，`claude-actions` 的翻译检查改为调用它，断言没有放松。改动的既有断言（`agents.test.mjs` 中 Codex 技能以 Claude 一侧切换改为 `NOT_FOUND`、`claude-catalog.test.mjs` 能力标记）与新行为一致。

### 3.6 文档

见第 5 节。

## 4. 问题

### PH4B-P2-01 中间档与共享设置同时出现时，用户只确认了中间档，共享设置被直接写入

- **位置**：`claude-actions.mjs:86-87` 先就中间档要求确认，`nativeRules` 只有 `visibility` 与 `reload`；`:93` 的 `scopeChecks` 中 `:60` 只在 `!request.confirm` 时要求共享设置的确认。中间档确认后重发的请求带 `confirm: true`，`:60` 不再拦截。
- **复现**（E2-2，导出副本、沙箱、临时世界）：个人技能 `mid` 当前为“仅用户调用”，请求 `{ action: "skill.toggle", agent: "claude", id, enabled: true, scope: "project", expectedRevision }`：
  1. 第一次：`CONFIRMATION_REQUIRED`，`nativeRules` 为 `["visibility", "reload"]`，没有 `kind: "scope"` 的“这会改动协作者共享的 .claude/settings.json”。
  2. 按协议带 `confirm: true` 重发：成功，“已在项目共享设置中把 Claude 技能 mid 设为可见”，项目的 `.claude/settings.json` 被写入 `"mid": "on"`。
- **依据**：PRD 与 HLD 3.4“写项目共享设置需逐次确认”；HLD 7.2“项目共享设置写入：确认中显示将写入的文件与改动，并说明会影响协作者”；36c 7.1 `scope` 一行。
- **影响范围**：当前界面切换技能时不带 `scope`，走不到这条路径；但这是 36c 公开的请求形态，任何按 `nativeRules` 显示确认框的客户端都会这样写入共享设置。另外，同一个请求在中间档与 `gitExclude` 都需要确认时，用户要连续确认两次，第二个确认框重复列出中间档的说明。
- **建议**：在 `skill.toggle` 中先算出全部需要确认的规则（中间档、`project` 层的 `SHARED`、`reload`），在第一次 `CONFIRMATION_REQUIRED` 中一并给出；`scopeChecks` 不再依赖“`confirm` 为真就跳过共享设置”，而是由调用方传入完整规则。补用例：中间档 + `scope: "project"` 的第一次响应必须含 `kind: "scope"`。

### PH4B-P2-02 Claude 技能更新对话框中的文件差异一律失败

- **位置**：`service.mjs:1329-1339` `preview.diff` 调用 `assertPreview(environment(mode), request.previewId, entry.kind)`，第四个参数缺省为 `codex`；4b2 新增的检查（`:584`）让 Claude 的预览一律不通过。界面（`App.tsx:2163` 的 `UpdateDialog` 与 `DiffBrowser.tsx:37`）发出的 `preview.diff` 没有 `id`，`requestAgent` 补为 `codex`；若改带 `agent: "claude"`，`assertAgentWritable` 又因该操作不在 Claude 的白名单返回 `UNSUPPORTED_FOR_AGENT`。
- **复现**（E3-B）：给 Claude 个人技能关联来源，来源改动后 `skill.checkUpdate` 返回 1 个文件有变化；对这个预览的 `preview.diff`：不带 `agent` → `STALE_PREVIEW`，带 `codex` → `STALE_PREVIEW`，带 `claude` → `UNSUPPORTED_FOR_AGENT`。
- **影响**：4b2 在技能详情中开放了 Claude 技能的“检查更新”，对话框列出变化的文件，展开任一文件都显示“预览已过期或属于其他环境，请重新预览”，重新预览也不会好；更新本身仍可执行。
- **建议**：`preview.diff` 是只读的，按预览自己记下的一侧核对：`assertPreview(env, id, entry.kind, entry.agent ?? 'codex')`，并在 `assertAgentWritable` 中让 `preview.diff` 不做一侧检查（或按预览的一侧检查）。补用例：Claude 更新预览与来源关联预览的 `preview.diff` 返回差异。

### PH4B-P2-03 按真实目录做键后，移除指向已登记技能的链接会删掉该技能的来源记录；恢复这次移除又会写回旧记录

- **位置**：`service.mjs:346` 与 `:376` 用真实目录做 `claudeSources` 的键；`:384-385` 移除时把 `sources[key]` 记入恢复数据并删除，**链接也一样**；`:450-451` 恢复时按真实目录重新算键，用记录中的旧值覆盖（或在旧值为空时删除）当前记录。Codex 的来源按发现路径派生的 ID 做键，链接与目标是两条记录，没有这个问题。
- **复现**（E3-C、C2）：个人技能 `~/.claude/skills/kept`（实际目录）已关联来源；当前项目的 `.claude/skills/kept` 是指向它的链接，快照中是两个只属于 Claude 的对象（链接 `canUpdate` 为假，目录为真）。
  1. 移除项目中的链接（只移除链接，目标目录保留）后，`claudeSources` 从 1 条变为 0 条，个人技能 `canUpdate` 变为假，检查更新返回 `PROTECTED_SKILL`。
  2. 重新给个人技能关联来源（新记录），再恢复第 1 步的移除：个人技能的来源记录被替换为第 1 步之前的旧记录。若用户第 2 步改关联到了另一个来源，之后的更新会从旧来源取内容（预览仍会列出变化，但不显示来源已经变回）。旧值为空时，恢复会直接删掉新记录。
- **依据**：36c 第 6 节“移除……该侧是链接就只移除链接，只影响该侧”；`canUpdate` 规则“该侧分区有来源记录”；HLD 3.4“来源记录按 Agent 分区保存”。
- **建议**：移除链接（`record.isLink`）时不读写 `sources`，恢复数据中不记 `source`，恢复链接时也不写 `sources`；只有移走真实目录、更新与恢复更新时才读写该键。若考虑以后共用状态下两个发现路径都可能是目录，可在记录中保存 `directory` 并在恢复时核对键仍属于同一目录。补用例：链接与目录同指一处时，移除并恢复链接，目录技能的来源记录不变。

### PH4B-P2-04 Claude 文件事务是 Codex 分支的复制，复制出来的保护有一半没有测试钉住

- **背景**：DEC-SDX-020 的决定是“复用，不为 Claude 另建文件操作实现”，理由是现有事务“经过多轮回归”。4b2 复用了底层函数（暂存、`move`、指纹、隔离区），但 `claudeSkillAction`（`service.mjs:348-473`）把安装、移除、来源关联、检查更新、更新、恢复的编排重新写了一遍，边界与状态检查是 Codex 分支（`:897-1024`）的副本，已经出现差异（恢复边界的写法、来源键、`moveWarnings` 的清空，以及 P2-02、P2-03）。这些副本没有 Codex 测试的保护。
- **变异实验**（第 6 节）：40 项中 18 项未被发现。与 4b 直接相关的：

  | 变异 | 未被发现意味着 |
  |------|---------------|
  | M04、M05 顶层或 `skillOverrides` 不是对象时不拒绝 | 只测了“不是 JSON” |
  | M08 不保留文件权限 | 0600 的设置文件会变为 0644 |
  | M14 操作记录不保存旧值 | HLD 3.4 的撤销数据没有断言 |
  | M15 本地设置不询问 `gitExclude` | 4b 的测试世界中 git 总是失败，`skill.toggle` 的这条路径完全没测 |
  | M22、M23 Claude 恢复不核对记录一侧、不核对原位置边界 | M22 在当前分发下走不到，属于纵深防御；M23 没有任何用例 |
  | M24 去掉应用自身与 `.system` 保护 | — |
  | M25 更新不拒绝 Git 工作树 | — |
  | M26 链接也可更新 | 与 P2-03 叠加时，更新会把链接换成目录 |
  | M27 不限于技能根的直接子目录 | — |
  | M30 安装不核对受保护根 | — |
  | M32 来源键改用发现路径 | 测试世界的临时根已是真实路径，断言区分不出 |
  | M35 不记录错误 | — |
  | M36 恢复更新时不核对本地修改 | 会覆盖更新后用户的新改动（进隔离区，可找回） |
  | M39 不取 Claude 锁 | DEC-SDX-010 |
  | M40 更新前不核对来源是否重新关联 | — |

  另外，`tests/claude-skill-files.test.mjs:89` 的标题是“只读的 Claude 不能移除**或恢复**技能”，用例只断言了移除（恢复的情形在本次 E4-H 中验证是正确的，但没有用例）。M20（真实路径越界）不被发现是预期的，见 3.3。
- **建议**：
  1. 首选：把 Codex 与 Claude 的技能文件事务合成一个按一侧参数化的实现（边界来源、来源分区、记录的一侧作为参数），让现有 Codex 用例同时守住两侧；4c 处理共用技能时还要再改这些分支，越早合并越省事。
  2. 至少：为上表中的每一项补 Claude 一侧的用例；`gitExclude` 用可控的替身 git（参照 4a 的 `claude-actions` 测试世界）；为只读 Claude 的恢复补断言。

### PH4B-P3-01 设置补丁的细节

- **位置**：`claude-settings.mjs:15`、`:29`、`:44-50`。
- **问题**（E1）：
  1. `:50` 写临时文件失败（磁盘满等）时文件已创建、不在 `try` 内，残留在设置文件所在目录（例如 `~/.claude/`）。
  2. 悬空链接（目标不存在）被替换成普通文件，链接丢失；硬链接的另一个名字仍是旧内容。
  3. 临时文件按原权限创建，但受 umask 影响，0664 变为 0644（只会收窄，不会放宽）。
  4. 整份文件重新序列化：紧凑的数组与对象展开、Unicode 转义写成字面字符、`1.0` 写成 `1`、大整数丢精度、重复键合并、整数形的键移到最前。语义上大多不变，但大整数会被改值，且用户手工排版的设置文件会出现大面积差异（用 Git 管理 dotfiles 的用户会看到）。
  5. `SAFE_KEY` 拒绝 `constructor`、`prototype`：写入普通对象的自有属性是安全的（只有 `__proto__` 有问题），名为这两个词的技能会得到 `INVALID_SETTING`。
- **建议**：把 `writeFile` 移进 `try`（或单独 `try` 后清理）；悬空链接时按 `readlink` 解析出的目标写入，或拒绝并说明；写完后 `chmod` 为原权限；对超出安全整数范围的数字拒绝改写（`SETTINGS_FORMAT`），或改为只替换 `skillOverrides` 子树文本的补丁；`SAFE_KEY` 只排除 `__proto__`。

### PH4B-P3-02 写前摘要核对的窗口从补丁内部的第一次读取开始，决策依据更早

- **位置**：`claude-actions.mjs:79-95`。是否需要中间档确认、写哪一层，依据的是处理开始时读取的 `state`；之后还要经过 `projectFor` 与 `scopeChecks`（会执行最多两次 `git`，各有 5 秒超时），然后 `patchClaudeSetting` 才读取文件并记下摘要。
- **影响**：这段时间里 Claude 恰好把同一技能改为中间档（或改了决定它的那一层），SkillDock 会不经确认把它改成开或关。窗口很小，但 DEC-SDX-006 的理由正是“缩小与 Claude 并发写入的冲突窗口”。
- **建议**：让 `patchClaudeSetting` 接受期望的旧值（来自 `state` 中该层的条目，可由 `readClaudeSettings` 一并给出），`previous` 不同即返回 `SNAPSHOT_STALE`；或在补丁读取后重新计算决定层与可见性并与 `state` 比较。

### PH4B-P3-03 同名技能共用一个可见性条目，确认与结果都不提

- **位置**：`claude-catalog.mjs:177` 按 SKILL.md 的 `name` 取可见性；`claude-actions.mjs:95` 按名称写。
- **复现**（E2-3）：个人技能与当前项目中各有一个 `dup`。关闭项目中的 `dup` 后，个人的 `dup` 也显示为关闭；没有确认，结果只提到一个技能。安装 Claude 技能时也不提示与已有同名技能冲突（Claude 中个人技能会遮蔽同名项目技能）。
- **建议**：同名的其他 Claude 技能存在时，在确认或结果中列出会一并受影响的技能（`nativeRules` 一条 `kind: "visibility"` 的 `items`）；安装预览提示同名。

### PH4B-P3-04 上级目录中的项目技能：可见性只对当前项目生效，移除与更新超出文档所写范围

- **位置**：`claude-catalog.mjs:149-156` 把从当前项目到仓库根的每一级 `.claude/skills` 都算作项目技能根；`claude-actions.mjs:91-94` 写当前项目的本地设置；`service.mjs:326` 只要求父目录以 `.claude/skills` 结尾。
- **现象**（E2-1、E3-D）：
  - 关闭仓库根 `.claude/skills` 中的 `anc` 时，写入的是子目录项目 `sub/.claude/settings.local.json`，读回成功；在仓库根启动的 Claude 会话中它仍然可见。结果文字“已在项目本地设置中……”没有说是哪个项目。
  - 同一个 `anc` 可以移除与更新（`canRemove` 为真），而 HLD 3.4、`37` 与提交说明写的是“个人技能目录或当前项目的 `.claude/skills`”。仓库根的技能通常入库并被各子项目共用。
- **建议**：结果文字带上设置文件的相对路径；在 `37`、36c 7.3 中写明移除与更新是否包括上级目录（仓库根以内）的项目技能，若不包括，`decorateClaudeSkills` 只放行当前项目的根。

### PH4B-P3-05 共用技能的 Claude 一侧：能力标记为可切换，请求却返回“未找到，请刷新”

- **位置**：`claude-actions.mjs:80-81` 只在 `state.claude.skills` 中按请求 ID 查找，共用技能的 ID 取 Codex 侧，找不到；`multi-agent.mjs:14` 把 Claude 侧的 `canToggle` 原样放进 `perAgent.claude`。
- **复现**（E6）：`perAgent.claude.canToggle` 为真；以 `agent: "claude"` 切换返回 `NOT_FOUND`“未找到这个 Claude 技能，请刷新后重试”（刷新无用，且不记录）。同一对象的移除返回 `UNSUPPORTED_FOR_AGENT` 并说明随后续版本提供。
- **建议**：随 4c 实现按侧切换（36c 第 6 节“启禁按侧执行”）；在此之前，共用技能的 Claude 一侧 `canToggle` 置假并给原因，请求返回 `UNSUPPORTED_FOR_AGENT`，与移除一致。

### PH4B-P3-06 Claude 文件事务与 Codex 路径的小差异

1. **技能根不在启动时固定**（E3-E）：个人技能根在服务运行中被换成指向别处的链接后，其中带 SKILL.md 的子目录成为 Claude 技能，可以被移入隔离区（可恢复）；同样的替换对 Codex 的技能根，Codex 不再列出这些技能。Claude 的根由用户在运行中修改是合理的（例如改为 dotfiles 链接），可接受，但建议在边界核验中至少要求根的真实路径不在受保护根内。
2. **受保护根不含 Claude 的插件目录**（E4-L）：根链接到 `~/.claude/plugins/cache/...` 时安装会写进插件缓存；链接到 Codex 的插件缓存则被拒绝（`TARGET_BOUNDARY`）。建议把 Claude 的 `plugins` 目录与插件缓存目录并入 Claude 一侧的受保护根。
3. **恢复边界用字符串后缀**（`:438`）：任何以 `.claude/skills` 结尾的父目录都通过；有父目录身份核对兜底，风险低。
4. **`moveWarnings` 只在 Claude 路径结束时清空**（`:472`），Codex 路径在开始时清空（`:762`）、结束时不清空：一次 Codex 操作留下的“未清理的恢复副本”提示会附在随后一次 Claude 操作的结果中。建议两条路径都在开始时清空。
5. **SKILL.md 是链接时**（E3-F）：快照按 SKILL.md 的真实路径找来源（`:325`），操作按目录的真实路径找（`:346`），两者不同；`canUpdate` 可能显示为真，检查更新被 `OUTSIDE_SOURCE` 拦下（安全失败）。建议两处用同一个键。

### PH4B-P3-07 只有 Claude 启用管理时，技能安装对话框不给位置选择，也不说明装到哪一侧

- **位置**：`InstallDialog.tsx:28-31`、`:122-125`。`agents` 只有 `claude` 时，`chooseAgent` 为假，`agent` 初值为 `claude`，`skillScope` 固定为 `user`。
- **影响**：用户无法把技能装到当前项目的 `.claude/skills`；对话框仍是原来的文字，只有预览中的目标路径能看出是 Claude。改动前同样情形会发给 Codex 并在安装时返回只读错误，所以这不是回归，而是新功能在这种情形下不完整。
- **建议**：只要可安装的一侧是 Claude（包括只有它一个），就显示位置选择；只有一侧时用一句说明代替单选。

### PH4B-P3-08 撤销数据与读回失败

- 可见性的撤销数据（`restore.kind = "claude-visibility"`）只写进操作记录，`canRestore` 恒为假，任何操作都不读它（E2-6 恢复返回 `RESTORE_MISSING`）。与 Codex 的启停一致（Codex 的启停也不可从记录恢复），可以接受，但 HLD 3.4“撤销记录只保存被改条目的旧值”读起来像是有撤销功能，建议在 HLD 或 `37` 中写明“只记录，暂不提供撤销”。
- 读回失败（`READBACK_FAILED`）时写入已经发生，错误记录不含旧值（E2-5），以后加撤销时这类写入无法撤销。建议错误记录同样带 `restore`。
- 显式 `scope: "user"` 写入时，若用户设置中该技能原为中间档而当前由更高层决定为开，中间档会被覆盖而不经确认（中间档判断只看生效值）。只在显式指定作用域时出现。

### PH4B-P3-09 文档小处

见第 5 节表中标为“不一致”的各项：HLD 修订表的标题、36c 状态行与 7.3“成功后读回”、36c 第 6 节“无法解析”、`37` 的三处描述。

## 5. 文档判定

| 文档与位置 | 判定 | 说明 |
|-----------|------|------|
| HLD 3.4 启禁（v1.17 改动） | 一致 | 个人技能当前由项目的本地或共享设置决定时写本地设置，与 `claude-actions.mjs:91` 一致；依据（优先级）正确 |
| HLD 有限修订表 | 小处不一致 | 4b1 的一行加在“阶段 4a 实现中的有限修订（v1.17）”标题下，建议标题改为“阶段 4a、4b 实现中……” |
| HLD 3.4 “写前再核对摘要”、DEC-SDX-006 “写前写后摘要核对” | 基本一致 | 写前核对已实现；“写后”由读回 Claude 清单承担，没有对写入字节再核对。窗口起点见 P3-02 |
| HLD 3.4 “撤销记录只保存被改条目的旧值” | 一致，但易误读 | 见 P3-08 |
| HLD 3.4 / DEC-SDX-020 “完全复用现有文件事务” | 不一致 | 编排是复制的，见 P2-04 |
| 36c 0.14 7.1 `scope` | 一致 | `skill.toggle` 的缺省层、`skill.previewInstall` 的取值与拒绝 `local` 都与实现一致 |
| 36c 1 节状态行 | 小处不一致 | 仍写“v0.14 为阶段 3 试用与阶段 4a 实现中的澄清”，没有提 4b 的增补 |
| 36c 7.3 “所有 Claude 写操作……成功后读回” | 不一致 | Claude 技能的文件事务没有从 Claude 清单读回（只核对指纹与移动结果）。建议写明文件事务以指纹核对代替读回，或在安装、移除后读回 Claude 技能清单 |
| 36c 第 6 节 共用对象的“启禁按侧执行” | 未实现（随 4c） | 见 P3-05 |
| 36c 第 6 节 对象 ID“解析不到时显示为无法解析并保留” | 部分实现 | Claude 来源记录按真实路径保存与查找；目录不存在或改名后记录静默成为孤儿，不显示“无法解析” |
| 36 索引 0.15 | 一致 | 7.1 的增补已登记；同样仍标为“阶段 3 试用与阶段 4a 实现中的澄清” |
| `37` 进度表 4b1 | 一致 | 描述与实现相符 |
| `37` 进度表 4b2 | 三处不准确 | ①“写入……当前项目的 `.claude/skills`”：移除与更新也作用于上级目录（P3-04）；②“技能变为两侧共用……来源仍按真实路径找到”：记录只是保留，共用期间 Claude 一侧拒绝操作，恢复为只属于 Claude 后才重新使用（E4-K）；③“链接只移除链接”：文件如此，但来源记录会被一并删除（P2-03） |

## 6. 测试与实验

全部测试与实验都在导出副本（`git archive 89eab4f` → `scratchpad/verify/phase4b-review/export/`，应用目录中的 `node_modules` 为指向主工作区同一目录的符号链接，只读使用）中，经 `run.sh` 在沙箱 `phase2-review/hermetic.sb` 中运行（禁止执行本机 Codex、Claude 命令行，禁止非本机外连）。环境为 `env -i`，`HOME`、`TMPDIR` 指向 `scratchpad/verify/phase4b-review/`，并通过 `NODE_OPTIONS=--import` 加载连接守卫，拒绝连接 4771、4781 端口与非本机地址。

| 运行 | 命令 | 结果 |
|------|------|------|
| 完整套件（只跑一次） | `run.sh npm test` | **424 项：369 通过、55 跳过、0 失败**，约 48 秒。55 项跳过都是 `compat-matrix`：它要求所在目录是 Git 仓库（用历史提交取出 0.10.2 冻结代码），完整套件运行时导出副本还不是仓库。本范围没有改动启动器、转交、迁移相关文件；这 55 项没有在 `89eab4f` 上验证 |
| 定向测试 | `run.sh node --test tests/claude-skill-visibility.test.mjs tests/claude-skill-files.test.mjs tests/claude-actions.test.mjs tests/claude-catalog.test.mjs tests/agents.test.mjs tests/multi-agent.test.mjs tests/backend-security.test.mjs tests/backend-lifecycle.test.mjs tests/source-links-diff.test.mjs tests/i18n.test.mjs` | 101/101 通过，约 3 秒 |
| 类型检查 | `run.sh node_modules/.bin/tsc --noEmit` | 通过 |
| 原生构建清单 | `node -e`（只读导出副本中的文件） | 52 个输入、4 个产物的 sha256 全部一致；`ui.html` 含“Install to {v0}”“Current project (.claude/skills)” |
| E1 设置补丁 | `exp/e1-settings.mjs` | 见 3.1、P3-01 |
| E2 可见性切换 | `exp/e2-toggle.mjs`（替身 Claude 清单、替身 git） | 见 3.2、P2-01、P3-03、P3-04、P3-08 |
| E3 文件事务 | `exp/e3-files.mjs` | 见 3.3、P2-02、P2-03、P3-04、P3-06 |
| E4 一侧、并发、共用状态、受保护根 | `exp/e4-sides.mjs` | 见 3.3、P3-06 |
| E5 翻译 | `exp/e5-i18n.mjs`、`exp/e5b-i18n.mjs`（生产翻译器） | 4b 新增的服务端提示与成功消息（含共享设置、`exclude`、读回失败、托管、恢复、边界）英、日译文完整。沿用 Codex 的若干原句（如“安装目标已存在，请重新预览。”）没有独立译文，为既有状况，不计入问题 |
| E6 共用技能的 Claude 一侧 | `exp/e6-shared-toggle.mjs` | 见 P3-05 |
| 变异实验 40 项 | `mut/run.py`：每项改动导出副本后运行定向测试中除 `i18n` 外的 9 个文件（83 项），再 `git checkout` 恢复 | **被发现 22 项**：M01、M02、M03、M06、M07、M09～M13、M16～M19、M21、M28、M29、M31、M33、M34、M37、M38。**未被发现 18 项**：M04、M05、M08、M14、M15、M20、M22～M27、M30、M32、M35、M36、M39、M40（见 P2-04；清单与结果在 `mut/mutations.py`、`mut/results.json`）。结束时副本干净 |

委托中点名的变异：去掉写前摘要核对（M01）、去掉预览一侧检查（M17）、恢复改为按请求的一侧（M18 环境检查、M19 分发）、去掉只读检查（M21）都被发现；去掉真实路径越界检查（M20）未被发现，原因见 3.3。

## 7. 观察（不计入问题）

1. **守卫记录**：完整套件开始时，npm 进程两次尝试连接 `registry.npmjs.org:443`（07:49:09、07:49:19），均被拦截，测试照常通过，没有下载。与前几轮报告记录的 npm 版本检查一致。所有实验与变异运行中没有被拦截的连接。
2. 每次 Claude 技能文件操作都会强制读取两次 Claude 清单（环境检查与 `claudeSkillRecord` 各一次）并强制列出 Codex 插件；在真实命令行下会多花数秒。
3. Claude 命令行不可用时，Claude 环境整体为“无法确认”，所以 `assertAgentWritable` 中“文件事务不要求命令行”的区分（`:1242`）目前不起作用（E2-7）。
4. `settings.setClaudeRoot` 不清空预览；切换 Claude 根目录后，之前的个人技能安装预览仍会装到旧根（目标路径在预览中可见）。
5. Claude 技能更新与 `update.check`、后台计划的衔接按 `37` 随阶段 5；本次 Claude 技能不进入更新页，行为与说明一致。
6. 中间档与 `gitExclude` 同时需要时，界面会连续弹出两个确认框（见 P2-01 末段）。

## 8. 操作披露与结束状态

- 没有向 `127.0.0.1:4771` 或 `127.0.0.1:4781` 发请求；没有运行真实的 `codex`、`claude` 命令行；没有读写或列出真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock*`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`；没有用真实 HOME 运行测试或实验；没有运行 `launchctl`；没有下载、没有联网。没有打印任何配置文件全文，报告中没有密钥。
- 在沙箱外、以默认环境运行的辅助操作（都没有访问上述位置）：
  - 主工作区的只读 git 命令：`log`、`show`、`diff`、`rev-parse`、`status`、`ls-tree`、`grep`、`archive`；
  - 导出副本中：建立 `node_modules` 符号链接；`git init`、`add`、`commit`（作为变异基线）与 `git checkout`、`status`（变异后恢复）；
  - 变异调度脚本 `mut/run.py`（Python，只改导出副本，测试本身经 `run.sh` 在沙箱中运行）；用 Python 修改一份实验脚本；
  - 用 `node -e` 核对导出副本中 `native/build.json` 的哈希；用 `grep`、`sed`、`cat`、`shasum` 读取仓库文件、前几轮的评审材料与测试输出；`ps` 查看本轮进程。
- 进程：本轮启动的测试与实验进程都已结束，没有遗留。
- 实验材料在 `scratchpad/verify/phase4b-review/`（导出副本 `export/`，`exp/` 下的实验脚本与输出，`mut/` 下的变异清单、调度脚本与结果，`run-full.out`、`run-targeted.out`、`run-tsc.out`，守卫日志 `guard.log`）。
- 主工作区中只新建了本报告（未提交）。主工作区 HEAD 在评审期间由他人从 `89eab4f` 推进到 `e1d5603`，本会话没有提交、推送、切换分支或修改其他文件。
