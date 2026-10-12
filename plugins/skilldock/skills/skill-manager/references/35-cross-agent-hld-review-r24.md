# HLD 审查报告（r24，增量核对，与契约第 15 轮合并）：HLD-SDX-001 v1.29 / API-SDX-001 v0.30

> 本报告是评审意见，不是批准。它做五件事：
>
> - 核对 HLD v1.15 → v1.29（`004c30f` → `316eae8`）的全部改动行：各节正文改动，以及第 12 节末尾“第 23 轮评审意见处理（v1.16）”“阶段 4a、4b 实现中的有限修订（v1.17）”……“另一台电脑试用观察的处理（v1.29）”共 14 张表；
> - 核对契约索引 0.14 → 0.30、36c 0.13 → 0.29 的全部改动行，确认 36a、36b、PRD 自 `004c30f` 起没有改动；
> - 判断改动是否与已批准的 PRD-SKILLDOCK-002 0.9 一致、是否改变已冻结的 0.10.3 / 0.10.2 行为（HLD 11A 条件 1a；36a、36b 冻结条文）；
> - 抽查关键条文对应的实现（`316eae8` 的 `assets/app/server/*.mjs`、`scripts/launch.mjs`），用定向测试、兼容矩阵与变异实验佐证；
> - 判断 HLD 准出证书（第 6 轮签发，第 7～24 轮延续）与契约证书（第 14 轮绑定 v0.14）能否重新绑定。
>
> HLD、PRD 与契约的批准、各项 Owner 决定都由产品 Owner 作出。本报告不授权实现、提交、推送或发布。

## 基本信息

| 项目 | 内容 |
|------|------|
| HLD / 本轮版本 | [35-cross-agent-hld.md](35-cross-agent-hld.md)，HLD-SDX-001 v1.29，`artifact.status: approved`，在提交 `316eae8` 中。sha256 `5b5de515968dedb969d197a5f0d147fa36d4cd09126c67fac28b64abb454fe13`（导出目录中计算，评审开始与结束各一次，两次相同，也与 `git show 316eae8:`、原工作树中的文件相同） |
| API 契约 / 本轮版本 | API-SDX-001 v0.30：索引 0.30 `16d8ea778cd9babd71ca251a856ae15af38adb32679142668563ac151e8893a3`；36c 0.29 `18642a1214ce6a4e5e9bf8c4933af1700f7d864a8821fdb6e911f79bf83ad913`；36a 0.2 `a4dd81b4…8ed4`、36b 0.14 `b5e9644c…989b`（均未改，与第 14 轮契约证书相同） |
| 差异基线 | HLD：v1.15 = `git show 004c30f:`，`11aa5c7a…b616`，与第 23 轮证书相同；v1.16 = `git show 58dc726:`，`2bd0c5b9767c370e4e4c4467197fecc744ac3e0e0066d8ab1ad5a659a615751e`，与“HLD 第 24 轮”证书相同（见下一行）。`git diff 004c30f 316eae8`：HLD 21 处、增 180 删 21；其中 v1.16 之后（`58dc726..316eae8`）17 处、增 165 删 16。契约：索引 3 处、增 19 删 3；36c 19 处、增 36 删 24；36a、36b、PRD 0 行 |
| 轮次说明 | 委托称上一轮独立评审为第 23 轮（绑定 v1.15）。实际上 [38-cross-agent-phase2-code-review-r3.md](38-cross-agent-phase2-code-review-r3.md) 第 6 节已作为“HLD 第 24 轮”核对 v1.15 → v1.16，APPROVED（带条件），证书绑定 v1.16（`2bd0c5b9…751e`）。本报告按委托文件名为 r24、编号前缀 HLDR24，按顺序是第 25 次 HLD 核对；证书链从 v1.16 继承（见 HLDR24-P3-08）。v1.15 → v1.16 的两处改动（3.3 第 606 行、3.10 第 787 行）本轮只核对“与第 24 轮所核内容相同”，不重审 |
| PRD | PRD-SKILLDOCK-002 0.9，`e061ec2584217dbdead4e7ad4487a43f7dc61a68ac992485d30665b61b243631`，未变 |
| 上一轮 | HLD：第 23 轮（[r23](35-cross-agent-hld-review-r23.md)）与第 24 轮（38-r3 第 6 节），均 APPROVED（带条件）。契约：第 14 轮（[r14](36-cross-agent-api-contract-review-r14.md)）APPROVED，P0/P1/P2 均 0 |
| 实现事实源 | 0.11 实现 `316eae8`（`git archive` 导出到 scratchpad 的 `review-r24/export/`）；冻结代码 0.10.2 = `ab6856f`、0.10.3 = `337547a`（兼容矩阵经只读的 Git alternates 取用） |
| 仓库状态 | 原工作树 HEAD 开始时为 `316eae8`，工作树中另有他人未提交的改动（`CHANGELOG.md`、`App.tsx`、`UpdatesWorkspace.tsx`、`messages.json`、`agent-ui.test.mjs`、`native/build.json`、`native/ui.html`、37、41、56）。评审期间这些改动由他人提交为 `65061fa`（UI-14 修复与 Owner 关于 TeamDesk、发布时间、UI-02/05/11/15 的决定），结束时 HEAD 为 `65061fa`。该提交不改 HLD、契约、PRD（结束时工作树中六个文件的 sha256 与 `316eae8` 相同）；它对 56 的改动不涉及本报告引用的 AC-001 第 3 项与 MR-SDX-003 两行。本轮评审对象仍是 `316eae8` |
| 模式与范围 | 准出后的增量复审（`delta`，`bounded_change`），对应 HLD 证书条件 5 与契约证书条件 ①。只核对上述改动及其直接影响；未改动、且不受直接影响的章节沿用前几轮结论 |
| 时间 / 轮次 | 2026-10-10；HLD r24（顺序第 25 次）、契约第 15 轮 |
| 评审者 | 独立的 Claude 评审会话（委托子任务），不与作者会话或前几轮评审会话共享上下文；不是人类评审，不代表任何 Owner。按委托不读写真实 `~/.claude`，没有加载 `testany-eng:hld-reviewer`、`api-reviewer` 技能文件，结构与门槛沿用 r23、r14 两份报告 |
| 风险 / 启用视角 | Architect：修订表与正文、HLD 与契约是否一致。Security：只读环境的写入、绑定是否能被换来源绕过、来源描述中的凭证。SRE：代号 2 切换失败后的重试、门槛一键更新的锁。QA：新条文是否都有实现与能发现回归的用例 |
| technical_verdict | **APPROVED**（带条件；P0 0、P1 0、P2 4、P3 8；两项 P2 需 Owner 追认） |
| scope_status | **WITHIN_APPROVED_SCOPE**，附两项待 Owner 追认的语义取舍（HLDR24-P2-01、P2-02） |

