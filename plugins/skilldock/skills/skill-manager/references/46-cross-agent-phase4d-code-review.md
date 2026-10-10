# 代码评审报告：阶段 4d 从本地目录或 Git 安装 Claude 插件（`c6293c1`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 范围 | `git diff 7700683 c6293c1 -- plugins`：18 个文件，增 703 行、删 149 行（其中 `native/ui.html`、`native/build.json` 为构建产物），diff sha256 前缀 `dc1d99f6925d` |
| Candidate | `c6293c1`（tree `77b7ddc3247f…`），分支 `feature/skilldock-0.11-cross-agent`（本地）。主工作区 HEAD 已在其后的 `259694c`（只改 `tests/claude-writes-smoke.mjs` 与 `37`，不在本次范围，只读查看过一次，见第 7 节） |
| 事实源 | PRD `34`（sha256 `e061ec25…`）；HLD `35` v1.17（`4b9bb53f…`）第 3.2、3.3 节、DEC-SDX-004、010、025；契约索引 `36` 0.16（`defdbc2a…`）；`36c` 0.15（`239bd7c2…`）第 7.1、7.2、7.3、8、10 节；实施计划 `37`（`09ad0580…`）；`41`（`456c7e31…`）。格式参考 `44` |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-09 |
| 工作区绑定 | 全部测试、实验与变异都在 `git archive c6293c1` 的导出副本中进行，不依赖主工作区。主工作区只做只读 git 操作，唯一写入是本报告 |

## 2. 结论

**CHANGES REQUESTED**

- P0：0
- P1：1（PH4D-P1-01）
- P2：6（PH4D-P2-01～06）
- P3：10（PH4D-P3-01～10）

要点：

- **P1**：来源既没有 Claude manifest、也没有 Codex manifest 时，插件名取的是暂存目录名，一律叫 `candidate`（P1-01）。名称会写进 Claude 的安装记录与设置，技能在 Claude 中以 `candidate:` 为前缀；以后修正会改变插件 ID，已装的只能重装。这正是 DEC-SDX-025 的“无 manifest”路径，现有用例和随后的冒烟都只用了带 Codex manifest 的来源。
- **失败与重试是主要短板**：
  - 清理时的 `marketplace remove` 不读回：Claude 中还留着这个 marketplace，结果却说已移除，并删了文件和登记（P2-01）；
  - 主操作已经成功、清理失败时，整次操作被记为失败（P2-02）；
  - 登记之后安装失败，用户改了来源再装，会被 `TARGET_EXISTS` 挡住。其中 `marketplace add` 失败的情形，界面上找不到出路（P2-03）。Codex 侧同类流程已经处理过这种情形，这里没有照做。
- **“最后一个插件”只看命令行清单**：Claude 自己的安装记录里如果还有其他项目的安装，仍会移除 marketplace，而且卸载确认里没有提到（P2-04）。这条以“命令行清单不含其他项目的安装”为前提，前提未经核实；代码在别处已经按“可能不含”做了防御。
- **文档**：不提供联网 `--available` 清单的决定没有同步 HLD 3.2、3.3 与 DEC-SDX-004；36c 第 10 节前后两句矛盾（P2-05）。
- **测试**：本轮针对新保护设了 16 项变异，13 项没有被现有用例发现（P2-06），包括三处读回、Claude 锁、“最后一个插件”判断、受保护根，以及界面复选框的默认值与出现条件。
- **做得好的部分**：
  - 锁顺序正确：命令行调用时实例锁、Codex 锁（根目录存在时）、Claude 锁都已持有，没有创建 Codex 根（X10）；
  - 复制、移动与删除都在数据目录或技能根的边界内；
  - 链接只移动链接本身，恢复也正确（X11a）；
  - 受保护根下的安装与移除都被拒绝（X11b）；
  - `decorateClaudeDirect` 不会把用户自己的同名 marketplace 认作 SkillDock 生成的（X9 快照）；
  - 使用的错误码都在第 8 节内，或是 0.10.2 已有的码；
  - 界面复选框默认不勾选，没有本地 marketplace 时不显示；
  - 类型检查通过，原生构建产物的哈希一致。
- **需要 Owner 决定的事项**：P2-05 中的 `--available` 决定需要在 HLD 中记录为 Owner 决定。`37` 写的是“已向 Owner 说明”，评审无法确认这是否等于批准。其余问题由实现修正即可。
- **对阶段推进的影响**：按 `37`“独立代码评审没有 P0/P1”的完成标志，4d 修完 P1-01 后需要复审。P2-01～04 建议同轮处理，它们都落在同一段代码（`service.mjs:670-745`、`claude-actions.mjs:194-210`）。

本结论不授予推送、合并或发布权限。

## 3. 各项判定

