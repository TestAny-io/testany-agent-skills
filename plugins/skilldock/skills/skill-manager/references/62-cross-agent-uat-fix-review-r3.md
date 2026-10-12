# UAT 修复评审 62 的第二次复核（`141d917..b1903be`）

> 本报告是独立评审意见，不构成提交、推送、合并或发布的授权。源码结论与环境状态分开写。契约、HLD 的批准和 Owner 决定都由产品 Owner 作出。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 被评审提交 | `b1903be`（tree `80729594af5f…`），分支 `feature/skilldock-0.11-cross-agent`；基线 `141d917`（tree `312cc494b2d1…`） |
| 范围 | `git diff 141d917 b1903be`：5 个文件，增 235 行、删 22 行（diff sha256 前缀 `a88ba7c796e0`）。其中 176 行是上一轮报告 [62 r2](62-cross-agent-uat-fix-review-r2.md) 本身。代码：`scripts/launch.mjs`（13 行）；用例：`tests/launcher.test.mjs`（26 行）；文档：`61`（修订 r4）、`37` |
| 要复核的事项 | 62 r2 的 UF2-P2-01、UF2-P3-01～04；新改动是否引入问题；`61` r4 与 `37` 的新内容 |
| 评审者 | 独立的 Claude 评审会话（委托子任务）。只做评审，不修改被评审的文件；不是人类评审，也不代表任何 Owner |
| 日期 | 2026-10-12 |
| 工作方式 | 用 `git archive` 把 `b1903be` 与 `141d917` 分别导出到 scratchpad 的 `rereview3-uatfix/`（`launch.mjs` 与 `git show` 逐字节一致），`node_modules` 软链接到主工作树同一路径。所有测试与实验都经 `sandbox-exec -f …/verify/phase2-review/hermetic.sb` 运行，`env -i` 清空环境（只留 `PATH`、`LANG`，`HOME`、`TMPDIR` 指向 scratchpad），Node v22.14.0。实验脚本在 `rereview3-uatfix-exp/`，变异拷贝在 `rereview3-uatfix-mut/`（每份只改一处），日志在 `rereview3-uatfix-logs/`，都不在被评审的树内。所有实例都用临时数据目录与空闲端口 |
| 环境状态（只读核对） | 本地远端跟踪分支 `origin/feature/skilldock-0.11-cross-agent` 指向 `b1903be`（未 fetch），即本提交已推送。开发工作树在本轮进行中前进到 `e1516d0`（“61 r5”，9 个文件，增 56 行、删 26 行），**不在本轮范围内，未评审**；下文对 `61` 的意见针对 r4，其中一部分可能已在 r5 中处理，请对照 |

## 2. 结论

**APPROVED（带 P2：继续 `61` 第 7 节第 4 项之前，须先补“新开会话或重载插件”）**

- P0：0
- P1：0
- P2：1（UF3-P2-01）
- P3：6（UF3-P3-01～06）

要点：

- **62 r2 的 5 项中 3 项已关闭，2 项部分关闭**（UF2-P3-01 的符号链接提示仍在决定之前；UF2-P3-04 的 r3 修订说明补记错了对象）。逐条见第 3 节。
- **代码改动正确，冻结面不变。** `finalProject` 在复用分支的 `try` 中不会抛错（4.1）。上一轮 22 个路径步骤与本轮新增 18 个步骤中，所有成功路径“最终扫描目录”恰好一次；“使用界面保存的项目，和本次调用目录不同”只在“保存项目就是最终目录、非 0.10.3 转交、调用目录不同”时出现一次，位置在最终目录之后（4.2）。两版的 stdout 字段与退出码逐项一致；唯一的差别是一个修复：调用目录的 `realpath` 报 `EACCES` 时，`141d917` 整个启动失败，`b1903be` 正常复用。
- **新用例有效**：上一轮存活的两个变异（去掉转交条件、非复用路径写本次解析的目录）现在分别被 `launcher.test.mjs:405`、`:335` 发现。但本次的核心条件 `final === project` 与新加的 `.catch` 没有用例覆盖，去掉后 50 项全部通过（UF3-P3-01）。
- **`61` 第 8 节第 2 项已改对**：从 `known_marketplaces.json` 按键只读该项 `source` 对象的 `source`、`repo`、`ref`，只读，字段形状与 36a 9.1/9.2 及实现的四处读法一致，`hasRef` 能区分“没有 ref”与“ref 为空”。剩余的是对照读数的位置与异常路径（UF3-P3-03）。
- **`61` 第 7 节改走 SkillDock“更新”页的说法与实现一致**：检查前先刷新远端 marketplace，SkillDock 条目是 Git 托管 marketplace 内的相对路径、无版本，按内容指纹判定有更新，经 `claude plugin update` 应用并按指纹读回。
- **唯一的 P2 在 `61` 第 7 节第 4 项与第 5 项第 3 小项**：都要求“在当前会话中”调用 `skilldock:skill-manager`，但实现自己的成功提示是“新会话生效，已打开的会话需要重载插件”。未重载的会话若仍指向旧版本目录，实验确认该目录写入 `.orphaned_at` 后，其启动器以“此数据目录属于另一个安装来源；请使用独立 SKILLDOCK_STATE_DIR。”拒绝。第 5 项第 2 小项刚停止实例，第 3 小项又起不来，实例会停在那里，提示还会把测试者引向拆分数据目录（UF3-P2-01）。

