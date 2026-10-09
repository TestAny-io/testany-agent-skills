# 代码复核报告（第 3 轮，窄范围）与 HLD 第 24 轮增量核对：阶段 2 复核意见的修复（`58dc726`）

> 本报告是独立评审意见，不是批准提交、推送、合并或发布的授权。源码结论、CI 状态与环境状态分开报告。
>
> 代码部分只看提交 `58dc726` 的改动及其直接影响；HLD 部分是 HLD-SDX-001 v1.15 → v1.16 的第 24 轮增量核对（证书条件 5），两部分实验共用。HLD 与 PRD 的批准、各项 Owner 决定都由产品 Owner 作出。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 上一轮 | 代码复核第 2 轮（[r2](38-cross-agent-phase2-code-review-r2.md)，APPROVED，新 P2：PH2R2-P2-01～03）；HLD 第 23 轮（[r23](35-cross-agent-hld-review-r23.md)，APPROVED（带条件），R23-P2-01、02，证书绑定 v1.15） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），不与作者会话或前几轮评审共享上下文；不是人类评审，不代表任何 Owner。没有加载 `testany-eng:code-reviewer`、`testany-eng:hld-reviewer` 技能文件，结构与分级沿用上一轮两份报告；追溯检查使用仓库内的 `plugins/testany-eng/scripts/trace_lint.py` |
| 日期 | 2026-10-09 |
| 仓库 / 分支 | `feature/skilldock-0.11-cross-agent`（本地，未推送） |
| Candidate | `58dc7264058ef511e8fd79dbcb7556a9a3ca9506`（tree `d9e6172a…7eea`），父提交 `f0b6e34`（tree `c877e297…96f8`；相对 `004c30f` 只多两份上一轮报告）。9 个路径，增 79 行、删 19 行；不含 `references/` 为 7 个路径，增 60 行、删 10 行。`--name-status --no-renames -z` 清单 sha256 `ae52249e…41d7`，完整 diff sha256 `4a66d877…e91c` |
| 工作区绑定 | 开始与结束时 HEAD 均为 `58dc726`；开始时工作区干净，结束时只多本报告。定向测试与变异实验在 `git archive 58dc726` 的两个导出副本（`export-58dc726/`、`mut/`）中进行，对照用 `git archive f0b6e34`（`base-f0b6e34/`）；`node_modules` 为指向仓库同名目录的符号链接。导出副本整棵树的 sha256 与变异副本变异前后都为 `6527840d…b2b9` |
| 事实源 | HLD-SDX-001 v1.16（本报告第 6 节核对）3.3、3.10；v1.15（`11aa5c7a…b616`）为差异基线；API-SDX-001 v0.14：36b 6.2、6.3、7.4；冻结代码 0.10.2 = `ab6856f`、0.10.3 = `337547a` |

## 2. 结论

**代码：APPROVED**（源码层；`58dc726` 相对 `f0b6e34`）。P2 不阻断。

- P0：0；P1：0
- 上一轮 P2：PH2R2-P2-01、PH2R2-P2-03 **关闭**；PH2R2-P2-02 **部分关闭**（(a)(b)(d)(e) 关闭；(c) 只补了一半；(f) 的清理钩子排在夹具删除之后，回归时仍遗留服务）
- 本轮新 P2：1（PH2R3-P2-01，第 5 节）
- 与 0.10.2、0.10.3 冻结行为的兼容：本提交不改变任何冻结调用方可观察的结果（第 4.2 节）

**HLD 第 24 轮：APPROVED（带条件）/ WITHIN_APPROVED_SCOPE**。R23-P2-01、R23-P2-02 已落实；11A 条件 1a 段落未改、维持满足；契约 36、36a、36b、36c 无须修订；`trace_lint --strict` 通过。**证书重新绑定到 v1.16，sha256 `2bd0c5b9767c370e4e4c4467197fecc744ac3e0e0066d8ab1ad5a659a615751e`**（第 6.10 节）。

- SCOPE_DECISION / EVIDENCE_BLOCKED：无
- 是否需要 Owner 决定：不需要

本结论不授予推送、合并、CI 或发布权限。

## 3. 上一轮问题逐项核对（代码）

