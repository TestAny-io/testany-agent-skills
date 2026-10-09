# 代码评审报告：阶段 4a Claude 插件与 marketplace 写操作（`95fdb7a`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 范围 | `95fdb7a` 相对 `76a6853`：`git diff 76a6853 95fdb7a -- plugins` 共 27 个文件，增 1345 行、删 144 行，diff sha256 前缀 `a61f83f8df43` |
| Candidate | `95fdb7a`（tree `165bc64a…`，父提交 `76a6853`），分支 `feature/skilldock-0.11-cross-agent`（本地） |
| 事实源 | PRD `34`（sha256 `e061ec25…`，未改）；HLD `35` v1.17（`e334145a…`，本提交改 3.3 并新增“阶段 4a 实现中的有限修订”）；契约索引 `36` v0.15（`3247590b…`）；`36c` v0.14（`84228fc7…`）；实施计划 `37`（`9b438043…`，阶段 4 段落与进度表）；`41`（`b663290f…`，未改）；Claude 2.1.288 插件命令帮助（会话 scratchpad 中的 `claude-plugin-help.txt`，sha256 `e76c2ed2…`，即 `37` 所引的帮助文本） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-09 |
| 工作区绑定 | 开始时主工作区 HEAD 已是 `89eab4f`（其后 4b1 `7346b69`、4b2 `89eab4f` 已提交），工作区干净。评审与全部实验都在 `git archive 95fdb7a` 导出的副本中进行，不依赖工作区状态。结束时 HEAD 不变，工作区只多本报告（未提交） |

## 2. 结论

**CHANGES REQUESTED**

- P0：0
- P1：1（PH4A-P1-01：移除 Claude marketplace 会改写协作者共享的 `.claude/settings.json`，确认框不说明）
- P2：3（PH4A-P2-01～03，见第 3 节）
- P3：9（PH4A-P3-01～09）
- 成立的部分：命令行白名单严密，没有参数注入与“选项伪装成对象”的途径，从不传 `-y`/`--accept-command`（实验 E1、E2，变异 M20～M25、M28 均被发现）；锁顺序为“实例 → Codex → Claude”，Claude 状态在三把锁内重读，Claude 根不存在时不取锁、不创建根（E9）；`expectedRevision` 与 `SNAPSHOT_STALE`、project 作用域与卸载的确认、新建未忽略本地设置文件的 `gitExclude` 询问都按契约触发（M01～M04、M13～M15 被发现）；`.git/info/exclude` 在普通仓库、子目录、工作树、子模块中都写对位置，幂等，不碰 `.gitignore`（E6、E8）；Claude 管理未启用或无法确认时快照统一只读，服务端四类拒绝成立；1 版快照不含 Claude 记录；Codex 现有流程未见回归（完整套件通过）。
- 问题集中在三处：marketplace 移除绕过了“共享设置须逐次说明”的写入边界（P1-01）；启停缺省作用域只看安装范围，忽略了决定启用状态的层级（P2-01）；只有 Claude 可管理时“添加来源”发往 Codex（P2-02）。另外，除启停外的所有读回与 Claude 锁都没有被测试钉住（P2-03）。
- 供参考（不属本轮范围）：用 `git show 89eab4f:<文件>` 核对，P1-01、P2-01、P2-02 涉及的代码在当前 HEAD 中未变；P2-01 的修法在 4b1 的 `skill.toggle` 中已有现成写法。

本结论不授予推送、合并或发布权限。

## 3. 问题

### PH4A-P1-01 移除 Claude marketplace 会改写协作者共享的 `.claude/settings.json`，确认框不说明

- **位置**：
  - `server/claude-actions.mjs:150-161`：确认规则只有 `affected-plugins` 与 `reload`；`:158` 执行 `plugin marketplace remove <名称> --json`，不带 `--scope`，工作目录为当前项目。
  - `server/claude-writer.mjs:11`：`plugin marketplace remove` 不在必须带作用域的集合中。
  - `server/claude-catalog.mjs:315-319`：只有 managed 层声明的 marketplace 标为不可移除；project、local 层声明的照常 `canRemove: true`，没有原因。