## 3. 62 r2 各项的关闭情况

行号都指 `b1903be` 导出副本。`assets/app/` 下的文件省略这一前缀；`references/` 下的文件只写编号。

| 编号 | 结论 | 依据 |
|------|------|------|
| UF2-P2-01 `61` 第 8 节第 2 项读不到 ref | **已关闭** | 第 156 行改为 `node -e` 只读 `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/known_marketplaces.json` 顶层 `testany-agent-skills` 一项，打印 `source.source`、`source.repo`、`hasRef`、`source.ref`；第 159 行写明预期 `hasRef` 为 `false`，并提示切回前应能读到开发分支作对照；第 3 节第 43 行同步改为“读法见第 8 节第 2 项”。合成输入试跑：无 ref → `hasRef:false`；有 ref → `hasRef:true` 与分支名；缺该项 → “未找到”（5.1）。形状与 36a、实现一致。对照读数的位置与异常路径见 UF3-P3-03 |
| UF2-P3-01 决定之前打印的另外两类提示 | **部分关闭** | “使用界面保存的项目”提示移入 `finalProject`（`launch.mjs:265-269`），只在 `final === project`、非转交、调用目录不同时写，复用（`:334`）与重建（`:344`）都在确定最终目录之后调用。上一轮步骤 17 不再写该提示（4.2）。**未处理**：`:262` 的符号链接说明仍在决定之前按本次解析结果打印，实例沿用自己的项目时会写出“扫描使用解析后的真实目录”，而实际扫描的是实例的项目（实验 `symlink`）。见 UF3-P3-02 |
| UF2-P3-02 两处改动没有用例覆盖 | **已关闭** | 换版本用例（`launcher.test.mjs:326`）截取 stderr，断言“最终扫描目录”恰好一次且为 `other（沿用运行实例的项目）`（`:334-335`）；新用例（`:387`）在数据目录中以 `SKILLDOCK_HANDOVER=1` 启动，断言没有该提示（`:405`），换到另一目录时有（`:406`）。变异 M1、M2 分别被发现（4.4） |
| UF2-P3-03 `61` 第 7 节第 5 项的几处说明 | **已关闭** | 第 1 小项只取出并打印 `D`，写明“`D` 为空，或目录名不是刚更新到的版本摘要时，停下来告诉用户，不要停止实例”（第 116～123 行）；停止拆成第 2 小项，写明核对无误、用户同意后再单独运行（第 124 行）；第 5 小项改为“改回 `main` 后，实例下一次由新的启动器全新启动，或在界面中切换项目时消失”（第 127 行），与第 115 行一致。第 3 点是“说明，不要求改”，未采纳，可以接受 |
| UF2-P3-04 文档细节 | **部分关闭** | `37` 第 229 行补上“调用工作目录”一级。`61` r4 修订说明末尾的“补记 r3：第 9 节汇报表另加了‘旧提示核对’一行”记的是 r3 说明里已有的内容（第 10 行“第 9 节加一行”）。上一轮指出的是另一处：r3 改写了第一条修订说明（第 8 行，补“第 9 节汇报表相应增删”，并把续做起点移出该说明），r3 说明没有记下这处改动。它仍未记下，见 UF3-P3-05 |

## 4. 新改动是否引入新问题

### 4.1 `finalProject` 会不会在复用分支中抛错

复用分支（`launch.mjs:321-336`）的 `catch` 吞掉所有错误并落到重建路径。若 `finalProject` 写完“最终扫描目录”之后才抛错，就会写两遍，还会无谓地重启实例。逐项检查 `finalProject` 内可能抛错的位置：

