# 代码与文档评审报告：阶段 5 合并复审之后到阶段 6c（`2e8dd42..316eae8`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 上一轮 | 阶段 5 合并复审 [52-cross-agent-phase5-review-r2.md](52-cross-agent-phase5-review-r2.md)（对 `cd94b88`：APPROVED，P2 2、P3 5；意见在 `2e8dd42` 处理） |
| 范围 | `git diff 2e8dd42 316eae8`：50 个文件，增 1351 行、删 250 行，diff sha256 前缀 `04200e534c5e`。提交：`ceffd4f`、`31f9068`、`e570697`、`72cc0d0`（UAT 说明与记录）；`7443a5a` UAT 修正（16 个文件 +129/−39）；`75fdddd` 阶段 6a（15 个文件 +92/−25）；`2b3cacb` 阶段 6b（14 个文件 +156/−141）；`f1bbf6a` 阶段 6c 矩阵（6 个文件 +392/−48）；`97daa19` README 的 Claude 安装与更新（5 个文件 +7/−7）；`316eae8` AC-013 与 P0 核对（8 个文件 +171/−6） |
| Candidate | `316eae8`（tree `f0d8cbbbf920…`）；基线 `2e8dd42`；分支 `feature/skilldock-0.11-cross-agent` |
| 事实源（均取 `316eae8` 中的版本） | PRD `34`（sha256 `e061ec258421…`）REQ-SDX-017、AC-009、AC-013、AC-017 与第 732 行（桌面应用整体关闭插件自动更新）；HLD `35` v1.29（`5b5de515968d…`）3.13A、9.3 V18、11A 第 3 条、末尾 v1.29 一节；`36b`（`b5e9644ce711…`）4.2 与附录 A；`36c` 0.29（`18642a1214ce…`）第 6、10 节；实施计划 `37`（`97ff099518c8…`）阶段 6 拆分与 6c 进展；`55`（`670cd9db64f8…`）；`56`（`3a0cbdcc7318…`）。格式参考 `52` |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审代码；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-10 |
| 工作区绑定 | 开始时主工作区 HEAD 为 `316eae8`。评审期间主工作区出现了新提交 `65061fa`（UI-14 与 Owner 决定，改动 `App.tsx`、`UpdatesWorkspace.tsx`、`56` 等 10 个文件）和他人的未跟踪文件 `references/35-cross-agent-hld-review-r24.md`：两者都不在本轮范围内，未评审；`65061fa` 对 `56` 的修改没有触及本报告引用的 AC-009 第 5 项、AC-013 第 1 项与 AC-017 第 3 项。结束时主工作区另有他人未提交的修改（`server/claude-plugin-updates.mjs`、`scheduler.mjs`、`service.mjs`），同样不在范围内；只核对了它们不是本轮变异实验留下的（实验全部在 scratchpad 副本中进行，变异副本已逐项还原）。全部阅读、测试、实验与变异都在 scratchpad 中进行：`git archive 316eae8` 的导出副本（只读，`objects/info/alternates` 指向原仓库对象库，供兼容矩阵 `git archive` 冻结提交用）与另一份完整导出的变异副本；`node_modules` 为指向主工作区的软链接；所有测试经 `sandbox-exec -f …/hermetic.sb` 运行，`HOME` 指向 scratchpad 中的空目录。对主工作区唯一的写入是本报告 |

## 2. 结论

**APPROVED（带 P2、P3）**

- P0：0
- P1：0
- P2：2（PH6-P2-01、P2-02）
- P3：8（PH6-P3-01～08）

要点：

