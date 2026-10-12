# 桌面应用合成清单修复的增量评审（`4abe81f..4d3a858`）

> 本报告是独立评审意见，不构成提交、推送、合并或发布的授权。源码结论与环境状态分开写。HLD 的批准和 Owner 决定都由产品 Owner 作出。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 被评审提交 | `4d3a858`（tree `20d1f5d3fa6f…`），分支 `feature/skilldock-0.11-cross-agent`；基线 `4abe81f`（tree `8a88e95f6b14…`） |
| 范围 | `git diff 4abe81f 4d3a858`，路径前缀 `plugins/skilldock/skills/skill-manager/`：5 个文件，增 61 行、删 11 行（diff sha256 前缀 `7ed9bfeb4012`）。代码：`server/claude-plugin-updates.mjs`（`SYNTHESIZED_MANIFEST`、`asInstalled`）、`server/service.mjs`（`claudePluginUpdate` 三处与 `preview.diff` 一处、`changedLocally` 改为函数）；用例：`tests/claude-plugin-updates.test.mjs`（新增一项，测试世界加 `synthesize` 开关）；文档：`37`、`61`（r7） |
| 要回答的问题 | ① 修复是否正确、完整；② 安全边界；③ 新用例是否有效；④ `61` r7 与 `37` 的记录是否准确 |
| 评审者 | 独立的 Claude 评审会话（委托子任务）。只做评审，不修改被评审的文件；不是人类评审，也不代表任何 Owner |
| 日期 | 2026-10-12 |
| 工作方式 | 用 `git archive 4d3a858` 导出到 scratchpad 的 `review-synth/src/`（三个被改的源码文件与 `git show` 逐字节一致），`node_modules` 软链接到主工作树同一路径。测试、变异与实验都经 `sandbox-exec -f …/verify/phase2-review/hermetic.sb` 运行（禁止外连、禁止执行本机 Agent 命令行），`HOME`、`TMPDIR` 指向 scratchpad，Node v22.14.0；**没有**像前几轮那样用 `env -i` 清空其余环境变量。只运行定向测试 `tests/claude-plugin-updates.test.mjs`、`tests/claude-updates.test.mjs`。变异拷贝在 `review-synth/mut/`（每份只改一处），补充场景在 `review-synth/exp/`（新建的临时用例文件，不在被评审的树内），日志在 `review-synth/logs/`。没有访问 127.0.0.1:4771，没有读取或改动真实的 `~/.claude`、`~/.codex` 等目录，没有联网 |
| 环境状态（只读核对） | 本地远端跟踪分支 `origin/feature/skilldock-0.11-cross-agent` 指向 `4d3a858`（未 fetch），即 `4abe81f` 与本提交都已推送。开发工作树 HEAD 为 `4d3a858`。评审开始时除未跟踪的 `node_modules` 外无改动；写报告时（约 10:49）出现了别的会话的未提交改动：`server/claude-plugin-updates.mjs`、`tests/claude-plugin-updates.test.mjs`、`37`，3 个文件，增 15 行、删 9 行。这些改动**不在本轮范围内，未评审**，可能已处理了下文的部分意见，请对照 |

## 2. 结论

**APPROVED（带 P2：测试者继续 `61` 第 7 节第 6 项第 2 小项之前，须先处理 SM-P2-02；SM-P2-01 建议本轮一并修）**

- P0：0
- P1：0
- P2：2（SM-P2-01、SM-P2-02）
- P3：4（SM-P3-01～04）
- 定向测试：本地沙箱 36/36 通过（非 CI 等价环境，见第 1 节工作方式）

要点：