- **依据**：Claude 2.1.288 帮助（`37` 已记录）：`marketplace remove` 不带 `--scope` 时“从每个作用域删除声明”。HLD 3.3：“写项目共享范围需用户逐次选择（Q3），并在确认中说明会改动协作者共享的设置文件”；HLD 7.2：“项目共享设置写入：确认中显示将写入的文件与改动，并说明会影响协作者”。同一提交中，卸载 project 范围的插件会加这条说明（`claude-actions.mjs:124`），移除 marketplace 没有。
- **失败场景**（实验 E4）：当前项目的 `.claude/settings.json` 在 `extraKnownMarketplaces` 中声明了 `m`（团队 marketplace 的常见做法）。快照中 `m` 为 `canRemove: true`、无原因；移除请求返回的 `CONFIRMATION_REQUIRED` 只有两条规则：`affected-plugins`（`demo`、`proj`）与 `reload`，没有 `kind: "scope"`；确认后执行 `plugin marketplace remove m --json`（工作目录为当前项目），Claude 会从项目共享设置中删掉这条声明。受影响插件中的 `proj` 是 project 范围安装，按 PRD 5.6（“会卸载从它安装的全部插件”）Claude 卸载它时还会改共享设置中的 `enabledPlugins`，同样没有说明。用户随后一次 `git commit -a` 就会替整个团队删掉 marketplace 声明。
- **建议修法**：
  1. 目录为 Claude marketplace 给出声明所在的层（例如 `declaredIn`，取 `readClaudeSettings` 的 `layers`）；
  2. 移除时，只要 project 层声明了它、或受影响插件中有 project 范围安装，就在 `nativeRules` 中加一条 `kind: "scope"`，写明 `.claude/settings.json` 会改动且影响协作者，仍须 `confirm: true`；另一种做法是显式传 `--scope user`、`--scope local` 只删本人层，project 层声明给出原因与手动途径。二选一需 Owner 决定，并写入 `36c` 7.3；
  3. 读回核对声明已从相应层消失；
  4. 补用例：project 层声明的 marketplace 移除必须带 scope 规则；managed 层声明不可移除（变异 M36 未被发现）。

### PH4A-P2-01 启停缺省作用域只看安装范围：用户范围安装由项目或本地设置决定时，写入用户设置不生效，却改了其他项目

- **位置**：`server/claude-actions.mjs:80-83`；HLD 3.3 v1.17“作用域”；`36c` 7.1 `scope`。
- **失败场景**（实验 E3、E3b）：
  - 插件装在用户范围，当前项目的共享设置 `enabledPlugins` 启用了它（`enablement.decidedBy: "project"`），目录给 `canToggle: true`、无原因。点“停用”，服务端发出 `plugin disable demo@m --scope user --json`。Claude 的优先级是 managed > local > project > user（`claude-catalog.mjs:14`），本项目中仍由项目设置启用，于是返回 `READBACK_FAILED`（“可能由更高层级的设置决定”）。但用户设置已写入 `false`：所有没有项目或本地条目的其他项目里，这个插件都被停用了，而提示没有说写了哪个文件。界面没有作用域选择，再点一次也只是重复同样的写入。
  - 由本地设置决定时（E3b，本项目曾在本地停用），点“启用”同样写用户设置，只能失败。
- 这与 v1.17 自己的理由（“避免写入用户设置后影响其他项目的同名插件”）相悖。同分支随后的 4b1 中，技能可见性已按决定层处理：个人技能在 `decidedBy` 为 local 或 project 时写本地设置。
- **建议修法**：缺省改为 `request.scope ?? (installScope === 'user' && !['local', 'project'].includes(plugin.enablement?.decidedBy) ? 'user' : 'local')`。local 层高于 project 与 user，而且不共享，所以本项目内生效、不影响他人。HLD 3.3 与 `36c` 7.1 同步这一句；读回失败的提示写明已写入的设置文件（4b1 的技能读回已这样做）；补 E3、E3b 两个用例。

### PH4A-P2-02 只有 Claude 可管理时，“添加来源”实际发给 Codex