## 本轮范围与方法

### HLD v1.15 → v1.29 的改动（行号均指 v1.29）

- **元信息**：版本（第 421 行）、状态（第 424 行，列出 v1.17～v1.29 “均待增量复核”）；YAML 中 DEC-SDX-004 的 statement（第 59 行，“可安装插件”例外）。
- **正文**：3.2 表“可安装插件”（第 581 行）；3.3 进程环境（第 606 行，v1.16）、白名单子命令（第 608 行）、作用域（第 609 行）；3.3A 指纹排除、版本不变不更新（第 631～632 行）、npm/archive 不改写、版本目录、依赖、原地覆盖的范围（第 635～638 行）、隔离区含 `node_modules`（第 640 行）、手动恢复（第 642 行）；3.4 个人技能可见性写入层（第 651 行）；3.8 启动器持锁期间（第 749 行）；3.10 对话框进程组（第 787 行，v1.16）；6.2 时序图（第 948 行）；9.3 V11、V13（第 1175、1177 行）；第 10 节 HLD 批准行（第 1201 行）、新增 DG-NO-AVAILABLE（第 1207 行）；11A 标题（第 1211 行）、条件 4（第 1219 行，改为“已满足”）、条件 5（第 1220 行）。
- **第 12 节新表**（第 1542～1694 行）：第 23 轮处理（v1.16）；v1.17、v1.18 两次有限修订；v1.19 编码前实测；v1.20～v1.24 五次实现中的有限修订；v1.25～v1.28 四次代码评审的处理；v1.29 试用观察的处理。
- 11A 条件 1a（第 1214 行）、1b（第 1215 行）段落**没有改动**（diff 证实）。

### 契约的改动

- 索引：版本与状态（第 9～10 行）；第 4 节 36c 版本（第 50 行）；第 10 节新增 0.15～0.30 共 16 行（第 143～158 行）。
- 36c：版本与状态（第 11～12 行）；第 6 节 `AgentEnvironment.skilldock.canUpdate` 与 `notes` 注释、`UpdateItem.route` 两个新值、批量移除的环境检查、来源冲突在快照/批量/计划中的处理、“Claude 一侧的更新项”“Claude 插件的检查与应用”两段、计划关闭时保存、未安装插件的 ID；7.1 `scope`、`confirm`；7.2 `agent.setManagement`、`agent.updateSkilldock`；7.3 各 Claude 操作的语义；7.4 一段说明；第 8 节 `SCOPE_INEFFECTIVE`；第 9 节门槛一键更新；第 10 节 1 版快照与可安装插件。
- 36c 第 4、5 节（1a 冻结面）没有改动：改动的第一处正文在第 108 行（第 6 节，第 92 行起）。

### 方法

每条新文字对照 `316eae8` 的实现与仓库用例；对委托点名的七项（Claude 插件计划绑定只含来源位置、`marketplace-entry` 来源描述不进绑定、1 版快照不含 `agent.*`、`agent.setManagement` 写操作记录、代号 2 自更新、一键更新、迁移失败后的快速拒绝）做定向测试、变异实验与探针；对冻结代码的影响用兼容矩阵（真实 0.10.2、0.10.3 代码调用真实 0.11）与 `337547a`、`ab6856f` 的调用方核对。全部实验在导出副本、临时 HOME 与 `hermetic.sb` 沙箱中进行（禁止执行本机 Codex、Claude 命令行，禁止非本机出站）。

## Guardrails Trigger Check

- Decision：`no_trigger`。
- Why：改动都是 0.11 自身的设计细化与对已批准设计的有限修订，不改变项目级默认规则。

## 第一道门：批准依据与范围

### 批准依据（本轮新增部分）

| 对象 | 可核实证据 | 结论 |
|------|-----------|------|
| v1.16 两处措辞 | HLD 第 24 轮（38-r3 第 6 节）已核对，sha256 一致 | 已批准 |
| v1.17 启禁缺省作用域、个人技能写入层 | 阶段 4a 评审 P2-01；PRD 5.6“按原生语义调整”；HLD 3.4 已有“项目技能写本地设置”的同类规则 | 在已批准边界内 |
| v1.18 Codex 命令行不可用保持管理状态 | PRD 5.1.4“无法确认”的条件是“配置不可读或格式未知”；MR-SDX-001 | 在已批准边界内 |
| v1.18 可安装插件只取本机副本 | 第 10 节 DG-NO-AVAILABLE（用户，2026-10-09），`5dbd674` | Owner 已决定 |
| v1.19 V11、V13 补测 | 9.3；两项联网下载与真实 launchd 任务注明 Owner 许可 | 作者实测记录（本轮未重做，见证据缺口） |
| v1.20～v1.22、v1.24～v1.28 | 阶段 5 实现与代码评审 48～52；36b 7.3、7.4；DEC-SDX-005、008、010、019、023、026 | 在已批准边界内 |
| v1.23 一键更新在只读一侧同样提供 | 只有 HLD 中的“取舍”说明，**没有 Owner 决定**；与 PRD REQ-SDX-001 的“用户启用后才允许写操作”不一致 | **需 Owner 追认（HLDR24-P2-01）** |
| v1.26 第 2 行：首次检查前的本地修改识别不出 | 只有 HLD 中的“MR-SDX-003 的残余”说明，**没有 Owner 知悉记录**；已批准的 3.3 第 619 行设计未实现 | **需 Owner 追认（HLDR24-P2-02）** |
| v1.29 试用观察 | 2026-10-10 Owner 试用（53、54）；37 阶段 5 状态 | 在已批准边界内 |

### 追溯工具结果

在导出目录根运行 `PYTHONDONTWRITEBYTECODE=1 PATH=/usr/local/bin:$PATH /usr/local/bin/python3 plugins/testany-eng/scripts/trace_lint.py --strict <HLD>`（文本与 `--format json` 各一次）：`TRACE-LINT RESULT: PASS`，退出码 0；Errors 0、Warnings 0、Infos 49（均为 TRACE404 外部 REQ 引用）。JSON 的 `summary` 与第 23 轮的 `r23-lint-hld.json` 相同。DEC-SDX-004 的 statement 改了文字，关系与覆盖未变，未重跑 RTM。

### 受影响条目的覆盖