- **针对 UAT 场景的修复正确。** 四处比较（检查、应用前核对、读回、`preview.diff`）都按同一份候选（检查时的 `compared`，之后存为 `preview.tree`，是同一个对象）判定是否去掉 `.claude-plugin/plugin.json`；检查时写入的基线、`preview.baseline`、读回后写入的基线都是去掉后的口径，`changedLocally` 另接受原样指纹，兼容修复前记下的基线。检查与应用之间桌面应用才写入合成清单（E7）、未声明版本原地覆盖（E8）也都正常。
- **安全边界成立。** 来源自带 Claude manifest 时不豁免（E4：改动它照样报 `LOCAL_CHANGES`；变异 M6 使 14 项失败）；只豁免这一个精确路径（新用例末尾改 `SKILL.md` 照样报本地修改）。窄残留：来源没有 manifest 时，这一个文件的**内容**改动也不受 MR-SDX-003 保护（E3），需写入 HLD（SM-P3-02）。
- **漏了一个比较情形（SM-P2-01）**：基线在“来源没有 manifest”时按去掉后的口径记下，之后来源新增了真正的 manifest，检查改按原样比较，桌面应用合成的那份就又被算作本地修改（E1 复现）。一行可修，已在实验拷贝中验证（第 6 节）。
- **`61` r7 的预期在测试者当前的机器上不会出现（SM-P2-02）**：执行检查的是正在运行的 SkillDock 实例，它和 Claude 中已装的 SkillDock 都是修复前的代码；修复只能经这次被挡住的更新才装得上。照 r7 做，第 7 节第 6 项第 2 小项会再次报“本地修改”并按 r7 停下。须先写明让修复后的代码运行起来的步骤，或改为“这次推送只装上修复、下一次推送再验证不用终端的路径”。
- **新用例有效**：去掉检查、读回、应用前核对、`preview.diff` 任一处的 `asInstalled`，新用例都失败；但“基线等于原样指纹也算未改动”这一支没有用例，去掉后 36 项全过（SM-P3-01）。

## 3. 逐条关闭情况

### 3.1 问题 1：修复是否正确、完整

| 子项 | 结论 | 依据 |
|------|------|------|
| 四处比较是否一致 | **关闭** | `service.mjs:831`（检查，`compared.entries`）、`:806`（应用前，`previews.get(previewId)?.tree?.entries`）、`:904`（读回，`preview.tree.entries`）、`:2171`（`preview.diff`，`preview.tree.entries`）。`preview.tree` 就是检查时的 `compared`（`:846`），判定条件相同。`checkOutcome`、`changes` 都用去掉后的 `installed`（`:841`、`:855`）。E7：检查后、应用前桌面应用才写入合成清单，差异预览与应用都成功 |
| 基线写入与 `preview.baseline` 是否同一口径 | **关闭（有一处错位，见 SM-P2-01）** | 检查时 `:835`、`:843` 写 `installed.fingerprint`（去掉后）；`preview.baseline` 取同一值（`:847`）；读回一致时 `:917` 写 `preview.tree.fingerprint`（候选本来就没有该文件）；读回不一致时 `:911` 写按预览候选去掉后的 `loadedTree.fingerprint`。四者口径相同。`changedLocally`（`:810`）同时接受原样指纹：修复前记下的“带合成清单”的基线照样算未改动（E2 通过；去掉这一支后 E2 报 `LOCAL_CHANGES`）。错位：口径取决于“当时的候选”，候选从没有 manifest 变成有 manifest 时，基线是去掉后的口径而比较改用原样口径（E1） |
| 应用前取不到预览（过期、伪造）是否安全 | **关闭** | 取不到时 `?? {}` 使安装中的该文件一律被去掉，但这只影响 `:814` 先报哪种拒绝：`:859` 的 `assertPreview` 随后报 `STALE_PREVIEW`，`:859` 之前本函数没有写入（`:799` 对远端 marketplace 的刷新早于本次，与预览无关）。E6：伪造的 ID 与过期 31 分钟的预览都返回 `STALE_PREVIEW`，`plugin update` 调用 0 次。拿到的是另一个插件的预览时，`:859` 校验的是同一个对象，`:860` 报 `PREVIEW_MISMATCH`（已有用例） |
| `claude-plugin` 之外的路径 | **关闭** | Codex 插件（`plugin-reinstall`）、技能来源、技能目录插件（必带 manifest）都不涉及这个文件。`claude-catalog.mjs:128` 读安装目录中的 manifest 只用于显示（合成后 SkillDock 的 Claude 安装会显示带 Claude manifest，描述取合成值），不参与比较 |
| 计划绑定 `targetSignature` | **关闭** | `claude-plugin` 路线绑定 `path.dirname(installedPath)`（插件的缓存目录）与条目位置，不含内容指纹（`service.mjs:1813` 起，指纹只用于 `plugin-reinstall`、`skill-source`、`plugin-files`），合成清单不影响绑定 |
| 恢复 | **关闭** | Claude 插件更新的操作记录 `canRestore: false`，没有按指纹比较的自动恢复 |
| 生成 marketplace 的 `direct` 插件 | **关闭** | 检查时从原始来源重新暂存，`stageSource` 只复制、不生成 manifest，比较走同一 `asInstalled`；应用前核对比较的是原始来源（`:867`），不比较 SkillDock 自己的副本 |
| 未声明版本原地覆盖时的副本 | **关闭（文档影响见 SM-P3-02）** | `copyInstallation` 原样复制，副本带合成清单（E8：`copyHasManifest: true`），不参与指纹比较。影响手动恢复途径：按 HLD 3.3，带 Claude manifest 的副本经“从本地目录安装”会成为技能目录插件 |
| 其他漏点 | **未关闭 → SM-P2-01** | 来源新增 manifest（E1）。另：来源在新版本中去掉自己的 manifest 时，差异中不显示它被移除（E5），记入 SM-P3-02 |