| ID | 修复 | 证据 | 结论 |
|----|------|------|------|
| PH2R2-P2-01 `launch-plan` 用例执行本机 Codex 命令行 | `launch-plan.test.mjs:139、141、178`：`planLaunch` 的 `env` 改为 `{ ...w.env, SKILLDOCK_STATE_DIR }`，带 `HOME` 与 `absentCommandLines(home)` | 定向五个文件（沙箱内）共记录 275 次子进程启动、变异实验共 2204 次，没有一次执行测试世界之外的 `codex` 或 `claude`；第 2 轮同一文件有 3 次执行本机 ChatGPT 应用内 codex-cli 的尝试。未加载记录器的子进程（真实入口用例中以显式环境启动的引导程序与启动器）按代码核对：`cli` 只用显式替身；被拒的 `start` 中 `CODEX_HOME` 与 `~/.claude` 都不存在，门槛不运行命令行，启动器在归属检查处就拒绝 | **关闭** |
| PH2R2-P2-02 (a) 启动器的 Codex 探测不用收到的环境 | `launch.mjs:352` 传 `env, home`；用例加 `SKILLDOCK_TEST_MARK` 并断言三处子进程都收到 | 变异 A1（探测恢复为整份环境）在测试进程**不带**会话变量时也被发现（失败信息 `codex---version CLAUDECODE`），第 2 轮未发现；A1b（撤回本行修复）被发现（`使用启动器收到的环境…`） | **关闭** |
| (b) `cli` 透传没有用例 | `agent-cli.test.mjs:110-138` 经真实 `launch.sh cli plugin list` 记录替身收到的变量名 | A5（透传恢复为整份环境）在五个文件中被发现（`plugin-list CLAUDECODE`）；A5b（透传丢掉 `CODEX_HOME`）被发现 | **关闭** |
| (c) notes 写 stderr、Claude 清单失败标为安装记录没有用例 | `launch-plan.test.mjs:194-204`：直接调用 `migrationCheck` 并注入 `log`，断言 Codex 确认句与“Claude 命令行不可用，改用安装记录。” | B4（notes 不交给 `log`）被发现。**B4b**（`migrationCheck` 默认 `log` 改为不写 stderr）与 **B5**（Claude 命令行可用但清单失败时依据仍标为命令行）在五个文件 65 项中都**未被发现**：新用例注入了 `log`，且 Claude 命令行不可用，走不到 B5 的分支 | **部分关闭** |
| (d) 引导程序不保存（C3）没有用例 | 同一真实入口用例的后半：另一来源的数据目录上 `launch.sh start` 退出 1、stdout 为空、没有 `settings/` | C3（引导程序恢复保存）被发现（`Missing expected rejection`，即 `settings/` 被写出） | **关闭** |
| (e) 进程组断言在沙箱中恒为真 | `toolchain.test.mjs:191`：替身改用 `/usr/bin/perl -e 'print getpgrp()'`；先断言末行是整数 | D2（对话框不开作业控制）在沙箱内被发现（`Expected "actual" to be strictly unequal to: 33758`），第 2 轮只在沙箱外发现 | **关闭** |
| (f) 接线用例在断言失败时遗留夹具服务 | `migration.test.mjs:191、373` 各加 `t.after(() => launch('stop', …).catch(() => {}))` | B2、B3b（接线用例第一次启动意外成功）与 B7（`unseen Claude configuration` 用例第一次启动意外成功）**各遗留一个运行中的夹具服务**。原因：`node:test` 的 `after` 钩子按注册顺序执行（本轮最小用例实测），夹具在 `launcher-fixture.mjs:52` 先注册了 `fs.rm(root)`，删掉数据目录后，用例的 `stop` 读不到启动记录，静默返回 | **未达成**（见 PH2R3-P2-01） |
| PH2R2-P2-03 `SKILLDOCK_NODE_SOURCE` 进入服务环境 | `process-env.mjs:13` 列入 `LAUNCH_ONLY`；用例断言 `service-env.json` 不含它 | A6（移出 `LAUNCH_ONLY`）被发现（失败信息 `SKILLDOCK_NODE_SOURCE`）。读取方只有启动器自身（`launch.mjs:110、242-244`），服务中没有；Windows 分支自更新从服务环境直接运行启动器时不再触发保存 | **关闭** |

## 4. 本提交的直接影响（代码）

### 4.1 `launch.mjs:352` 传 `env, home`

- 生产入口 `launch.mjs` 由 `parseLaunchArguments` 构造 `options`，不含 `env`、`home`，于是 `env = process.env`、`home = os.homedir()`（`launch.mjs:174`），与 `resolveCodexCli` 的默认值相同；候选（调用方 PATH、`appRoots(env, home)`、`codexHome` 下的托管位置）与执行环境都不变。仓库内没有其他生产代码以 `options.env` 调用 `launch()`（`self-update.mjs:18` 启动的是子进程）。
- 只有测试会注入 `options.env` / `options.home`；夹具的环境都带 `absentCommandLines`，显式候选唯一，不会转而去找 `/Applications/ChatGPT.app`。

### 4.2 `SKILLDOCK_NODE_SOURCE` 列入启动链专用变量