| 基线条目 | 本轮 | 说明 |
|----------|------|------|
| REQ-SDX-001 环境与管理状态 | 已覆盖，**一处语义待追认** | v1.18 Codex 命令行不可用的处理一致；v1.23 只读一侧的一键更新见 HLDR24-P2-01 |
| REQ-SDX-002 Claude 清单 | 已覆盖 | 可安装插件改为本机副本，有 Owner 决定 |
| REQ-SDX-004 Claude 插件更新 | 已覆盖 | 3.3A 与 36c 第 6 节、实现一致（正文残留见 HLDR24-P2-03） |
| REQ-SDX-006 后台计划 | 已覆盖 | 绑定只含来源位置；暂停规则；1 版只见 Codex 目标 |
| REQ-SDX-007 单实例与版本收敛 | 已覆盖 | 代号 2 协调器、两种快速拒绝、门槛一键更新都有实现与用例 |
| MR-SDX-001 | 已覆盖 | 只管理 Codex 时保持 0.10.2 行为（暂停规则、批量与计划不做冲突跳过） |
| MR-SDX-003 不覆盖本地修改 | 已覆盖，**残余扩大待追认** | 见 HLDR24-P2-02 |

## HLD v1.17～v1.29 逐项核对

| 版本 / 事项 | 实现（`316eae8`） | 测试 / 实验 | 判断 |
|------------|------------------|------------|------|
| v1.17 启禁缺省作用域与决定层；`SCOPE_INEFFECTIVE` | `claude-actions.mjs:118、166` | 定向测试（阶段 4 评审已核）；36c 7.1、第 8 节一致 | 一致 |
| v1.17 个人技能可见性写入层 | 同上；36c 7.1 `skill.toggle` 缺省 | — | 一致 |
| v1.18 Codex 命令行不可用：保持存储状态、只附说明、仅在 Claude 已启用时暂停 Codex 插件目标 | `service.mjs:1968-1972`（`pausedTarget`）；36c `AgentEnvironment.notes` | — | 一致；3.6 正文未改，不矛盾 |
| v1.18 可安装插件取本机副本（DG-NO-AVAILABLE） | 3.2 表、3.3 白名单子命令、DEC-SDX-004 已同步；36c 第 10 节 | — | 一致 |
| v1.18 无 manifest 来源的命名、生成 marketplace 的生命周期、技能目录插件移除 | 36c 7.3 `plugin.previewInstall`、`plugin.remove` | 阶段 4d 评审已核 | 一致 |
| v1.19 V11、V13 补测；条件 4 改为已满足 | 9.3、3.3A 第 635～642 行 | 本轮未重做（需联网与真实 Claude） | 记录完整；正文矛盾见 HLDR24-P2-03 c、d |
| v1.20 原地覆盖含本地目录 marketplace 无版本插件；`VERSION_UNCHANGED` | 3.3A 第 632、638 行已改；`claude-plugin-updates.mjs` `predictVersion` | 定向测试“changed content under an unchanged version is blocked” | 一致；第 636 行未改（HLDR24-P2-03 c） |
| v1.21 生成 marketplace 中插件的更新；来源冲突跳过 | `service.mjs:803-822`（`direct`）；36c 第 6 节 | 阶段 5c 评审已核 | 一致（版本取值以 v1.25 为准） |
| v1.22 代号 2 协调器按 `preferred` 发起切换、目标版本须与记录一致 | `self-update.mjs:59-64、66-100` | 定向测试“generation 2: …”四项；变异 M11（去掉版本核对）被发现 | 一致 |
| v1.22 后台运行来源取两侧家族最高版本；持锁期间跳过的写入由维护周期补做 | `launch-plan.mjs:95-102`；3.8 第 749 行 | `launch-plan` “generation 2: the background …”三项 | 一致 |
| v1.23 一键更新：只改 SkillDock、只读一侧同样提供、无法确认或无命令行时不提供 | `agents.mjs:112`（`canUpdate` 与管理状态无关）；`service.mjs:2020` | `skilldock-update` “the older side …”断言只读 Claude 可更新；变异 M10（改为须已启用）被发现 | 与 36c 一致；**与 PRD 的关系见 HLDR24-P2-01** |
| v1.24 门槛一键更新（`SKILLDOCK_UPDATE_AGENT`，原生入口 `skilldock_gate_update`） | `launch-plan.mjs:178-193`；`gate-cli.mjs:88-114`（持 `launcher.lock` 与该侧操作锁）；`native-server.mjs:47`（app-only 工具，模型不可见）；`process-env.mjs:15` 不传给服务 | 矩阵 G-01、V18-c/d；`launch-plan` “a gate update …” | 一致；重启任务从不执行 |
| v1.25 生成 marketplace 的版本取值、副本移动替换、Git 引用解析 | `claude-plugin-updates.mjs:93-100` 等 | `claude-plugin-updates` “a Git ref resolves …” | 一致 |
| v1.26 Codex 链接固定释放、本地修改基线、指纹排除、不代为更新的插件、计划绑定、暂停判断 | `service.mjs:803-818`（基线）、`1822-1866`（绑定） | 定向测试 | 与实现一致；基线一行的 PRD 影响见 HLDR24-P2-02；3.3 第 619 行未更正（HLDR24-P2-03 a） |
| v1.27 代号 2 切换失败写失败记录、对同一目标的重启任务快速拒绝 | `launch.mjs:374-382`（`recover` 写记录）、`launch-plan.mjs:176-177`（`SWITCH_FAILED_BEFORE`，退出 1）；成功启动后清除（`launch.mjs:326、402`） | `launch-plan` “generation 2: a restart job into a target whose switch failed …”；变异 M7、M9、M9b 被发现 | 一致 |
| v1.27 一键更新逐项读回、跳过缺失项目、超时视为未确认；一次性同意标志不传给长期进程 | `skilldock-update.mjs`；`native-backend.mjs:119、128` 显式清空 | `skilldock-update` 第 42 行用例 | 一致；3.7 第 707 行未更正（HLDR24-P2-03 e） |
| v1.28 绑定只取来源位置；生成 marketplace 的比较树；协调器先看失败记录 | `service.mjs:462-471`（`sourcePlace`）、`1840-1848`；`self-update.mjs:72、91` | N21 用例；变异 M1、M2 被发现，M3、M4 存活（HLDR24-P3-05） | 一致 |
| v1.29 列表项与检查结果带安装目录与来源描述，描述不进绑定 | `claude-plugin-updates.mjs:56-62`（`publicSource` 去掉账号、密码、查询串与片段）；`service.mjs:453、822、1840` | `claude-plugin-updates` 第 489 行用例；M1 被发现 | 一致；`contracts.ts` 未同步（HLDR24-P3-03） |
| v1.29 `agent.setManagement` 写操作记录；1 版快照不含 `agent.*` | `service.mjs:2091-2096`（读回后写入，失败不影响开关）、`268` | `agents` 第 95 行用例；M6 被发现，M5 存活，本轮探针补证（HLDR24-P3-05） | 一致 |
| v1.29 慢读取写分段耗时 | `service.mjs:262-264、321` | `agents` 同一用例断言日志格式 | 一致 |

## 契约 0.15～0.30（36c 0.14～0.29）逐项核对

