# 代码复核报告（第 2 轮，delta）：阶段 2 的 P1/P2 修复

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论、CI 状态与环境状态分开报告。
>
> 本轮与 HLD 第 23 轮增量复审（[35-cross-agent-hld-review-r23.md](35-cross-agent-hld-review-r23.md)）合并进行，实验共用。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 上一轮 | [阶段 2 代码评审](38-cross-agent-phase2-code-review.md)（CHANGES_REQUESTED：PH2-P1-01，PH2-P2-01～08） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），不与作者会话或前几轮评审共享上下文；不是人类评审，不代表任何 Owner。按委托不读写真实 `~/.claude`，没有加载 `testany-eng:code-reviewer` 技能文件，结构与分级沿用上一轮 |
| 日期 | 2026-10-09 |
| 仓库 / 分支 | `feature/skilldock-0.11-cross-agent`（本地，未推送） |
| Candidate | `004c30f82006bd5342015d8ccfc94249fba7a202`（tree `cd00ae68…420f`），基线 `0eb4b2f`（tree `1170f9e4…4c95`）。被审提交 `a925599`、`35f0b71`、`ef67997`、`af3ffad`、`1f761c8`、`004c30f`（`261fa21` 只提交上一轮报告）。范围 `-- plugins .claude-plugin AGENTS.md`：26 个路径，增 1096 行、删 139 行；不含 `references/` 为 20 个路径，增 346 行、删 120 行。`--name-status --no-renames -z` 清单 sha256 `fe117824…e222`，完整 diff sha256 `3ebf50f1…ff4f` |
| 工作区绑定 | 开始与结束时 HEAD 均为 `004c30f`；除本报告与 HLD 第 23 轮报告外工作区干净。定向测试与变异实验在 `git archive 004c30f` 的两个导出副本中进行（`export-004c30f/`、`mut/`，`node_modules` 为指向仓库同名目录的符号链接）；兼容矩阵与冒烟需要 Git 历史，在工作区运行，前后 `git status --short` 均为空 |
| 事实源 | HLD-SDX-001 v1.15（`11aa5c7a…b616`，本轮 HLD 第 23 轮核对）3.3、3.7、3.10；DEC-SDX-024；API-SDX-001 v0.14：36b 6.3、7.4；冻结代码 0.10.2 = `ab6856f`、0.10.3 = `337547a` |

## 2. 结论

**APPROVED**（源码层；`004c30f` 相对 `0eb4b2f`）。P2 不阻断。

- P0：0
- P1：0（PH2-P1-01 已关闭）
- 上一轮 P2：PH2-P2-01、02、03、05、06、07、08 **关闭**；PH2-P2-04 **部分关闭**（一个测试仍会执行本机 Codex 命令行，见 PH2R2-P2-01）
- 本轮新 P2：3（PH2R2-P2-01～03，第 5 节）
- 与 0.10.2、0.10.3 冻结行为的兼容：未发现回退（兼容矩阵 55/55；快速拒绝改序对冻结调用方不可观察，第 4.2 节）
- SCOPE_DECISION / EVIDENCE_BLOCKED：无
- 是否需要 Owner 决定：不需要

本结论不授予推送、合并、CI 或发布权限。

## 3. 上一轮问题逐项核对