| 重点 | 判定 | 依据 |
|------|------|------|
| 1 边界与安全 | **基本成立**（余量见 P3-01、P3-04） | 复制：`copySkill` 之前先做 `verifyDescendantDirectory(stateBoundary, destination)`（`service.mjs:672`）；写 `marketplace.json` 之前两次核验（`direct-plugins.mjs:90-92`）。移动：技能目录插件的放入与移除都经 `move()` 守卫，父目录必须在固定受管根或传入的技能根边界内；放入前 `prepareInstall` 检查受保护根，移除前同样检查（`:721`）。删除：清理只删 `tracked.root`，先 `inside(claude-direct-plugins)` 再核验边界（`:742`）。链接：插件目录是链接时只移动链接，恢复后仍是链接、外部目录不动（X11a）；来源中越出来源根的链接在暂存时就被 `inspectTree` 拒绝。受保护根：个人技能目录链接到 Claude 插件缓存时，安装与移除都返回 `TARGET_BOUNDARY`（X11b）。误认：快照只把名称、目录、位置都对得上的 marketplace 标为 `direct`（X9 中用户的同名 marketplace 没有被标），但安装、清理与停用时只按名称核对（P3-01） |
| 2 失败与重试 | **不成立**（P2-01、P2-02、P2-03、P3-02） | 成立的部分：登记先于命令行写入，命令行失败也保留（`:677-680`），重试时复用同一目录；技能目录插件读回失败时会撤销移动，并写回带错误记录的原注册表；停用清理中途失败时管理保持启用（用例 8）。**写注册表与写操作记录的先后**：`cleanupClaudeDirect` 先删登记并写注册表（`:743`），随后 `claudeAction` 的 `journal` 重新读取注册表、追加记录再写。两次写都在实例锁内，且 `journal` 每次都重读，不会互相覆盖，顺序本身没有问题。问题在于：清理不读回（P2-01）；清理失败时被记成主操作失败（P2-02）；改了来源后不能重试（P2-03）；技能目录插件移除后写注册表失败时没有撤销（P3-02） |
| 3 锁与并发 | **成立**（余量见 P3-07） | `claudePluginSourceAction` 在 `withOperation`（实例锁 → Codex 锁）之内再取 Claude 锁，配置根不存在时不取、不创建（`:622`）。`setManagement` 经 `action()` 进入 `withOperation`，每个 `claudeAction('marketplace.remove')` 再各自取 Claude 锁，不会重入。X10：三条命令行调用时三把锁都在；没有 Codex 根时不取 Codex 锁，也不创建它。只有停用清理中“登记在案、但不在 Claude 中”的一支不取 Claude 锁（P3-07） |
| 4 作用域与读回 | **基本成立**（P2-01、P2-04、P3-08 第 1 条） | 技能目录插件：`user`、`project`，`local` 返回 400 `INVALID_ACTION`（`:652`）；无 manifest 的来源：`user`、`local`，`project` 返回 422 `UNSUPPORTED_FOR_AGENT`（`:663`）。命令行一律显式带作用域，`local` 以项目为工作目录；安装读回核对作用域与项目路径的真实路径（`:686-689`，用例断言了 `projectPath`）。技能目录插件按 Claude 清单读回 `installedPath`。缺口：清理不读回（P2-01）；“最后一个插件”的判断范围（P2-04）；遮蔽状态没有体现在结果中（P3-08） |
| 5 契约语义 | **基本成立**（P3-05、P3-06） | 错误码：`UNSUPPORTED_FOR_AGENT`、`AGENT_UNCONFIRMED`、`CONFIRMATION_REQUIRED` 在第 8 节内；`INVALID_ACTION`、`INVALID_NAME`、`TARGET_EXISTS`、`PLUGIN_ALREADY_INSTALLED`、`ROOT_BOUNDARY`、`TARGET_BOUNDARY`、`STALE_PREVIEW`、`CLI_UNAVAILABLE`、`READBACK_FAILED` 都是沿用码，在 `7700683` 中已存在，没有新码。`agent.setManagement` 的 `confirm` 与 7.1 的写法一致，但与 7.3 的通则不一致（P3-06）；Claude 已是只读时仍会执行清理（P3-05） |
| 6 界面 | **成立**（测试缺口见 P2-06，出路缺口见 P2-03） | 复选框的状态初值为 `false`（`App.tsx:2049`）；只有快照中存在 Claude 一侧 `direct` 的 marketplace 时才带 `option`（`AgentEnvironments.tsx:39-45`）；勾选后才发送带 `confirm: true` 的请求。没有用例（M12、M13 都没有被发现）。登记在案、但不在 Claude 中的条目不会出现在确认框里（P2-03） |
| 7 翻译 | **基本成立**（P3-09） | 用例中出现的提示都有英、日译文。另用生产翻译器逐条检查了 17 条提示（多数是用例没有触发的），15 条有整句译文；新增的 `INVALID_NAME` 提示与复用的 `TARGET_EXISTS` 提示没有，界面会退回错误码的通用译文 |
| 8 文档 | **部分一致**（P2-05、P3-06、P3-10） | 见第 5 节。`--available` 的决定需要同步 HLD |

## 4. 新发现

### PH4D-P1-01 没有任何 manifest 的来源，插件名一律是 `candidate`

- **位置**：
  - `direct-plugins.mjs:60`：`const name = … : path.basename(directory)`；
  - 调用方 `service.mjs` 的 `stageSource`：`inspectClaudePlugin(candidate)`，`candidate` 为 `<数据目录>/staging/<uuid>/candidate`。
- **证据**（X1，导出副本、沙箱、临时世界）：来源 `bare-tools/` 只有 `skills/bare-skill/SKILL.md`，结果如下：
  - 预览名为 `candidate`；
  - 安装命令为 `plugin install candidate@skilldock-20b1c01159c559e3afbe --scope user --json`；
  - 结果文字为“已为当前用户安装 Claude 插件 candidate。”
- **影响**：
  - 本地目录与 Git 来源都受影响，子路径也一样，所有这类来源同名；
  - Claude 中技能以 `candidate:<技能>` 调用；两个这样的来源会装成两个都叫 `candidate` 的插件；
  - 名称会写进 Claude 的安装记录与用户设置中的 `enabledPlugins`，以后修正会改变插件 ID，已装的需要重装；
  - 36c 7.3 与 DEC-SDX-025 描述的正是“不带 manifest 但有技能或命令”的来源。用例中的 `codex-only` 带 Codex manifest，名称取自它，所以没有覆盖到这条路径；随后 `259694c` 的冒烟同样只用了带 Codex manifest 的来源。