| 位置 | 能否抛错 | 依据 |
|------|---------|------|
| 模板字符串 `${final}` | 否 | `health.project` 来自 JSON（字符串、普通对象或 `undefined`），转字符串不抛；`141d917` 在同一位置写同一行 |
| `process.stderr.write` | 与修复前相同 | 同一 `try` 内修复前就写这一行，没有新增风险 |
| `process.cwd()` | 实际不会 | `:256` 解析项目时已调用过一次（CLI 入口的 `path.resolve(process.argv[1])` 更早）。Node 主线程缓存工作目录，只在 `process.chdir` 时失效，之后目录被删也返回缓存值。实验 S13：调用目录在调用前被删，`reused: true`，最终行 1 次 |
| `canonicalPath(...)` | 否 | 异步函数：`ENOENT` 逐级回退到父目录，不抛；其他错误被 `.catch(() => null)` 吞掉，结果按“和调用目录不同”处理。实验 S14：调用目录的父目录 `chmod 000`，`realpath` 报 `EACCES`，`b1903be` 正常复用、最终行 1 次、提示 1 次。同一情形下 `141d917` 整个启动以 `EACCES: permission denied, realpath …` 失败（当时没有 `catch`），这是本次的附带修复 |
| 条件求值 | — | 短路：只有 `source === 'saved'` 且 `final === project` 且非转交时，才读工作目录 |

结论：**不会抛错落到重建路径。** 重建路径中的调用（`:344`）在内层 `try` 之外，即使抛错也只会让启动失败，不会重复写；同样不可达。

### 4.2 两行提示的次数与条件

**上一轮的 22 步实验**（原样复用 `rereview-uatfix-exp/paths.test.mjs`，只读）分别对 `141d917` 与 `b1903be` 运行。两版的顶层键、`projectContext` 键、`reused`、`project`、`migrated`、最终行次数、错误文字与退出码逐项一致（只有步骤 10 随机端口号不同）。stderr 只有两处差别：步骤 17（工作目录 other、保存项目 saved、实例在 other）不再写“使用界面保存的项目”；步骤 18（无实例）该提示移到最终行之后。

**本轮新增的 18 步**（`rereview3-uatfix-exp/saved.test.mjs`，专测有保存项目的路径）：

| 步骤 | 路径 | `b1903be`：最终行 / 提示 | `141d917`：最终行 / 提示 |
|------|------|-------------------------|-------------------------|
| S02 | 非转交，工作目录 other，无实例（全新） | 1 saved / 1（在最终行后） | 1 / 1（在最终行前） |
| S03 | 同上，实例在 saved（复用） | 1 saved / 1 | 1 / 1 |
| S04 | 工作目录就是 saved（复用） | 1 / 0 | 1 / 0 |
| S05 | 隐式 `restart`，工作目录 other，实例在 saved（重建，沿用 = 保存项目） | 1 saved / 1 | 1 / 1 |
| S10 | 实例在 saved，运行目录被改，复用在写最终行之前抛错，落到重建 | 1 saved / 1（不重复） | 1 / 1 |
| S13 | 调用目录在调用前被删（复用） | 1 / 1 | 1 / 1 |
| S14 | 调用目录 `realpath` 报 `EACCES`（复用） | 1 / 1，正常复用 | **启动失败**（`EACCES`），0 / 0 |
| S06 | 显式切换到 other | 1 other / 0 | 1 / 0 |
| S07 | 工作目录 other，实例在 other（复用沿用） | 1 other（沿用运行实例的项目）/ **0** | 1 / 1 |
| S08 | 隐式 `restart`，工作目录 saved，实例在 other（重建沿用） | 1 other（沿用…）/ 0 | 1 / 0 |
| S09 | 实例在 other，运行目录被改（重建沿用） | 1 other（沿用…）/ **0** | 1 / 1 |
| H01 | 0.10.3 转交（工作目录为数据目录），无实例 | 1 saved / 0 | 1 / 0 |
| H02 | 转交，实例在 saved（复用） | 1 / 0 | 1 / 0 |
| H03 | 转交，隐式 `restart`（重建，沿用 = 保存项目） | 1 / 0 | 1 / 0 |
| H04 | 转交，实例在 other（复用沿用） | 1 other（沿用…）/ 0 | 1 / 0 |
| V01 | 实例 0.11.0 在 other，隐式换到 0.11.1（重建沿用） | 1 other（沿用…）/ **0** | 1 / 1 |
| V02 | 实例 0.11.0 在 saved，隐式换到 0.11.1（重建，沿用 = 保存项目） | 1 saved / 1 | 1 / 1 |

结论：