| 核对项 | 结果 |
|--------|------|
| 读取方 | 只在启动器：`launch.mjs:110`（写入启动记录的 `execution.source`；36a 5.2 旧字段表取“实际值”，用途为诊断与 0.10.2 自更新的自检，并注明 0.10.2 服务在代号 2 下不会运行）与 `:242-244`（保存选择的触发条件）。服务、后台入口（`background-entry.mjs:27`、`background.mjs:70` 只保留 `SKILLDOCK_SELECTED_NPM_CLI` 等三个变量）都不读 |
| macOS 生产路径 | 服务发起的重启经 `launch.sh` → 引导程序，三个选择变量由引导程序重新设置（`bootstrap.mjs:60-63`），不受影响 |
| Windows 分支自更新 | 启动器直接从服务环境运行：修复前带着服务继承来的来源值并保存（缺 `npmVersion`）；修复后不保存，`execution.source` 记为 `direct`（启动器确实由服务的 Node 直接运行，更准确） |
| 冻结代码 | 0.10.2、0.10.3 的 `launch.mjs` 只从自身进程环境读取该变量（`ab6856f:launch.mjs:73`、`337547a:launch.mjs:76`）；它们不会运行在 0.11 服务的环境中（0.10.x 协调器调用 0.11 `launch.sh` 时用的是 0.10.x 服务自己的环境） |
| 结论 | 不改变 0.10.2、0.10.3 可观察的行为；本轮没有重跑兼容矩阵（第 2 轮在 `004c30f` 上 55/55；HLD 11A 条件 3 要求 0.11.0 合并前全量重跑） |

### 4.3 新增与修改的用例

| 用例 | 守住的事实 | 变异 |
|------|-----------|------|
| `agent-cli.test.mjs:110` 真实入口（前半） | `cli` 的探测与透传都不含会话变量、都带 `CODEX_HOME` | A5、A5b 被发现 |
| 同上（后半） | 另一来源数据目录上的 `start` 退出 1、stdout 为空，引导程序的选择不写入 | C3 被发现 |
| `launch-plan.test.mjs:194` | `migrationCheck` 把每条依据交给 `log` | B4 被发现；B4b、B5 未被发现 |
| `launcher.test.mjs:376、385、391` | Codex 探测用启动器收到的环境；服务不含 `SKILLDOCK_NODE_SOURCE` | A1、A1b、A6 被发现 |
| `toolchain.test.mjs:191、220、226` | 对话框进程组在沙箱中也能读出；bash 下与调用方不同组 | D2 在沙箱内被发现 |
| `migration.test.mjs:191、373` | 回归时停止意外启动的服务 | 不生效（B2、B3b、B7 各遗留一个服务） |

### 4.4 变异实验

在 `mut/` 副本中逐项修改、只跑相关用例、随后逐字节还原（还原前后整棵树 sha256 相同），全部在 `hermetic.sb` 中运行，运行环境不带会话变量：

| # | 变异 | 运行范围 | 结果 |
|---|------|----------|------|
| A1 | Codex 探测恢复为整份环境 | launcher（`allowed variables`） | 发现（第 2 轮未发现） |
| A1b | 撤回 `launch.mjs:352` 的修复 | 同上 | 发现 |
| A5 | `cli` 透传恢复为整份环境 | 五个文件 | 发现（第 2 轮未发现） |
| A5b | `cli` 透传丢掉 `CODEX_HOME` | agent-cli 真实入口 | 发现 |
| A6 | `SKILLDOCK_NODE_SOURCE` 移出启动链专用 | launcher、agent-cli | 发现 |
| B4 | notes 不交给 `log` | launch-plan、migration、agent-cli、launcher | 发现（第 2 轮未发现） |
| B4b | `migrationCheck` 默认 `log` 不写 stderr | 五个文件 | **未发现** |
| B5 | Claude 清单失败时依据仍标为命令行 | 五个文件 | **未发现** |
| C3 | 引导程序恢复保存（归属检查之前） | 五个文件 | 发现（第 2 轮未发现） |
| D2 | 对话框不开作业控制 | toolchain 对话框用例（沙箱内） | 发现（第 2 轮沙箱内未发现） |
| B2、B3b | 接线用例第一次启动意外成功 | migration（`command lines confirm`） | 发现，但**各遗留一个夹具服务** |
| B7 | `claude-unverified` 被接受（拒绝用例第一次启动意外成功） | migration（`unseen Claude configuration`） | 发现，但**遗留一个夹具服务** |

遗留的三个夹具服务（pid 40907、40940、41000，端口 51957、51962、51965，均由 `listen(0)` 分配）位于实验临时目录，确认后已用 SIGTERM 停止。

## 5. 问题清单

### 5.1 P0 / P1

无。

### 5.2 P2（不阻断，可选整改）