- **建议**：
  - 没有 manifest 时用来源目录名：本地来源取 `staged.originalDirectory` 的末段；Git 来源取子路径的末段，子路径为 `.` 时取仓库名；
  - 仍按现有正则校验，不合规时返回 `INVALID_NAME`，并补上这条提示的译文（P3-09）；
  - 补一条“完全没有 manifest”的用例，断言预览名、安装命令，以及 `marketplace.json` 中的 `name` 与 `source`。

### PH4D-P2-01 清理时的 `marketplace remove` 不读回：结果说已移除，文件与登记已删，Claude 中仍有这个 marketplace

- **位置**：`service.mjs:741-744`（`cleanupClaudeDirect`）。调用方：
  - `claude-actions.mjs:209`（`plugin.remove`）；
  - `service.mjs:1602`（停用清理）；
  - `claude-actions.mjs:254`（`marketplace.remove`，这条路径上处理函数本身已读回）。
- **证据**（X3）：卸载最后一个插件时，替身命令行返回成功、但保留了 marketplace。之后的状态：
  - 结果为“已卸载 Claude 插件 helper……已移除 SkillDock 为它生成的本地 marketplace skilldock-…”；
  - 生成的目录与登记都已删除；
  - Claude 清单中仍有这个 marketplace，来源指向已删除的目录；
  - 快照不再把它标为 `direct`，用户也看不出它是 SkillDock 生成的。

  36c 7.3 末段要求“所有 Claude 写操作……成功后核对结果（命令行操作……从 Claude 的清单读回）”。4a 的 `marketplace.remove` 处理（`claude-actions.mjs:246-249`）读回了清单与各层声明，清理路径没有。
- **建议**：
  - 命令行返回后重读 Claude：确认 marketplace 已不在清单中、非托管层没有它的声明，然后才删文件与登记；
  - 否则返回 `READBACK_FAILED`，保留文件与登记，以便重试；
  - 也可以直接复用 `marketplace.remove` 处理中的读回；
  - 补用例：替身 `stuck`，走 `plugin.remove` 路径。

### PH4D-P2-02 主操作已成功、清理失败时，整次操作被记为失败

- **位置**：
  - `claude-actions.mjs:209`、`:254`：`await cleanupDirect(...)` 没有单独捕获；
  - `claude-actions.mjs:278-281`：`claudeAction` 的 catch 把整次操作记为 error。
- **证据**（X2）：替身让清理中的 `marketplace remove` 失败。结果：
  - `plugin.remove` 返回 `CLI_FAILED`，操作记录为 `status: "error"`；
  - 插件其实已经卸载，Claude 清单中已没有它；marketplace 与登记仍在；
  - 用户看到的是“卸载失败”，再点卸载会因为插件不存在而失败。出路是去 Marketplace 页移除这个 marketplace，但没有任何地方提示。

  `marketplace.remove` 路径同理：移除与卸载都已读回证实，只是删除生成文件时出错，整次也会记为失败。
- **建议**：
  - 清理放在主操作之后，单独 try/catch；
  - 主操作照常返回成功并记录，结果追加一句“SkillDock 生成的本地 marketplace 未能清理：原因；可在 Marketplace 页移除，或停用 Claude 管理时一并清理”；
  - 清理失败另记一条错误记录，`action` 为 `marketplace.remove`，`target` 为 marketplace 名。

### PH4D-P2-03 登记后安装失败，改了来源再装会被 `TARGET_EXISTS` 挡住；`marketplace add` 失败时界面没有出路

- **位置**：`service.mjs:673-675`。对照 Codex 单插件来源的同类流程：
  - `service.mjs:1130`：同名但目录不同时返回 `MARKETPLACE_EXISTS`；
  - `service.mjs:1133-1141`：目标目录与登记的指纹一致时，先备份，再替换为新内容。
- **证据**：
  - X7：`plugin install` 失败，此时 marketplace 已登记。用户修改来源（例如修好一个技能）后重新预览、安装，得到 `TARGET_EXISTS`“之前为 Claude 生成的同一来源目录仍然存在且内容不同，请先核对。” 出路是在 Marketplace 页移除这个 marketplace：X7b 中移除后再装成功。但提示没有说出路。
  - X7c：`marketplace add` 失败。生成的文件与登记留下，但 Claude 中没有这个 marketplace，结果是：
    - Marketplace 页看不到它；
    - 停用确认框里不出现“一并清理”，因为界面只为快照中 `direct` 的 marketplace 给这个选项；
    - 不勾选清理而停用，结果文字也不会列出它，因为只列登记在 Claude 中的；
    - 界面上没有任何出路，只能手动删除数据目录中的文件。
  - HLD 3.3 要求“与 Codex 侧现有做法一致”，而 Codex 侧已经处理过“来源变了再装”的情形。
- **建议**：
  - 与 Codex 侧一致：目标目录与登记一致（`tracked.root`、`name`、`fingerprint`）、且 Claude 中没有从它安装的插件时，备份后替换为新的候选内容，失败时还原，并更新登记中的指纹；
  - 不一致时，在提示中说明出路；
  - 停用时的“一并清理”应覆盖登记在案、但不在 Claude 中的条目。服务端已经能清理这类条目，界面需要知道它们的存在，例如由快照给出数量。

### PH4D-P2-04 “最后一个插件”只按命令行清单判断；Claude 的安装记录中还有其他项目的安装时，仍会移除 marketplace