- **代码改动正确**。UAT 修正（`7443a5a`）的五处都按 HLD v1.29 与 36c 0.29 实现：更新项与检查结果带安装目录和去凭证的条目来源（`publicSource` 同时去掉查询串与片段），`targetSignature` 跳过 `marketplace-entry` 描述（变异 E6 被阶段 5 复审补的 N21 用例发现），`agent.setManagement` 在操作锁内尽力写记录，1 版快照不含 `agent.*`，慢快照按段落写日志。启动器打印 Claude 命令行只在 Claude 配置目录存在时进行、`save: false`，导入闭包仍只有内置模块（27 个文件）。删除专用 Node 下载代码是安全的：仓库内无调用者、无残留译文，`node-candidates.mjs` 仍有 `$state/node/node-v*-darwin-*/bin/node` 候选。版本 0.11.0 同步完整，`native/build.json` 69 项输入与 4 项产物哈希一致，且在变异副本中重建原生产物与提交逐字节相同。
- **兼容矩阵的真实 0.11 重跑名副其实**：包装脚本对样本控制项的处理与样本等价（逐项见第 3.3 节），启动记录与健康检查凡有写出都来自真实 0.11；新增的 S-26、S-28、N-14、N-15、R-04、V18 用例经探查与变异证实有效。103 个用例名、44 个“（真实 0.11）”与 `55` 一致；本轮定向运行 45/45 通过，测试进程无一次连接 4771。
- **两项 P2 都是发布关口的证据与文字问题**：README 中“全程不要求终端”的 Claude 安装与更新路径未经实测、更新一步缺少刷新 marketplace，而 `56` 已记为“满足”（P2-01）；R-03 与 N-14（实例未运行）只断言“失败”，没有断言 36b 登记的“删除记录、因计划文件 version 2 失败”，`55` 却把未断言的结果写成了用例结论（P2-02）。两项都只需改文档和几行断言，事实我已在实验中核实（E3）。
- 八项 P3 为测试缺口（变异 E5 存活）、AC-013 与 AC-009 的余项、来源描述的可信度标签、V18 的归类、6c 自己列出的“登记测试缺口”未完成、几处文字，以及一个既有的测试接触真实 `~/.npm` 的问题。
- **对阶段推进的影响**：按 `37`“独立评审没有 P0/P1”的标准，阶段 6a～6c 的代码可以进入 6e。建议在最终 UAT 之前处理 PH6-P2-01（同时把 AC-017 第 3 项改为“待 Owner”，在 6e 中实测桌面应用路径）与 PH6-P2-02，CHANGELOG 的日期与“验证”一节按计划在合并前填写。

本结论不授予推送、合并或发布权限。

## 3. 重点项的核对结果

行号均指 `316eae8` 导出副本；`assets/app/` 下的文件省略该前缀，`scripts/` 指 skill-manager 根下的启动脚本。

### 3.1 UAT 修正（`7443a5a`）

| 项 | 判定 | 依据 |
|----|------|------|
| Claude 插件更新项的 `installedPath` 与 `sourceInfo` | 正确 | 列表项来自 `server/service.mjs:452-453`（只在插件自身没有来源描述时补 `entrySourceInfo`，生成 marketplace 的插件保留原始来源）；检查结果在 `:821-822` 带 `install.installPath` 与来源（生成 marketplace 用 `publicSource(tracked.source)`，其余用远端刷新后重新读出的条目）。`applyObservations`（`server/sources.mjs:97`）保留列表项自己的 `sourceInfo` 与 `installedPath`，预览只显示 `installedPath` 与 `sourceInfo.source`（`src/UpdatesWorkspace.tsx:1243`、`:1249`），检查结果不进入列表与绑定。新用例覆盖列表、检查与去凭证 |
| `entrySourceInfo` 去凭证 | 正确 | `server/claude-plugin-updates.mjs:56-61`：Git、压缩包地址与 npm 规格都经 `publicSource`（http/https 去用户名、密码、查询串、片段；ssh 去密码），npm 的 `registry` 不显示。可信度标签见 PH6-P3-04 |
| `targetSignature` 跳过 `marketplace-entry` | 正确，已被钉住 | `server/service.mjs:1840`。绑定只用列表项（`:1819`），条目位置仍由 `sourceIdentity.entry = sourcePlace(entry)` 绑定。变异 E6（去掉跳过）被“a plan follows a pinned entry to its next version…(N21)”发现 |
| `agent.setManagement` 的操作记录 | 正确（尽力而为） | `:2091-2096`：读回成功后在 `withOperation` 内（`:2280`）追加记录，写失败不影响开关结果，与 `agent.updateSkilldock` 的记录方式一致。删去记录会使新用例失败 |
| 1 版快照过滤 `agent.*` | 代码正确，用例未钉住 | `:268`。新用例只切换 Claude 的管理，记录本已被 `agent === 'codex'` 条件滤掉；变异 E5（去掉 `agent.*` 条件）存活，见 PH6-P3-01 |
| 慢快照日志 | 正确 | `:261-264`、`:320-321`：`options.log` 缺省写 stderr，启动器把服务的 stdio 接到 `server.log`（`scripts/launch.mjs:98`）。阈值为“达到”5000 ms，CHANGELOG 写“超过 5 秒”（PH6-P3-07） |