- **位置**：`src/App.tsx:1468`（`agents` 取已安装且已启用管理的环境）、`:1908`（初始选中 Claude）、`:1919`（只有 `agents.length > 1` 才带 `agent`）、`:1922`（Git ref 只在选中 Codex 时发送）；`src/agent-requests.ts:14-20`（请求没有 `agent` 也没有对象时取 `codex`）。
- **失败场景**（实验 E7，用打包后的 `requestAgent` 计算）：只装 Claude、或 Codex 为只读时，`agents = ["claude"]`。对话框内部选中 Claude、隐藏 Git ref，但请求不带 `agent`，`requestAgent` 回落为 `codex`，服务端按 Codex 处理：Codex 未安装或只读时报错，Claude 一侧永远加不上。只用 Claude 是本版本的主要场景之一。可管理的环境为“两侧”或“仅 Codex”时行为与改动前相同，Codex 无回归。
- **建议修法**：只要 `agents` 非空就带 `agent`（`...(agents.length ? { agent } : {})`）；把“发往哪一侧”提成纯函数，补四种情形的用例（两侧、仅 Claude、仅 Codex、都不可管理）。

### PH4A-P2-03 关键保护的测试缺口：除启停外的读回、Claude 锁和若干能力标记都没有被测试钉住

在导出副本上做了 55 项变异（第 6.2 节），被发现 31 项、未被发现 24 项。与本步核心承诺相关的未被发现项：

| 变异 | 含义 | 缺的用例 |
|------|------|----------|
| M06、M07、M08 | 安装读回恒真；不核对项目路径；不核对作用域 | 替身命令行不改清单（`noop`）时安装应为 `READBACK_FAILED`；装到别的作用域或别的项目时同样失败 |
| M09 | 卸载读回恒真 | 卸载后插件仍在清单中时失败 |
| M10、M11、M12 | 添加 marketplace 不要求恰好一个新增；刷新读回恒真；移除读回恒真 | 没有新增或新增两个、刷新后消失、移除后仍在，三种情形各一例 |
| M16、M17、M18 | 不取 Claude 锁；根不存在时也取锁（会创建根）；在取锁前读状态 | 在替身清单中观察 `<Claude 根>/.skilldock-operation.lock` 是否存在（E9 的做法）；删掉 Claude 根后写请求不得创建它 |
| M36、M39、M41 | managed 层声明的 marketplace 可移除；设置与实际不一致仍可切换；managed 范围安装可修改 | 目录对这三种情形的能力标记与原因 |
| M43、M44、M46 | exclude 写入不幂等；不看是否已被忽略；用户拒绝后仍写 exclude | 已忽略的仓库不询问；`gitExclude: false` 时 exclude 不变；重复写入只有一行 |
| M48、M56 | 卸载与启停的工作目录改为当前项目 | 现有用例的安装项目恰好就是当前项目，换成另一个存在的目录即可钉住 |
| M26、M27、M34、M49 | 取第一行 JSON；错误不脱敏；演练环境不拒绝 Claude；确认与过期也记为失败 | 各补一例 |

读回是“不把未完成判为完成”的唯一保护，目前八种读回只有启停一种有反例用例（M05 被发现）。

### PH4A-P3-01 几个错误码与契约第 8 节不一致

- 项目目录不存在的安装：目录先把它标为不可切换、不可卸载（`claude-catalog.mjs:241-251`），请求因此返回 `PROTECTED_PLUGIN`（403），而不是契约的 `PROJECT_PATH_MISSING`（422，“恢复路径后可”）；`claude-actions.mjs:47-48` 只在目录与请求之间目录被删的窄窗口里才会触发。用例 `a project installation whose project is gone is read-only` 把 `PROTECTED_PLUGIN` 写成了预期。
- managed 范围安装（`protection` 未设置）返回 `PROTECTED_PLUGIN`，managed 层声明的 marketplace 返回 `PROTECTED_MARKETPLACE`；契约中 `HOST_MANAGED` 的含义是“由宿主或组织管理（managed、`@synced`、command 来源等）”（实验 E5）。
- `service.mjs:1070` 的 `CLI_UNAVAILABLE` 走不到：命令行不可用时 `effective()` 已返回“无法确认”（用例注释也这样说）。
- 建议：代码按契约给错误码，或在 `36c` 第 8 节写明这几种情形用哪个码。