| 条文 | HLD 对应 | 实现 | 判断 |
|------|---------|------|------|
| 36c 第 6 节 `canUpdate`“与管理状态无关” | v1.23 | `agents.mjs:112` | 一致（PRD 关系见 HLDR24-P2-01） |
| 36c 第 6 节 `UpdateItem.route` 新增 `plugin-files`、`claude-plugin` | v1.20 起 | `contracts.ts:107-109` 已同步 | 一致 |
| 36c 第 6 节“Claude 插件的检查与应用”：绑定位置、`SOURCE_MISSING` 跳过、npm 再打包核对、压缩包不能指向本机、`installedPath` 与 `sourceInfo` | v1.26、v1.28、v1.29 | `service.mjs:462-471、1840-1848`；`scheduler.mjs:284-287`；`claude-plugin-updates.mjs:115` | 一致；`sourceInfo.kind = marketplace-entry` 未进 `contracts.ts`（P3-03） |
| 36c 第 6 节 1 版快照与 1 版 `schedule.configure` 只含 Codex 侧目标 | v1.21 | `service.mjs:272` | 一致 |
| 36c 7.1 `scope`、`gitExclude`；第 8 节 `SCOPE_INEFFECTIVE` | v1.17 | `claude-actions.mjs` | 一致 |
| 36c 7.2 `agent.setManagement`：停用时一并清理；成功写一条不可恢复的操作记录 | v1.18、v1.29 | `service.mjs:2073-2097`，经 `withOperation`（实例锁与 Codex 锁）执行 | 一致；“写一条”在实现中是尽力写入（P3-07） |
| 36c 7.2 `agent.updateSkilldock` 步骤、逐项读回、超时、操作记录范围 | v1.23、v1.27 | `service.mjs:2020-2071` | 一致 |
| 36c 7.3 通则：`needsReload` 的范围、`PROJECT_PATH_MISSING`、`HOST_MANAGED`、`CLI_TIMEOUT` | v1.17～v1.26 | 沿用的错误码在 `ab6856f` 中都已存在（`git grep` 核对 12 个） | 一致 |
| 36c 第 9 节门槛一键更新的结构化错误与 `skilldock_gate_update` | v1.24 | `native-backend.mjs:116-121`、`native-server.mjs:47` | 一致 |
| 36c 第 10 节 1 版快照不含 Claude 记录与 `agent.*` | v1.29 | `service.mjs:268`；但调度器的附加记录未过滤（P3-04） | 基本一致 |
| 索引 0.25、0.28：`SKILLDOCK_UPDATE_AGENT` 与代号 2 快速拒绝不写入 36b | v1.24、v1.27 | 36b 第 2 节“不覆盖：迁移门槛的交互细节”“0.11.x 自身入口之间的启动流程”；第 12 节允许 0.11.x 接受更多环境变量 | 判断成立，见下节 |

## 委托点名的七项：实现与证据

| 条文 | 实现 | 证据 | 结论 |
|------|------|------|------|
| Claude 插件计划绑定只含来源位置（Git 仓库与子目录、npm 包名与源、压缩包下载主机、相对路径） | `sourcePlace`（`service.mjs:462-471`）：git 取 `url`、`subpath`；npm 去掉 `@版本`、带 `registry`；archive 取 `origin`；local / git-market 取 `relative`；绑定另含插件缓存目录（不是版本目录）的 `real`、`dev`、`ino` | N21“a plan follows a pinned entry to its next version; another package is another source”通过；M2（npm 保留版本）被发现；M3（git 带 ref）、M4（archive 取完整地址）存活 | 实现正确；git 与 archive 两种没有用例（P3-05）；相对路径条目不含 marketplace 自身来源（P3-06） |
| `marketplace-entry` 来源描述不进入绑定 | `service.mjs:1840`：`kind === 'marketplace-entry'` 时 `sourceIdentity` 不取描述字段；`scheduler.mjs:180` 观察记录也剥掉 `sourceInfo`、`installedPath` | M1（去掉排除）使 N21 失败（npm 描述含版本） | 一致，有间接用例 |
| 1 版快照不含 `agent.*` 记录 | `service.mjs:268` | 仓库用例只用 Claude 一侧的记录（已被 agent 过滤），M5（去掉 `agent.` 过滤）**存活**；本轮探针：Codex 一侧两次 `agent.setManagement` 后，2 版快照有两条、1 版快照没有；同一探针对 M5 副本失败 | 实现正确；用例缺口（P3-05） |
| `agent.setManagement` 写操作记录 | `service.mjs:2091-2096`：读回成功后写 `{action, agent, target, status: success, canRestore: false}`，写失败不影响开关 | `agents` 用例断言两条记录与 1 版不可见；M6 被发现 | 一致 |
| 代号 2 自更新 | `self-update.mjs:59-100`：只在自身记录、`preferred` 版本更高、目标目录 `package.json` 版本一致、没有失败记录时发起；按目标重置退避 | 四项“generation 2”用例；M11 被发现；M8（去掉第一处失败记录检查）存活，属等价变异（第二处 `:91` 仍阻止发起，只影响退避重置） | 一致 |
| 一键更新 | Agent 环境页：`service.mjs:2020-2071`；门槛：`launch-plan.mjs:178-193` + `gate-cli.mjs:88-114`；界面确认框写明“只改动 SkillDock 本身”（`AgentEnvironments.tsx:24-29`） | `skilldock-update` 7 项；矩阵 G-01、V18-c/d；M10 被发现 | 与 HLD、契约一致；PRD 关系见 P2-01 |
| 迁移失败后的快速拒绝 | 代号 1：`migrationCheck` 在命令行确认之前（`launch-plan.mjs:141-142`，`MIGRATION_FAILED_BEFORE`，退出 4），启动器锁内再判一次（`launch.mjs:285`）；代号 2：`planLaunch` 在工具链之前（`:176-177`，`SWITCH_FAILED_BEFORE`，退出 1）；`recover` 恢复旧实例后写记录（`launch.mjs:381`） | `launch-plan` 第 179、345 行用例；`migration` 第 4 项；M7、M9、M9b 被发现 | 一致；代号 2 只在引导阶段判一次，可接受（0.11 协调器发起前也先看记录） |

定向测试：导出副本中 `node --test --test-concurrency=1` 运行 `claude-plugin-updates`、`agents`、`self-update`、`skilldock-update`、`launch-plan`、`migration`、`launcher` 七个文件，**本机沙箱内 116/116 通过**（非 CI 等价全量）。

## 对 0.10.3 与 0.10.2 冻结行为的影响（问题 1）