### 3.2 阶段 6a、6b（`75fdddd`、`2b3cacb`）

| 项 | 判定 | 依据 |
|----|------|------|
| 版本 0.11.0 同步 | 完整 | `.codex-plugin/plugin.json`、应用 `package.json`、`package-lock.json` 根与 `packages[""]`、根 README 中英、插件 README 中英、应用 README 均为 0.11.0；`native/build.json` 69 项输入、4 项产物哈希与文件一致（E10），变异副本中重建的 `server.mjs`、`ui.html`、`build.json` 与提交逐字节相同（E8）。产物中残留的 `"0.10.3"` 是门槛常量，不是包版本 |
| 启动器打印 Claude 命令行 | 正确 | `scripts/launch.mjs:358-363`：只在 `plan.claudeRoot.configDir` 是目录时调用 `resolveClaudeCli({ …, save: false })`；位置在锁内、Codex 命令行之后。新用例覆盖“无目录不打印”、找到时打印、失败时打印跳过原因；变异 E7（条件恒真）被发现。`save: false` 没有用例（用例只用显式命令行，显式来源本来就不保存），见 PH6-P3-01。导入闭包 27 个文件、无第三方包（E9） |
| `errors.json` 兜底文案 | 正确 | `CLI_FAILED`、`CLI_UNAVAILABLE` 的英、日文改为不写死 Codex；中文界面显示服务端原文（`src/i18n.tsx:55`） |
| 删除专用 Node 下载代码 | 安全 | 全仓库搜索 `installPrivateRuntime`、`downloadVerified`、`NODE_RELEASE`、`SKILLDOCK_SMOKE_PRIVATE` 只剩文档中的历史说明；`toolchain.mjs` 剩余导入全部仍在使用；对应译文已无残留；`runtime-smoke.mjs` 与应用 README 同步。0.10.x 下载过的 Node 仍由 `server/node-candidates.mjs:34` 的 `skilldock-private` 候选识别（`installPrivateRuntime` 当年把运行时放在 `<state>/node/node-v24.21.0-darwin-<arch>`，与模式相符），但这条候选没有行为用例，见 PH6-P3-03 |
| CHANGELOG 0.11.0 | 基本准确 | 与实现逐条对照一致；三处措辞见 PH6-P3-07（“应用自带”的 Node、“超过 5 秒”、“同时打印”）。日期与“验证”一节是计划中的占位，合并前填写 |
| README、`AGENTS.md`、`SKILL.md`、`references/18` | 基本准确 | 管理状态的默认值与 `server/agents.mjs:33-40` 一致；打开方式（内置浏览器面板、无浏览器工具时给链接、没有原生侧栏入口）与 UAT CC-02 一致；`SKILL.md` 的 Claude 命令行查找顺序与 `server/claude-cli.mjs` 一致；`AGENTS.md` 的锚点与 `--available` 禁令正确；新增的两条可选 Claude 演练脚本与变量名存在。安装与更新的“全程不要求终端”见 PH6-P2-01；回退与要求一栏的措辞见 PH6-P3-07 |

### 3.3 阶段 6c（`f1bbf6a`、`97daa19`、`316eae8`）

**真实 0.11 包装脚本的忠实度**（`tests/compat-matrix.test.mjs:101-113` 对照 `tests/fixtures/skilldock-0.11-sample/stub-launcher.mjs`）：

| 控制项 | 样本 | 包装脚本 | 判定 |
|--------|------|----------|------|
| `waitForSignal` | 记录调用后等待 SIGINT/SIGTERM，写标记退出 | `exec` 进 `log-invocation.mjs`，同样的等待与标记 | 等价（接收信号的仍是 0.10.3 的直接子进程） |
| `fail`、`noisyFail` | 记录后失败（`noisyFail` 先写半截 JSON） | `log-invocation.mjs` 同样失败，`set -e` 带出退出码 | 等价 |
| `forcePort` | 新实例监听指定端口 | 设 `PORT` 后进入真实启动器 | 等价（用例的端口都由 `freePort()` 取得，样本“被占用时换随机端口”的分支用不到） |
| `bigStdout` | 启动实例后输出 70 KiB + JSON | 真实启动器完成后再输出 70 KiB | 等价（顺序不同，0.10.3 按总字节判断） |
| `restartThenFail` | 启动实例、输出 JSON 后退出 1 | 真实启动器完成后退出 1 | 等价 |