### PH4A-P3-02 写命令的结果与错误语义

- 超时报 `CLI_TIMEOUT`，文字却是“Claude 命令行 … 失败：Command failed: …”（E2）。命令可能已经完成，应与 `runProcess` 一致，说明“未确认执行结果，请刷新查看实际状态”。被杀的只是 Claude 主进程，它派生的 `git` 等可能在锁释放后继续写。
- 当前项目目录已被删除时，用户范围的写以它为工作目录，`spawn` 报 `ENOENT`，提示读起来像找不到 Claude 命令行。
- 白名单接受重复的 `--scope`（后一个生效）和空字符串对象（E1）。参数由服务端拼接，目前无法利用；但 `marketplace update ''` 在 Claude 中可能被当成“未指定名称 = 更新全部”。建议拒绝重复参数与空对象，并对对象按名称规则校验。
- `--json` 结果取的是“最后一个以 `{` 开头的行”，不是严格的最后一行（E2 的 trailing 情形）。比约定更宽，可以接受，建议在注释或 `37` 中写明。

### PH4A-P3-03 本地设置判断中的 git 细节

- `GIT_CONFIG_GLOBAL=/dev/null` 让用户全局配置中的 `core.excludesFile` 失效：用户已在全局忽略文件中忽略了该文件时，SkillDock 仍判为“未被忽略”而询问（E6 g；XDG 默认位置 `~/.config/git/ignore` 不受影响，E6 h）。结果只是多问一次，同意后写入的 exclude 也无害。
- 仓库本地配置中的 `core.fsmonitor` 会被 `check-ignore` 执行（E6k，钩子确实运行了）。仓库本地配置按 git 的模型可信，Claude Code 自己的 `git status` 也会执行它；作为加固，建议加 `-c core.fsmonitor=false`。
- 该文件已被跟踪、只是本地删除时，仍判为“新建且未忽略”并写入 exclude（E6 i）。exclude 对已跟踪文件无效，提示“已写入 exclude”会给人已受保护的印象。情形很窄。
- 工作树写入的是公共目录的 `info/exclude`（E6 e），对同一仓库的所有工作树生效，这是 git 的机制，正确；建议在提示或文档中说明。

### PH4A-P3-04 读回与结果文字的余量

- 移除 marketplace 成功时说“并卸载了从它安装的 N 个插件”，但读回只核对 marketplace 已消失，没有核对这些插件已卸载。冒烟是在插件已卸载后才移除 marketplace，这一句没有被真实命令行验证过。
- 刷新的读回只核对 marketplace 仍在，可以比较 `refreshedAt` 是否前进。
- 添加 marketplace 的读回只比较名称集合，没有核对新条目的来源与请求一致。
- 受影响插件清单与 marketplace 的 `revision` 只覆盖命令行清单中的安装；`installed_plugins.json` 中其他项目的安装不在其中，而 Claude 移除 marketplace 时可能一并卸载它们。

### PH4A-P3-05 锁内重读与操作记录的小处

- 锁内重读（`claude-actions.mjs:173`）没有再看 `state.claude.unconfirmed`：取锁前的检查之后清单读取失败时，状态会回落到 `installed_plugins.json` 等文件证据，仍会继续执行。大多数情况下修订号会不一致而停住，但没有显式检查。
- 操作记录（`service.mjs:302-306`）写注册表前没有像 Codex 流程那样执行 `verifyDirectoryRoot(env.stateBoundary)`；错误记录的 `message` 没有 `redact`（命令行错误本身已脱敏，其他错误没有）；失败记录的 `target` 是原始对象 ID，成功记录是名称，两者不一致。
- 1 版快照先截取最近 200 条、再去掉 Claude 记录（`service.mjs:256`、`:280`），Claude 记录多时 1 版看到的 Codex 记录会少于 0.10.2。