| 交集 | 冻结面事实 | 本轮改动的表现 | 判断 |
|------|-----------|---------------|------|
| 36a、36b、36c 第 4～5 节 | 1a 冻结面 | 0 行改动（36a、36b sha256 与第 14 轮证书相同；36c 改动从第 6 节开始） | 未改 |
| HLD 11A 1a、1b 段落 | — | 第 1214、1215 行不在 diff 中 | 未改 |
| 0.10.x 读取的文件（`background/`、`launcher.json`、`restart.json`、`project.json`、`local/`） | 3.7：门槛通过前不得改动 | 门槛一键更新只取共享的 `launcher.lock` 与 Agent 操作锁，写的是 Agent 自己的插件；失败记录写在 0.10.x 不读的 `compat/`；`agent.*` 记录写入 `local/` 的登记文件，只在代号 2（0.10.x 已不接管）且持锁时 | 不变 |
| 0.10.x 自更新协调器调用 0.11 `launch.sh restart`（36b 7.1、7.4） | 只区分 0 与非 0 | 代号 1 的拒绝仍为退出 4、stdout 为空、在接受任务之前；代号 2 的 `SWITCH_FAILED_BEFORE` 退出 1 只会被 0.11 协调器看到（代号 2 下 0.10.3 不接管、0.10.2 服务因新格式计划文件起不来），符合 6.3“今后增加退出码不改变本节义务” | 不变 |
| 0.10.3 转交链调用 0.11（36b 6.2、6.3） | 原样传递调用方环境 | `SKILLDOCK_UPDATE_AGENT` 只在门槛拦下被指名 Agent 且不是重启任务时生效；0.10.x 调用方不会设置它；0.11 原生入口普通启动显式清空 | 不变 |
| 1 版客户端（0.10.x 原生界面）经代理访问 0.11 服务（36c 第 5 节） | 不带 `multiAgent` 只返回 Codex 对象 | `agent.*` 记录与 Claude 记录被过滤；新增的 `installedPath` 等字段属“只增不破”；调度器附加记录未过滤只影响显示（P3-04） | 不改变冻结语义 |
| 兼容矩阵 | — | 导出副本（经只读 alternates 取 `ab6856f`、`337547a`）运行 `tests/compat-matrix.test.mjs`：**本机沙箱内 103/103 通过**，含“真实 0.11”两版用例、附录 A.5 的 G 系列、S-28 五项×两版、V18-a～d | 未发现回退 |

结论：**本轮改动不改变 0.10.3、0.10.2 冻结代码的任何可观察行为，也不要求它们改变**。

## 11A 条件 1a、1b

- **1a：不受影响，维持满足。** 1a 段落与 36a、36b、36c 第 4～5 节均未改；本轮改动都描述 0.11 自身行为；没有发现 K3、固定子目录或转交链第 3 步不可行。
- **1b：以本轮绑定的契约 v0.30 为准，事后满足。** 36c 0.14～0.29 的新增字段值、操作语义与错误码（`SCOPE_INEFFECTIVE`、两个 `route` 值、`agent.*` 语义、`MIGRATION_BLOCKED` 结构化错误等）都是先实现、后标“待增量复核”，与 1b“最迟在实现 0.11.0 的 HTTP 接口与 `contracts.ts` 增量之前”通过评审的时序不符（HLDR24-P2-04）。本轮补做 delta 复核，未发现需要回改实现的条文。

## Findings

### P0 / P1 缺陷

无。

### P2（应处理；不阻断证书重新绑定）

**HLDR24-P2-01 一键更新在只读一侧同样提供：与 PRD“启用后才写入”不一致，没有 Owner 决定（v1.23；36c 第 6 节 `canUpdate`、7.2）**

- 有效依据：PRD REQ-SDX-001 statement“另一侧新发现的环境默认只读，用户启用后才允许写操作”；5.1.1“环境的启用与停用是对后续写操作的授权”；5.1.4“只读：写操作禁用并提示”；第 1182 行灰度策略“用户启用后才写入”。HLD 第 1621 行把它写成“取舍”，第 10 节没有对应决定。
- 当前事实：`agents.mjs:112` 的 `canUpdate` 与管理状态无关；`agent.updateSkilldock` 对只读一侧执行 `plugin marketplace update` 与 `plugin update`（Claude 按每个非托管作用域，含 project、local），或 Codex 的 `marketplace upgrade` 与 `plugin add`；用例明确断言只读 Claude 可更新。界面有确认框（“只改动 SkillDock 本身”），每次都由用户点击触发，没有后台路径；但停用管理的确认框写“SkillDock 只显示其中的对象，不再修改它们”，与此相反。56 把 AC-001“未启用管理时写操作不可用”判为满足，没有提这一例外。
- 影响：产品语义变化落在 P0 需求的验收口径上，未经 Owner 认可。不是越权写入（逐次确认、只动 SkillDock 自身、不涉及冻结行为），故列 P2。
- 建议：由 Owner 在两者中选一并记入第 10 节：① 接受（理由：PRD REQ-SDX-007 已要求门槛处的一键更新与管理状态无关；只动 SkillDock 自身），同时修正停用确认框文案与 56 的结论；② 收窄为只在已启用的一侧（以及门槛处）提供，只读一侧给出“先启用管理”或手动步骤。选 ② 时对改动做增量复核。
- 是否需要 Owner 决定：**需要**。

**HLDR24-P2-02 首次检查前的本地修改识别不出：MR-SDX-003 的残余扩大，没有 Owner 知悉记录（v1.26 第 2 行；3.3 第 619 行）**

- 有效依据：PRD MR-SDX-003（P0）“任何手动或后台更新都不覆盖被本地修改过的内容，冲突跳过并记录”；已批准的 3.3 第 619 行设计“没有历史记录的，优先以 Claude 安装记录中的来源提交取得基线，取不到时以检查时的指纹为基线”。
- 当前事实：`service.mjs:812-815` 只在已有 `claudePluginBaselines` 时比较；首次检查把当时的安装内容当作基线，“优先以来源提交取得基线”一步没有实现（v1.26 已如实写明）。结果：用户在 SkillDock 首次检查前改过的 Claude 插件，之后的手动或计划更新会照常进行——声明版本的插件由 Claude 新建版本目录，改过的旧目录带废弃标记保留 14 天；版本为 `unknown` 的原地覆盖，更新前有隔离区副本。56 把 MR-SDX-003 判为满足，没有提这一残余。
- 影响：内容在 14 天内或隔离区中可找回，Claude 自己的自动更新也会产生同样效果，SkillDock 没有首次检查前的记录可比，故列 P2；但这是 P0 约束的适用面收窄，宜由 Owner 知悉。
- 建议：Owner 把它登记为已知残余（与 PRD Q8～Q10 同样处理），或要求对 Git 类来源按安装记录中的提交取基线；同时更正 3.3 第 619 行与 56。
- 是否需要 Owner 决定：**需要**（知悉或要求补实现）。

**HLDR24-P2-03 修订表与正文不一致：正文保留被修订表推翻的说法，且 HLD 没有写明两者的优先关系**