控制文件路径用 `SKILLDOCK_STATE_DIR` 推出，与 `log-invocation.mjs` 一致；若转交时丢了该变量，注入会静默失效，但相应用例（N-11、S-24 等）会因期望的失败没出现而报错，不会假通过。“（真实 0.11）”的用例中，启动记录与健康检查凡有写出都由真实启动器与服务写出（`seedInstance` 跑的是包装后的真实启动器）；S-27、S-28 的真实版在注入点之前不运行真实代码，只验证 0.10.3 把真实安装布局认作转交目标（`55` 第 2 节已说明机制，逐条表中可再点明，PH6-P3-07）。

**新增用例对 36b 附录 A 的证明力**：

| ID | 判定 | 依据 |
|----|------|------|
| N-12 | 足够（失败原因未断言） | 只给这条用例显式端口，断言固定错误、无启动记录、端口空闲、脚本删除后仍为固定错误、不调用任何 0.11 脚本 |
| N-14（已打开/首次打开） | 足够 | 断言已打开照常代理、首次打开固定错误、记录逐字节不变、实例 pid 不变——正是“实例不受影响”这一登记行为 |
| N-14（实例未运行）、R-03 | **不足**，见 PH6-P2-02 | 只断言失败与计划不变 |
| N-15 | 足够 | 真实版校验真实 0.11 写下的 `source` 与目录形态的 `installation`；样本版是同义反复（样本按字面写出），无害 |
| S-26 | 足够 | 探查 E1：发 SIGTERM 时 `launcher.json` 尚未写出，说明信号确实落在 `launch.mjs` 运行期间；变异 E2（让 0.10.3 的 `bootstrap.mjs` 收到 SIGTERM 时杀掉 `launch.mjs`）被发现 |
| S-28 | 足够 | 判定点 1+SIGINT、2+SIGINT/SIGTERM、3+SIGINT/SIGTERM × 两版；判定点 3 的驱动脚本（`:688-692`）与已发布 `launch.mjs:206-216` 的入口逐行对照，差别只在 `appDir` 不带结尾斜杠、`null` 时不写 stderr，与信号转发（在 `handover.mjs:281-286`）无关 |
| R-04 | 足够 | 三个动作都退出 1 且提示“无法核实/另一个源码实例”，记录逐字节不变，健康检查仍为 0.11.0 |
| V18-a～d | 门槛逻辑足够；归类见 PH6-P3-05 | 变异 E4（Claude 无法确认时加一个拦截项）使 V18-a、V18-b 失败。V18-c/d 断言退出 4、stdout 空、列出缓存目录与 `config.toml` 条目、不提供跳过、一键更新不可执行时给出原因与步骤、不写三类文件 |

**`55` 的逐条对照**：用例数（103，其中 3 项 V18）、两版与单版的划分、S-17 与 S-22 真实版的调整理由、U-03 与 G-16 的未自动化说明都属实；R-03 一行把未断言的结果写成结论（PH6-P2-02）。

**AC-013 的两处显示条件**：`server/projects.mjs:31-32` 只在 Codex 目录本身不存在时静默返回，Codex 在而记录不在时照常提示，用例覆盖两种情形；`src/App.tsx:1119` 对 1 版快照（无 `agents`）保持原样，2 版快照只在环境列表中有 Codex 时显示。界面一处没有用例，另有几处 Codex 专属文字，见 PH6-P3-02。

**`tests/app.spec.ts` 拦截地址**：改为 `**/api/state?mode=sandbox*`，覆盖 2 版界面请求的 `&multiAgent=1`，修正正确（本轮未运行浏览器端到端测试）。

**`56` 的结论**：大多数行有对应用例；AC-017 第 3 项（PH6-P2-01）、AC-013 第 1 项（PH6-P3-02）与 AC-009 第 5 项（PH6-P3-03）的“满足”偏宽；6c 自己列出的“登记测试缺口”没有体现（PH6-P3-06）。

### 3.4 遗留代码、4771 与真实用户目录