### PH4A-P3-06 位于上层目录的技能目录插件，启停工作目录取的是那个上层目录

- `claude-actions.mjs:82` 用 `dirname(dirname(skillsDir))` 作为项目目录。项目是仓库的子目录、插件在仓库根的 `.claude/skills` 中时（目录会向上找到仓库根），启停以仓库根为工作目录、写仓库根的本地设置，而不是当前项目的（E11：工作目录为 `repo`，当前项目为 `repo/sub`）。Claude 在子目录中运行时是否读取仓库根的本地设置，本轮无法核实。读不到时读回会失败，但仓库根的设置已被改动。建议这种情形以当前项目为工作目录。

### PH4A-P3-07 界面上的功能性小处（不属界面打磨）

- `App.tsx:577`：结果带 `needsReload` 时一律追加“新的 Codex 会话或重载后生效。”，Claude 的写操作也会显示“Codex”。
- 确认后重发（`NativeConfirm.tsx:22-25` 经 `App.tsx:543`）会按当时的快照重新计算 `expectedRevision`，而不是沿用弹出确认框时的那个。目前确认框打开期间不会自动刷新，风险很低；建议把首次请求所用的修订号存入 `NativeConfirmation.request`，让“确认的清单就是执行的清单”不依赖这一前提。
- `gitExclude` 复选框默认勾选（`NativeConfirm.tsx:44`）。HLD 3.4 写的是“征得用户同意后写入”，是否默认勾选请 Owner 决定，并记入 `41`。

### PH4A-P3-08 文档小处

- `36c` 7.3 写“所有 Claude 写操作……结果带 `needsReload: true`”，但添加与刷新 marketplace 不带，移除只在有受影响插件时带。代码的做法更合理，建议改契约的措辞。7.4 示例中启停成功结果带 `nativeRules`，实现中不带。
- 契约索引 `36` 第 4 节的清单仍写 `36c` 为 0.13；索引与 HLD 元信息中的“状态”没有提到 0.15、v1.17（HLD 状态栏仍写“v1.16 … 待增量复审”）。
- `37` 进度表写冒烟“前后核对真实 Claude 配置的修改时间与缓存条目数未变”，`tests/claude-writes-smoke.mjs` 中没有这一步，应是手工所做。建议写明方法，或把它写进脚本（只比较修改时间与条目数，不读内容）。

### PH4A-P3-09 冒烟覆盖的空白（建议在下次用真实命令行时补）

- 没有 local、project 范围的安装及其读回：Claude 记录的 `projectPath` 是工作目录还是仓库根，决定了 `claude-actions.mjs:110-113` 在子目录项目中会不会误报失败。
- 没有在“仍有插件从它安装”时移除 marketplace（对应 P3-04 第 1 条）。
- 没有触发 `shownCommand` 的真实输出：`HOST_MANAGED` 的识别依据的是帮助文本中的字段名。

## 4. 重点核查项的结论