- 有效依据：HLD 是 0.11 的设计事实源（AGENTS 规则“三者不一致时，改代码的人必须把文档一起收敛”）；v1.17～v1.29 的大部分改动只写在第 12 节末尾的表中，表中“位置”一栏指向 3.3、3.3A、3.7、3.8 等，但下列正文仍是旧说法：
  - a. 3.3 第 619 行“没有历史记录的，优先以 Claude 安装记录中的来源提交取得基线”——v1.26 表写明未实现；
  - b. 3.3A 表 github/url/git-subdir 行（第 627 行）读回“列表读回的版本前缀 = 预览提交的前 12 位”——v1.26 表写明“不另核对版本前缀”；
  - c. 3.3A 第 636 行“只有没有声明版本的 npm 插件（版本 `unknown`）在同一目录原地覆盖”——与第 638 行和 v1.20 表（本地目录 marketplace 中无版本插件同样原地覆盖）矛盾；
  - d. 3.3A 第 637、642 行把“本地目录 marketplace 中的相对路径插件”算作“原地加载、Claude 不装依赖”——v1.20 表与 9.3 V8 是“按版本复制进缓存 / 复制整个目录”；V11 补测只验证了技能目录插件一条途径不补装依赖。结论“副本保留 `node_modules`”两种情况下都成立，但依据写错；
  - e. 3.7 第 707 行“与仍在运行的 0.10.x 后台刷新、自更新之间由启动锁串行”——v1.27 表已更正为“与 0.10.x 后台工作进程串行靠 Codex 锁”。
- 影响：按正文实现或测试的人会得到被推翻的设计；以后的增量复核也难以只看改动行。
- 建议：把 v1.17～v1.29 并入对应正文，或至少在元信息与第 12 节开头写明“末尾修订表优先于正文”，并改正 a～e。
- 是否需要 Owner 决定：不需要。

**HLDR24-P2-04 条件 1b 的时序：契约 0.15～0.30 先实现、后复核**

- 有效依据：11A 条件 1b（第 1215 行）“0.11.0 相应编码前（最迟在实现 0.11.0 的 HTTP 接口与 `contracts.ts` 增量之前）……定稿并通过独立契约评审”；契约第 14 轮证书条件 ①“此后任何修订……都须 delta 复核后重新绑定”。
- 当前事实：索引第 10 节 0.15～0.30 每行都是“待增量复核”，契约改动与对应代码在同一提交中（例如 `7443a5a` 同时改 36c 与 `service.mjs`）；阶段 4、5 期间没有契约复核轮次。
- 影响：本轮补做后没有发现需要回改的条文，实际风险已消化；但证书条件被事后满足，后续若照此执行，契约复核会失去“先定稿再编码”的作用。
- 建议：0.11.0 合并发布前若再改契约，先复核再编码；在 37 中记下本轮补做的事实。
- 是否需要 Owner 决定：不需要。

### P3（编辑与小处）

**HLDR24-P3-01 HLD 元信息与证书记录过时**：状态行“截至 v1.15 共 23 轮”“v1.16 修第 23 轮两处措辞，待增量复审”（v1.16 已经 38-r3 的第 24 轮核对）；第 10 节 HLD 批准行停在“v1.16 …待第 24 轮核对”；11A 标题“第 7～23 轮延续”；条件 5 停在 v1.16，未列 v1.17～v1.29；第 12 节没有第 24 轮的处理表。实施计划第 3 行上游仍为“HLD v1.16、API v0.14”。建议随下次修订一并更新（按本报告证书）。

**HLDR24-P3-02 契约元信息过时**：索引状态行仍写“第 13 轮契约复核 APPROVED”，且“0.15～0.29 … 待增量复核”漏了 0.30；索引第 4 节表中 36c 版本写 0.21（实为 0.29）；36c 状态行仍为“第 12 轮契约复核 APPROVED（v0.12）”（第 14 轮已提）；36a 状态行（第 13 轮观察）未变。

**HLDR24-P3-03 `contracts.ts` 未随 36c 0.29 同步**：36c 第 6 节写 `sourceInfo.kind = marketplace-entry`，`contracts.ts:61` 的 `SourceInfo.kind` 没有这个值；`label` 在类型中必填，`entrySourceInfo` 不给；生成 marketplace 插件的检查结果（`service.mjs:822`）只有 `source`、`sourceType`、`subpath`、`ref`、`label`，缺 `kind`、`confidence`、`owner`、`evidence`，更新页的“证据”摘要（`UpdatesWorkspace.tsx:903-909`）因此显示空白的可信度。36c 第 11 节要求两者同步、契约评审同时核对。

**HLDR24-P3-04 1 版快照中调度器的附加记录未过滤**：`service.mjs:269` 在过滤之后才并入 `scheduler.data().extraActivity`（`schedule.configure`、`schedule.reconcile`、`schedule.migrate`），`updateRuns` 也原样返回；Claude 目标的迁移、运行项会出现在 0.10.x 界面中。与 36c 第 10 节“1 版快照的 `activity` 不含 Claude 一侧的操作记录”不完全相符（按代码推断，未实测）。只影响显示。建议按 `target.agent` 过滤，或在 36c 写明例外。

**HLDR24-P3-05 用例缺口**：① 1 版快照的 `agent.` 过滤没有能发现回归的用例（M5 存活；本轮探针证明实现正确、补一个 Codex 一侧的用例即可发现）；② 绑定位置只有 npm 有用例，git 带 `ref`（M3）、archive 取完整地址（M4）都不会被发现；③ `marketplace-entry` 排除只由 N21 间接覆盖。

**HLDR24-P3-06 绑定位置的两处边界**（按代码推断，未实测）：① `local`、`git-market` 条目只绑定 `relative` 与缓存目录身份，不含 marketplace 自身的来源；同名 marketplace 被改指另一个仓库（例如协作者改了项目共享设置中的 `extraKnownMarketplaces`）而缓存目录仍在时，计划不会要求重新选择，v1.28“换仓库须重新选择”在这种情形不成立；② npm 条目的 `package` 是 https 包地址时，`sourcePlace` 原样保留整条地址，维护者换地址发布时会重现 v1.28 修正的问题。建议把 `known_marketplaces.json` 中该 marketplace 的来源纳入相对路径条目的位置；npm 地址按 origin 处理，或在 HLD 中登记为残余。

**HLDR24-P3-07 措辞**：HLD v1.29 与 36c 7.2 写“写一条操作记录”，实现是尽力写入（`service.mjs:2096` 写失败被忽略，开关已生效）；来源描述实际去掉了账号、密码、查询串与片段，比文字“去掉账号与密码”更严。建议照实现写明。

**HLDR24-P3-08 轮次编号冲突**：“HLD 第 24 轮”已用于 38-r3 第 6 节（绑定 v1.16）；本报告按委托命名 r24。建议下次修订 HLD 时把本轮记为第 25 轮（报告文件名 r24），或由作者统一更名，避免证书链出现两个“第 24 轮”。