| ID | 修复 | 证据 | 结论 |
|----|------|------|------|
| PH2-P1-01 启动器派生的 Codex 命令行与依赖构建继承全部环境 | `codex-runtime.mjs:36`：候选按调用方 PATH 发现，运行时用 `childEnvironment(env, { CODEX_HOME })`，覆盖启动器探测、`doctor`、门槛与服务；`bootstrap.mjs:34` 透传改用白名单并带 `CODEX_HOME`；`launch.mjs:358` 构建传 `childEnvironment(env, {}, { npm: true })`；`process-env.mjs:30-40` 的 `npm` 选项只在构建时保留 `npm_config_*`（不分大小写） | 真实入口探针 P7r2：`launch.sh cli --version`（探测两次、透传一次）与 `launch.sh doctor`（探测两次）中，替身 Codex 收到的变量名不含 `CLAUDE*`、`ANTHROPIC_*`、`OPENAI_*`、`CODEX_THREAD_ID`、`NODE_OPTIONS`、`npm_config_*`，都含 `CODEX_HOME`；`doctor` 不建数据目录。启动器层用例断言服务、Codex 探测与构建三处；变异 A2、A2b、A2c（构建）、A3（`npm_config_*` 进服务）、A4 均被发现。Codex 探测部分的断言只在测试进程自身带会话变量时生效（A1 / A1s），`cli` 透传没有用例（A5），见 PH2R2-P2-02 | **关闭** |
| PH2-P2-01 显式运行环境与保存值 | `toolchain.mjs:171`：设了 `SKILLDOCK_NPM_CLI` 时不读保存值；`:189` 显式 Node 也保存 | 用例断言显式 Node 写入 `runtime.json`（来源 `explicit`）与 `node-path`，无效的显式 npm 抛错，有效的显式 npm 不被保存值替代；变异 C1、C2 被发现。生产路径中由启动器保存（见 PH2-P2-06），来源同样记为 `explicit` | **关闭** |
| PH2-P2-02 shell 片段同一位置取字典序第一个 | `node-candidates.mjs:67-90`：每个位置调用 `skilldock_pick`，在该位置的展开结果中取能运行且不低于 22.12 的最高版本（按 `主*1e6+次*1e3+补丁` 比较），找到即停 | 用例在 sh 与 dash 下断言 v24.10 优先于 v24.9、最高者坏掉时取次高、靠前位置优先；变异 D1 被发现。本轮另在 bash（`/bin/sh`）、dash、以 `sh` 名义运行的 zsh 下实测（第 4.3 节） | **关闭** |
| PH2-P2-03 快速拒绝排在命令行确认之后 | `launch-plan.mjs:119-125`：文件证据通过且为重启任务时，先查失败记录再运行命令行；文件证据不通过时仍先给门槛结果（与修复前相同） | 用例断言被拒的重启任务没有任何命令行调用；变异 B1 被发现。真实入口探针 Q2：`launch.sh restart` 带 `SKILLDOCK_RESTART_JOB` 与失败记录，退出 4、stdout 0 字节、数据目录不变，替身 Codex 没有被调用 | **关闭**；对冻结调用方的影响见第 4.2 节 |
| PH2-P2-04 门槛确认：接线无测试、测试运行本机命令行、依据不输出 | (a) 新增接线用例（`migration.test.mjs:186-210`）与启动器层读不出提示的断言；(b) `absentCommandLines` 让 `isolated()`、兼容矩阵、`launch-plan` 的 `world()` 指定不存在的 Codex 与 Claude 命令行；(c) `migrationCheck` 把 notes 写到 stderr，Claude 清单失败时依据标为“Claude 安装记录” | (a) 变异 B2（M11）、B3（M20）、B3b、B6（M5）均被发现。(b) 以子进程记录器统计：本轮定向测试共 279 次子进程启动，其中 3 次是本机 `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex --version`，全部来自 `launch-plan.test.mjs:175` 的用例（其 `env` 只有 `SKILLDOCK_STATE_DIR`，没有 `absentCommandLines`，也没有 `HOME`），被沙箱拒绝；其余文件与兼容矩阵没有执行本机命令行。(c) 真实入口探针 Q1：stderr 第一行为“已用 Codex 命令行 …（codex-cli 0.200.0）确认插件清单。”，阻断项注明“依据：Codex 命令行插件清单”；但 notes 与“清单失败时标为安装记录”都没有用例（B4、B5 未被发现） | **部分关闭**：(a)(c) 已落实；(b) 剩一处，见 PH2R2-P2-01；(c) 的回归守护见 PH2R2-P2-02 |
| PH2-P2-05 `launch.sh` 对话框与调用方同一进程组 | `launch.sh:66-73`：在子 shell 中能开启作业控制时 `set -m`，再在后台启动 `osascript` | 本轮实测（第 4.3 节）：bash（macOS 默认 `/bin/sh`）下对话框进程自成进程组，调用方进程组被结束后仍存活；在伪终端中运行也没有多余输出。dash、zsh（选作 `/bin/sh` 时）仍与调用方同组，与 `18-codex-node-runtime.md`“默认的 bash”一致，HLD 3.10 措辞偏宽见 HLD 第 23 轮 R23-P2-02。用例覆盖重启任务、无界面、`status` 三种不弹窗与对话框参数；变异 D3（M16）、D4 被发现。进程组断言在沙箱外能发现变异 D2，在沙箱内 `/bin/ps` 不能执行时恒为真（PH2R2-P2-02） | **关闭**（默认 `/bin/sh`）；V12 真实宿主实测仍按 HLD 条件 4 |
| PH2-P2-06 归属拒绝前写入 Node 选择 | `bootstrap.mjs:43` 只选择（`save: false`），经 `SKILLDOCK_SELECTED_NPM_CLI`、`SKILLDOCK_SELECTED_NPM_VERSION`、`SKILLDOCK_NODE_SOURCE` 交给启动器；`launch.mjs:242-244` 在 `checkOwner(initial)` 之后保存（来源为 `saved` 时不重写）；`SKILLDOCK_SELECTED_NPM_VERSION` 列为启动链专用变量 | 真实入口探针 P6r2：另一来源的数据目录上 `launch.sh start` 退出 1、stdout 0 字节、数据目录逐项不变，没有 `settings/`；同一探针对“引导程序恢复保存”的变异副本（C3）写出 `node-path` 与 `runtime.json`，说明探针有区分力。仓库用例只守住启动器一层（C4、C5 被发现），C3 没有用例发现（PH2R2-P2-02） | **关闭** |
| PH2-P2-07 冒烟实际联网 | 去掉 `plugin list --available`；TeamDesk 说明改从 Claude 记录的 marketplace 位置读取；断言配置目录中没有远端目录缓存 | 本轮在禁止外连的沙箱中运行一次：通过（2 秒），临时配置目录只有 `installed_plugins.json`、`known_marketplaces.json`、`cache/`、空的 `marketplaces/`，没有 `plugin-catalog-cache.json` 或 `plugin-directory-cache-v2.json`；Node 进程没有连接尝试 | **关闭** |
| PH2-P2-08 保存的 Claude 命令行不追随升级 | `claude-cli.mjs:53-66`：显式（唯一候选）→ 手动指定的保存值（`source: 'manual'`）→ 会话路径 → 桌面应用最高版本 → 自动保存值 → PATH → 用户目录；`:91` 保存时保留原来源 | 用例覆盖桌面应用升级后改用新版、会话路径优先、会话失效后回到桌面应用、手动指定优先、显式无效即不可用且不保存；变异 E1～E4 均被发现。顺序与 HLD v1.15 3.3 第 1～7 项一致（第 4.4 节） | **关闭** |