- **位置**：`service.mjs:740`；卸载的确认规则在 `claude-actions.mjs:201-204`。
- **证据**（X6、X6b）：`installed_plugins.json` 中记录了同一插件还装在另一个项目中（`local` 作用域），而替身命令行清单只给出用户范围的安装。卸载用户范围的安装后，清理照常运行 `plugin marketplace remove skilldock-…`。
  - `37` 记载的 4a 冒烟结论是“移除 marketplace 时 Claude 会卸载从它安装的插件”，所以另一个项目中的安装会随之被卸载或失效；
  - 卸载确认只列出 `data-removal` 与 `reload` 两条规则，用户无从得知。
- **前提与判断**：这条以“`claude plugin list --json` 不返回其他项目的 project、local 安装”为前提，前提未经核实（阶段 3 uat1 评审 P3-03；HLD 9.3 V10 只核实了同一项目的情形）。但代码已经按“可能不返回”做了防御：未安装插件的去重并入了 `installed_plugins.json`（`claude-catalog.mjs:287-289`）。移除 marketplace 是破坏性更大的一步，也应同样保守。
- **建议**：
  - 判断“最后一个”时同时看 `installed_plugins.json`。读取目录时已经解析过它，可以一并给出该 marketplace 的安装记录数；
  - 还有其他记录时，保留 marketplace，并在结果中说明；
  - 或者，在卸载确认中加一条 `affected-plugins` 规则，列出会随 marketplace 一并移除的其他安装；
  - 另在 HLD 9.3 中补测命令行清单是否包含其他项目的安装。

### PH4D-P2-05 “不提供联网 `--available` 清单”的决定没有同步 HLD；36c 第 10 节前后矛盾

- **位置**：
  - HLD 3.2 表（`35:580-581`）：“可安装插件 | 主证据：命令行列表中的 `available` | 补充：marketplace 副本中的条目”；
  - HLD 3.3 白名单（`35:608`）：“带 `--available` 的列表……只在用户打开‘可安装插件’时调用”；
  - DEC-SDX-004（`35:57-63`）：命令行列表为主证据，文件系统只作补充；
  - 36c 第 10 节（`36c:339`）：前半句仍是“‘可安装插件’在用户打开时单独请求”，后半句是“0.11 不调用联网的 `--available` 清单”。
- **证据**：
  - 实现中，未安装插件只取本机 marketplace 副本（`claude-catalog.mjs:304-316`），全仓没有 `--available` 调用；
  - `37` 写的是“2026-10-09 已向 Owner 说明；36c 第 10 节同步”，HLD 没有修订，第 10 节的 Owner 决定表也没有这一条；
  - 按 HLD 3.2，副本只是补充证据；现在它成了“可安装插件”的唯一来源，等于改变了 DEC-SDX-004 对这类信息的主证据。
- **建议**：
  - HLD 出一个有限修订（仿照 v1.17）：
    - 3.2 表中“可安装插件”一行改为“本机 marketplace 副本（不联网；刷新 marketplace 即更新）”；
    - 3.3 白名单删去 `--available`，或注明 0.11 不用；
    - 在第 10 节或修订表中记录 Owner 的决定与日期；
  - 36c 第 10 节删去前半句的“单独请求”；
  - 随 HLD 与契约的增量复核一起审。

### PH4D-P2-06 新增保护大多没有用例

16 项定向变异，13 项未被现有用例发现（6.2 节）：

| 变异 | 未被钉住的保护 |
|------|---------------|
| M01 | 快照只认目录也对得上的 marketplace（`direct-plugins.mjs:80`） |
| M02 | 只有最后一个插件被卸载时才清理（`service.mjs:740`） |
| M03 | 移除技能目录插件时检查受保护根（`:721`） |
| M04 | 插件来源操作取 Claude 锁（`:622`） |
| M05 | 停用清理全部成功才停用（`:1604-1605`）。用例 8 的失败来自 `marketplace.remove` 的读回，不经过这一检查 |
| M06、M07、M08 | 三处读回：技能目录插件放入（`:660`）、安装（`:689`）、登记（`:684`） |
| M09 | 恢复后来源记录还原（用例 1 恢复后没有检查 `claudeSources`） |
| M10 | 移除只限两个技能根（快照的 `canRemove` 已先挡住，属纵深防御，可选） |
| M11 | 删除边界 `inside(claude-direct-plugins)` |
| M12、M13 | 复选框默认不勾选；只在有 `direct` marketplace 时出现 |

- **建议**：至少补上述用例中的 M01～M09、M11～M13，加上 P1-01 与 P2-01～04 的回归用例。参照 `claude-actions.test.mjs` 中锁与读回的写法，替身让读回不含目标即可。

### PH4D-P3-01 SkillDock 生成的 marketplace，在安装、清理与停用时只按名称核对身份

- **位置**：
  - `service.mjs:682`：同名就跳过 `marketplace add`，不核对路径；
  - `service.mjs:741`：清理按名称移除；
  - `service.mjs:1600-1602`：停用清理按名称移除；
  - `service.mjs:742`：删除前的 `inside()` 在 `tracked.root` 等于 `claude-direct-plugins` 本身时也为真。
  - 对照：`decorateClaudeDirect` 核对名称、目录与位置三项（`direct-plugins.mjs:80`）；Codex 侧遇到同名不同目录返回 `MARKETPLACE_EXISTS`（`:1130`），读回时核对 `_root`（`:1159`）。
- **证据**（X9）：Claude 中有一个同名的 `skilldock-…`，指向另一个目录（用户自己的）。
  - 快照不把它标为 `direct`，这是正确的；
  - 但卸载插件后，清理照样按名称把它移除了；停用时的“一并清理”同理，而且确认框不会列出它，因为界面只列 `direct` 的；
  - 安装时如果同名 marketplace 已经存在、指向别处，会跳过登记，直接从那个目录安装，装入的内容不是预览的内容。
