# 最终 UAT 第一部分修复评审（`92a804b..73c438a`）

> 本报告是独立评审意见，不构成提交、推送、合并或发布的授权。源码结论与环境状态分开写。契约、HLD 的批准和 Owner 决定都由产品 Owner 作出。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 被评审提交 | `73c438a`（tree `3adb0461f4ae…`），分支 `feature/skilldock-0.11-cross-agent`；基线 `92a804b` |
| 范围 | `git diff 92a804b 73c438a`：8 个文件，增 80 行、删 21 行（diff sha256 前缀 `f155941a01e6`）。代码：`server/project-context.mjs`、`scripts/launch.mjs`；用例：`tests/launcher.test.mjs`、`tests/launch-plan.test.mjs`；文档：`37`、`41`（UI-17～UI-19）、`61`（修订）、根 `CHANGELOG.md`（两条已知限制） |
| 背景 | 另一台电脑最终 UAT 第一部分（Claude 桌面应用）发现：① Codex 原生入口每次在界面顶部显示“已跳过无效的项目目录 …/compat/legacy-project（--project）”；② 沿用运行实例时 stderr 的“最终扫描目录”与实例实际项目不符 |
| 冻结面 | 36b 第 6.3 节（项目回退：“跳过的显式值（①②）一并注明，不另弹提示”）；36c 第 4 节（健康检查 `project`、`launchProject` 冻结，`projectContext` 不冻结、沿用 0.10.2 形态）；36a 第 7 节（固定子目录“不作为任何项目使用”） |
| 评审者 | 独立的 Claude 评审会话（委托子任务）。只做评审，不修改被评审的文件；不是人类评审，也不代表任何 Owner |
| 日期 | 2026-10-12 |
| 工作方式 | 用 `git archive 73c438a` 导出到 scratchpad 的 `review-uatfix/`，`node_modules` 软链接到原工作树同一路径。所有测试与实验都经 `sandbox-exec -f …/verify/phase2-review/hermetic.sb` 运行，`HOME` 指向 scratchpad，去掉 `CLAUDECODE`、`CODEX_HOME`、`PORT`，Node v22.14.0。变异实验在 `skill-manager/` 的完整拷贝中进行，每份只改一处。兼容矩阵需要历史提交：在导出目录 `git init`，以只读的 `objects/info/alternates` 引用原仓库对象库（不改原仓库）。实验脚本放在 scratchpad 的 `review-uatfix-exp/`，不在被评审的树内。所有实例都用临时数据目录与空闲端口（矩阵用例都预置了启动记录或显式 `PORT`）；本轮没有加载连接守卫 |
| 远端状态（只读核对） | 本地远端跟踪分支 `origin/feature/skilldock-0.11-cross-agent` 指向 `73c438a`；`61` 的修订若再改，需要再推送一次 |

## 2. 结论

**APPROVED（带 P2，须在另一台电脑继续第二部分之前修订 `61`）**

- P0：0
- P1：0
- P2：2（UF-P2-01、UF-P2-02）
- P3：6（UF-P3-01～06）

要点：

- **代码修复满足 36b 第 6.3 节，其他冻结义务不变。** 跳过的显式值只进 `skipped`，`launch.mjs` 在解构时把它与 `explicit` 一起剥掉，只写到 stderr；`projectContext` 的字段集合、stdout JSON 的顶层字段、退出码、回退链顺序与各级性质、项目切换规则都没有变（3.1）。真实 0.11 端到端（N-03 改装探针）：新实例健康检查的 `projectContext` 为 `{requested, effective, source: "record", workingDirectory, warnings: []}`，没有 `skipped`。
- **新增 stderr 行准确**：只在“未显式指定项目且实例项目不同”时出现一次，复用与非复用两条路径不会重复，显式切换和项目相同时不出现（3.2）。原有的“最终扫描目录”一行仍在决定沿用之前打印，两行并存时前一行不准（UF-P3-01）。
- **新增用例有效**：基线 49/49；分别还原两处修复，新用例都失败（3.3）。用例没有钉住“`skipped` 不进入 `projectContext`”（变异 M3 存活，UF-P3-02）。
- **两项 P2 都在 UAT 说明 `61`**：
  - UF-P2-01：已由修复前构建启动的实例，会把旧提示带过复用、隐式重启和换版本；Codex 一侧在发布前仍是修复前的启动器，全新启动时还会重新写入提示。`61` 没有说明，也没有核对这项修复的步骤，测试者很可能把提示仍在报告为“未修复”。
  - UF-P2-02：`61` 让做完第 3～6 节的人“从第 6 节第 5 项继续”，会跳过第 4 项新加的“启用 Claude 管理”。第 7 节第 5 项与第 7A 节都依赖它。