| ID | 位置 | 依据 | 复现或推理 | 建议 |
|----|------|------|-----------|------|
| PH2R2-P2-02（剩余） | (c) `launch-plan.mjs:114`（默认 `log`）、`gate-cli.mjs:61-67`；(f) `migration.test.mjs:191、373` 与 `helpers/launcher-fixture.mjs:52` | 第 2 轮建议 (c)“在接线用例中断言 stderr 含‘确认插件清单’，并补一条‘Claude 清单失败’用例”、(f)“把第一次启动也放进 `try/finally`”；提交说明写“refusal tests stop anything a regression starts”“Each fails when its fix is removed” | (c) 新用例注入 `log`，默认写 stderr 的接线没有用例（B4b）；Claude 命令行可用而清单失败的分支没有用例（B5）。HLD 3.7 写明“依据写入 stderr”。(f) `t.after` 按注册顺序执行，夹具的 `fs.rm(root)` 先于用例的 `stop`；B2、B3b、B7 实测各遗留一个服务，与第 2 轮相同 | (c) 在 `migration.test.mjs` 的接线用例中断言启动器 stderr（或 `launch()` 的错误输出）含“确认插件清单”；补一条 Claude 替身 `--version` 成功、`plugin list` 失败的用例，断言阻断项 `evidence` 为“Claude 安装记录”。(f) 见 PH2R3-P2-01 |
| PH2R3-P2-01 新加的停止钩子排在夹具删除之后：回归时不生效，正常运行时在系统临时目录留下残留；新的真实入口拒绝用例使用默认端口 | `migration.test.mjs:373`；`helpers/launcher-fixture.mjs:52`；`agent-cli.test.mjs:121-135` | 提交说明“refusal tests stop anything a regression starts”；第 2 轮 PH2R2-P2-02(f) | (1) 每次**通过的**运行中，第 373 行的钩子在夹具删除之后以带选择变量（`SKILLDOCK_NODE_SOURCE`、`SKILLDOCK_SELECTED_NPM_CLI`）的环境调用 `launch('stop')`：读不到启动记录，归属检查放行，随即按 HLD 3.10 保存选择，重新建出 `<临时目录>/skilldock launcher XXXX/app state/settings/{node-path,runtime.json}`。只跑该用例与接线用例：`58dc726` 留下这一目录，父提交 `f0b6e34` 不留任何东西；本轮每次包含该用例的运行都多一个残留目录。(2) 回归时（B2、B3b、B7）钩子读不到记录，服务继续运行。(3) `agent-cli.test.mjs` 新用例的 `start` 没有设 `PORT`（取默认 4771），也没有停止清理：若归属拒绝回归，启动器会在 4771 上做端口占用检查；本机有 SkillDock 在 4771 时以“端口已占用”失败，在空闲的机器（如 CI）上会构建并在 4771 留下服务。当前实现在归属检查处拒绝，之前没有任何探测或绑定，正常运行不受影响 | 让停止先于删除：夹具提供在 `fs.rm` 之前执行的清理登记（或夹具清理时按启动记录与 `server.log` 中的 pid 停止残留服务），或按第 2 轮建议用 `try/finally`；停止调用不带选择变量（例如 `{ ...next, env: { ...base, CLAUDE_CONFIG_DIR: custom } }`）。真实入口用例的 `env` 加一个由 `listen(0)` 取得的 `PORT`，并登记停止 |

P2 共 2 项（其中 1 项为上一轮的剩余），只作统计。

### 5.3 其他观察（不计入问题）

- **`execution.source` 在 Windows 分支自更新后记为 `direct`**：见第 4.2 节，比修复前更准确；36a 5.2 对该字段只要求实际值，读取它的 0.10.2 服务在代号 2 下不会运行。
- **对话框用例的替身在用例结束后存活约 3 秒**：bash 下替身自成进程组（这正是用例要证明的），`sleep 3` 结束后自行退出。实验期间每次包含该用例的运行后都观察到，随后消失。
- **上一轮观察“`18-codex-node-runtime.md` 写‘检查三处是否一致’”与“后台任务重建运行目录时不传日志文件”**：本提交未涉及，仍有效。

## 6. HLD 第 24 轮增量核对（HLD-SDX-001 v1.16）

### 6.1 范围与方法

`git diff -U0 f0b6e34 58dc726 -- 35-cross-agent-hld.md`：8 处，增 17 行、删 7 行（行号均指 v1.16）：

- 元信息：版本（第 421 行）、状态（第 424 行：“截至 v1.15 共 23 轮”，补 v1.15 经第 23 轮重新绑定、v1.16 “修第 23 轮两处措辞，待增量复审”）。
- 3.3 进程环境（第 606 行）：去掉“全部子进程”，列明纳入白名单的几类，并写明“启动链自身的进程除外”。
- 3.10 弹窗不阻塞调用方（第 783 行）：引导程序分支脱离调用方；shell 层只在 bash 下独立成组，dash、zsh 下仍与调用方同组。
- 第 10 节 HLD 批准行（第 1197 行）、11A 标题（第 1206 行，“第 7～23 轮延续”）、条件 5（第 1215 行）。
- 第 12 节新增“第 23 轮评审意见处理（v1.16）”表（第 1537～1544 行）。

同一提交还改了实施计划（第 3 行上游、阶段 2 进度行），一并核对。核对方法：每处新文字对照 `58dc726` 的实现；用本轮的 shell 实测、定向测试与变异实验佐证；对冻结代码的影响对照 `ab6856f`、`337547a`。

### 6.2 Guardrails Trigger Check

- Decision：`no_trigger`。
- Why：v1.16 只收窄两处措辞，使之与已批准的实现一致（DEC-SDX-012、024 之内），不改变项目级默认规则。

### 6.3 第 23 轮问题逐项核对