- 无用代码：被删函数无残留引用；新增的 `killed`、`entrySourceInfo`、`SLOW_SNAPSHOT_MS`、`log-invocation.mjs` 的控制处理都有使用者。
- 4771：N-12 的修法正确；0.10.2 原生入口在有启动记录时以记录端口启动自身启动器（`ab6856f` 的 `native-backend.mjs:55`、`:114`），N-14、N-10 等用例因此都落在测试世界的端口上；其余新用例都带 `PORT`（`w.env`）或显式端口。定向运行时在测试进程中加载连接守卫，日志为空。
- 真实用户目录：新增用例都在临时 HOME 中。既有的 `builtRuntime` 用真实环境跑 `npm run build`，会写真实 `~/.npm/_logs`、读 `~/.npmrc`（PH6-P3-08，不在本轮 diff 内）。

## 4. 逐项意见

### PH6-P2-01 README 的 Claude 安装与更新路径未经实测、更新一步缺少刷新 marketplace；`56` 把 AC-017“全程不要求终端”记为满足

- **位置**：`README.md:163`、`:167`；`README.en.md:93`、`:97`；`plugins/skilldock/README.md:59`；`plugins/skilldock/README.en.md:59`；`assets/app/README.md` 的“在 Claude 中安装”一段；`references/56-p0-acceptance-check.md:133`。
- **问题**：
  1. **安装**：桌面应用的路径写作“点提示框旁的 + → Plugins → Add plugin，在插件浏览器中选择 SkillDock”，并以“也可以”与两条 `/plugin` 命令并列。SkillDock 不在官方目录中，插件浏览器里能出现它的前提是先添加本仓库的 marketplace（PRD AC-017 第 1 项的原文就是“添加本仓库 marketplace 后”）；README 里添加 marketplace 的唯一方法是 `/plugin marketplace add`，桌面应用 Code 标签页能否执行这条命令、或有没有界面上的“添加 marketplace”，文档没有说，也没有实测（`56` AC-017 第 1 项自己写着“桌面应用的插件浏览器未实测”）。
  2. **更新**：免终端的更新写作“`/plugin` → Installed → SkillDock → Update now”。SkillDock 在本仓库 marketplace 中是相对路径条目（`./plugins/skilldock`），新内容来自 marketplace 副本；PRD 第 732 行记录了桌面应用整体关闭插件自动更新、第三方 marketplace 默认也不自动更新，副本不会自己刷新。本仓库根 README 的“在 Claude Code 中使用 → 更新”与同一段中的终端写法都是“先 `claude plugin marketplace update`，再 `plugin update`”，SkillDock 自己检查 Claude 插件时也先刷新远端 marketplace（36c 第 6 节）。免终端路径漏掉了这一步，按它操作很可能得到“已是最新”。
  3. `56` 第 133 行据文档把“全程不要求终端”记为“满足”，与第 1 项“待 Owner”及上面两点不一致；`97daa19` 的说明称 README“以插件浏览器为主”，实际各 README 仍以 `/plugin` 命令开头。
- **建议**：
  1. 在 6e 的最终 UAT 中实测桌面应用里的三步：添加 marketplace、从插件浏览器安装、刷新 marketplace 后更新，并把实际的界面路径写进 README（中英、插件 README、应用 README 一并）；更新一步写明先刷新 `testany-agent-skills` marketplace，或把“SkillDock 的更新页”作为首选（它会先刷新）。
  2. `56` AC-017 第 3 项改为“待 Owner（随第 1 项实测）”，汇总一并列出。

### PH6-P2-02 R-03 与 N-14（实例未运行）只断言“失败”，没有断言 36b 登记的行为；`55` 把未断言的结果写成了用例结论