## 3. 逐项结论

行号都指 `73c438a` 导出副本。`assets/app/` 下的文件省略这一前缀；`references/` 下的文件只写编号。

### 3.1 是否满足 36b 第 6.3 节，且不改变其他冻结义务

| 义务 | 结论 | 依据 |
|------|------|------|
| 跳过的显式值只在 stderr 注明，不另弹提示 | **满足** | `server/project-context.mjs:70-71`：回退路径返回 `warnings: []` 与单独的 `skipped`；`scripts/launch.mjs:258` 解构 `{ explicit, skipped = [], ...projectContext }`，`:261` 把 `skipped` 与 `warnings` 一并写 stderr。界面只读 `projectContext.warnings`（`src/App.tsx:812`） |
| stdout JSON 形状与字段 | **不变** | 实验 `shape`：修复前后 `start`（新实例）与 `start`（复用）的顶层键都是 `backgroundService, cli, pid, project, projectContext, requestedProject, reused, state, status, url`，`projectContext` 的键都是 `effective, requested, source, warnings, workingDirectory`。与 36c 第 4 节示例一致 |
| 退出码 | **不变** | 本次改动没有新增或改变任何抛错路径 |
| 回退链顺序与显式／保存值性质 | **不变** | `project-context.mjs:65` 的五级数组与 `explicit` 标志未动；`launch-plan.test.mjs:46` 用例照常通过 |
| 项目切换规则 | **不变** | `launch.mjs:313`（`projectKept`）、`:314`（复用条件）、`:333`（`keptProject`）未动；`:327` 只多写 stderr |
| 0.10.2、0.10.3 调用 | **不变** | 兼容矩阵按名称挑选 12 项（N-01/N-02a、N-02b、N-03、S-02、S-13、S-19，各含示例实现与真实 0.11）全部通过。0.10.3 对被调用方 stdout 只做透传（36b 4.7、10.1），不解析 `projectContext` |

**`skipped` 会不会从别的途径进入服务或健康检查**（逐条核对）：

- 复用：`launch.mjs:328` 返回 `health.projectContext || projectContext`，后者已剥掉 `skipped`；只到 stdout，不进服务。
- 新实例、重启、换版本：服务只经 `SKILLDOCK_PROJECT_CONTEXT`（`launch.mjs:104`）接收 `runContext`，其三个来源（`:335-336`：剥掉后的 `projectContext`、运行实例的 `health.projectContext`、合成对象）都不含 `skipped`。服务端 `service.mjs:129-130` 把继承值合并进自身上下文。
- 迁移：`migrate()` 只拿 `runProject`（`launch.mjs:394`），启动记录的 `projectContext` 固定为 `null`（`launcher-record.mjs:90`）。
- 失败恢复：`recover()` 以 `projectContext: null` 启动（`launch.mjs:378`）；0.10.x 记录用旧实例自己的上下文（`:353`）。
- 0.11 自更新：`self-update.mjs:22-25` 以 `SKILLDOCK_PROJECT_DIR`（显式）调用 `restart`，得到新的上下文。
- 端到端：真实 0.11 的 N-03（实例已停止，0.10.2 原生入口带固定子目录调用）新实例 `projectContext.warnings` 为 `[]`，没有 `skipped` 键。

结论：修复后不会再产生带跳过说明的 `projectContext`。但**修复前构建写进运行实例的旧提示**会沿 `health.projectContext` 继续传递，见 UF-P2-01。

### 3.2 新增 stderr 行是否准确

实验 `lines`（同一数据目录，依次执行）：

| 步骤 | 复用 | 项目 | stderr 中相关行 |
|------|------|------|----------------|
| 1 显式 A，首次启动 | 否 | A | 最终扫描目录 A |
| 2 显式 A，再次 | 是 | A | 最终扫描目录 A |
| 3 隐式，工作目录为 other | 是 | A | 最终扫描目录 other；**沿用运行实例的项目 A** |
| 4 隐式，工作目录为 A | 是 | A | 最终扫描目录 A |
| 5 `restart` 隐式，工作目录为 other | 否（`keptProject`） | A | 最终扫描目录 other；**沿用运行实例的项目 A** |
| 6 显式 other（切换） | 否 | other | 最终扫描目录 other |
| 7 `restart` 显式 other | 否 | other | 最终扫描目录 other |