P2 共 4 项（两项需 Owner 决定），P3 共 8 项。

## 证据缺口

- V11、V13 补测（需联网下载与真实 Claude、真实 launchd）本轮没有重做，只核对 9.3 的记录与 3.3A 的落点；条件 4 的“已满足”以作者实测记录为准。
- 条件 2（V20 与 0.10.3 关口留证）仍没有材料，本轮不判断（与第 14～24 轮相同）。
- 条件 3：兼容矩阵已用真实 0.11.0 重跑（本轮在沙箱中复现 103/103），V18 已完成；V17（真实 Codex 中更新）仍待 Owner 配合（阶段 6e）。
- 一键更新、门槛一键更新只在替身命令行下验证，没有在真实 Claude、Codex 中执行（本轮约束）。
- HLDR24-P3-04、P3-06 为代码推断，没有实测。

## Decision Gates（需要 Owner）

| 编号 | 事项 | 选项 |
|------|------|------|
| DG-R24-1（HLDR24-P2-01） | 只读一侧是否提供 SkillDock 自身的一键更新 | ① 接受并记入第 10 节，修正停用确认框与 56；② 收窄为只在已启用一侧与门槛处提供 |
| DG-R24-2（HLDR24-P2-02） | 首次检查前的本地修改识别不出 | ① 登记为 MR-SDX-003 的已知残余；② 要求对 Git 类来源按安装记录取基线 |

两项都不阻断证书重新绑定；最迟在 0.11.0 合并发布前决定（见证书条件 7）。

## 放行结论

| 门槛 | 实际结果 |
|------|----------|
| P0 / P1 均为零 | 是 |
| 冻结行为 | 不改变 0.10.3、0.10.2 的可观察行为（专节；矩阵 103/103，本机沙箱内） |
| 必要证据缺口关闭 | 是。条件 2～3 的剩余部分属后续关口 |
| 范围具有有效原始授权 | 是，两项语义取舍待 Owner 追认（DG-R24-1、2） |
| 本轮增量核对覆盖完整 | 是：HLD 21 处改动与 14 张表逐项核对；契约索引 3 处、36c 19 处逐项核对；七项关键条文都有实现与实验证据；36a、36b、PRD 确认未改 |

- technical_verdict：**APPROVED**（带条件）。条件是对 Owner 决定与发布的后续关口，不是接受未关闭的缺陷。
- scope_status：**WITHIN_APPROVED_SCOPE**（附 DG-R24-1、2）。
- 执行许可：本轮只授权写本报告。不包括修改 HLD、PRD、契约、实施计划或代码，也不包括实现、commit、push、PR、安装、发布或合并 main。

## 准出证书重新绑定（带条件）

### HLD 证书

- **对象**：`plugins/skilldock/skills/skill-manager/references/35-cross-agent-hld.md`，HLD-SDX-001 v1.29，**sha256 `5b5de515968dedb969d197a5f0d147fa36d4cd09126c67fac28b64abb454fe13`**（在导出目录中以 `shasum -a 256` 计算，评审开始与结束各一次，两次相同；与 `git show 316eae8:` 相同）；已在提交 `316eae8` 中；`artifact.status: approved`。
- **取代**：38-r3 第 6 节（HLD 第 24 轮）绑定的 v1.16（`2bd0c5b9…751e`）。
- **批准依据**：PRD-SKILLDOCK-002 0.9（`e061ec25…243631`，未变）；HLD 的 Owner 批准见第 10 节第 1201 行；DG-NO-LLD、DG-RUNNING-PROJECT、DG-NO-RECORD、DG-BACKOFF、DG-SPLIT-1、DG-NO-AVAILABLE 见第 10 节；API 契约 v0.30（下节）。
- **时间 / 轮次**：2026-10-10，r24（顺序第 25 次）。轮次构成：第 1 轮正式全量评审；第 2～6 轮整改复审；第 7 轮准出后增量复审；此后各轮为增量核对。
- **technical_verdict / scope_status**：APPROVED（带条件）/ WITHIN_APPROVED_SCOPE（附 DG-R24-1、2）。

### 契约证书（第 15 轮）

| 项 | 内容 |
|----|------|
| 结论 | **通过**（P0 0，P1 0；涉及契约的 P2：HLDR24-P2-01（`canUpdate` 语义，与 HLD 同一事项）、P2-04（1b 时序）；P3：P3-02、03、04、07） |
| 对象 | API-SDX-001 v0.30，提交 `316eae8`：<br>索引 `36-cross-agent-api-contract.md`（0.30）**`16d8ea778cd9babd71ca251a856ae15af38adb32679142668563ac151e8893a3`**<br>36a `36a-cross-version-file-formats.md`（0.2，未改）**`a4dd81b456443c8472244ee0a4a0b006e95de147233c9e88e8ca3f2d9c278ed4`**<br>36b `36b-launcher-handover-protocol.md`（0.14，未改）**`b5e9644ce711a4f2228488d43353520a828dc9159a3b82fc9b5d2df56fcf989b`**<br>36c `36c-http-api-delta.md`（0.29）**`18642a1214ce6a4e5e9bf8c4933af1700f7d864a8821fdb6e911f79bf83ad913`** |
| 取代 | 第 14 轮证书（v0.14：索引 `20c5d95f…a269`、36c `980f6306…dedf4`；36a、36b 相同） |
| 基线 | PRD 0.9 `e061ec25…243631`；HLD v1.29 `5b5de515…fe13` |
| Gate 结果 | Gate 1 基线与覆盖：通过（REQ-SDX-001～017、MR-SDX-001～003 仍有落点）。Gate 2 协议完整性：通过（新字段值、操作、错误码均有可断言的结果；沿用错误码在 0.10.2 中都存在）。Gate 3 漂移与冲突：通过，`contracts.ts` 一处未同步（P3-03）、第 10 节一处不完全相符（P3-04）。Gate 4 兼容性与演进：通过（1a 冻结面未改；1 版语义保持；新退出码只被 0.11 调用方看到） |
| 有效条件 | ① 只对上述四个 sha256 有效，此后任何修订（含只改状态行或第 10 节）都须 delta 复核后重新绑定，且宜先复核再编码（P2-04）；② 1a 部分只允许与已发布 0.10.3 一致的措辞修正，修订后按 1a 复核；③ 对 36b 6.3“完成条件与输出”的修订须按 1a 复核；④ DG-R24-1 若选收窄，36c `canUpdate` 与 7.2 随之修订并复核 |

### 条件（两份证书共同的有效条件）