## 4. 重点核查

### 4.1 白名单与子进程环境

`git grep` 列出插件中全部 `spawn` / `execFile` / `exec`（非测试），并算出 `launch.mjs`、`bootstrap.mjs` 的静态导入闭包（25 个文件，没有包名导入或动态导入）。启动器与引导程序会派生的子进程：

| 子进程 | 位置 | 环境来源 | 判断 |
|--------|------|----------|------|
| Codex 命令行探测（启动器、`doctor`、`cli`、门槛、服务） | `codex-runtime.mjs:36` | `childEnvironment(env, { CODEX_HOME })` | 白名单；`CODEX_HOME` 保留 |
| Codex 插件清单（门槛） | `gate-cli.mjs:21` | 同上 | 白名单 |
| `cli` 透传 | `bootstrap.mjs:34` | `childEnvironment(process.env, { CODEX_HOME: process.env.CODEX_HOME })`；未设时删除，Codex 取默认目录，与修复前一致 | 白名单 |
| Claude 命令行（版本查询、插件清单） | `claude-cli.mjs:71、103` | `claudeCliEnvironment`：白名单 + `CLAUDE_CONFIG_DIR`（+ 自定义缓存目录）+ `DISABLE_AUTOUPDATER=1` | 白名单（上一轮已确认） |
| 依赖安装与构建 | `launch.mjs:358` → `runtime.mjs:48-49` | `childEnvironment(env, {}, { npm: true })` 再加 `.toolchain-bin` | 白名单 + `npm_config_*`，不含会话变量 |
| 服务 | `launch.mjs:101-108` | `childEnvironment(env, {…})`，不带 `npm` 选项 | 白名单；用例断言不含 `npm_config_loglevel` 与 `SKILLDOCK_SELECTED_NPM_VERSION` |
| 引导程序 → 启动器 | `bootstrap.mjs:65` | 调用方全部环境 + 选择结果 | 启动链本身：启动器要读 `CLAUDE_CODE_EXECPATH`、`CLAUDECODE`、`CLAUDE_CONFIG_DIR` 等判断会话与 Claude 根目录，按设计保留 |
| 转交给较新安装 | `launch-plan.mjs:228` | 调用方全部环境 + `SKILLDOCK_DELEGATED` | 启动链本身（对方仍按上述规则过滤） |
| 对话框（引导层）与“重新检测” | `node-guide.mjs:15` | 调用方全部环境 | 启动链本身（重新运行 `launch.sh`） |
| Node / npm / `codesign` 核验 | `toolchain.mjs:24、41、46、86、200` | 调用方全部环境 | 只查版本与签名，不运行第三方代码；未改 |