| 原 ID | 本轮结论 | 依据 |
|-------|---------|------|
| R23-P2-01 3.3“全部子进程”比实现宽 | **已落实** | 第 606 行改为列举：服务、Codex 与 Claude 命令行（含探测、诊断与透传）、依赖安装与构建；“启动链自身的进程除外：引导程序运行启动器、转交给另一安装的启动器……以及核验 Node/npm 版本的短命令”。与 `bootstrap.mjs:60-65`（调用方环境加选择变量）、`launch-plan.mjs:228`（调用方环境加 `SKILLDOCK_DELEGATED`）、`toolchain.mjs:24、41、86、200`（不传 `env`）一致；纳入的几类与 `codex-runtime.mjs:36`、`gate-cli.mjs:21`、`bootstrap.mjs:34`、`claude-cli.mjs`、`launch.mjs:101、358` 一致 |
| R23-P2-02 3.10“支持作业控制的 shell”比实现宽 | **已落实** | 第 783 行与实现、`18-codex-node-runtime.md` 第 52 行一致。本轮在沙箱内复测（第 6.4 节） |
| 第 23 轮范围外观察 1（v1.15 处理表“不再运行本机的 Agent 命令行”） | **已成立** | PH2R2-P2-01 关闭（第 3 节） |
| 第 23 轮范围外观察 2（新表前多一个空行） | 未改，新表前同样多一个空行（第 1535～1536 行） | 不影响渲染 |
| 第 23 轮范围外观察 3（后台重建运行目录不传日志文件） | 仍留给代码评审 | 本轮未涉及 |

### 6.4 v1.16 新文字与实现

| 条文 | 实现（`58dc726`） | 实测 | 判断 |
|------|------------------|------|------|
| 3.3 纳入白名单的几类 | 见上 | 定向测试与变异 A1、A1b、A5、A5b、A6 | 一致 |
| 3.3 启动链自身的进程除外 | 引导程序 → 启动器、转交、Node/npm 版本核验都不经 `childEnvironment` | 代码 | 一致。除外清单没有列出对话框（`node-guide.mjs:15` 的 `osascript` 及其“重新检测”）与 `codesign` 签名核验（`toolchain.mjs:46`），它们同样沿用调用方环境；两者都不在纳入清单中，不构成矛盾（第 6.8 节观察 1） |
| 3.3“按 36b 原样传递调用方环境，由被调用的启动器再按白名单构造” | `delegate()` 传调用方环境加 `SKILLDOCK_DELEGATED`；被调用方按 36b 6.3“服务与命令行子进程的环境仍按白名单构造” | 代码 | 一致。36b 6.2 对 0.10.3 的转交写明“其余变量（含宿主会话变量）原样保留”，0.11 的转交沿用同一做法 |
| 3.10 引导程序分支脱离调用方 | `node-guide.mjs:15` 以 `detached: true` 启动 | 代码 | 一致 |
| 3.10 shell 层：bash 下独立成组，dash、zsh 下仍同组 | `launch.sh:66-73` 未改 | 沙箱内以入口副本（替身 `osascript` 用 perl 记录进程组，`sleep 3` 后写“survived”）实测：`/bin/sh`（指向 bash）与 `/bin/bash` 自成进程组，调用方进程组结束后仍存活，约 32～39 ms 返回、退出 1、stdout 0 字节；`/bin/dash` 与以 `sh` 名义运行的 zsh 与调用方同组，进程组收到 SIGTERM 时随之结束。定向用例在沙箱内通过，D2 被发现 | 一致 |
| 状态行、批准行、11A 标题与条件 5、处理表 | — | 逐字核对：轮次“截至 v1.15 共 23 轮”“第 7～23 轮延续”，条件 5“v1.15 经第 23 轮核对后重新绑定；v1.16 待第 24 轮增量复审” | 一致。处理表“P2 3 项，已修复”与本报告第 3 节不完全相符（第 6.8 节观察 2） |

### 6.5 对 0.10.3 与 0.10.2 冻结代码可观察行为的影响

| 交集 | 判断 |
|------|------|
| 0.10.x 代码 | 本提交未改 |
| 0.10.2、0.10.3 自更新协调器调用 0.11 `launch.sh restart`（36b 7.1、7.4） | v1.16 两处只改措辞；对应实现（`process-env.mjs`、`launch.mjs:352`）不改变退出码、stdout 与写入的文件（第 4.1、4.2 节） |
| 0.10.3 转交链调用 0.11 `launch.sh`（36b 6.2） | `launch.sh` 与 `node-guide.mjs` 未改；对话框进程组的表现与 v1.15 时相同 |
| 0.10.x 读取的文件 | 不变 |

结论：**v1.16 的文字与 `58dc726` 的实现不改变 0.10.3、0.10.2 冻结代码的任何可观察行为，也不要求它们改变**。

### 6.6 11A 条件 1a、1b 与契约