- **前提**：同名而路径不同的情形少见。摘要不含数据目录，所以两个数据目录对同一来源会算出同一个名称。
- **建议**：
  - 抽出一个判断“这是 SkillDock 为该登记生成的 marketplace”：名称相符、清单中的路径等于 `tracked.root`、且 `tracked.root` 恰为 `claude-direct-plugins/<名称去掉前缀>`；
  - 安装、清理、停用与快照都用它；安装时不符返回 `MARKETPLACE_EXISTS`；
  - 删除前要求 `path.dirname(tracked.root)` 为 `claude-direct-plugins`、末段为 20 位十六进制。

### PH4D-P3-02 技能目录插件的移除没有撤销；登记与操作记录分两次写

- **位置**：`service.mjs:727-729`；`claude-actions.mjs:197-198`、`:276`。
- **证据**（X8）：把数据目录 `local` 设为只读后移除。结果：
  - 插件目录已移入隔离区，随后写注册表时报 `EACCES`；
  - 没有撤销；错误记录也写不进去（`.catch(() => {})`）；
  - 插件从 Claude 中消失，操作记录中没有可恢复的项，只能手工从 `quarantine` 找回。

  `claudeSkillAction` 遇到同样的失败时会把目录移回，并且把注册表与操作记录一次写入。
- **严重度说明**：只在写 SkillDock 自己的数据失败时才会出现，所以列 P3。
- **建议**：移动之后的失败要撤销移动；或者让 `removeSkillsDirPlugin` 只返回 `restore` 与对 `claudeSources` 的改动，由记录时一次写入，与 `claudeSkillAction` 的顺序相同。

### PH4D-P3-03 Claude 的 `plugin.installSource` 静默忽略 `enabledSkills`

- **位置**：`service.mjs:648-693` 没有检查这个字段；对照 `claude-actions.mjs:173`。
- **证据**（X5）：带 `enabledSkills` 的请求照常整包安装，并返回成功。
  - HLD 3.5 与 `37` 阶段 4 要求“服务端同样拒绝不支持的操作”；
  - 同为 Claude 的 `plugin.install` 遇到这个字段返回 `UNSUPPORTED_FOR_AGENT`；
  - 界面不会发送这个字段，只有 API 能走到。
- **建议**：同样返回 `UNSUPPORTED_FOR_AGENT`“Claude 插件不能只启用部分技能。”

### PH4D-P3-04 移除技能目录插件时，不提示依赖其内容的 Codex 独立技能

- **位置**：`claude-actions.mjs:194-198`。
- **证据**（X12）：Codex 个人技能 `tidy-up` 是一个链接，指向 `~/.claude/skills/tidy/skills/tidy-up`（快照中它的 `realPath` 在插件目录内）。
  - 移除插件 `tidy` 时，确认规则只有 `scope`、`reload` 两条；移除后 Codex 的链接悬空；
  - 反方向（移除或更新内容位于 Claude 插件目录内的 Codex 技能）已经按 36c 第 6 节要求确认，并列出受影响的插件；
  - `37` 阶段 0 第 0.4 项写明，技能目录插件的跨侧影响按提示处理，不登记为限制；
  - 4d 之前技能目录插件不能在 SkillDock 中移除，所以这种不对称是新出现的。
- **严重度说明**：移除可以恢复，所以列 P3。
- **建议**：确认规则中加一条，列出 `realPath` 落在插件目录内的 Codex 独立技能；只在 Codex 环境已被发现时提示，与 36c 第 6 节一致。

### PH4D-P3-05 Claude 已经是只读时，`agent.setManagement`（`read-only` + `confirm: true`）仍会改写 Claude

- **位置**：`service.mjs:1577`、`:1590-1607`。
- **证据**（X4）：
  - 先停用管理，Claude 变为只读；此时直接发 `marketplace.remove` 返回 `AGENT_READ_ONLY`；
  - 再发 `{ management: "read-only", confirm: true }`：执行了 `plugin marketplace remove skilldock-…`，插件被卸载，结果为“已清理……”；
  - 只读的含义是“SkillDock 不再修改其中的技能和插件”（`setManagement` 自己的结果文字；36c 第 5 节）。
- **严重度说明**：只读时界面不显示“停用”按钮，只有 API 能走到；不勾选清理时的提示也写着“重新启用管理后再停用”。所以列 P3。
- **建议**：只在保存的管理状态为 `enabled` 时执行清理；已是只读时带 `confirm` 返回 `AGENT_READ_ONLY`（或者忽略 `confirm`，照常返回提示），并在 36c 7.2 中写明。

### PH4D-P3-06 `agent.setManagement` 中 `confirm` 的语义与 7.3 的通则不一致；“各自留操作记录”不完全成立

- **位置**：36c 7.1 的 `confirm` 一行、7.2 的 `agent.setManagement` 一行、7.3 中“需要确认的操作在未带 `confirm: true` 时返回 `CONFIRMATION_REQUIRED`”一句（`36c:259`）；`service.mjs:1602`。
- **证据**：
  - 在这里，`confirm` 是“另外做一件破坏性的事”的开关：不带时照常停用，不返回 `CONFIRMATION_REQUIRED`；而在其他操作中，`confirm` 只表示“已确认服务端列出的规则”；
  - 按通用做法实现的客户端（收到 `CONFIRMATION_REQUIRED` 后带 `confirm: true` 重发）不会误触，因为这里从不返回该错误；但“确认框一律附带 `confirm`”的客户端会；
  - 7.2 写“各自留操作记录”，但 Claude 中已经不存在的登记项是由 `cleanupClaudeDirect` 直接清理的（`:1602`），不留记录。