- 新行（`launch.mjs:327`）只在复用且 `!explicit`、实例项目不同时出现（复用分支里项目不同只可能来自 `!explicit`）。`:327` 之后只有构造返回值，不会抛错再落到 `:337`，因此同一次调用不会写两遍。
- 非复用沿用（`:337`，原有）与显式切换的行为不变。
- 修复前构建启动的实例被 `restart` 时（实验 `stale`），“沿用”行同样只出现一次。
- 残余：“最终扫描目录”（`:260`）在决定是否沿用之前打印，第 3、5 步里写的是 other，下一行又写沿用 A。`SKILL.md:30` 要求 Agent 核对“最终扫描目录”。见 UF-P3-01。

### 3.3 新增用例是否有效

- **基线**：`tests/launcher.test.mjs`、`tests/launch-plan.test.mjs`、`tests/project-context.test.mjs` 共 49 项，49 通过（沙箱内，约 54 秒）。新用例 `launcher.test.mjs:360` 与修改后的 `launch-plan.test.mjs:46` 都在其中。
- **变异**（每份拷贝只改一处，只跑这两个用例）：

| 编号 | 改动 | 结果 |
|------|------|------|
| M1 | 还原修复一：`project-context.mjs:70` 改回 `warnings: skipped`（不返回 `skipped`） | **被发现**：`launch-plan` 用例读 `info.skipped[0]` 失败；`launcher` 用例在“不另弹提示”断言失败（`warnings` 含 `…legacy-project（--project）。`） |
| M2 | 还原修复二：删去 `launch.mjs:327` | **被发现**：`launcher.test.mjs:378` 的“沿用运行实例的项目”断言失败 |
| M3 | `launch.mjs:258` 不再剥掉 `skipped`（`projectContext` 带着它进服务与健康检查），stderr 照写 | **存活**：两项都通过。见 UF-P3-02 |

- 用例写法：`stderrOf` 临时替换 `process.stderr.write`，`process.chdir` 在 `finally` 中还原；同一文件内的用例按顺序执行，没有并发风险。

### 3.4 文档

- **`61` 与 HLD 3.6、实现一致**：第 6 节第 4 项“Claude 在装 SkillDock 之前就已被发现会保持只读”与 HLD 3.6（首次出现时确定默认值）及 `agents.mjs:37-41`、`:72-77`（只在 `stored[agent]` 不存在时写默认值）一致。修订说明中的上一版 sha256 `7a489bd2…b283` 与 `git show 6d9d519:` 和 `92a804b:` 的 `61` 一致。第 3 节“同名 marketplace 就地改为该分支”与 `37` 第一部分记录一致。
- **`61` 的命令**：第 6 节第 5 项 `grep '读取清单用时' …/server.log | tail -5` 只读，只取计时行。该行由 `service.mjs:326` 写出，只含时间与 `codex-list`、`scan`、`agents`、`claude-list` 各段毫秒数，与说明一致；另一台电脑所装的 `e7bf95a` 已包含该日志（`7443a5a` 是其祖先）。第 7 节第 2、4 项用 `NAMES` 过滤。问题有两处：第 6 节第 1 项、第 8 节第 2 项要求读回 `plugin list --json`、`plugin marketplace list --json` 中某一项的字段，却没有给过滤命令（UF-P3-03）；续做起点与第 6 节第 4 项冲突（UF-P2-02）；没有覆盖本次修复（UF-P2-01）。第 7 节第 2 项的预期版本 `e7bf95a311b9` 来自另一台电脑的汇报，本轮无法独立核实。
- **CHANGELOG 两条已知限制**：
  - “Claude 一侧只列个人与项目技能”与实现一致：`claude-catalog.mjs:279-281` 只扫描个人技能目录与项目 `.claude/skills`，插件只计 `skillCount`（`:271`、`:294`）。“在插件页查看”说多了：插件详情只显示数量，并附有过时的提示“这一版只读取 Claude 插件，附带技能不单独列出。”（`src/App.tsx:1591`）。见 UF-P3-04。
  - “Codex 插件计划绑定按版本目录计算”与实现一致：`service.mjs:1828` 的绑定目录为 `pluginPath(…, plugin.version)`；`scheduler.mjs:187-193` 只对内容漂移做和解，路径或目录身份变化即 `TARGET_BINDING_CHANGED`（`:287`）。`61` 第 8 节第 4 项的提醒与此一致。