- 所有成功路径上“最终扫描目录”恰好一次，就是实例实际扫描的目录。
- 保存项目提示恰好在“最终目录就是保存项目、非转交、调用目录不同”时出现一次，否则为 0。实例沿用别的项目时（S07、S09、V01）不再写，这正是 UF2-P3-01 要的改动。转交的四种形态都不写。
- 提示现在在最终行之后，也在“服务会在后台运行”一行之后。36b 只要求“写一行说明最终采用的项目及其级别”（第 196 行），没有约束这条提示的位置；行数不增，256 KiB 上限不受影响。
- 同类残余（早于本次）：0.10.2 原生入口形态（`--project` 与工作目录都是数据目录内的固定子目录）有 `project.json` 时，仍拿内部目录作“本次调用目录”比较并写该提示，还建议“可用 --project 明确覆盖”。`141d917` 与 `b1903be` 相同（实验 `native-saved`）。见 UF3-P3-02。

### 4.3 冻结面

| 冻结面 | 结论 | 依据 |
|--------|------|------|
| stdout JSON | **不变** | 两个 `return` 语句（`:335`、`:411`）未改；22 步与 18 步实验中两版的 stdout 字段逐项一致（S14 除外：`141d917` 失败、无 stdout） |
| 退出码 | **不变**（一处失败变成功，属修复） | 没有新增、删除或移动任何 `throw`；S14 的 `EACCES` 是旧代码在提示判断里未捕获的错误，现在不再中止启动 |
| 36b | **不变** | 改动只涉及 0.11 启动器的 stderr 顺序与条件；6.3 的跳过说明仍在 `:262`；冻结调用方不解析 stderr（6.1 只看退出码，6.2 实时透传，0.10.3 原生入口失败时取末尾 2500 字符） |

### 4.4 新用例（变异）

基线：三组定向测试 50/50 通过（约 49 秒）。每份变异拷贝只改 `scripts/launch.mjs` 一处，再跑三组定向测试：

| 编号 | 改动 | 结果 |
|------|------|------|
| M1 | 去掉 `env.SKILLDOCK_HANDOVER !== '1'`（上一轮的 MD） | **被发现**：`launcher.test.mjs:387` 用例，`:405` 断言失败（转交时写了提示） |
| M2 | 重建路径写 `finalProject(project)`（上一轮的 ME） | **被发现**：`:326` 用例，`:335` 断言失败 |
| M3 | 去掉 `final === project` | **存活**（50/50） |
| M4 | 去掉 `canonicalPath(...)` 的 `.catch` | **存活**（50/50） |
| M5 | 去掉“（沿用运行实例的项目）” | **被发现**：`:326`、`:362` 两项 |
| M6 | 复用路径写 `finalProject(project)` | **被发现**：`:362` |

新用例本身的写法没有问题：转交一次走全新启动（重建路径），调用一次走复用路径，用完都在 `finally` 中停止实例并恢复工作目录。M3、M4 见 UF3-P3-01。

## 5. 文档

### 5.1 `61` 第 8 节第 2 项的读回命令

| 检查项 | 结论 | 依据 |
|--------|------|------|
| 是否只读 | 是 | 只有 `readFileSync` |
| 是否只打印所需字段 | 正常路径是 | 只打印 `source`、`repo`、`hasRef`、`ref` 或“未找到”，不打印 `url`、`installLocation` 等。从 `61` 原样取出程序、喂合成文件试跑：github 无 ref → `{"source":"github","repo":"TestAny-io/testany-agent-skills","hasRef":false,"ref":null}`；github 有 ref → `hasRef:true` 与分支名；git 形态 → 只有 `source:"git"`、`hasRef`、`ref`（无仓库信息）；缺该项 → “未找到”。**异常路径**：文件不存在时报 ENOENT 与路径；JSON 损坏时，Node 的报错会原样打出出错的那一行 JSON（单行文件即整份内容，含 `url` 中可能的凭证）。见 UF3-P3-03 |
| 字段形状 | 一致 | 36a 9.1“顶层 `<名称>` 对象的 `source` 字段”、9.2 `{"source":"github","repo":…}` / `{"source":"git","url":…}`；实现：`claude-catalog.mjs:123` 读整个对象、`:333` 取 `entry.source?.repo \|\| entry.source?.url \|\| entry.source?.path`；`installs.mjs:96-97` 取 `known[名称]?.source`；`service.mjs:466-472` 取 `known.installLocation` 与 `known.source` 对象；`claude-plugin-updates.mjs:57-60` 取 `source`、`repo`、`url`、`path`、`package`。36a 9.1 中“`ref` 等其他键一律忽略”是来源身份规范化的规则；这里读 `ref` 只供人工核对，不冲突 |
| 配置目录 | 一致 | `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` 与 `server/claude-root.mjs:59` 的默认取法相同 |