- **建议**：
  - 最好改用独立字段，例如 `cleanup: true`，只对 Claude 的 `agent.setManagement`（`read-only`）有效；
  - 若保留 `confirm`，在 7.3 的那句通则后注明这个例外；
  - 直接清理的条目也记一条记录，或把 7.2 改为“经 marketplace 移除的各留记录”。

### PH4D-P3-07 停用清理中，不在 Claude 中的登记项不经 Claude 锁清理

- **位置**：`service.mjs:1602` → `:736-744`。
- **证据**：
  - 这一支在 `withOperation` 内运行，持有实例锁与 Codex 锁，但不取 Claude 锁；
  - `cleanupClaudeDirect` 会重读 Claude；如果此时同名 marketplace 已经出现（例如被外部添加），会在没有 Claude 锁的情况下运行 `marketplace remove`；
  - 其他路径都在 Claude 锁下（X10）。
- **严重度说明**：只有竞态才会走到，所以列 P3。
- **建议**：这一支在根目录存在时同样取 Claude 锁；或者锁外只删数据目录中的文件与登记，发现已在 Claude 中时改走 `claudeAction('marketplace.remove')`。

### PH4D-P3-08 几处结果文字与界面文案与实际不符

1. **遮蔽**：项目中的技能目录插件被个人目录中的同名插件遮蔽时（X11c），预览给出了遮蔽提示，但安装结果仍说“Claude 信任该项目后加载”（`service.mjs:661`）。HLD 3.3 要求读回能识别“被遮蔽”，并按实际状态显示。
2. **安装对话框文案**：
   - 对 Claude 来源仍显示“选择单个插件的目录，内含 plugin.json”（`InstallDialog.tsx:129`），而 Claude 并不要求 manifest；
   - 确认页说明写着“安装后可在插件详情统一管理、更新或卸载”（`:107`），但 Claude 的这两类插件在 4d 中还不能更新。
3. **manifest 证据没有显示**：Claude 预览不显示 `manifests`，`src/*.tsx` 中都没有用到这个字段。
   - HLD 3.12 要求“0.11.0 先交付证据展示……显示该插件带有哪个 Agent 的专用 manifest”；PRD 5.6 安装插件一行要求“并显示该插件是否带 Claude 专用 manifest”；
   - 4a 的预览已有同样的缺口；4d 的两种安装方式正是由有没有 Claude manifest 决定的，更需要显示；`41` 中没有登记。
- **建议**：第 1 条按读回结果给出“被个人目录中的同名插件遮蔽，不会加载”；第 2、3 条按 Owner 对界面的安排，修改文案或记入 `41`。

### PH4D-P3-09 翻译：一条新提示没有整句译文；`37` 的说法不准确

- **位置**：
  - `direct-plugins.mjs:61-62`：`INVALID_NAME`“插件名称只能包含字母、数字、点、下划线与连字符。”；
  - `service.mjs:656`：复用的“同名安装目录已存在，不能覆盖。”（0.10.2 起就有，也没有整句译文）。
- **证据**（6.3 节 E-i18n）：用生产翻译器检查，这两句的英文与日文都返回原文。界面会退回到错误码的通用译文（`errors.json` 中的 `INVALID_NAME`、`TARGET_EXISTS`），不会空白，但丢失了“哪些字符可用”这类信息。`37` 写“含全部新提示的英、日翻译检查”，而测试只检查了用例中出现过的提示。
- **建议**：补上这两条译文；把翻译检查改为覆盖本次新增的全部提示，或者在用例中触发它们。

### PH4D-P3-10 文档小处

1. 契约索引第 4 节的分册表仍写 `36c` 为 0.14（`36:50`），而 36c 已是 0.15。
2. `37` 的 4d 一行有两处没写清：
   - 没有写技能目录插件与无 manifest 插件的更新何时提供。HLD 3.3 写的是“更新、移除、恢复复用……”，4d 只做了移除与恢复，快照中这两类插件没有 `canUpdate`；
   - 没有写 Claude 中这类 marketplace 的“刷新”不会从原始来源取新内容。界面同时显示原始来源与刷新按钮，容易误解。
3. 36c 7.1 `scope` 一行末尾的“`project` 会改动协作者共享的设置，须同时带 `confirm: true`”紧跟在 `plugin.installSource` 之后，读起来也适用于技能目录插件的 `project` 范围；实现没有这样要求，也不需要，因为技能目录插件不写设置。建议写明这句只针对写设置的操作。

## 5. 文档判定