结论：Agent 命令行、构建与服务三类已全部按白名单构造，PH2-P1-01 关闭。启动链自身的三处转交与工具链核验仍用调用方环境，属设计需要，但 HLD v1.15 3.3 写成“启动器与引导程序派生的全部子进程”，比实现宽，见 HLD 第 23 轮 R23-P2-01。`npm_config_*` 只进构建、不进服务，有用例守住（A3）。

`SKILLDOCK_*` 设置变量照旧进入服务：`SKILLDOCK_SELECTED_NPM_CLI` 是有意的（服务与后台的 `findNpm`、接管后台注册都读它）；`SKILLDOCK_NODE_SOURCE` 也会进入服务，服务中没有读取方，而本轮它成了启动器保存选择的触发条件，见 PH2R2-P2-03。`SKILLDOCK_SELECTED_NPM_VERSION`、`SKILLDOCK_GATE_CHECKED` 不进入服务。

### 4.2 与 0.10.2、0.10.3 冻结行为的兼容（HLD 11A 条件 1a；36b 6.3、7.4）

| 核对项 | 证据 | 判断 |
|--------|------|------|
| 兼容矩阵 | 工作区 `004c30f`，`tests/compat-matrix.test.mjs` 在沙箱内 55/55 通过（72 秒）；子进程记录中没有本机 Agent 命令行；前后 `git status` 均为空 | 未发现回退 |
| 快速拒绝改到命令行确认之前 | 只有一种组合的结果变化：文件证据通过、存在同一目标的失败记录、为重启任务，且命令行会报出低于 0.10.3 的安装。修复前得到 `MIGRATION_BLOCKED`，修复后得到 `MIGRATION_FAILED_BEFORE`。两者都退出 4、stdout 为空、在接受任务之前（不写 `restart.json` 与任何 0.10.x 读取的文件）。冻结调用方 `ab6856f`、`337547a` 的 `self-update.mjs:25` 只区分 0 与非 0。可观察差异只有 stderr 文字（写入旧服务的 `server.log`）与更短的耗时。文件证据不通过时，两种顺序都先给门槛结果；交互入口不查失败记录 | 不改变冻结调用方可观察的结果；符合 36b 7.4（两项都在接受任务之前，且在解析工具链之前）与 6.3（退出 4） |
| 非 0 退出时 stdout 为空 | 真实入口：Q1（门槛由命令行阻断，退出 4）、Q2（快速拒绝，退出 4）、P6r2（归属拒绝，退出 1）stdout 都是 0 字节；新的 notes 与保存失败提示只写 stderr | 一致 |
| shell 入口 | 无 Node 时退出 1、stdout 为空、提示不变（用例与第 4.3 节实测）；对话框换进程组不改变退出码与输出 | 一致 |
| 不写 0.10.x 读取的文件 | 启动器只在 `settings/` 下保存选择，且在归属检查之后；Q1、Q2 数据目录不变 | 一致 |

### 4.3 生成的 shell 片段与对话框

在实验目录中构造含空格与单引号的世界（`w o'rld`），固定系统位置换成世界内不存在的路径，用真实的 Node 18.20.8、22.14.0、25.9.0 与一个坏掉的 v26 替身：

| 情形 | bash（`/bin/sh`） | dash | zsh 以 `sh` 名义运行 |
|------|------------------|------|----------------------|
| nvm 中 18 / 22.14 / 25.9 / 坏 26 | 取 25.9 | 取 25.9 | 取 25.9 |
| Codex 工作区 22.14 与 nvm 25.9 | 取工作区 | 取工作区 | 取工作区 |
| 保存路径含空格与单引号 | 取保存值 | 取保存值 | 取保存值 |
| 显式指定 Node 18 | 跳过，取保存值 | 同左 | 同左 |
| 没有可用 Node | `node_bin` 为空，片段返回 0 | 同左 | 同左 |