- **`37`、`41` 的记录**：`37` 第 216 行如实写了“已修复”和“已补一行说明”（没有声称改正了“最终扫描目录”），“0.11.x 文档修订”“改进候选”两行与实现一致。但这一行少了第三列“需要 Owner”（UF-P3-06）。`41` 的 UI-17（Codex 列出插件技能、Claude 只计数）、UI-18（Claude marketplace 卡片不显示 ref：`claude-catalog.mjs:333-336` 的 `source` 只取仓库、URL 或路径）、UI-19（与 `61` 第 6 节第 5 项衔接）都准确。

### 3.5 同类问题排查

| 路径 | 结论 |
|------|------|
| 0.11 原生入口 `native-backend.mjs:126`、`:131-133`：没有保存项目时把记录旧 `project`（固定子目录）作为 `--project` 与子进程工作目录 | 与 0.10.2 冻结行为（36b 6.1）一致，靠启动器回退链把它变成 ③～⑤ 级、非显式，这是有意的。修复后只剩 stderr 一行跳过说明；启动失败时原生入口把 stderr 末尾 2500 字符放进错误信息，属于失败诊断，可以接受。附带事实：这类启动的 `projectContext.workingDirectory` 记为固定子目录（N-03 端到端可见），界面不显示，只出现在健康检查与快照数据中，记录在案，不另列问题 |
| 继承运行实例的 `health.projectContext`（`launch.mjs:335`）时连同 `warnings` 整体继承 | 修复前构建写进去的跳过提示会一直被带下去，见 UF-P2-01 |
| 非回退路径（`--project` 有效或未给、非转交）的 ②③④ 级与界面“切换项目” | 不按 4.4 排除 `<state>` 内的目录，固定子目录可以经 `project.json` 或环境变量成为项目，见 UF-P3-05 |
| `launch.mjs:262`“使用界面保存的项目，和本次调用目录不同” | 0.10.3 转交时工作目录是 `<state>`（36b 6.2），比较对象是内部目录，见 UF-P3-01 |
| 其他经环境传给服务的文字 | `startRuntime` 只经 `SKILLDOCK_PROJECT_CONTEXT` 传文字；服务自身只在请求目录含符号链接时加提示（0.10.2 行为）。没有发现其他把 stderr 级说明送进界面的路径 |
| `self-update.mjs:107` 比较记录旧 `project` | 只在代号 1 的分支中使用，此时记录是 0.10.x 格式、`project` 就是实际项目，不属同类问题 |

## 4. 新发现

### UF-P2-01 修复前构建写下的跳过提示会继续显示；`61` 没有说明，也没有核对步骤

- **现象**：实验 `stale`。先用修复前的启动器（`92a804b`）带固定子目录启动，健康检查返回的 `projectContext.warnings` 含跳过提示。再用修复后的启动器：
  - 隐式 `restart`：新实例的 `warnings` 仍是这条提示（`launch.mjs:333-336` 在 `keptProject` 时整体继承 `health.projectContext`）；
  - 之后带固定子目录 `start`：复用，返回同一条提示；
  - 只有 `stop` 后再 `start`，提示才消失。
  换版本（非显式项目）走同一段代码，提示也会被带过去。服务端在 `service.mjs:129-130` 合并继承值，所以提示会显示在界面上。界面“切换项目”（`selectProject` 重建上下文）、0.11 自更新（显式环境变量）以及重启电脑后的全新启动，都会清掉它。
- **影响**：已发布版本都不会写出这种上下文，所以只影响跑过修复前 0.11 构建的电脑，也就是两台 UAT 电脑（另一台电脑用的是真实数据目录）。另一台电脑上：
  - 第 7 节更新 Claude 一侧后版本仍是 0.11.0，按 DEC-SDX-008 沿用旧实例，提示照旧显示；
  - Codex 一侧在 `60` 第 8 节改回 `main` 之前，一直是修复前的启动器（同版本不转交，`launch-plan.mjs:123-128`），实例停止后从 Codex 原生入口全新启动，提示又会被写回。
  `37` 记为“已修复”，`61` 修订却没有提这件事，测试者很可能把“提示仍在”报告为修复无效。这项修复也没有任何真机核对步骤。