### 3.2 问题 2：安全边界

| 子项 | 结论 | 依据 |
|------|------|------|
| 来源本身带 Claude manifest 时不豁免 | **关闭** | `asInstalled` 只在候选中没有该路径时去掉（`claude-plugin-updates.mjs:25`）。E4：改动来源自带的 manifest，同版本检查与新版本检查都报 `LOCAL_CHANGES`。M6（不看候选、一律去掉）使 14 项用例失败 |
| 只豁免这一个路径 | **关闭** | 精确键 `.claude-plugin/plugin.json`；`.claude-plugin/` 下的其他文件、链接到别处的情形都照常比较。新用例末尾改 `SKILL.md` 报 `LOCAL_CHANGES` |
| 会不会掩盖真正的本地修改 | **部分：窄残留须写明（SM-P3-02）** | E3：来源没有 manifest 时，用户在这一个文件里加上 `hooks`，检查仍为“已安装内容与来源一致”，下一版本的差异也不列它。该文件由 Claude 生成、桌面应用刷新时会再写，与已排除的 `.in_use`、`node_modules` 同类，作为残留可以接受，但 MR-SDX-003 写的是“任何”，须在 HLD 中写明 |
| 与 HLD 3.3A、MR-SDX-003 是否一致 | **部分 → SM-P3-02** | 3.3A 第一条要点列的是三项**无条件**排除；新规则是**有条件**的（按本次候选），比较基线时还接受两种口径，读回列“安装目录指纹 = 候选指纹”也需加限定。`37`“0.11.x 文档修订”新增的一句方向正确，但不够写清，建议文字见 SM-P3-02 |

### 3.3 问题 3：新用例是否有效

基线：两份定向测试 36/36 通过（`review-synth/logs/baseline.log`）。每个变异只改一处，跑同样两份文件：

| 变异 | 改动 | 结果 |
|------|------|------|
| M1 | 去掉检查处 `installed = asInstalled(rawInstalled, compared.entries)`（`:831`） | 新用例失败（35/36），**被发现** |
| M2 | 读回处不调用 `asInstalled`（`:904`） | 新用例失败，**被发现** |
| M3 | 应用前核对处用原样指纹（`:806`） | 新用例失败，**被发现** |
| M4 | `preview.diff` 处不调用 `asInstalled`（`:2171`） | 新用例失败，**被发现**；同时翻译用例报出一条早已存在的未翻译提示（SM-P3-04） |
| M5 | `changedLocally` 不再接受原样指纹 | 36/36 通过，**存活** → SM-P3-01 |
| M6 | `asInstalled` 不看候选、一律去掉 | 14 项失败，被发现 |
| M7 | `changedLocally` 只接受原样指纹 | 新用例失败，被发现 |
| M8 | 应用前一律按空候选去掉 | 15 项失败，被发现 |

结论：**关闭**（问题 3 要求的四处都被发现）；兼容旧基线的一支见 SM-P3-01。

### 3.4 问题 4：`61` r7 与 `37` 的记录是否准确