隔离环境的样本（scratchpad 中早前各实验的 `known_marketplaces.json`，只打印键名）都是 `{installLocation, lastUpdated?, source: {source, repo|url|path}}`；其中没有带 `ref` 的 github 样本，所以 ref 的实际位置只能靠第 159 行说的对照读数确认。

### 5.2 第 7 节“改走 SkillDock 更新页”与实现

| `61` 的说法 | 实现 | 结论 |
|------------|------|------|
| 更新页有“Claude 中的 skilldock（经 Claude 命令行更新）” | Claude 侧插件单独列出，不与 Codex 侧合并（`server/multi-agent.mjs:40`），marketplace 安装的插件路由为 `claude-plugin`，提示“更新经 Claude 命令行完成，并读回核对”（`server/claude-updates.mjs:43-44`） | 一致 |
| 检查时由 SkillDock 刷新 marketplace | 非 `directory`/`file` 类 marketplace 先运行 `plugin marketplace update <名> --json`（`service.mjs:798-799`）；用例 `claude-plugin-updates.test.mjs:433-455`（M19）断言 | 一致 |
| SkillDock 条目没有声明版本、是 Git 托管 marketplace 内的相对路径 | 根 `.claude-plugin/marketplace.json` 的 `skilldock` 条目：`source: "./plugins/skilldock"`，无 `version`；`plugins/skilldock/` 下没有 `.claude-plugin/plugin.json`。`pluginSource` 对 github/git 类 marketplace 中的字符串来源给出 `git-market`（`claude-plugin-updates.mjs:37-39`） | 一致 |
| 按内容判定有更新 | 候选从刷新后的本机副本复制（`:174-176`）；`predictVersion` 对没有 manifest 与条目版本的 `git-market` 返回 `null`（`:211-220`）；`checkOutcome` 指纹不同即 `available`，文字“来源内容有变化；经 Claude 命令行更新。”（`:228-232`），不会出现 `VERSION_UNCHANGED`，也不给 `availableVersion` | 一致 |
| 应用经 Claude 命令行 | 应用前再核对本机副本内容（`service.mjs:865`），运行 `plugin update skilldock@testany-agent-skills --scope user --json`（`:897`），读回按内容指纹核对（`:899-901`）；成功提示“……新会话生效，已打开的会话需要重载插件。”（`:918`） | 一致；但第 4 项与第 5 项第 3 小项与这句提示矛盾，见 UF3-P2-01 |
| 用户全程不用终端 | 刷新与更新都由服务调用命令行 | 一致 |

补充：

- 单元测试覆盖了远端 marketplace 先刷新、内容比较、命令行应用与读回，但没有专门覆盖“Git 托管 marketplace + 相对路径 + 无版本（安装版本为提交摘要）”这一组合；第 7 节第 3 项是它的第一次真实执行。
- 按内容判定意味着：推送如果没有改动 `plugins/skilldock/` 下的文件，检查会显示“已安装内容与来源一致”（HLD 3.3A 第 633 行明说“仓库其他部分的提交也可能改变它；内容相同即记为无需更新”）。第 7 节开头“新提交即新版本”只对 Claude 计算的版本成立。“Agent 环境”页的一键更新按应用版本比较，两次推送都是 0.11.0，会报“marketplace 中没有更新的 SkillDock”（`server/skilldock-update.mjs:57-59`），所以第 7 节只能走“更新”页。见 UF3-P3-04。

### 5.3 `37` 的记录