- **位置**：`tests/compat-matrix.test.mjs:787-795`（R-03，两版）、`:406-416`（N-14 实例未运行，两版）；`references/55-compat-matrix-coverage.md:58`、第 4 节第 2 条。
- **问题**：36b A.4 R-03 登记的是“删除记录后尝试启动自己；服务因计划文件 `version: 2` 启动失败；计划、绑定、历史不变”，N-14 的实例未运行分支“同 R-03”。用例只断言退出码非 0（R-03）或固定错误（N-14）加公共不变量。HLD 3.13A 要求“残留用例也要断言已登记的行为，以便在行为变差时发现”：若 0.10.2 改为留下一个 0.10.x 格式的启动记录、留下占着端口的进程，或因别的原因提前失败，这两条用例都照常通过。`55` 第 58 行写“不留启动记录、端口空闲、计划不变”，前两项并不在断言中。
- **实测**（E3，两版都一样）：R-03 结束后 `launcher.json` 不在、端口空闲，0.10.2 的 stderr 为“SkillDock 未能启动，请查看 …/server.log”，`server.log` 末尾是 `code: 'INVALID_UPDATE_STATE'`（422）；N-14 实例未运行分支的 `server.log` 也是 `INVALID_UPDATE_STATE`。也就是说，登记的行为现在确实成立，只是没有被钉住。
- **建议**：在 R-03 与 N-14 实例未运行分支补三条断言——`launcher.json` 不存在、`server.log` 含 `INVALID_UPDATE_STATE`、端口上没有服务（与 N-12 相同的写法）；N-12 第一段可同样补上失败原因。改完后 `55` 的说法即属实。

### PH6-P3-01 测试缺口：1 版快照的 `agent.*` 过滤与启动器的 `save: false` 没有被钉住

- **位置**：`server/service.mjs:268`、`tests/agents.test.mjs:95-104`；`scripts/launch.mjs:360`、`tests/launcher.test.mjs` 末条。
- **问题**：变异 E5 去掉 `!item.action?.startsWith('agent.')` 后新用例照常通过——用例只切换 Claude 的管理，记录的 `agent` 为 `claude`，本来就被前一个条件滤掉；真正依赖新条件的是 `agent: 'codex'` 的 `agent.setManagement` 与 `agent.updateSkilldock` 记录。启动器的新用例只用显式 `SKILLDOCK_CLAUDE_BIN`，显式来源本来就不保存，`save: false` 改成 `true` 也不会被发现。
- **建议**：用例中再切换一次 Codex 的管理（或写一条 Codex 侧的 `agent.updateSkilldock` 记录），断言 1 版快照不含它而多 Agent 快照含它；启动输出用例加一个经 PATH 找到的替身命令行，断言启动后没有写出 `settings/claude-cli.json`。

### PH6-P3-02 AC-013：界面一处条件没有用例，几处 Codex 专属文字在只装 Claude 时仍显示

- **位置**：`src/App.tsx:1119`；`src/InstallDialog.tsx:114`（“从 Codex 官方目录或已连接的 Marketplace 选择插件。”）；`src/UpdatesWorkspace.tsx:85`（计划说明“无需打开 SkillDock 或 Codex”）；`references/56-p0-acceptance-check.md:106`。
- **问题**：`316eae8` 的界面一半没有任何用例（服务端一半有）。另外两处文字不是“需要 Codex”的提示，但在只装 Claude 的环境里所说不实（没有“Codex 官方目录”）。`56` 已注明在最终 UAT 中复核。
- **建议**：在 `agent-ui` 中补一条：2 版快照、环境只有 Claude、`cli.available: false` 时不出现“Codex CLI 暂不可用”，1 版快照照旧出现；上述两处文字按环境选择措辞或记入 41，最终 UAT 的 AC-013 复核清单列出它们。

### PH6-P3-03 AC-009 第 5 项：0.10.x 下载过的专用 Node 没有行为用例，`56` 引用的测试不存在

- **位置**：`server/node-candidates.mjs:34`；`tests/toolchain.test.mjs:100-115`；`references/56-p0-acceptance-check.md:91`。
- **问题**：`56` 的证据写“自动：`node-candidates`（`skilldock-private` 候选）”，仓库中没有这个测试文件，`toolchain` 的顺序用例也没有放置 `<state>/node/node-v*-darwin-*` 的 Node。`2b3cacb` 删除下载代码之后，“继续识别已下载的 Node”是这块唯一剩下的承诺。
- **建议**：在 `toolchain` 的顺序用例中加一个 `<state>/node/node-v24.21.0-darwin-arm64/bin/node` 替身，断言它以 `skilldock-private` 出现在 Codex 工作区之后、Homebrew 之前；`56` 的证据改指该用例。

### PH6-P3-04 Claude 插件的条目来源描述标为“已核实”