- **条件 1a 不受影响，维持满足**：第 1209 行（1a）与第 1210 行（1b）不在 diff 中；第 1206 行只改轮次、第 1215 行只改条件 5 的记录。v1.16 的改动只描述 0.11 自身的进程环境与对话框，没有触及 36a 全文、36b 第 2 节末、第 3～6.2 节、7.3、8～11 节、附录 A 的 0.10.3 关口用例或 36c 第 4、5 节。
- **条件 1b 满足**（以契约第 14 轮证书绑定的 v0.14 为准）。
- **契约无须修订**：`git diff f0b6e34 58dc726` 中契约四个文件与 PRD 为 0 行。36b 6.3“服务与命令行子进程的环境仍按白名单构造（HLD 7.2），不继承会话变量”与 v1.16 3.3 的纳入清单一致；启动链除外项不在 6.3 约束之内；36b 6.2 的转交环境与 3.3 的描述一致。

### 6.7 追溯工具结果

在仓库根目录运行（`PYTHONDONTWRITEBYTECODE=1`，没有安装任何包）：

| 命令 | 结果 |
|------|------|
| `PATH=/usr/local/bin:$PATH /usr/local/bin/python3 plugins/testany-eng/scripts/trace_lint.py --strict plugins/skilldock/skills/skill-manager/references/35-cross-agent-hld.md` | `TRACE-LINT RESULT: PASS`，退出码 0；Errors 0、Warnings 0、Infos 49 |
| 同上加 `--format json` | `status: pass`，退出码 0；与第 23 轮的 `r23-lint-hld.json` 只读比较，规范化后完全相同。追溯 metadata 在第 411 行之前，第一处改动在第 421 行，故没有重跑 RTM |

### 6.8 Findings 与观察

**P0 / P1**：无。**本轮 HLD 新 P2**：无。

范围外观察（不计入）：

1. **3.3 除外清单未列对话框与签名核验**：对话框（`osascript` 及其“重新检测”）与 `codesign` 同样沿用调用方环境。纳入清单已是明确列举，读者不会据此认为它们按白名单构造；下次修订 HLD 时可在除外清单补“对话框”“签名”两词，按条件 5 核对。
2. **新处理表一句陈述**：第 1539 行“同轮代码复核……（APPROVED，P2 3 项，已修复）”。按本报告第 3 节，PH2R2-P2-02 为部分关闭。修好剩余部分后即成立；若决定不修，下次修订 HLD 时更正。实施计划阶段 2 行“P2 3 项……随后修复”同此。
3. **新表前多一个空行**（第 1535～1536 行），与第 23 轮观察 2 相同，不影响渲染。

### 6.9 Decision Gates

本轮 HLD 增量没有必须由 Owner 决定的事项。第 22 轮列出的三项条件性事项不变。

### 6.10 放行结论与证书重新绑定（带条件）

| 门槛 | 实际结果 |
|------|----------|
| P0 / P1 均为零 | 是 |
| 必要证据缺口关闭 | 是。条件 2、4 的剩余部分属后续关口 |
| 范围具有有效原始授权 | 是。v1.16 只收窄 3.3、3.10 的措辞，在 DEC-SDX-012、024 与 36b 6.2、6.3 之内 |
| 本轮增量核对覆盖完整 | 是：8 处改动逐处核对；R23-P2-01、02 与第 23 轮三条范围外观察逐条给出结论；直接影响检查了 3.3、3.10、第 10 节、11A、第 12 节、契约 v0.14、实施计划与冻结代码中的调用方 |

- technical_verdict：**APPROVED**（带条件）。这里的“条件”是对实现与发布的后续关口，不是接受未关闭的缺陷。
- scope_status：**WITHIN_APPROVED_SCOPE**。

**对象绑定**

- **HLD**：`plugins/skilldock/skills/skill-manager/references/35-cross-agent-hld.md`，HLD-SDX-001 v1.16，**sha256 `2bd0c5b9767c370e4e4c4467197fecc744ac3e0e0066d8ab1ad5a659a615751e`**（评审开始与结束各算一次，两次相同，也与 `git show 58dc726:<文件>` 相同）；已在提交 `58dc726` 中；`artifact.status: approved`。取代第 23 轮绑定的 v1.15（`11aa5c7a…b616`，与 `git show 004c30f:`、`git show f0b6e34:` 相同）。
- **批准依据**：PRD-SKILLDOCK-002 0.9，sha256 `e061ec2584217dbdead4e7ad4487a43f7dc61a68ac992485d30665b61b243631`（未变）；HLD 的 Owner 批准见第 10 节第 1197 行，DG-NO-LLD、DG-RUNNING-PROJECT、DG-NO-RECORD、DG-BACKOFF、DG-SPLIT-1 见第 10 节；API-SDX-001 v0.14，第 14 轮复核 APPROVED，本轮未改，四个文件 sha256（开始与结束各算一次）：
  - 索引 `20c5d95fbca6c53a8caeea782d2352ee475c93ff424c1c62d91580e213a2a269`
  - 36a `a4dd81b456443c8472244ee0a4a0b006e95de147233c9e88e8ca3f2d9c278ed4`
  - 36b `b5e9644ce711a4f2228488d43353520a828dc9159a3b82fc9b5d2df56fcf989b`
  - 36c `980f6306f9f6909ce9d5d81d514622ec6a80b5c3a88c755c30dd783bda1dedf4`