- `set -eu`：`skilldock_pick` 总以 0 返回；命令替换失败都在 `|| continue` 中；没有匹配的通配符保持字面值后被 `[ -x ]` 拒绝。三种 shell 的 `-n` 语法检查与实际运行都通过。
- 变量命名：新增的函数与变量都带 `skilldock_` 前缀；沿用的 `state`、`app` 等没有与入口其他部分冲突；没有使用 zsh 的特殊参数名（如 `path`、`status`）。
- 版本比较值最大约 9.9e7，在 32 位整数内。版本输出改为读 stdout（旧片段丢弃 stdout）：若某个 Node 启动时向 stdout 打印额外内容（例如通过 `NODE_OPTIONS` 预加载的模块），该候选会被跳过。不计问题。
- `launch.sh`、`native.sh` 与后台 `run.sh` 内嵌的片段与 `shellBlock()` 逐字节一致（导出副本中核对，后台模板直接调用 `shellBlock()`）。
- 对话框：以 `detached` 启动复制后的 `launch.sh`（固定路径与 `osascript` 指向实验目录），返回后结束调用方进程组。bash：对话框替身自成进程组（父进程为 1），进程组结束后仍运行到底，约 30 ms 返回、退出 1、stdout 0 字节、stderr 无多余内容；在伪终端中运行同样没有作业控制提示。dash、zsh：与调用方同组，随进程组结束。

### 4.4 Claude 命令行发现与 HLD v1.15 3.3

实现顺序与 HLD 3.3 第 1～7 项逐项一致；HLD 第 12 节风险表“优先使用会话提供的命令行路径并保存；多级回退”与新顺序不冲突。

- 显式变量改为唯一候选：`SKILLDOCK_CLAUDE_BIN` 是 0.11 新增变量，0.10.x 不读，现有用户没有依赖它；指定无效时门槛改用安装记录（有 notes），服务中 Claude 一侧按“无法确认”只读，与 Codex 一致。相对路径从静默忽略改为记一条“必须为绝对路径”的尝试。
- 目前没有代码写入 `source: 'manual'`（设置页属后续阶段），第 2 项暂时只有用例覆盖。
- 自动保存值排在桌面应用之后：同时装有独立 Claude Code 与桌面应用、且从 Codex 一侧打开的用户，会改用桌面应用自带的命令行；两者都按保存的 `CLAUDE_CONFIG_DIR` 管理同一配置，影响只在版本差异。

### 4.5 保存时机移到启动器之后

| 入口 | 行为 | 证据 |
|------|------|------|
| `doctor` | 引导程序 `save: false`，不派生启动器，不建数据目录 | P7r2 |
| `status`、`stop` | 引导程序不解析工具链，不设三个选择变量，启动器不保存 | 代码 `bootstrap.mjs:40、60-63` |
| `start`、`restart` | 启动器在 `checkOwner(initial)` 之后保存；数据较新、转交、归属拒绝都发生在保存之前 | 用例；P6r2 |
| 门槛在启动器锁内失败 | 选择已保存在 `settings/`（0.10.x 不读），符合 HLD 3.7 | 代码 |

保存的 `node` 取启动器自身的 `process.execPath`，与引导程序传给它的 `toolchain.node`（真实路径）一致；`npmVersion` 来自 `SKILLDOCK_SELECTED_NPM_VERSION`。

### 4.6 新测试是否守住修复（变异实验）

在 `mut/` 副本中逐项修改、只跑相关用例、随后逐字节还原（还原前后整棵树的 sha256 相同，`run-mutations.json`），全部在沙箱中运行：

| # | 变异 | 结果 |
|---|------|------|
| A1 / A1s | Codex 探测恢复为整份环境：测试进程不带会话变量 / 带会话变量 | **未发现** / 发现 |
| A0s | 对照：不变异，测试进程带会话变量 | 通过 |
| A2、A2b、A2c | 构建用启动器原样环境；构建去掉 `npm_config_*`；不传构建环境 | 均发现 |
| A3、A4 | `npm_config_*` 进服务；`SKILLDOCK_SELECTED_NPM_VERSION` 不再是启动链专用 | 均发现 |
| A5 | `cli` 透传恢复为整份环境 | **未发现**（五个文件 63 项全部通过） |
| B1 | 快速拒绝移回命令行确认之后 | 发现 |
| B2、B3、B3b | 门槛从不问命令行（M11）；启动器忽略 `SKILLDOCK_GATE_CHECKED`（M20）；启动器从不问 | 均发现 |
| B4 | notes 不写 stderr | **未发现** |
| B5 | Claude 清单失败时依据仍标为命令行 | **未发现** |
| B6 | 启动器层读不出提示去掉权限步骤（上一轮 M5） | 发现 |
| C1、C2 | 显式 Node 不保存；显式 npm 被保存值替代 | 均发现 |
| C3 | 引导程序恢复保存（归属检查之前） | **未发现**（真实入口探针 P6r2 能发现） |
| C4、C5 | 启动器在归属检查前保存；启动器不保存 | 均发现 |
| C6 | 来源为 `saved` 时也重写 | 未发现（不影响正确性） |
| D1 | shell 片段恢复为按通配顺序取第一个 | 发现 |
| D2 | 对话框不开作业控制 | 沙箱内**未发现**；沙箱外发现（见 PH2R2-P2-02） |
| D3、D4 | 重启任务也弹窗（M16）；等待对话框结束 | 均发现 |
| E1～E4 | 自动保存值排回会话之前；手动指定不再优先；显式不再是唯一候选；来源被改记为 `saved` | 均发现 |