| 行 | 结论 | 说明 |
|----|------|------|
| 第 218 行“UAT 修复复核 r2” | 准确 | APPROVED、P2 1、P3 4、8 项关闭 7 项部分 1 项，与 62 r2 一致；所列处理与代码、`61` 一致，“复核中存活的两个变异现在都会被发现”经本轮 M1、M2 证实。没有提到 UF2-P3-04 第 2 点，r4 的补记也没有补对（UF3-P3-05） |
| 第 219 行“最终 UAT 第二部分” | 与 `61` r4、HLD 一致；有一处待办没有落地 | 桌面应用中的现象属 UAT 实测，本轮无法核实。“推翻了 HLD 中‘Claude 以提交摘要计算版本并据此判断更新’的一半前提”对应 HLD 第 763 行。Owner 决定 README 中 Claude 的更新说明改为在 SkillDock“更新”页检查并应用、满足 AC-017 第 3 项（PRD 第 1364 行：README 的更新说明全程不要求终端）。但本提交没有改 README，`37` 也没有把它列为 0.11.0 发布前的待办；现有插件 README 第 59 行、`README.en.md` 第 59 行、根 `README.md` 第 167 行、`README.en.md` 第 97 行仍以 `/plugin` → **Marketplaces** → **Update marketplace** 为先。第二部分已经发现桌面应用里没有这个入口（UF3-P3-06） |
| 第 227 行“0.11.1” | 基本准确，范围可补全 | ① 声明条目版本后，Claude 与 SkillDock 都按它计算版本（`predictVersion` 的顺序是 manifest → 条目 → 来源）。副作用：内容变了而版本没变时，SkillDock 显示 `VERSION_UNCHANGED`（`claude-plugin-updates.mjs:230-231`），Claude 也不更新，开发分支上的“推送即更新”测试方式需要每次递增版本；HLD 3.3A 第 633 行的理由也随之变化。② Codex manifest 确实不引用 `commands/`（键为 `name, version, description, author, skills, interface, license, homepage, repository, mcpServers`）；删除该文件后，`tests/claude-distribution-smoke.mjs:41` 的 `Skills (2) skill-manager, skill-manager` 断言与 HLD V6 的记录要一并改。③ 只列了“3.x 中两处”。见 UF3-P3-06 |
| 第 229 行“0.11.x 改进候选” | 准确 | 已补“调用工作目录” |

## 6. 新发现

### UF3-P2-01 `61` 第 7 节第 4 项与第 5 项第 3 小项缺“新开会话或重载插件”，旧会话可能以旧版本目录启动并被拒绝

- **现象**：第 3 项经 SkillDock“更新”页应用后，实现的成功提示是“新会话生效，已打开的会话需要重载插件。”（`service.mjs:918`），插件 README 第 66 行也写“更新 SkillDock 后在已打开的会话中运行 `/reload-plugins`”。但第 4 项写“在当前会话中再调用一次 `skilldock:skill-manager`，确认正常”，第 5 项第 3 小项写“在当前会话中调用 `skilldock:skill-manager`（由 Claude 这份修复后的启动器全新启动）”，两处都没有先重载。
- **后果**（取决于会话是否仍指向旧版本目录 `e7bf95a311b9`，这一版早于 `73c438a` 的修复）：
  1. 旧目录已被 Claude 写入 `.orphaned_at`（HLD 3.3A 第 636 行：版本变化时新建版本目录，旧目录写入废弃标记后保留 14 天）：`inspect` 对废弃目录返回 `null`（`installs.mjs:160`），启动器把自己当作开发副本，没有来源身份（`launch-plan.mjs:55-56`）；运行记录属于 Codex 侧，`checkOwner` 以“此数据目录属于另一个安装来源；请使用独立 SKILLDOCK_STATE_DIR。”拒绝（`launch.mjs:200`），退出 1。实验 `orphan`：同一夹具中，未废弃的 Claude 副本复用 Codex 侧实例（`reused: true`）；写入 `.orphaned_at` 后得到上述错误。第 4 项会因此失败；第 5 项第 2 小项刚停止实例，第 3 小项又起不来，实例停在那里。错误文字还会把测试者引向“使用独立 SKILLDOCK_STATE_DIR”，即拆分数据目录。
  2. 旧目录未被标记：启动的是修复前的启动器，第 5 项“由修复后的启动器全新启动”不成立（核对结果仍会是“没有提示”，见 62 r2 UF2-P3-03 第 3 点，但验证对象错了）。
- **不确定的部分**：桌面应用的会话在外部进程执行 `claude plugin update` 后是否自动刷新插件路径，本轮无法实测。以实现与 README 自己的说法为准，应按“需要重载”处理。
- **建议**（继续第 7 节之前修订 `61`）：在第 4 项开头加“新开一个会话（或 `/reload-plugins`），再调用一次 `skilldock:skill-manager`”，与第 6 节第 2 项的写法一致；第 5 项第 3 小项写明在已重载的会话中进行。可再加一句：若出现“此数据目录属于另一个安装来源”，先停下来确认会话是否已重载，不要按提示改用独立数据目录。

### UF3-P3-01 本次的核心条件与新加的 `.catch` 没有用例覆盖

- M3（去掉 `final === project`，即恢复“实例沿用别的项目时也写保存项目提示”）与 M4（去掉 `.catch`，即 `realpath` 报 `EACCES` 时整个启动失败）都通过了全部 50 项。新用例只有“最终目录就是保存项目”的两种情形。
- 建议：在 `launcher.test.mjs:387` 的用例中再加一次调用：先显式切换到另一目录，再从第三个目录隐式启动（有 `project.json`、非转交），断言复用、最终行为“（沿用运行实例的项目）”、没有“使用界面保存的项目”（即本报告 S07）。`.catch` 的用例可选（S14 的写法：父目录 `chmod 000`，用完恢复）。