- **时间 / 轮次**：2026-10-09，第 24 轮。轮次构成：第 1 轮正式全量评审；第 2～6 轮整改复审；第 7 轮准出后增量复审；第 8～24 轮增量小核对。
- **需求覆盖**：追溯 metadata 未改，第 21 轮 RTM 17/17 继续有效；没有发现未批准的扩张或语义曲解。P0 / P1：第 1～5 轮共 9 项 P1 均已关闭，第 6～24 轮为 0。

**条件（证书仅在以下条件下有效）**

| 条件 | 有效状态 |
|------|---------|
| 1a. 约束 0.10.3 行为的全部条文定稿并通过独立契约评审（第 1209 行） | **满足（维持）；硬前提。** 本条段落与契约四个文件本轮未改；v1.16 的改动只描述 0.11 自身行为，不影响 0.10.3（`337547a`）与 0.10.2（`ab6856f`）冻结代码的任何可观察行为；本轮没有发现 K3、固定子目录或转交链第 3 步不可行 |
| 1b. 0.11.0 相应编码前，36b 6.3、7.4、附录 A.5 与 36c 多 Agent 字段形态、操作与错误码定稿并通过独立契约评审（第 1210 行） | **满足**（以契约第 14 轮证书绑定的 v0.14 为准）。v1.16 与 36b 6.2、6.3 一致，无须修订 |
| 2. 0.10.3 合并发布前完成 V20 与矩阵 0.10.3 关口 | **时点已过**。本轮材料中仍没有 V20 与关口留证，本轮不判断；若留证缺失，宜在条件 3 中一并补齐 |
| 3. 0.11.0 合并发布前用真实 0.11.0 记录重跑矩阵（含附录 A.5 全部用例并补入 S-28），完成 V18、V17 | 有效，尚未满足 |
| 4. 0.11.0 相应功能编码定稿前完成 V11～V14 | **部分完成，仍有效。** 剩余部分最迟在阶段 5 编码前完成；两项联网下载须先征得 Owner 许可。V12 宜在真实宿主中实测 `launch.sh` shell 分支的对话框（默认 `/bin/sh` 下的独立进程组） |
| 5. 证书绑定的版本 | **改为**：本证书绑定上述 v1.16 的 sha256（`2bd0c5b9…751e`）。HLD 此后的任何修订（含只改状态行或 11A）都须对修订部分做增量复审，复审范围仅限修改及其直接影响 |
| 6. PRD 按核对的内容提交 | 0.9 为 `e061ec25…243631`，已提交，本轮核对未变，**满足** |

**审查者与权限边界**：本证书证明上述 HLD 版本在第 24 轮增量核对下的设计评审结论；不授权实现、commit、push、PR、合并 main、发布、安装或任何环境操作。

### 6.11 实施计划同步

| 位置 | 改动 | 判断 |
|------|------|------|
| 第 3 行 | 上游改为 HLD v1.16 | 正确 |
| 阶段 2 进度行 | “已完成，代码复核第 2 轮通过”；“P2 3 项与 HLD 第 23 轮两处措辞随后修复（HLD v1.16，待最后一次窄范围复核）”；“测试世界不再运行本机的 Agent 命令行；完整套件在禁止外连、禁止执行本机 Agent 命令行的沙箱中通过” | “测试世界不再运行本机的 Agent 命令行”本轮核实成立（五个定向文件）；“P2 3 项……修复”见第 6.8 节观察 2；完整套件（作者报告 351 项）本轮没有重跑，只核实了五个定向文件 65 项 |

实施计划在 `58dc726` 中的 sha256 为 `89b3ca293dfed0fa036e13c70fe577db8c0a74e474d4694ca9d2d65c09faa21d`（只记录，不绑定）。

## 7. 测试与实验记录

实验目录：scratchpad 的 `verify/phase2-review-r3/`。统一环境：`env -i HOME=<实验目录>/home TMPDIR=<实验目录>/tmp LANG=en_US.UTF-8 PATH=<nvm Node 22.14.0>:/usr/bin:/bin:/usr/sbin:/sbin npm_config_offline=true NODE_OPTIONS=--import=hooks.mjs`（沿用第 2 轮的网络拦截 `guard.mjs` 与子进程记录器 `exec-recorder.mjs`，拦截日志在整个评审中没有生成）。所有测试与实验都在 `verify/phase2-review/hermetic.sb` 中运行（禁止执行本机 Codex、Claude 命令行，禁止本机以外的出站连接）。