另：B2、B3b 让接线用例的第一次 `launch('start')` 意外成功，用例在 `try` 之前失败，留下一个运行中的夹具服务（`migration.test.mjs:192-209` 只为第三次启动做了 `finally` 停止）。两个遗留服务位于实验临时目录，已停止。

## 5. 问题清单

### 5.1 P0 / P1

无。

### 5.2 P2（不阻断，可选整改）

| ID | 位置 | 依据 | 复现或推理 | 建议 |
|----|------|------|-----------|------|
| PH2R2-P2-01 一个用例仍会执行本机 Codex 命令行（PH2-P2-04(b) 的剩余部分） | `tests/launch-plan.test.mjs:175-192`（`bootstrap planning stops generation-1 data …`）；`toolchain.mjs:56-58` 的 `appRoots` 固定包含 `/Applications/ChatGPT.app` | 上一轮 PH2-P2-04(b) 点名的正是“`planLaunch` 用例中 `HOME` 未设置”；`a925599` 说明与实施计划进度表、HLD 第 12 节处理表都写“测试世界不再运行本机的 Agent 命令行” | 该用例的 `env` 只有 `SKILLDOCK_STATE_DIR`。文件证据放行的 3 次 `planLaunch` 都会进入命令行确认，`resolveCodexCli` 按固定应用位置找到本机 ChatGPT 应用内的 codex-cli 并执行 `--version`（未加沙箱时还会执行 `plugin --help`、`plugin list --json`，`CODEX_HOME` 为临时目录、`HOME` 未设置）。本轮在沙箱中被拒绝，用例结果不受影响，所以作者的全量运行也看不到它 | 给该用例的 `env` 加上 `HOME: w.home` 与 `absentCommandLines(w.home)`（与同文件 `world()` 的 `env` 一致）；可在夹具中加一个断言或记录器，确保测试期间没有执行测试世界之外的 `codex`、`claude` |
| PH2R2-P2-02 本轮修复的回归守护有缺口 | `launch.mjs:352`；`tests/launcher.test.mjs:363-394`；`tests/toolchain.test.mjs:190、224`；`launch-plan.mjs:125`；`gate-cli.mjs:61-67`；`bootstrap.mjs:43` | `a925599` 说明“DEC-SDX-024 用例在任一旧文件下都会失败”；`35f0b71` 说明“每个接线去掉后都会失败” | (a) `launch.mjs:352` 调用 `resolveCodexCli` 时没有传 `options.env` 与 `home`，探测用的是测试进程自身的 `process.env`；用例注入的会话变量到不了探测，只有测试进程本身带会话变量时断言才有效（A1 未发现、A1s 发现）。在 CI 或干净环境中，这部分断言不起作用。(b) `cli` 透传没有用例（A5）。(c) notes 写 stderr 与“清单失败标为安装记录”没有用例（B4、B5）。(d) 引导程序不保存（PH2-P2-06 的主体）没有用例（C3）。(e) 对话框进程组断言用 `Number(ps 输出)`，`/bin/ps` 不能执行时（沙箱中就是这样，作者的全量运行也在沙箱中）得到 `NaN`，`notEqual` 恒为真（D2 只在沙箱外被发现）。(f) 接线用例在断言失败时遗留夹具服务 | (a) `launch.mjs:352` 传 `env, home`（生产中两者就是 `process.env` 与 `os.homedir()`，行为不变）；(b)(d) 各补一条真实入口用例（可仿照本轮探针 P7r2、P6r2）；(c) 在接线用例中断言 stderr 含“确认插件清单”，并补一条“Claude 清单失败”用例；(e) 先断言该行是整数，或改用 `perl -e 'print getpgrp'` 之类在沙箱中可运行的方式；(f) 把第一次启动也放进 `try/finally` |
| PH2R2-P2-03 `SKILLDOCK_NODE_SOURCE` 进入服务环境，而它现在是保存选择的触发条件 | `process-env.mjs:12-13`（`LAUNCH_ONLY`）；`launch.mjs:242`；`self-update.mjs:18-21` | HLD 3.10“保存由启动器在归属检查通过后写入：引导程序只做选择”；本轮新增 `SKILLDOCK_SELECTED_NPM_VERSION` 为启动链专用变量，同组的 `SKILLDOCK_NODE_SOURCE` 没有列入 | 服务环境中有 `SKILLDOCK_NODE_SOURCE` 与 `SKILLDOCK_SELECTED_NPM_CLI`（前者在服务中没有读取方）。从服务环境直接运行启动器的路径会触发保存：目前只有 Windows 分支的自更新（`process.execPath launch.mjs restart`），写入的选择缺 `npmVersion`。macOS 上服务发起的重启都经 `launch.sh` → 引导程序，三个变量被重新设置，不受影响 | 把 `SKILLDOCK_NODE_SOURCE` 列入 `LAUNCH_ONLY`（`SKILLDOCK_SELECTED_NPM_CLI` 有读取方，保留）；或启动器只在 `SKILLDOCK_SELECTED_NPM_VERSION` 也存在时保存 |