### UF3-P3-02 决定之前或比较内部目录的两处提示残余（UF2-P3-01 的剩余部分，早于本次）

1. `launch.mjs:262` 的符号链接说明仍在决定之前打印。保存项目是一个符号链接、实例沿用自己的项目时，stderr 依次是“请求项目目录 …/link（saved）”“提示：请求目录包含符号链接，扫描使用解析后的真实目录。”“最终扫描目录 …/project（沿用运行实例的项目）”，第二行与实际不符（实验 `symlink`）。工作目录这一级不会出现这种情况，因为 `process.cwd()` 本身返回真实路径。
2. 0.10.2 原生入口形态（`--project` 与工作目录都是 `<state>/compat/legacy-project`）有 `project.json` 时，仍拿这个内部目录当“本次调用目录”比较并写保存项目提示，还建议“可用 --project 明确覆盖”，而调用方刚传的 `--project` 正是被跳过的那个（实验 `native-saved`，两版相同）。这与 62 UF-P3-01 修掉的转交情形属同一类。原生入口成功时不显示 stderr，影响只在失败诊断的末尾。
- 建议：随下一次改启动器时，把符号链接说明也并入 `finalProject`，只在 `final === project` 时写；保存项目提示的条件把“转交”换成或加上“规范化后的工作目录不在数据目录内”，一并覆盖转交与原生入口两种形态。

### UF3-P3-03 `61` 第 8 节第 2 项：对照读数的位置与异常路径

1. 对照读数写在第 2 项的括号里（“切回前应能读到 `ref` 为开发分支，可先读一次作对照”），而切换在第 1 项，按顺序执行时已经来不及；“可先读一次”也是可选的。上一轮 P2 的根源正是“检查恒通过”，对照读数是防止它的唯一手段。建议把对照读数作为第 1 项之前的必做一步：先运行同一命令，应读到 `hasRef: true` 与开发分支；读不到时说明 ref 不在这里，停下来问用户，不能用“`hasRef` 为 `false`”判断切换成功。
2. 来源若是 git 形态（`{"source":"git","url":…}`，桌面应用“从 Git 仓库添加”可能这样记），输出没有 `repo`，又不打印 `url`，无法核对仓库。可以加一个去掉用户信息的地址（例如用 `new URL()` 清空 `username`、`password` 后打印，或至少打印主机与路径），与 36a 9.1 的脱敏口径一致。
3. JSON 损坏时，Node 的报错会原样打出出错的那一行（试跑：单行文件时即整份内容）。建议像第 3 节的 `$NAMES` 一样包一层 `try/catch`，失败时只打印“读取失败”。
4. （措辞）r4 修订说明与第 3、8 节都把“`plugin marketplace list --json` 的输出不含 ref”写成事实。上一轮只核实到“实现只接受扁平形状、样本没有 ref”，github 类型是否带 ref 仍未核实。不影响新读法，可改为“读不到 ref”。

### UF3-P3-04 `61` 第 7 节：按内容判定对两次推送的要求，以及只能走“更新”页

- SkillDock“更新”页按内容指纹判定（5.2）。推送如果只改了 `plugins/skilldock/` 之外的文件，检查会显示“已安装内容与来源一致”；第 6 项预期的“读回版本应为第二个提交的摘要”就做不到，尽管 Claude 命令行会把它算成新版本。第 1 次更新不受影响（从 `e7bf95a311b9` 到现在，`plugins/skilldock/` 已有多处改动），第 2 次取决于开发者推什么。
- 建议：第 7 节开头写明“两次推送都要改动 `plugins/skilldock/` 下的文件（SkillDock 按内容判断是否有更新）”，并把“新提交即新版本”限定为 Claude 侧的版本号。再加一句：两侧应用版本都是 0.11.0，不要用“Agent 环境”页的一键更新（它按应用版本比较，会报“marketplace 中没有更新的 SkillDock”）。

### UF3-P3-05 `61` 的续做起点与修订说明