| 命令 | 结果 | 输出 sha256 |
|------|------|-------------|
| 导出副本：`node --test tests/agent-cli.test.mjs tests/launch-plan.test.mjs tests/launcher.test.mjs tests/migration.test.mjs tests/toolchain.test.mjs` | 65 项全部通过（第 2 轮同五个文件 63 项 + 本提交新增 2 项），0 跳过，44 秒；275 次子进程启动，没有测试世界之外的 `codex` / `claude` | `1e460cfa…fc5a` |
| 变异实验 A1～B7（`run-mutations.mjs`，每次一项，之间在沙箱外用 `ps` 检查残留） | 第 4.4 节；2204 次子进程启动，没有测试世界之外的 `codex` / `claude` | `b7db330c…1b73` |
| 残留对照：只运行 migration 的 `unseen Claude configuration` 与 `command lines confirm` 两个用例，`58dc726` 与 `f0b6e34` 各一次，各用独立 TMPDIR | 都是 2/2 通过；`58dc726` 留下 `skilldock launcher XXXX/app state/settings/{node-path,runtime.json}`，`f0b6e34` 不留任何东西 | `cd05e047…efc`、`5e40a9c6…35c` |
| `node:test` 的 `after` 钩子顺序（最小用例） | 按注册顺序执行：先注册者先执行 | — |
| 对话框进程组：入口副本在 `/bin/sh`、`/bin/bash`、`/bin/dash`、以 `sh` 名义运行的 zsh 下（替身 `osascript`，`PORT=47999`） | 第 6.4 节 | `4464871c…1896` |
| `trace_lint.py --strict`（文本与 JSON，仓库根目录，沙箱外） | PASS，与第 23 轮相同 | — |
| `shasum -a 256`：HLD v1.16、v1.15（`git show 004c30f:`、`f0b6e34:`）、契约四个文件、PRD、实施计划，开始与结束各一次 | 第 6.10 节；开始与结束相同 | — |

没有重跑兼容矩阵与完整套件，理由见第 4.2 节与第 6.11 节。

## 8. 约束遵守与披露

- 没有向 `127.0.0.1:4771` 发送任何请求，也没有在 4771 上绑定；用户真实的 SkillDock 服务没有被访问或停止。没有执行 `launchctl`。没有执行任何 Claude 或 Codex 命令行（含 `--version`）；没有运行 `claude-distribution-smoke`。
- 没有读写或列出真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；没有用真实 HOME 运行任何测试或实验。只查看了 `~/.nvm/versions/node/` 的条目名、`/private/var/select/sh` 的指向；`ps` 输出中出现了本机其他进程的命令行（含真实 SkillDock 服务与 Codex 原生入口的路径），没有访问这些目录。
- **披露 1**：变异 B2、B3b、B7 各遗留一个夹具服务（实验临时目录内，端口由 `listen(0)` 分配，不是 4771），确认后用 SIGTERM 停止并确认退出（PH2R3-P2-01 的证据）。对话框用例的替身在每次运行后存活约 3 秒并自行退出。
- **披露 2**：为判断能否从系统日志读到沙箱拒绝记录，我用一份**不是** `hermetic.sb` 的内联配置（只拒绝执行 `/bin/echo`）运行了一次 `/bin/sh -c '/bin/echo hi'` 作为对照，并用 `log show` 读取了最近几分钟的系统日志。结论是这种拒绝不会写入系统日志，故未采用这一方法；这次对照不是测试，只执行了 `/bin/sh` 与 `/bin/echo`。
- **披露 3**：`trace_lint.py` 按委托在仓库根目录、沙箱外运行（不是测试，没有安装任何包，禁止写字节码缓存）。
- 没有下载任何东西，没有运行 `npm install`/`ci`、`pip install`。没有修改被审文件；只新建本报告，没有提交或推送。删除只发生在实验目录内。
- 结束时：HEAD 仍为 `58dc726`；`git status --porcelain` 只有本报告一行；没有本评审启动的残留进程。开始时记录的进程中没有他人遗留的夹具服务（第 2 轮提到的 pid 76540 已不存在）。

## 9. 状态分层

| 层 | 状态 |
|----|------|
| 源码（本报告第 2～5 节） | APPROVED：P0 0、P1 0、P2 2（其中 1 项为上一轮剩余）；PH2R2-P2-01、03 关闭，PH2R2-P2-02 部分关闭 |
| HLD（第 6 节） | 第 24 轮 APPROVED（带条件）/ WITHIN_APPROVED_SCOPE；证书绑定 v1.16（`2bd0c5b9…751e`） |
| CI（exact SHA） | NOT_RUN（分支未推送） |
| 环境 | 不适用（无部署） |

## 10. 下一步

1. 阶段 2 可以收尾，0.11.0 可以按实施计划进入阶段 3。
2. PH2R3-P2-01 与 PH2R2-P2-02 的剩余部分只涉及测试，建议随下一次涉及启动器或门槛的提交一并处理：先让停止早于夹具删除（顺带消除每次运行的临时目录残留），再补 stderr 接线与 Claude 清单失败两条用例。
3. 第 6.8 节三条观察等下一次因其他原因修订 HLD 时一并处理，按条件 5 做只限改动部分的核对；若届时 PH2R2-P2-02 已修好，观察 2 不需要改。
4. HLD 11A 条件 3（0.11.0 合并前全量重跑矩阵）与条件 4 中 V12 的真实宿主实测仍有效。
5. 本报告尚未提交。