- **位置**：`server/claude-plugin-updates.mjs:60`；更新页显示为“证据 · 已核实”（`src/UpdatesWorkspace.tsx:903-910`、`:159`）。
- **问题**：描述取自本机 marketplace 副本中当前的条目，不能证明已装内容来自它（条目可能在安装之后改过，副本也可能未刷新）；HLD v1.29 也说它“只供显示”。Codex 一侧同类的“缓存线索”标为 `inferred`（`server/sources.mjs:58`），两边口径不一。
- **建议**：改为 `confidence: 'inferred'`（证据文字不变）。不影响绑定。

### PH6-P3-05 V18 的归类与 HLD 3.13A 不一致；V18-a 没有断言走了“无法确认”分支

- **位置**：HLD `35-cross-agent-hld.md:823`（“不能替代的：……真实宿主行为（V13、V14、V17、V18）”）、`:1181`、`:1218`；`37:206`（“V18（门槛的环境组合，临时目录中进行）”）；`55` 第 3 节末；`tests/compat-matrix.test.mjs:834-842`。
- **问题**：HLD 把 V18 列为矩阵不能替代的真实宿主行为，`37`、`55`、`56` 则以临时目录中的矩阵用例完成 V18。就 V18 的内容（环境组合）而言，临时目录能忠实构造，用真实 0.11.0 启动器也合理，但两处文档需要一致。V18-a 只断言门槛通过，没有断言 stderr 中“Claude 命令行不可用，改用安装记录。”，不能直接证明“无法确认”这一前提成立（变异 E4 证明门槛逻辑被钉住，但前提本身靠夹具保证）。
- **建议**：在 6d 的 HLD 增量复核中二选一：修订 3.13A，把 V18 移出“真实宿主行为”并注明以临时目录中的真实启动器完成；或在 6e 中补一次真实宿主核对。V18-a 补断言该提示。

### PH6-P3-06 6c 计划中的“登记未补的测试缺口”没有完成，行号引用已失效

- **位置**：`references/37-cross-agent-implementation-plan.md:206`（“第 225 行所列未补的测试缺口逐项补测或登记为已知限制”）。
- **问题**：写入时的“第 225 行”是阶段 5 的进度行，现在第 225 行已是别的内容。该行列出的“仍未补”项（N34、A-M20、A-M27、A-M37～M39、A-M42、B-M10、B-M23、K05、K06、B55、B56、B59、N22、K15、K16 等）在 `55`、`56` 与 6c 进展中都没有处理或登记。
- **建议**：把引用改为指向具体段落；在 `56`（或 `37` 6c 进展）中逐项写“已补（用例名）”或“登记为已知限制（理由）”，完成 6c 的这条出口。

### PH6-P3-07 文字与说明的小处

1. `CHANGELOG.md:204`：Node 来源列出“应用自带”。应用包内的 Node 只运行引导程序，从不被选中或保存（`server/node-candidates.mjs:26-28`）；应用包可以提供的是 npm。建议改为“Codex 工作区、Homebrew、nvm 等”。
2. `CHANGELOG.md:212`“清单读取超过 5 秒”，实现是达到 5000 ms 即记；同一条目“启动输出同时打印所选的 Codex 与 Claude 命令行”宜补“（本机有 Claude 配置目录时）”。
3. `README.md:169`、`README.en.md:99`、`plugins/skilldock/README*.md:154`、应用 README 第 135 行：“0.10.2 及更早版本……不改写数据”。按 36b R-03（Q8），0.10.2 会删除启动记录，运行目录缺失时还会联网构建（0.10.x 找不到 Node 时甚至下载专用 Node）到同一数据目录后再失败；准确的说法是“不改动计划、绑定、历史与偏好”。另外“设置 `SKILLDOCK_STATE_DIR`”对 Codex 原生入口与后台任务如何生效没有说明，可指向 `SKILL.md` 或注明只适用于从技能启动。
4. `plugins/skilldock/README.md:64`（英文版同处）：“需要 macOS、Git，以及支持 plugin 管理的 Codex CLI”读作无条件要求，下一条才说 Claude 的要求；建议改为“在 Codex 中使用时需要……”。
5. `55` 第 3 节 S-27、S-28 两行可注明真实版在注入点之前不运行真实代码，只验证 0.10.3 认出真实安装布局。

### PH6-P3-08 既有的运行时构建步骤用真实 HOME 运行 npm（不在本轮 diff 内）