| 条件 | 有效状态 |
|------|---------|
| 1a. 约束 0.10.3 行为的全部条文定稿并通过独立契约评审（第 1214 行） | **满足（维持）；硬前提。** 本条段落与 36a、36b、36c 第 4～5 节本轮未改；改动不影响冻结代码的可观察行为（矩阵 103/103，本机沙箱内） |
| 1b. 36b 6.3、7.4、附录 A.5 与 36c 多 Agent 字段形态、操作与错误码定稿并通过独立契约评审（第 1215 行） | **满足（以本轮绑定的 v0.30 为准）。** 0.15～0.30 为事后复核（HLDR24-P2-04） |
| 2. 0.10.3 合并发布前完成 V20 与矩阵 0.10.3 关口 | 时点已过，仍无留证，本轮不判断 |
| 3. 0.11.0 合并发布前用真实 0.11.0 重跑矩阵（含 A.5 与 S-28），完成 V18、V17 | **部分满足**：矩阵重跑与 V18 已完成（本轮复现）；V17 待 Owner（阶段 6e） |
| 4. 0.11.0 相应功能编码定稿前完成 V11～V14 | HLD 记为已满足（第 1219 行），以作者 2026-10-09 实测记录为准；本轮未重做 |
| 5. 证书绑定的版本 | **改为**：本证书绑定 v1.29（`5b5de515…fe13`）。此后的任何修订，包括按本报告 P2-03、P3-01 所做的修改、只改状态行或 11A 的修改，都须对修订部分做增量复审，复审范围仅限修改及其直接影响 |
| 6. PRD 按核对的内容提交 | 0.9 `e061ec25…243631`，未变，**满足** |
| 7.（新增）DG-R24-1、DG-R24-2 | 0.11.0 合并发布前由 Owner 决定；若选择收窄或补实现，对改动部分做增量复核 |

### 审查者与权限边界

- **Reviewer**：独立的 Claude 评审会话；不是人类评审，不代表产品或工程 Owner。
- **本证书证明的内容**：上述 HLD 与契约版本在本轮增量核对下的设计与契约评审结论。
- **本证书不授权**：实现、commit、push、PR、合并 main、发布、安装或任何环境操作。

## 历程与下一步

| 轮次 | 变化 / 结论 |
|------|------------|
| HLD 1～23 | 见 r23 |
| HLD 第 24 轮（38-r3 第 6 节） | R23-P2-01、02 落实；证书绑定 v1.16 |
| 本轮（HLD r24 / 顺序第 25 次；契约第 15 轮） | v1.17～v1.29、契约 0.15～0.30 逐项核对；P0/P1 0，P2 4（两项待 Owner），P3 8；冻结行为未改；证书重新绑定到 HLD v1.29、契约 v0.30 |

最小下一步：

1. Owner 决定 DG-R24-1、DG-R24-2，并据此更新 HLD 第 10 节与 56。
2. 作者按 P2-03 把修订表并入正文（或写明优先关系），顺带处理 P3-01、P3-02、P3-07、P3-08；修订后按条件 5 做只限改动部分的核对。
3. 代码侧按 P3-03～P3-06 补 `contracts.ts`、1 版附加记录过滤、用例与绑定边界（可在阶段 6 内处理，交给代码评审）。
4. 条件 3 的 V17 在阶段 6e 完成。

## 附：本轮实际执行的校验

1. `shasum -a 256`（导出目录，开始与结束各一次）：HLD、索引、36a、36b、36c、PRD、实施计划（`97ff0995…6265`，只记录）；`git show 004c30f:`、`58dc726:`、`316eae8:` 各算一次，结果见基本信息与证书；原工作树中 HLD、索引、36c 与 `316eae8` 相同。
2. 差异：`git diff [-U0|--numstat] 004c30f 316eae8`、`58dc726 316eae8`（HLD、索引、36a、36b、36c、PRD），逐处核对；逐提交列出 v1.17～v1.29 对应的提交。
3. 追溯：`trace_lint --strict`（文本与 JSON），PASS，与第 23 轮摘要相同；`PYTHONDONTWRITEBYTECODE=1`，没有安装任何包。
4. 定向测试：`sandbox-exec -f …/verify/phase2-review/hermetic.sb env -i HOME=<scratch> TMPDIR=<scratch> PATH=<node 与系统目录> npm_config_offline=true NODE_OPTIONS=--import=guard.mjs node --test --test-concurrency=1 <七个文件>`：116/116 通过；守卫没有记录任何被拦截的连接。
5. 兼容矩阵：导出副本另建一份、`git init` 并以 alternates 只读引用原仓库对象，在同一沙箱中运行 `tests/compat-matrix.test.mjs`：103/103 通过（约 3 分 17 秒）。
6. 变异实验（导出副本的另一份拷贝，每次只改一处、跑对应用例后复原）：M1、M2、M6、M7、M9、M9b、M10、M11 被发现；M3、M4、M5 存活（P3-05）；M8 为等价变异。探针：在拷贝中追加一个用例（Codex 一侧 `agent.setManagement` 后 1 版快照不含 `agent.*`），原实现通过、M5 副本失败。
7. 只读对照：HLD 3.2～3.10、9.3、第 10 节、11A、第 12 节新表；36c 第 4～11 节；36b 第 2、6.3、7.1～7.4、12 节；PRD REQ-SDX-001、007、MR-SDX-003、5.1；`316eae8` 的 `service.mjs`、`scheduler.mjs`、`self-update.mjs`、`launch-plan.mjs`、`migration.mjs`、`gate-cli.mjs`、`agents.mjs`、`claude-plugin-updates.mjs`、`files.mjs`、`native-backend.mjs`、`native-server.mjs`、`process-env.mjs`、`scripts/launch.mjs`、`shared/contracts.ts`、`src/AgentEnvironments.tsx`、`src/UpdatesWorkspace.tsx`；`ab6856f` 中 12 个沿用错误码的出处；辅助材料 37、48、52、55、56。

**约束遵守与披露**

- 除本报告外没有写入原工作树任何文件；没有修改 HLD、PRD、契约、实施计划或代码；没有 commit、push、切换分支。
- 实验只在 scratchpad 的 `review-r24/` 下进行（导出副本、变异拷贝、兼容矩阵拷贝、临时 HOME 与 TMPDIR）；没有访问 `127.0.0.1:4771`；没有读取或改动真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；没有执行 `launchctl`；没有联网下载任何东西；没有打印任何配置文件全文。
- 兼容矩阵拷贝中的 `.git` 以 alternates 只读引用原仓库对象，只执行了 `cat-file`、`rev-parse`、`archive` 类只读命令。
- 变异 M9b（去掉失败记录写入）使 `migration.test.mjs` 中途失败，留下一个监听 `127.0.0.1:65035` 的测试服务进程（位于 scratchpad 临时目录）；评审结束前已发现并结束它，未变异的运行没有残留进程。
- 本报告不含凭证或令牌；引用的绝对路径都在 scratchpad 或仓库内。