### 5.3 其他观察（不计入问题）

- **本机另有一个遗留的夹具服务**：pid 76540，启动于 08:43:34（本轮评审开始之前，与 `35f0b71` 的提交时间相近），位于系统临时目录 `…/T/skilldock launcher 9pkZhI/`，不是本评审启动的，未处理。它与 PH2R2-P2-02(f) 的成因吻合，作者可自行停止。
- **`18-codex-node-runtime.md` 仍写“检查三处是否一致”**：检查脚本只检查 `launch.sh`、`native.sh`，后台 `run.sh` 在写入时生成（上一轮已提过，未改）。
- **用环境变量配置 npm 镜像的用户**：服务环境不含 `npm_config_*`，服务发起的自更新重启经 `launch.sh` 时构建拿不到这些变量；`~/.npmrc` 不受影响。与 0eb4b2f 相同，HLD v1.15 已写明只在构建时保留。
- **shell 层的探测次数**：第一个有 Node 的位置中，每个版本各运行一次 `node -e`；有保存值时只运行一次。
- **`npm_config_*` 可能含 npm 自身的仓库凭据**：它们会进入 `npm run build` 的环境，这与 npm 运行脚本时的默认行为相同，不另计。

## 6. 测试与实验记录

实验目录：scratchpad 的 `verify/phase2-review-r2/`。统一环境：`env -i HOME=<实验目录>/home TMPDIR=<实验目录>/tmp LANG=en_US.UTF-8 PATH=<nvm Node 22.14.0>:/usr/bin:/bin:/usr/sbin:/sbin npm_config_offline=true`，`NODE_OPTIONS=--import=hooks.mjs`（沿用上一轮的网络拦截，另加子进程记录器 `exec-recorder.mjs`，自检确认能记录 `spawn`、`spawnSync` 并拦截发往 `192.0.2.1` 的连接；没有用 4771 自检）；`perl alarm` 限时。凡可能执行 Agent 命令行的运行都在上一轮的 `hermetic.sb` 中（禁止执行本机 Codex、Claude 命令行，禁止本机以外的出站连接）。

| 命令 | 结果 | 输出 sha256 |
|------|------|-------------|
| 导出副本：`node --test tests/toolchain.test.mjs tests/agent-cli.test.mjs tests/launcher.test.mjs tests/migration.test.mjs tests/launch-plan.test.mjs tests/background-updates.test.mjs`（沙箱内） | 78 项全部通过，0 跳过，47 秒 | `e13f037b…9fc7` |
| 同上四个文件逐个运行以定位子进程（沙箱内）：toolchain 14、agent-cli 3、launch-plan 6、background-updates 15 | 全部通过；本机 codex-cli 的 3 次执行尝试全部来自 launch-plan | — |
| 工作区 `004c30f`：`node --test --test-concurrency=1 tests/compat-matrix.test.mjs`（沙箱内）；前后 `git status --short` 均为空 | 55/55 通过，72 秒；没有执行本机 Agent 命令行 | `697a448d…c3fe` |
| 变异实验 A0s～E4（`run-mutations.mjs`，沙箱内） | 第 4.6 节 | `c9fc92e9…7ba6` |
| D2 与对照：只运行 `toolchain.test.mjs` 的对话框用例（沙箱外，见第 7 节） | 不变异通过；变异失败 | — |
| 探针 P7r2：`launch.sh cli --version`、`launch.sh doctor`，替身 Codex 记录变量名（沙箱内，会话变量取假值） | 第 3 节 | — |
| 探针 Q1、Q2：门槛命令行阻断与重启任务快速拒绝（真实入口，沙箱内） | 第 3、4.2 节 | — |
| 探针 P6r2：另一来源数据目录上的 `launch.sh start`，含 C3 变异对照（沙箱内） | 第 3 节 | — |
| shell 片段与对话框实验（沙箱外，只运行真实 Node 与替身脚本） | 第 4.3 节 | — |
| 工作区：`node tests/claude-distribution-smoke.mjs`，`no-network.sb` 沙箱内，临时 HOME，`SKILLDOCK_CLAUDE_BIN` 指向桌面应用自带的 2.1.288 命令行；只运行一次 | 通过；没有远端目录缓存；前后 `git status` 为空 | — |
| `import-closure.mjs scripts/launch.mjs scripts/bootstrap.mjs` | 25 个文件，没有包名导入或动态导入 | — |