- **位置**：`tests/compat-matrix.test.mjs:64`（`builtRuntime`，`2e8dd42` 中已有）。
- **问题**：`npm run build` 的环境是 `{ ...process.env }`，按 `55` 记录的运行方式（不改 HOME）会读真实 `~/.npmrc`、每次在真实 `~/.npm/_logs` 写调试日志（本轮把 HOME 指向 scratchpad 后，日志落在 scratchpad 中，可证实它会写）。f1bbf6a 让更多用例经过这一步。
- **建议**：构建环境中设 `npm_config_userconfig=/dev/null`、`npm_config_logs_dir` 与 `npm_config_cache` 指向临时目录（或整体换临时 HOME），与 `world()` 的 `npm_config_cache` 一致。

## 5. 运行与实验

全部在 scratchpad 的导出副本或变异副本中，经 `sandbox-exec -f …/hermetic.sb`、`HOME=<scratchpad>/home` 运行；Node v22.14.0。每项变异只改一处，跑完即还原。

| 编号 | 内容 | 结果 |
|------|------|------|
| T1 | `agents`、`claude-plugin-updates`、`projects`、`toolchain`、`shared-skills`、`launcher`、`i18n` 七个测试文件全量 | 123/123 通过（按名称筛选单跑新用例时，`claude-plugin-updates` 的翻译检查因收集不到前面用例的文字而失败，属筛选所致，整文件运行通过） |
| T2 | 兼容矩阵定向：N-11、N-12、N-13、N-14×2、N-15、N-17、S-07、S-17、S-20、S-22、S-24、S-25、S-26、S-27、S-28×5、R-03、R-04（以上除 N-12、S-26 外两版）、V18×3；`--test-concurrency=1`，测试进程加载连接守卫（拒绝并记录对 4771 与非回环地址的连接） | 45/45 通过，约 96 秒；守卫日志为空 |
| T3 | 以替身 `test` 静态收集矩阵用例名 | 103 个，其中 44 个名称带“真实 0.11”（43 个由循环生成，另一个是 G-06 自带），与 `55` 一致 |
| E1 | S-26 探查：发 SIGTERM 前查看 `launcher.json` | 尚不存在（信号落在 `launch.mjs` 运行期间） |
| E2 | S-26 变异：0.10.3 的 `bootstrap.mjs` 收到 SIGTERM 时 `SIGKILL` 掉 `launch.mjs` | 用例失败（被发现） |
| E3 | R-03、N-14（实例未运行）探查 | 两版均：记录不在、端口空闲、`server.log` 为 `INVALID_UPDATE_STATE`；R-03 的 stderr 为“SkillDock 未能启动” |
| E4 | V18 变异：Claude 命令行不可用时加一个拦截项 | V18-a、V18-b 失败（被发现），V18-c/d 通过 |
| E5 | 去掉 1 版快照的 `agent.*` 条件 | 新用例照常通过（存活，PH6-P3-01） |
| E6 | 去掉 `targetSignature` 对 `marketplace-entry` 的跳过 | `claude-plugin-updates` + `claude-updates` 33 项中 1 项失败（N21 用例，被发现）；基线 33/33 |
| E7 | 启动器打印 Claude 命令行的条件改为恒真 | 新用例失败（被发现） |
| E8 | 变异副本中运行 `node scripts/native-bundle.mjs` | `server.mjs`、`ui.html`、`icon.svg`、`THIRD_PARTY_NOTICES.txt`、`build.json` 与提交逐字节相同 |
| E9 | `scripts/launch.mjs` 与 `scripts/bootstrap.mjs` 的静态导入闭包 | 27 个文件，无第三方包 |
| E10 | `native/build.json` 输入与产物哈希 | 69 项输入、4 项产物全部一致 |

未运行：全量 `npm test`（按要求只跑定向测试，`56` 记录的 603/603 未复核）、浏览器端到端测试、真实 Claude 或 Codex 命令行（沙箱禁止）。

## 6. 环境说明

- 未访问 127.0.0.1:4771；未读取或改动真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；未联网下载；未打印任何配置文件全文。
- 兼容矩阵所需的冻结提交经导出副本的对象库引用（alternates）读取，对原仓库只读。
- scratchpad 中留有导出副本、变异副本与日志，可随时删除；主工作区除本报告外无写入。