| 文档与位置 | 判定 | 说明 |
|-----------|------|------|
| HLD 3.3“从本地目录或 Git 安装” | 基本一致 | 两种方式、作用域、生命周期、停用时提示与一键清理都已实现。偏离：清理不读回（P2-01）；“与 Codex 侧做法一致”在同名核对与内容替换上不一致（P2-03、P3-01）；没有识别遮蔽状态（P3-08）。“更换数据目录前先移除再重建”判为不适用（0.11 不提供更换数据目录），README 清理步骤随阶段 6，`37` 都已写明，合理 |
| HLD 3.2 表、3.3 白名单、DEC-SDX-004 | 不一致 | `--available` 的决定未同步（P2-05） |
| HLD DEC-SDX-010 | 一致 | X10 |
| 契约索引 `36` 0.16 | 基本一致 | 修订记录与实现相符；第 4 节中 `36c` 的版本没有更新（P3-10） |
| 36c 7.1 `scope` | 一致 | 两种方式的取值与错误码同实现、用例一致；末句的适用范围见 P3-10 |
| 36c 7.1 `confirm`、7.2 `agent.setManagement` | 基本一致 | 与实现相符；与 7.3 通则的关系（P3-06）、只读时的行为（P3-05）没有写明；“各自留操作记录”不完全成立（P3-06） |
| 36c 7.3 `plugin.previewInstall`、`plugin.installSource`、`plugin.remove` 两行 | 一致 | 与实现相符；末段的读回通则在清理路径上没有落实（P2-01） |
| 36c 第 8 节 | 一致 | 没有新错误码；用到的码见第 3 节第 5 项 |
| 36c 第 10 节 | 前后矛盾 | P2-05 |
| `37` 4d 一行 | 基本一致 | 与代码相符；“全部新提示”的说法不准确（P3-09）；更新的安排没有写（P3-10）；`--available` 的决定已写明，但需要同步 HLD（P2-05） |
| `41` | 缺一项 | 没有登记 manifest 证据的展示（P3-08） |

## 6. 验证命令与结果

### 6.1 命令

所有测试、实验与变异都在导出副本的应用目录中运行，命令形如 `env HOME=<scratchpad>/review-4d/home TMPDIR=<scratchpad>/review-4d/tmp sandbox-exec -f <scratchpad>/verify/phase2-review/hermetic.sb node …`。该沙箱拒绝执行真实的 Codex、Claude 命令行，也拒绝非本机外连。`<scratchpad>` 为评审会话的临时目录（`…/scratchpad`）。

| 命令 | 位置 | 结果 |
|------|------|------|
| `git archive c6293c1 \| tar -x -C <scratchpad>/review-4d/export`；应用目录中建立指向主工作区 `node_modules` 的符号链接 | 主工作区（只读）→ scratchpad | 完成 |
| `node --test tests/claude-plugin-sources.test.mjs` | 导出副本 | **9/9 通过** |
| `node --test`：`claude-actions`、`claude-catalog`、`agents`、`agent-ui` | 导出副本 | **19/19、12/12、12/12、10/10 通过** |
| `node --test`：`claude-skill-files`、`claude-skill-guards`（移除与恢复复用的技能事务） | 导出副本 | **5/5、7/7 通过** |
| 定向测试合计 | — | **74/74 通过**，没有跳过 |
| `./node_modules/.bin/tsc --noEmit`（TypeScript 7.0.2，覆盖 `src` 下 39 个文件） | 导出副本 | 通过 |
| `native/build.json` 哈希核对（`node -e`，只读） | 导出副本 | 52 个输入、4 个产物全部一致；`ui.html` 含新译文 |
| 翻译检查脚本（临时放在导出副本的 `tests/`，用后删除） | 导出副本 | 见 6.3 节 E-i18n |
| 实验 `review-4d/exp/*.mjs`（输出在同目录的 `*.out`） | 临时世界 | 见 6.3 节 |
| 变异 `review-4d/mut/run.mjs`：每项复制应用目录、改一处，运行 `claude-plugin-sources`、`claude-catalog`、`claude-actions`、`agent-ui`、`agents`，结束删除副本 | `review-4d/mut/work` | 见 6.2 节 |

按委托，没有运行完整套件与兼容矩阵。

### 6.2 变异结果

| 编号 | 变异 | 结果 |
|------|------|------|
| M01 | `decorateClaudeDirect` 不核对目录 | 未被发现 |
| M02 | 清理不看是否还有安装 | 未被发现 |
| M03 | 移除技能目录插件不查受保护根 | 未被发现 |
| M04 | 插件来源操作不取 Claude 锁 | 未被发现 |
| M05 | 停用不核对剩余登记 | 未被发现 |
| M06 | 技能目录插件放入不读回 | 未被发现 |
| M07 | 安装不读回 | 未被发现 |
| M08 | 登记 marketplace 不读回 | 未被发现 |
| M09 | 移除时不保存来源记录 | 未被发现 |
| M10 | 移除不限于两个技能根 | 未被发现（纵深防御） |
| M11 | 清理删除不核对边界 | 未被发现 |
| M12 | 复选框默认勾选 | 未被发现 |
| M13 | 没有本地 marketplace 也显示复选框 | 未被发现 |
| M14 | 预览不检查已安装 | 被发现 |
| M15 | 本地作用域不询问 `gitExclude` | 被发现 |
| M16 | 移除技能目录插件不要求确认 | 被发现 |

结果文件在 `<scratchpad>/review-4d/mut/results.tsv`。

### 6.3 实验摘要

替身世界参照 `tests/claude-plugin-sources.test.mjs` 搭建：

- 数据代号写为 2，不启用计划；
- 注入替身：`claudeCli`、`claudeCatalog`（`managedDir`、`listPlugins`、`listMarketplaces`）、`claudeWriter`、`claudeGit`；
- 使用临时 HOME，托管设置目录指向临时目录。