| 子项 | 结论 | 依据 |
|------|------|------|
| r7 记录的上一版 sha256 | **准确** | `git show 4abe81f:…/61-final-uat-claude-desktop.md` 的 sha256 为 `5f4bd5f596946c3f…`，与 r7 一致 |
| r7 改动位置 | **准确** | 改的是第 7 节第 6 项第 2 小项，与 r7 说明一致 |
| r7 写入的预期 | **不成立 → SM-P2-02** | 执行检查的实例是修复前的代码 |
| `61` 进度行 | **过时 → 并入 SM-P2-02** | 仍写“剩下第 7 节第 6 项第 1 小项（…用开发者推送的下一个提交）”；按 `37` 新行，第 1 小项已用 `e1516d0` 做完，第 2 小项失败、待修复后重做 |
| r7 “（提交 `4abe81f`，未推送）” | **已过时 → SM-P3-03** | 本地远端跟踪分支显示两者已一起推送 |
| `37` 新增的“桌面应用 Check for updates 补测”行 | **准确** | 对现象、原因、修复范围（检查、应用前核对、读回、差异预览；其他改动照旧算本地修改）的描述与代码一致 |
| `37`“0.11.x 文档修订”新增的一句 | **方向正确、不完整 → SM-P3-02** | 见 3.2 |

## 4. 新发现

### SM-P2-01 来源新增 Claude manifest 时，合成清单仍被误报为本地修改

- 位置：`server/service.mjs:810`（`changedLocally`）与 `:831`。
- 现象（E1，已复现）：来源没有 manifest 的插件（条目版本 1.0.0）先检查一次记下基线；桌面应用往安装目录写入合成清单，检查仍为一致（修复生效）；来源随后新增真正的 `.claude-plugin/plugin.json`（版本 1.1.0）并改动技能。再检查返回 `LOCAL_CHANGES`：“已安装的插件内容相对上次记录有本地修改，不能自动覆盖；请先核对。”
- 原因：候选现在有这个路径，`installed` 改为原样指纹（含合成清单），而基线是去掉后的口径；`changedLocally` 接受的两个值（`installed`、`rawInstalled`）此时相同，都含合成清单，都不等于基线。
- 影响：失败方向是安全的（不覆盖），但这正是本次要修的同一根因，任何没有 manifest、后来补上 manifest 的第三方插件都会被挡住，而且提示指向一个用户无从核对的“本地修改”。SkillDock 自己按 0.11.1 计划在条目中声明版本、不新增 manifest，暂不受影响；若以后改为新增 manifest，所有经桌面应用安装过的机器都会碰上。
- 建议（一行）：`installed.fingerprint` 只可能是原样指纹或“一律去掉”后的指纹之一，所以把接受的集合写成这两者即可：

  ```js
  const changedLocally = () => baseline && baseline.version === install.version
    && ![rawInstalled.fingerprint, asInstalled(rawInstalled, {}).fingerprint].includes(baseline.fingerprint);
  ```

  安全性：“一律去掉”后的指纹等于基线，说明除这一个文件外安装内容与记录一致，与现行豁免同义；基线若是在来源自带 manifest 时记下的，含该路径，去掉后的指纹不可能等于它。实验拷贝中按此改动后，两份定向测试加 E1～E8 共 44/44 通过，E1 改为“发现新版本 1.1.0”，差异列出 `.claude-plugin/plugin.json`（合成 → 来源）与 `SKILL.md`，应用与再次检查都正常。另把 E1 加为用例。

### SM-P2-02 `61` r7 的预期依赖修复后的代码在运行，测试者当前的机器上不成立