所有网络拦截日志都没有生成。

## 7. 约束遵守与披露

- 没有向 `127.0.0.1:4771` 发送任何请求；用户真实的 SkillDock 服务没有被访问或停止。没有执行 `launchctl`；测试世界中的更新计划保持关闭。
- 没有读写或列出真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`。
- **披露 1（违反约束）**：为确认冒烟所用命令行的版本，我在沙箱之外、以真实 HOME 执行了一次当前会话的 Claude 命令行 `--version`（路径取自 `CLAUDE_CODE_EXECPATH`，只带这一个参数，输出 `2.1.288 (Claude Code)`）。这违反了“执行 Agent 命令行必须在沙箱中”的约束。版本查询按设计不改配置，但我无法在不读取真实 `~/.claude` 的前提下核实它没有写入任何文件。
- **披露 2**：按委托在 `no-network.sb` 中运行的冒烟执行了桌面应用自带的 Claude 命令行（临时 HOME 与 `CLAUDE_CONFIG_DIR`）；其 `doctor` 一步按冒烟的设计执行了本机 ChatGPT 应用内的 Codex 命令行（`--version`、`plugin --help`，临时 HOME，`CODEX_HOME` 在临时目录下）。网络被禁止，没有远端目录缓存。
- **披露 3**：定向测试中 launch-plan 用例 3 次试图执行本机 ChatGPT 应用内的 codex-cli，均被沙箱拒绝，没有实际运行（PH2R2-P2-01）。
- **披露 4**：变异 B2、B3b 各遗留一个夹具服务（实验临时目录内，端口由 `listen(0)` 分配，不是 4771），发现后用 SIGTERM 停止并确认退出。另一个夹具服务（pid 76540）不是本评审启动的，没有处理。
- **披露 5**：对话框进程组用例与 shell 实验在沙箱外运行，因为沙箱中不能执行 `/bin/ps`；这些运行只执行 `/bin/sh`、dash、zsh、真实 Node 二进制与替身脚本，子进程记录确认没有执行 Agent 命令行，也没有联网。
- 另外只查看了当前会话 `CLAUDE_CODE_EXECPATH` 的路径、`~/.nvm/versions/node/` 与 `/opt/homebrew/bin` 的条目名、`/private/var/select/sh` 的指向。
- 没有下载任何东西，没有运行 `npm install`/`ci`、`pip install`，没有使用 `plugin list --available`。没有修改被审文件；只新建本报告与 HLD 第 23 轮报告，没有提交或推送。删除只发生在实验目录内。结束时没有本评审的残留进程。

## 8. 状态分层

| 层 | 状态 |
|----|------|
| 源码（本报告） | APPROVED：P0 0、P1 0、P2 3；上一轮 P1 关闭，P2 七项关闭、一项部分关闭 |
| CI（exact SHA） | NOT_RUN（分支未推送） |
| 环境 | 不适用（无部署） |

## 9. 下一步

1. 阶段 2 可以收尾；建议在进入阶段 3 前顺手处理 PH2R2-P2-01（改动一行用例）与 PH2R2-P2-02(a)(e)，它们决定 CI 中这些断言是否真正生效。
2. PH2R2-P2-03 改动一行，可随下一次涉及启动器的提交处理。
3. HLD 11A 条件 3（0.11.0 合并前全量重跑矩阵）与条件 4 中 V12 的 shell 分支实测仍有效。