| 编号 | 内容 | 结果 |
|------|------|------|
| X1 | 没有任何 manifest 的来源 | 名称为 `candidate`（P1-01） |
| X2 | 清理中的 `marketplace remove` 失败 | `plugin.remove` 记为 `CLI_FAILED`，但插件已卸载（P2-02） |
| X3 | 清理中的命令返回成功，但保留 marketplace | 结果说“已移除”，文件与登记都已删除，Claude 中仍有它（P2-01） |
| X4 | 已只读时 `read-only` + `confirm` | 直接写入被拒，经停用则执行了 `marketplace remove`（P3-05） |
| X5 | `installSource` 带 `enabledSkills` | 照常整包安装（P3-03） |
| X6、X6b | 另一个项目的安装只在 `installed_plugins.json` 中 | 卸载后清理照常移除 marketplace；卸载确认中没有说明（P2-04） |
| X7、X7b | 安装失败、修改来源后重装 | `TARGET_EXISTS`；在 Marketplace 页移除后重装成功（P2-03） |
| X7c | `marketplace add` 失败、修改来源后重装 | `TARGET_EXISTS`；Marketplace 页与停用结果中都看不到这个条目（P2-03） |
| X8 | 移除技能目录插件时注册表不可写 | `EACCES`；目录在隔离区，没有可恢复的记录（P3-02） |
| X9 | Claude 中有同名但目录不同的 marketplace | 快照不标为 `direct`；清理仍按名称移除它（P3-01） |
| X10、X10b | 命令行调用时的锁 | 三把锁都在；没有 Codex 根时不取 Codex 锁、不创建根 |
| X11a | 技能目录插件是链接 | 只移动链接，外部目录不动；恢复后仍是链接 |
| X11b | 个人技能目录链接到 Claude 插件缓存 | 移除与安装都返回 `TARGET_BOUNDARY`，内容没有动（快照仍显示 `canRemove: true`，见第 7 节） |
| X11c | 个人目录已有同名插件时安装到项目 | 预览有遮蔽提示，结果仍说“信任后加载”（P3-08） |
| X12 | Codex 技能链接到技能目录插件内部 | 移除插件时没有跨侧提示，Codex 的链接悬空（P3-04） |
| E-i18n | 17 条提示（多数是用例没有触发的），用生产翻译器逐条检查 | 15 条有整句英、日译文；2 条没有（P3-09） |

## 7. 观察（不计入问题）

1. **能力标记与服务端不一致**：技能根位于受保护根之下时，快照仍给出 `canRemove: true`，点了才被服务端拒绝（X11b）。与 4b 中技能的情形一样（44 号报告 P3-05 第 6 条），可以一并让快照与服务端一致。
2. **项目目录不存在时的报错**：无 manifest 的来源以 `local` 作用域安装时，工作目录直接取当前项目（`service.mjs:665`）。项目目录被删时会以命令行的 spawn 错误失败，而不是 4a 中的 `PROJECT_PATH_MISSING`；而且这时登记已经写入。
3. **恢复位置**：恢复允许回到任意项目的 `.claude/skills`（`restorePlace` 只看末两段）。这是 4b 的既有行为，4d 的技能目录插件沿用。
4. **英文界面中的全角括号**：停用确认框的条目格式为 `名称（插件名）`，英文界面中也显示全角括号。这是数据格式，不是译文问题。
5. **readback 的前提**：替身的 marketplace 清单中，`path` 与 `marketplace add` 的参数字面相同；`decorateClaudeDirect` 依赖这一点。真实命令行是否返回同样的字符串（而不是规范化后的路径），决定这个 marketplace 能否被标为 `direct`、复选框是否出现。`259694c` 的冒烟把 `direct` 记入了步骤，但没有断言。
6. **主工作区的后续提交**：`259694c`（候选之后的一个提交）给真实命令行冒烟补了 4d 的流程，提交说明称在 Claude 2.1.288 下离线通过。按委托本轮没有运行它，不作核实；它的两个来源分别带 Codex manifest 与 Claude manifest，没有覆盖 P1-01。
7. **SkillDock 自身**：SkillDock 没有 Claude manifest，因此不会成为技能目录插件，移除技能目录插件时没有自身保护不构成问题。如果用这一路径把 SkillDock 自己装进 Claude，它会进入 `skilldock-…` marketplace；HLD 3.7 的安装登记是否认这种安装，属于阶段 5 的范围，本轮没有评估。

## 8. 操作披露与结束状态

- **没有做的事**：
  - 没有向 `127.0.0.1:4771` 或 `127.0.0.1:4781` 发送请求；
  - 没有运行真实的 `codex`、`claude` 命令行（实验中 Claude 的清单、写入与命令行都是替身）；
  - 没有下载、没有联网，没有运行 `launchctl`；
  - 没有读写真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`；测试与实验的 HOME、TMPDIR 都在 scratchpad 中，托管设置目录指向临时目录；
  - 没有打印整个配置文件。
- **主工作区**：只运行了只读 git 命令（`log`、`show`、`diff`、`grep`、`rev-parse`、`status`、`branch`、`merge-base`、`archive`）。唯一的写入是本报告，未提交。没有提交、推送、切换分支或修改其他文件。开始时没有单独记录主工作区的 HEAD；结束时 HEAD 为 `259694c`，除本报告外工作区干净。
- **沙箱内**：定向测试、类型检查、实验与变异。
- **沙箱外、默认环境下的辅助操作**（都只涉及 scratchpad 或只读）：
  - 建立导出副本与 `node_modules` 符号链接；
  - 写入实验与变异脚本；
  - 在导出副本中临时放入翻译检查脚本，用后删除；
  - 用 `node -e` 只读核对 `native/build.json`；
  - `grep`、`sed`、`awk`、`cat`、`shasum` 等只读命令。
- **进程**：本轮启动的测试与实验进程都已结束，没有遗留。
- **实验材料**：在 `<scratchpad>/review-4d/` 下：
  - `export/`：导出副本，已恢复为导出时的内容，另有 `node_modules` 链接；
  - `exp/`：实验脚本与输出；
  - `mut/`：变异脚本与结果；
  - `home/`、`tmp/`：临时 HOME 与 TMPDIR。

> 2026-10-10 推送前修订：上文一处本机临时目录的绝对路径改为占位写法，其余内容未改；原文见提交 `ceffd4f`。