- 位置：`61` 第 7 节第 6 项第 2 小项（r7 新增的句子）与进度行。
- 现象：测试者机器上，Claude 中的 SkillDock 是 `b1903be` 版本（读回 `b1903be3d1aa`），目录中已有合成清单；正在运行的实例是第 7 节第 5 项全新启动的那个；即使之后重启过，代码也只能来自修复前的安装目录（不晚于 `e1516d0`）。两侧应用版本都是 0.11.0，启动器会沿用该实例。修复（`4d3a858`）只有经 SkillDock 更新页这次被挡住的更新才会装上，而执行检查的仍是修复前的 `changedLocally`，所以会再次报“相对上次记录有本地修改”，按 r7 停下。检查失败时不写基线，等修复后的代码运行起来，现有基线（读回时记下的去掉后口径）会被正确识别，所以不会留下需要清理的状态。
- 紧迫性：`4d3a858` 已推送，测试者下一次在桌面应用中 Check for updates 就会拿到它；若照 r7 继续，这一轮会白做。
- 建议（`61` r8，交测试者之前完成）：
  1. 写明让修复后的代码先运行起来的步骤。可选做法及取舍：
     - (a) 先经 Codex 一侧把 SkillDock 更新到含修复的提交，征得用户同意后停止实例，由 Codex 那份全新启动，再在更新页检查 Claude 中的 skilldock。全程不用终端，但步骤多，须先核实 Codex 一侧当前跟踪的分支与可用的更新途径（`61` 说过不要用“Agent 环境”页的一键更新）。
     - (b) 由 Owner 决定本次用一次例外把修复装上（例如在桌面应用中卸载后重装 SkillDock，或经用户同意在终端执行一次 `claude plugin update`），全新启动实例后，请开发者再推一个改动 `plugins/skilldock/` 的提交，用修复后的实例完整验证第 7 节第 6 项（桌面应用 Check for updates → SkillDock 检查 → 应用 → 读回）。多一次推送，但证据最干净。
     - 不建议删除合成的 `plugin.json`：r7 已禁止，桌面应用下次刷新也会再写。
     - 也不建议依赖 `37` 记下的“桌面应用 reload_plugins 后会建新版本目录、会话改用它”：这只观察到一次，从那个目录启动时可能触发“此数据目录属于另一个安装来源”。
  2. 第 2 小项的预期改为“由修复后的实例检查”，并写明如何核对实例的代码版本，例如核对实例所在目录的提交，或核对 `server/claude-plugin-updates.mjs` 中是否有 `SYNTHESIZED_MANIFEST`（只读、按键读取）。
  3. 进度行改为：第 6 项第 1 小项已用 `e1516d0` 做完（marketplace 副本到达 `e1516d0`，Update 仍不可用），第 2 小项修复前失败、待按上面的步骤重做；`37` 对应行可补一句“待用修复后的实例重做”。

### SM-P3-01 兼容修复前基线的一支没有用例

- 位置：`tests/claude-plugin-updates.test.mjs:172` 起的新用例；`service.mjs:810`。
- 现象：M5（`changedLocally` 不再接受原样指纹）下 36 项全过。这一支是给修复前那一版 0.11 记下的基线用的：桌面应用安装时就写了合成清单，修复前第一次检查把含合成清单的原样指纹记为基线（`:843`）。实验 E2 按此构造：现行代码检查结果为“发现新版本 1.1.0”，M5 下变为 `LOCAL_CHANGES`。
- 建议：把 E2 加为用例。做法：先检查一次以建立登记文件，再把基线改写为含合成清单的原样指纹，换新版本后检查应为 `available`。若采纳 SM-P2-01，E1 与 E2 一起钉住两种口径。

### SM-P3-02 HLD 3.3A 的修订文字须写清条件、口径与残留（`37`“0.11.x 文档修订”）

`37` 新增的一句（“Claude 写入安装目录、不计入指纹”的文件补上桌面应用合成的 `.claude-plugin/plugin.json`（来源中没有时））只说了“排除”。实际规则是有条件的，并带两种基线口径和窄残留。建议随下一次 HLD 修订写入 3.3A（经增量评审），大意如下：

> 桌面应用在安装插件、刷新 marketplace（Manage marketplaces → Check for updates）时，会给没有 Claude manifest 的插件在安装目录写入合成的 `.claude-plugin/plugin.json`（实测只含 name、description；2026-10-12 最终 UAT）。本次候选中没有这个文件时，安装目录与候选的比较（检查、应用前核对、读回、差异预览）不计它，差异中也不列出；候选中有（来源自带 manifest）时照常比较。与更新记录（基线）比较时，原样指纹或去掉这个文件后的指纹等于基线，即视为没有本地修改。已知残留：来源没有 manifest 时，对这一个文件内容的本地修改识别不出（它由 Claude 生成，刷新时可能被重写），MR-SDX-003 对它不成立；来源在新版本中去掉自己的 manifest 时，差异中不显示它被移除。读回列“安装目录指纹 = 候选指纹”按上述口径。

另需同步：

- 3.3A 手动恢复一段：版本为 `unknown` 的插件，更新前副本会带上合成清单（E8），经“从本地目录安装”时按 3.3 成为技能目录插件 `名称@skills-dir`，而不是经 SkillDock 生成的 marketplace 登记。
- 9.3 增加一行 UAT 观察（桌面应用写入合成清单的时机与内容，并注明只在 Git marketplace 的已装目录上观察到；本地目录、npm、archive 来源是否同样写入未实测，代码按候选通用处理）。
- 可选收紧（由 Owner 取舍）：只在安装目录中的这个文件不声明组件或配置键（`commands`、`agents`、`skills`、`hooks`、`mcpServers` 等）时豁免，可以缩小 E3 的残留；代价是桌面应用以后若在合成内容中加入这些键，会退回误报。按现有做法（`.in_use`、`node_modules` 的排除只写在 HLD 中），残留写入 HLD 即可，不必另开 PRD 问题，除非 Owner 希望像 Q11 那样登记。