| 项 | 结论 | 依据 |
|----|------|------|
| 1. `claude-writer.mjs` 白名单与脱敏 | **成立**（细节见 P3-02） | 只允许 7 个子命令，别名与大小写变体被拒；参数只允许 `--json`、`--keep-data`（仅卸载）、`--scope`（取值只能是 user、project、local）；`--scope=x`、`-s`、`-y`、`--accept-command`、`--prune`、`--all`、`--config`、`--registry`、`--sparse`、`--claudeai` 都被拒；以 `-` 开头的对象、`--`、含换行的对象都被拒；带作用域的 5 个子命令缺 `--scope` 或缺 `--json` 被拒（E1，26 种输入）。`shownCommand` 不论退出码都判为 `HOST_MANAGED`；URL 中的凭证与 `token=` 被脱敏（E2）。子进程环境沿用白名单并附加 `DISABLE_AUTOUPDATER`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` |
| 2. `claude-actions.mjs` | 锁、重读、修订号、确认 **成立**；marketplace 移除的确认 **不成立**（P1-01）；启停缺省作用域 **有缺口**（P2-01） | E9：取锁前的检查只持有实例锁与 Codex 锁；锁内重读、写命令、读回都持有三把锁；结束后全部释放；Claude 根被删时不取锁、不创建根。`CONFIRMATION_REQUIRED` 在 project 作用域、卸载、移除 marketplace、新建未忽略的本地设置文件时触发，并在修订号核对之后，因此确认与所见状态绑定。读回：启停核对有效状态（只会误报失败，不会误报成功）；安装按“名称@市场 + 作用域 + 项目路径”核对；卸载按安装身份核对；添加按前后差异核对。没有发现会把未完成判为完成的路径，但除启停外都没有测试（P2-03）。操作记录带 `agent: "claude"`；确认、过期、未找到不记录 |
| 3. `local-settings.mjs` | **成立**（细节见 P3-03） | 用真实 git 核对（E6、E8）：文件已存在时不问；被 `.gitignore`（含 `.claude/` 目录模式且目录不存在、`**/` 通配）忽略时不问；子目录项目写 `/sub/.claude/settings.local.json`；工作树写公共目录的 exclude；子模块写 `.git/modules/sub/info/exclude`，父仓库不变；幂等；补结尾换行；不改 `.gitignore`；清除 `GIT_DIR` 等变量。经服务走通“同意、拒绝、已忽略”三种情形 |
| 4. `service.mjs` | **成立** | 2 版字段只在带 `agent` 时允许（M33 被发现）；Claude 的拒绝依次为 `MODE_DISABLED`（演练环境）、`UNSUPPORTED_FOR_AGENT`、`AGENT_NOT_INSTALLED`、`AGENT_UNCONFIRMED`、`AGENT_READ_ONLY`（`CLI_UNAVAILABLE` 走不到，见 P3-01）；快照在未启用或无法确认时统一只读（M31 被发现）；1 版快照过滤 Claude 记录（M32 被发现）。Claude 分支在 `withOperation` 之内，`requestBusy` 期间后台与其他请求被挡住，结束后清掉 Claude 缓存；Codex 分支代码未动 |
| 5. `claude-catalog.mjs` 能力标记 | **基本成立**（错误码见 P3-01；marketplace 声明层见 P1-01） | synced、managed 范围、项目目录缺失：不可切换、不可卸载；托管锁定：不可切换、可卸载；设置与实际不一致、Claude 未报告启用状态：不可切换；技能目录插件只在 Claude 已加载时可切换，不提供移除；managed 层声明的 marketplace 不可移除；未安装插件 `canInstall: true` |
| 6. 前端 | 修订号、确认重发、安装作用域 **成立**；Agent 选择 **不成立**（P2-02） | `requestRevision` 只给 Claude 独有对象带修订号，共用技能留给 4c；确认重发带 `confirm` 与规则给出的选项（`agent-ui` 用例，M54、M55 被发现）；安装对话框按预览给出作用域，Codex 预览路径不变。Codex 流程：卸载与移除来源仍走原确认框，市场对话框在“两侧”“仅 Codex”时与改动前相同 |
| 7. 文档修订 | 见第 5 节 | — |
| 8. 测试 | **有缺口**（P2-03） | 定向用例覆盖了白名单、确认、修订号、启停读回、只读与无法确认、1 版过滤、HTTP 错误体与英日翻译；读回、锁与部分能力标记未被钉住。另核对了本提交新增的 33 条完整服务端提示（含未被用例触发的），只有一个基本走不到的片段“没有返回详情”缺翻译 |

## 5. 文档修订的判定

| 文档 | 修订 | 判定 |
|------|------|------|
| HLD v1.17（3.3 作用域、有限修订表） | 启禁缺省改为按安装范围：project、local 安装写该项目本地设置 | **方向合理，但不完整**：解决了“项目安装写到用户设置、影响其他项目”，与技能目录插件的规则一致；用户范围安装在启用状态由 project 或 local 层决定时仍会写用户设置（P2-01），建议再加“按决定层”一句。元信息“状态”未提 v1.17（P3-08） |
| `36c` 0.14 第 7.1 节 | `scope` 缺省例外；新建未忽略本地设置文件须带 `gitExclude` | **与实现一致**。随 P2-01 同步措辞 |
| `36c` 0.14 第 7.3 节 | `marketplace.add` 的作用域、不支持 `ref`、按差异读回；`plugin.previewMarketplace` 的 Claude 形态 | **与实现一致**。缺 `marketplace.remove` 会从所有作用域删除声明及其确认要求（P1-01）；“所有写操作带 `needsReload`”与实现不符（P3-08） |
| `36c` 0.14 第 10 节 | 1 版快照不含 Claude 记录 | **与实现一致** |
| 契约索引 0.15 | 修订记录 | **记录准确**；第 4 节清单中 `36c` 仍为 0.13（P3-08） |
| `37` 阶段 4 段落与进度表 | 4a～4d 拆分；命令行写法；4a 完成说明 | **拆分合理，命令行事实与帮助文本一致**（`-s/--scope`、`--keep-data`、`--json`、`-y`/`--accept-command`、remove 不带作用域时从所有作用域删除）。“完整套件 413/413”经本轮复核成立（第 6 节）；冒烟“核对真实配置未变”的方法未写明（P3-08） |

## 6. 验证命令与结果

### 6.1 命令

所有测试与实验都在导出副本的应用目录（`plugins/skilldock/skills/skill-manager/assets/app`）中，经下列包装在隔离沙箱内运行：`sandbox-exec -f …/verify/phase2-review/hermetic.sb`，加 `env -i`（临时 `HOME`、`TMPDIR`，最小 `PATH`）和连接守卫（拦截 4771、4781 与非本机地址并记录）。下表中的 `$R` 指 `…/scratchpad/verify/phase4a-review`。

| 命令 | 位置 | 结果 |
|------|------|------|
| `git archive 95fdb7a \| tar -x -C $R/export`；为应用目录建立指向主工作区同一目录 `node_modules` 的符号链接 | 主工作区（只读）→ scratchpad | 完成 |
| `node --test tests/claude-actions.test.mjs tests/claude-catalog.test.mjs tests/agents.test.mjs tests/agent-ui.test.mjs` | 导出副本 | **43/43 通过** |
| `npm test`（只跑一次，关闭 npm 的版本更新检查） | 导出副本 | 413 项：通过 358、失败 0、**跳过 55**。跳过的是 `compat-matrix.test.mjs`，它要在 Git 仓库中取冻结提交，而导出副本不是仓库 |
| 在导出副本根目录执行 `git init`，用 `objects/info/alternates` 只读引用主仓库的对象库，再运行 `node --test tests/compat-matrix.test.mjs` | 导出副本 | **55/55 通过**。与上一行合计 413 项全部通过，与提交说明一致 |
| `./node_modules/.bin/tsc --noEmit` | 导出副本 | 通过 |
| 实验 E1～E11（脚本在 `$R/exp/`） | 临时目录 | 见第 3、4 节 |
| 变异 M01～M56（不含 M19，脚本 `$R/mut/run.mjs`，每项重新复制应用目录后运行上面 4 个定向测试文件） | `$R/mut/work`（每项结束后删除） | 31 项被发现、24 项未被发现（6.2） |
| 守卫记录 `$R/guard.log` | — | 文件不存在：没有任何连接被拦截 |

### 6.2 变异结果

- **被发现（31）**：M01 去掉修订号核对、M02 缺修订号时放行、M03 去掉 project 确认、M04 去掉 `gitExclude` 询问、M05 启停读回恒真、M13 卸载不需确认、M14 移除 marketplace 不需确认、M15 移除 marketplace 不核对修订号、M20 任意参数、M21 不要求 `--json`、M22 允许 managed 作用域、M23 不识别 `shownCommand`、M24 不要求显式作用域、M25 允许多个对象、M28 任意命令可带 `--keep-data`、M29 只读时不拒绝、M30 无法确认时不拒绝、M31 快照不标只读、M32 1 版快照含 Claude 记录、M33 2 版字段不要求 `agent`、M37 synced 不阻止、M38 项目目录缺失不阻止、M40 未加载的技能目录插件可切换、M42 托管锁定可切换、M45 已存在的文件也询问、M47 启停缺省总写用户设置、M51 卸载 project 安装不提示共享设置、M52 Claude marketplace 接受 ref、M53 保留数据不传给命令行、M54 界面不带修订号、M55 确认重发不带 `confirm`。
- **未被发现（24）**：M06～M12（安装、卸载、marketplace 添加、刷新、移除的读回）、M16～M18（Claude 锁）、M26（取第一行 JSON）、M27（错误不脱敏）、M34（演练环境不拒绝 Claude）、M35（`nativeRules` 随任何错误；`AppError` 只在确认时带规则，属可接受的冗余）、M36、M39、M41（三种能力标记）、M43、M44、M46（本地设置与 exclude）、M48、M56（工作目录取当前项目）、M49（确认与过期也记为失败）、M50（项目目录不存在也执行；目录已先挡住，属纵深防御）。

### 6.3 实验摘要

| 编号 | 内容 | 结果 |
|------|------|------|
| E1 | 26 种白名单输入 | 见第 4 节第 1 行；接受重复 `--scope`、空对象、含空白或 U+202E 的对象（P3-02） |
| E2 | 替身命令行：末尾非 JSON 行、退出 0 带 `shownCommand`、带凭证的错误、无 JSON、超时、超大输出 | 取到较早的 JSON 行；`HOST_MANAGED`；凭证脱敏；`CLI_JSON`；`CLI_TIMEOUT` 但文字为“失败”；输出超限为 `CLI_FAILED` |
| E3、E3b | 用户范围安装、由 project 或 local 层决定启用状态时启停 | 写 `--scope user`，读回失败（P2-01） |
| E4 | 项目共享设置声明的 marketplace 移除 | 可移除；确认无 scope 规则；命令不带作用域（P1-01） |
| E5 | managed 范围安装、项目目录缺失 | 两者都返回 `PROTECTED_PLUGIN`（P3-01） |
| E6、E6k | 真实 git 下 12 种仓库形态；`GIT_DIR`；`core.fsmonitor` | 见第 4 节第 3 行与 P3-03 |
| E7 | 市场对话框“发往哪一侧” | 仅 Claude 可管理时发往 Codex（P2-02） |
| E8 | 经服务与真实 git 的本地设置询问 | 同意、拒绝、已忽略三种情形都正确 |
| E9 | 写操作期间三把锁的持有；删掉 Claude 根后写 | 顺序正确；不创建根 |
| E10、E10b | 新增服务端提示的英日翻译 | 33 条完整提示中只有一个基本走不到的片段缺翻译 |
| E11 | 仓库子目录项目中上层技能目录插件的启停 | 工作目录为仓库根（P3-06） |

## 7. 操作披露

- 主工作区中唯一的写入是本报告（未提交）。没有提交、推送、切换分支，也没有修改其他文件。
- 主工作区中只运行了只读 git 命令：`log`、`show`、`diff`、`rev-parse`、`status`、`archive`（其中 `git show 89eab4f:<文件>` 只用于第 2 节的参考说明）。导出副本用 `objects/info/alternates` 只读引用了主仓库的对象库，没有向主仓库写入。
- 所有测试、实验与变异都在 scratchpad 的导出副本或临时目录中进行，并经沙箱包装；`npm test` 只跑了一次；`compat-matrix` 另单独跑了一次（不是完整套件）。
- 没有向 127.0.0.1:4771 或 4781 发送请求；没有运行真实的 codex 或 claude 命令行（只用了 scratchpad 中的替身脚本与服务内的替身）；没有下载任何东西（npm 版本检查已关闭，守卫没有记录）；没有运行 launchctl。
- 没有读写真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock*`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`。E6 中的 `.gitconfig`、全局忽略文件都写在沙箱的临时 `HOME`（`$R/home`）中，用完即删。读取了会话 scratchpad 中已保存的 Claude 2.1.288 帮助文本（`claude-plugin-help.txt`），没有读取 Claude 可执行文件。
- 报告中没有密钥；E2 中的“凭证”是自造的假值，只用来验证脱敏。