- **建议**：
  1. 在 `61` 第 7 节第 4 项之后加一项。先说明：沿用修复前启动的实例时提示仍会显示。再写核对方法（停止实例需征得用户同意）：Claude 一侧更新后停止实例，先从 Claude 打开（修复后的启动器），再打开 Codex 原生入口（复用），确认顶部不再出现“已跳过无效的项目目录”。最后说明：Codex 一侧改回 `main` 之前，若实例由 Codex 原生入口全新启动，提示会再出现，这属预期。汇报表加一行。
  2. （可选，代码）`keptProject` 继承 `health.projectContext` 时只沿用 `requested`、`effective`、`source`，`warnings` 按当前事实重算（只保留符号链接说明），或去掉“已跳过无效的项目目录”开头的条目。这样旧提示在一次隐式重启后就会消失。

### UF-P2-02 `61` 的续做起点会跳过“启用 Claude 管理”

- **现象**：`61` 第 8 行要求做完第 3～6 节的人“从第 6 节第 5 项继续”。本次修订在第 6 节第 4 项新增了动作：“请用户点‘启用管理’，再记录”。按第一部分的记录（`37` 第 216 行：Claude 一侧为“只读”），这一步很可能还没做。
- **影响**：
  - Claude 只读时，Claude 的更新项 `canCheck`、`canApply` 都为假（`multi-agent.mjs:61`），第 7 节第 5 项“在更新页检查并应用 Claude 中的 skilldock”做不了；
  - 第 7A 节的 Agent 选择只在两侧都启用管理时出现（`61` 第 118 行）。
  第二部分会在这两处偏离说明。
- **建议**：续做起点改为“从第 6 节第 4 项的‘启用管理’继续（第一部分已启用的跳过）”，或在第 7 节开头加前置读回：Agent 环境页 Claude 为“已启用管理”。

### UF-P3-01 “最终扫描目录”仍在决定沿用之前打印；转交时“本次调用目录”是内部目录

- `launch.mjs:260` 在复用判定（`:314`）与 `keptProject`（`:333`）之前打印“最终扫描目录”。隐式沿用时，stderr 先写本次调用解析出的目录，下一行才写“沿用运行实例的项目”（3.2 第 3、5 步）。UAT 问题②所说的那一行本身没有改，只是补了一行更正。`SKILL.md:30` 要求 Agent 核对“最终扫描目录”，只看这一行就会误判扫描目录。
- 同类：`launch.mjs:262` 比较 `process.cwd()`。0.10.3 转交时工作目录固定为 `<state>`（36b 6.2），没有 `P` 且有 `project.json` 时，每次都会写“使用界面保存的项目，和本次调用目录不同”，而这里的“本次调用目录”是数据目录，不是用户的工作目录。
- 建议：把“最终扫描目录”移到决定之后，写 `runProject` 或 `health.project`（或把第一行改称“按本次调用解析的项目”，并在 `SKILL.md` 中说明以“沿用运行实例的项目”为准）；转交时（`SKILLDOCK_HANDOVER=1`）不写 `:262` 这一行。只涉及 stderr 文字，不涉及冻结面。

### UF-P3-02 用例没有钉住“`skipped` 不进入 `projectContext`”

- 变异 M3（`projectContext` 带着 `skipped` 进入服务、健康检查与快照）在两项用例下都存活。新用例只断言 `warnings` 为空。另外：
  - 修复前上下文被继承的情形（UF-P2-01）没有用例；
  - `SKILLDOCK_PROJECT_DIR` 级跳过说明的文字（`project-context.mjs:71` 的另一分支）也没有断言。
- 建议：在 `launcher.test.mjs:360` 中断言 `Object.keys(next.projectContext).sort()` 等于 `['effective', 'requested', 'source', 'warnings', 'workingDirectory']`；若采纳 UF-P2-01 建议 2，补一项“继承的上下文不带跳过提示”的用例。

### UF-P3-03 `61` 新增的读回没有给过滤命令

- 第 6 节第 1 项“再读回 `"$CLAUDE" plugin list --json` 中 skilldock 一项有没有错误字段”、第 8 节第 2 项“`"$CLAUDE" plugin marketplace list --json` 中该项的 source 不再带 ref”都只给了原始命令。执行者可能把整份列表打印出来，内容相当于 Claude 的插件安装记录与 `known_marketplaces`；私有 marketplace 的 Git URL 可能带凭证。这与 `61` 第 2 节“需要核对时只列名称”的边界不符。第 3 节的旧写法也是这样，但第一部分已做完。
- 建议：给出只打印目标一项所需字段的 `node -e` 过滤，例如 marketplace 只打印 `name === "testany-agent-skills"` 的 `source.repo` 与 `source.ref`，插件只打印 skilldock 一项的 `id`、`version`、`enabled` 以及是否存在 `errors` 一类字段（只报有无与条数）。