### SM-P3-03 `61` r7 与 `37` 的两处记录细节

- `61` r7 写“上一版……（提交 `4abe81f`，未推送）”。本地远端跟踪分支显示 `4abe81f` 已与 `4d3a858` 一起推送（未 fetch 核实）。建议改为“与本次一起推送”，或删去“未推送”。
- `37` 补测行末尾“桌面应用广播 reload_plugins 后在缓存中建了新版本目录、打开中的会话改用它，而 `plugin list` 仍是旧版本——桌面应用自己的行为，记录在案”：它不只是记录。它与 0.11.1 ④ 中“正在运行”标记失准是同一类问题（运行目录与 `plugin list` 不一致），也影响 SM-P2-02 中实例从哪里启动。建议在 0.11.1 ④ 中引用这条观察，一并评估。

### SM-P3-04 `preview.diff` 的“本机文件在预览后发生变化”没有英文、日文翻译（早于本次）

- 位置：`service.mjs:2172` 的提示“本机文件在预览后发生变化，请重新检查更新。”；`src/i18n/server-messages.json` 中没有这一条（2026-09-15 `213427d` 起即如此）。
- 发现方式：M4 下这条提示被用例看到，翻译用例报 `en`、`ja` 都缺。修复前，桌面应用写入合成清单正好会让 Claude 插件的差异预览走到这条提示。
- 建议：补上两种语言的译文，或改用已有译文的“插件在预览后发生变化，请重新检查。”。不阻断。

## 5. 补充场景（实验用例，不在被评审的树内）

用例文件为 `review-synth/exp/app/tests/zz-synth-review.test.mjs`，复用 `claude-plugin-updates.test.mjs` 的测试世界。以下是现行代码（`4d3a858`）下的结果：

| 编号 | 场景 | 结果 |
|------|------|------|
| E1 | 来源没有 manifest → 桌面应用写入合成清单 → 来源新增真正的 manifest（1.1.0）并改动技能 | `LOCAL_CHANGES`（误报，SM-P2-01） |
| E2 | 安装时已写入合成清单，基线为修复前口径（含合成清单的原样指纹），换新版本后检查 | `available`；M5 下为 `LOCAL_CHANGES`（SM-P3-01） |
| E3 | 来源没有 manifest，用户在合成清单中加 `hooks` | 同版本检查为 `current`；新版本的差异只有 `SKILL.md`（残留，SM-P3-02） |
| E4 | 来源自带 manifest，用户改动它 | 同版本与新版本检查都是 `LOCAL_CHANGES`（边界成立） |
| E5 | 来源在新版本中去掉自己的 manifest；检查后、应用前用户改动安装中真正的 manifest | 检查为 `available`，差异只有 `SKILL.md`（不显示 manifest 被移除）；应用报 `LOCAL_CHANGES`（改动被拦下） |
| E6 | 应用时用伪造的预览 ID；用过期 31 分钟的预览 | 都是 `STALE_PREVIEW`，`plugin update` 0 次 |
| E7 | 检查时没有合成清单，检查后、应用前桌面应用写入 | 差异预览“文件差异已加载。”，应用成功 |
| E8 | 没有版本号的插件（原地覆盖），安装时写入合成清单 | 首次检查 `current` → `available`（差异只有 `SKILL.md`）→ 应用成功，副本带合成清单 → 再检查 `current` |

## 6. 其他观察（不计入问题数）

- `asInstalled` 调整了 `files`，没有调整 `bytes`。本函数内不用 `installed.bytes`，没有影响；若以后显示安装体积，需一并减去。
- 读回处去掉合成清单还覆盖了一种情形：Claude 命令行更新时沿用了桌面应用预先建好的版本目录（`37` 记下的 reload_plugins 行为），目录中已有合成清单。
- 指纹去掉一个键后，按插入顺序重新序列化，与 `inspectTree` 在没有该文件时算出的指纹相同（键序一致）。`.claude-plugin/` 下只有这个文件时，空目录本来就不计入。