1. 第 15 行的续做起点仍是“从第 6 节第 4 项的‘启用管理’继续”。按 `37` 第 219 行，第二部分已经做到第 7 节：第一个提交已推送，marketplace 已经用终端刷新过一次，第 3 项在桌面应用中未达成。`61` 没有写第二部分做到哪里、接着从第 7 节第几项做（应为第 3 项，改走“更新”页）；照现在的写法会重做第 6 节第 4、5 项，并再请开发者推一次“第一个提交”。同一行“第 7 节第 6 项与第 7A 节都要求 Claude 已启用管理”也应加上第 3 项：r4 起第 3 项同样经 SkillDock 改动 Claude。
2. r4 修订说明没有列出第 9 节汇报表的改动（改写一行、新增一行、改写一行），与上一轮 62 UF-P3-06 指出的是同一类遗漏。
3. “补记 r3”补错了对象（见第 3 节 UF2-P3-04）。应补的是：“r3 还改写了第一条修订说明，补上第 9 节汇报表的增删，并把续做起点移出该说明。”
4. 第 11、12 行是两行连续的空引用行，多了一行。

### UF3-P3-06 `37`：Owner 决定的 README 改动没有列为待办；0.11.1 的范围可补全

1. 第 219 行记录了 Owner 决定（README 中 Claude 的更新说明改为在 SkillDock“更新”页检查并应用），但没有在阶段 6 的步骤或发布关口中留一条待办。现有四处 README（插件中英 README 第 59 行、根 `README.md` 第 167 行、根 `README.en.md` 第 97 行）仍以桌面应用里不存在的 **Marketplaces** → **Update marketplace** 为先。AC-017 第 3 项要靠这处改动满足。建议在 6e 或发布关口加一行“按 Owner 2026-10-12 决定改写中英 README 与根 README 的 Claude 更新说明”。
2. 0.11.1 ③ 的 HLD 修订除“3.x 中两处”外，还应包括 3.3A 第 633 行（按内容判定的理由）以及声明版本后的行为：内容变而版本不变时 SkillDock 显示 `VERSION_UNCHANGED`，Claude 不更新，开发分支测试需要递增条目版本。② 删除 `commands/skill-manager.md` 时，一并改 `tests/claude-distribution-smoke.mjs:41` 的断言与 HLD V6 的记录。

## 7. 验证记录

| 项 | 命令（均在沙箱内，`env -i`） | 结果 |
|----|------------------|------|
| 定向测试 | `node --test tests/launcher.test.mjs tests/launch-plan.test.mjs tests/project-context.test.mjs` | 50/50 通过（约 49 秒）；新用例 `ok 42`、换版本用例 `ok 39` |
| 上一轮 22 步实验 | `IMPL_ROOT=<导出> node --test --test-concurrency=1 rereview-uatfix-exp/paths.test.mjs`，`141d917` 与 `b1903be` 各一次 | 两次都是 5/5；stdout 字段、退出码与错误文字逐项一致；stderr 只有步骤 17、18 的预期差别 |
| 本轮 18 步实验 `saved` | 同上，`rereview3-uatfix-exp/saved.test.mjs` | 两次都是 3/3；结果见 4.2 |
| 实验 `orphan`、`symlink`、`native-saved` | 同上（`native-saved` 两版各一次） | 见 UF3-P2-01、UF3-P3-02 |
| 变异 M1～M6 | 三组定向测试，每份拷贝改一处 | M1、M2、M6 各 1 项失败，M5 2 项失败（被发现）；M3、M4 50/50（存活） |
| `61` 第 8 节第 2 项试跑 | 从第 156 行原样取出 `node -e` 程序，喂 6 个合成文件（不含真实配置） | 见 5.1 |
| 宿主文件形状 | 只读 scratchpad 中早前隔离环境的 `known_marketplaces.json`，只打印键名与 `source.source` 类型 | 见 5.1 |
| 修订说明中的 sha256 | `git show 141d917:…/61-final-uat-claude-desktop.md \| shasum -a 256` | `eefc2100…a63a`，与 r4 说明一致 |

未运行：完整单元套件、兼容矩阵、e2e、原生产物重建（按要求只跑定向测试，本次没有改界面源码）。0.10.3 转交与 0.10.2 原生入口在实验中按 36b 6.1、6.2 的调用形态模拟（环境变量与工作目录），没有运行真实的 0.10.x 代码；废弃标记是在夹具中手工写入的，没有运行真实的 `claude plugin update`。真实 Claude 命令行与桌面应用没有运行（沙箱禁止执行，也不得读取真实配置），所以 UF3-P2-01 中“会话是否自动刷新插件路径”、UF3-P3-03 中“github 来源的 ref 存在哪里”都未实测。本轮没有访问 127.0.0.1:4771（所有实例都用空闲端口），没有读取或改动真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`，没有联网下载，没有打印任何配置文件全文。主工作树只用 `git archive`、`git diff`、`git show`、`git log`、`git rev-parse`、`git cat-file`、`git merge-base` 读取，没有改动；开发工作树只新建了本报告这一个文件。