### UF-P3-04 CHANGELOG“在插件页查看”说多了；插件详情的提示已过时

- 插件详情只显示“附带技能（N）”，并提示“这一版只读取 Claude 插件，附带技能不单独列出。”（`src/App.tsx:1591`，`src/i18n/messages.json:2402`）。0.11.0 已能安装、卸载、启停与更新 Claude 插件，所以“只读取”不再属实；CHANGELOG 第 221 行的“在插件页查看”也会让人以为能看到技能清单。
- 建议：CHANGELOG 改为“只计入所属插件的技能数（插件页显示数量）”；界面提示改为“Claude 插件的附带技能随插件启用，不单独列出”，或登记到 `41` 的 UI-17 一并处理（改界面需要重建原生产物）。

### UF-P3-05 非回退路径与界面“切换项目”不排除数据目录内的目录

- `resolveProject`（`project-context.mjs:25-35`）对环境变量、`project.json`、工作目录三级只校验“存在且是目录”，不按 36b 4.4 排除 `<state>`；`selectProject`（`service.mjs:1901-1902`）同样如此。探针结果：
  - `project.json` 指向固定子目录、无 `--project` 也不在转交中时，`resolveLaunchProject` 返回 `source: saved`、`effective` 为固定子目录；
  - 环境变量指向它时返回 `source: environment`、`explicit: true`；
  - 只有转交（回退链）会跳过它。
- 影响：这需要用户在界面里手动选中隐藏的内部目录（或环境变量指向它），概率低。一旦发生，就违反 36a 第 7 节“不作为任何项目使用”和 36c 第 4 节“`project` 不得等于固定子目录”（K3：0.10.2 启动器将能核实并停止 0.11 实例）。这个问题早于本次改动，不由本次引入。
- 建议：`selectProject` 与 `resolveProject` 的 ②③④ 级都改用 `validProject`。无效时，界面返回 `PROJECT_UNAVAILABLE`，启动器在 stderr 注明后按原顺序取下一级。随下一次 0.11.x 修订处理即可。

### UF-P3-06 文档细节

- `37` 第 216 行只有两列，缺第三列“需要 Owner”（第 7 节需要 Owner 同意推送，应为“是”）。
- `61` 第 8 行的修订说明没有提到第 9 节汇报表的改动（删 Errors 行，增计时与两次更新的行）。

## 5. 验证记录

| 项 | 命令（均在沙箱内） | 结果 |
|----|------------------|------|
| 基线定向测试 | `node --test tests/launcher.test.mjs tests/launch-plan.test.mjs tests/project-context.test.mjs` | 49/49 通过 |
| 变异 M1、M2、M3 | 同上两文件，`--test-name-pattern='skipped --project\|project fallback'` | M1：2 项失败；M2：1 项失败；M3：全部通过（存活） |
| 兼容矩阵（按名称） | `node --test --test-name-pattern='N-01/N-02a\|N-02b\|N-03 \|S-02 \|S-13 \|S-19 ' tests/compat-matrix.test.mjs` | 12/12 通过（含真实 0.11） |
| N-03 端到端探针 | 矩阵的临时拷贝，在 N-03 断言后打印健康检查的 `projectContext`，跑完即删 | 真实 0.11：`source: record`，`warnings: []`，无 `skipped` |
| 实验 `shape`、`lines`、`stale` | scratchpad `review-uatfix-exp/` 下的独立脚本，复用 `launcher-fixture`；`stale` 的桩服务按 `service.mjs` 的方式回显继承的上下文 | 见 3.1、3.2、UF-P2-01 |
| 回退链探针 | 直接调用 `resolveLaunchProject` | 见 UF-P3-05 |

未运行：完整单元套件、e2e、原生产物重建（本次没有改界面源码），以及兼容矩阵的其余用例（按要求只跑定向测试）。真机上的界面效果（另一台电脑）无法在本轮核对，见 UF-P2-01 的建议。本轮没有访问 127.0.0.1:4771，没有读取或改动真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`，没有联网下载。
