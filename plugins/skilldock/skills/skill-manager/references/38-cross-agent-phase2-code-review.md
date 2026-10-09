# 代码评审报告：阶段 2（运行环境、Claude 命令行与进程环境、分发、Claude 侧安装）与阶段 1 复核 r4 的 P2 复核

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论、CI 状态与环境状态分开报告。
>
> 本轮与 HLD 第 22 轮（[35-cross-agent-hld-review-r22.md](35-cross-agent-hld-review-r22.md)）、契约第 14 轮（[36-cross-agent-api-contract-review-r14.md](36-cross-agent-api-contract-review-r14.md)）合并进行，实验共用。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| Review ID | `CRV-9d60bf12-090b-4688-b72e-f895014e28c8`（阶段 2 首轮评审，兼对阶段 1 复核 r4 的 P2 做 delta 复核） |
| 上一轮 | 阶段 1 代码复核第 4 轮 [r4](38-cross-agent-phase1-code-review-r4.md)（APPROVED，R4-P2-01～03）；HLD 第 21 轮 R21-P2-01 的实现部分；契约第 13 轮 APIR13-P2-01 的实现联动 |
| 评审者 | 独立的 Claude 评审会话（委托子任务），不与作者会话或前几轮评审共享上下文；不是人类评审，不代表任何 Owner。按委托不读写真实 `~/.claude`，因此没有加载 `testany-eng:code-reviewer` 技能文件，结构与分级沿用 r4 |
| 日期 | 2026-10-09 |
| 仓库 / 分支 | `github.com/TestAny-io/testany-agent-skills`，`feature/skilldock-0.11-cross-agent`（本地，未推送） |
| Candidate | `0eb4b2f269ff8e1a14c984d83e621677f829aa6f`（tree `1170f9e4…4c95`），基线 `e316c79`（tree `26a3f3de…ee69`，阶段 1 r4 批准代码）。被审提交 `38bd668`（2a）、`fe777f2`（2b）、`7d19e86`（2c）、`7971fd8`（r4/r21/APIR13 的 P2）、`e0ed4ab`（2d）、`0eb4b2f`（文档）。范围 `-- plugins .claude-plugin AGENTS.md`：40 个路径（不含 `references/` 为 31 个），增 1927 行、删 161 行；`--name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none` 清单 sha256 `5ae42ede…727a`，完整 diff sha256 `fcd580bd…d0e6` |
| 直接受影响的调用方 | `launch.sh` / `native.sh` / 后台 `run.sh` 的全部调用方（0.10.2 原生入口 6.1、0.10.3 转交 6.2、0.10.x 自更新 7.1、launchd）；`bootstrap.mjs` → `planLaunch` → `migrationCheck` → `commandLineGateEvidence`；`launch.mjs` 的 `checkOwner`、`startRuntime`、`prepareRuntime`；`background.mjs`、`background-registration.mjs` 的 `runScript`；冻结代码 `ab6856f`（0.10.2）、`337547a`（0.10.3） |
| 工作区绑定 | 开始与结束时 HEAD 均为 `0eb4b2f`，工作区干净。测试与实验在 `git archive 0eb4b2f` 的导出副本中进行；兼容矩阵需要 Git 历史，在工作区运行，运行前后 `git status` 均为空 |
| 事实源 | HLD-SDX-001 v1.14（`e0821c1d…ec36`，本轮 HLD 第 22 轮重新绑定）3.3、3.7、3.8、3.9、3.10、3.13、7.2、7.3，DEC-SDX-007、012、013、014、024；API-SDX-001 v0.14：36b 6.3、7.4、附录 A.5 G-18；实施计划阶段 2；冻结代码 0.10.2 = `ab6856f`、0.10.3 = `337547a` |

## 2. 结论

**CHANGES_REQUESTED**（源码层；`0eb4b2f` 相对 `e316c79`）。

- P0：0
- P1：1（PH2-P1-01：启动器派生的 Codex 命令行探测与依赖构建仍继承调用方的全部环境，含 Claude、Codex 会话变量与凭据，违反 DEC-SDX-024 与 36b 6.3）
- P2：8（PH2-P2-01～08，不阻断，见第 4 节）
- 阶段 1 复核 r4 的 P2：R4-P2-01、R4-P2-02、R4-P2-03 **全部关闭**；R21-P2-01 的实现与 APIR13-P2-01 的实现联动已落实（第 3.1 节）
- 与 0.10.2、0.10.3 冻结行为的兼容：未发现回退（兼容矩阵 55/55，第 3.7 节）
- SCOPE_DECISION / EVIDENCE_BLOCKED：无
- 是否需要 Owner 决定：不需要。PH2-P1-01 的修复若要把 `npm_config_*` 等 npm 配置变量纳入构建环境的白名单，属工程侧的 HLD 3.3 有限增量

P1 修复后只需对改动部分做 delta 复核。本结论不授予推送、合并、CI 或发布权限。

## 3. 逐项核查

### 3.1 阶段 1 复核 r4 的 P2（`7971fd8`）

| ID | 修正 | 证据 | 结论 |
|----|------|------|------|
| R4-P2-01 门槛把指向文件的链接判为不可读；回归断言没有守住修正 | `migration.mjs:37-45`：符号链接先 `fs.stat` 跟随，目标是目录才计入，`ENOENT`/`ENOTDIR`/`ELOOP` 跳过，其他错误记为不可读 | 测试改为在 `<market>/skilldock/` 下放名称合法的普通文件、指向文件的链接、悬空链接，并断言门槛结果为 `{passed: true, blockers: [], unreadable: []}`；指向 0.10.0 目录的链接计为阻断项。反向验证：把 `migration.mjs` 换回 `74cce24` 版（M1）与 `38bf3df` 版（M1b），`gate evidence` 用例都失败 | **已关闭** |
| R4-P2-02 自定义 Claude 配置目录从 Codex 侧不可见时仍是通用提示 | 采纳做法 ①：`launch-plan.mjs:210-217` 对“插件缓存布局 + 同一 marketplace + 根目录不在已知缓存之下”的记录返回 `claude-unverified`（`reason: 'configuration'`，带 `configDir`）；`launch.mjs:206-222` 点名该目录并给出 `CLAUDE_CONFIG_DIR="<目录>"` 的步骤；`:190` 让 Codex 缓存中的目录形态记录提前返回 `null`，避免误归入新分支 | 单元断言（`launch-plan.test.mjs:108-115`）与启动器层用例（`migration.test.mjs` 第 48 项：退出 1、`owner-unverified`、消息含目录、步骤含 `CLAUDE_CONFIG_DIR`、旧服务不停止、数据目录逐字节不变）。反向验证 M3、M3b、M3c 均失败 | **已关闭** |
| R4-P2-03 不是 JSON 的 `package.json` 与门槛口径不一致；读不出时提示不确切 | `launch-plan.mjs:196-203`：解析失败视为“不是安装”（与门槛 `migration.mjs:58` 相同）；只有存在但读不出（`text === null`）且未带废弃标记时为 `claude-legacy` 并带 `unreadable`；`launch.mjs:226-234` 改为“无法读取 … 无法确认 … 的版本”并附权限步骤 | 单元断言：不是 JSON → `family`、`{}` → `family`、读不出 → `{owner:'claude-legacy', unreadable}`；反向验证 M2 失败。启动器层探针 P8：`status` 退出 1、`start` 退出 4，提示与三条步骤正确，启动记录逐字节不变。启动器层提示本身没有仓库断言（M5 无测试命中），见 PH2-P2-04 的测试缺口 | **已关闭** |
| R21-P2-01（实现）旧服务仍运行时先给停止步骤 | `launch.mjs:212-218`：健康检查与记录一致时，第 1 步给出旧启动脚本的 `stop` 命令（找不到脚本时给进程号），删除记录一步写明“且它的服务已停止” | `migration.test.mjs` 第 48 项；反向验证 M4 失败 | 已落实 |
| APIR13-P2-01（实现联动） | 同 R4-P2-03 | 同上 | 已落实 |

修正没有引入新的误判：链接 `stat` 的其他错误仍记为不可读（方向是不通过）；“配置目录不可见”只是把原先的通用拒绝换成具体提示，仍退出 1、不写文件、不停止旧实例。

### 3.2 阶段 2a：运行环境（HLD 3.10，DEC-SDX-012）

| 条文 | 实现 | 证据 | 判断 |
|------|------|------|------|
| 扫描顺序：显式 → 保存 → Codex 工作区 → 私有 Node → 常见位置 → 版本管理器 → PATH；应用包 Node 只引导 | `node-candidates.mjs:30-53` 单一清单；`toolchain.mjs:166-192` 用 `bootstrap: false` 排除应用包 Node | 测试 57、49、56；P6 中引导程序选中 Homebrew Node 并以前缀下的 npm 配对 | 一致；同一管理器内的顺序 shell 层与 Node 层不同，见 PH2-P2-02 |
| 保存并复用、轻量核验、失效重扫 | `writeSavedNode` 原子写 `settings/runtime.json`（0600）与 `settings/node-path`；`savedStillUsable` 只查文件、可执行与版本；失效时记日志并继续扫描、保存新值 | 测试 58；反向验证 M12 失败 | 一致；显式变量与保存值的关系见 PH2-P2-01 |
| 不再下载；不删除已下载的私有 Node | `resolveToolchain` 不再调用 `installPrivateRuntime`；`$state/node/node-v*-darwin-*` 仍是候选 | 测试 53 | 一致 |
| 找不到时弹窗：shell 层由启动脚本、引导层由引导程序；`native.sh` 与后台从不弹窗；弹窗不阻塞 | `launch.sh:54-61`（`&` 后台）；`node-guide.mjs`（`detached` + `unref`）；`native.sh`、`run.sh` 无对话框；重启任务、`SKILLDOCK_NO_DIALOG=1`、非 macOS、`status`/`stop`/`doctor` 都不弹 | 测试 59；反向验证 M15 失败；探针 P4：shell 分支 16 ms 返回、退出 1、stdout 为空、提示“已显示安装引导” | 不阻塞成立；shell 分支的对话框与调用方同一进程组且无测试，见 PH2-P2-05 |
| 单一事实源：shell 片段由同一定义生成，测试校验 | `scripts/node-candidates.mjs` 检查 `launch.sh`、`native.sh`；`runScript` 写入时生成 | 测试 57；反向验证 M17 失败 | 一致 |
| `doctor` 只读 | `save: action !== 'doctor'` | 测试 56；冒烟中安装副本的 `doctor` 不建数据目录 | 一致 |
| 构建日志按大小轮换（第 19 轮范围外观察） | `runtime.mjs:43-44`，在构建锁内 | 测试 32；反向验证 M18 失败 | 一致 |

### 3.3 阶段 2b：进程环境、Claude 命令行、门槛的命令行确认

| 条文 | 实现 | 证据 | 判断 |
|------|------|------|------|
| 服务只继承白名单变量，PATH 按规则构造，会话变量剔除（DEC-SDX-024，HLD 3.3、7.2，36b 6.3） | `process-env.mjs`：HOME、USER、LOGNAME、LANG、LANGUAGE、`LC_*`、TMPDIR、SSH_AUTH_SOCK、GIT_SSH_COMMAND、代理与 TLS 变量、除启动链一次性变量外的 `SKILLDOCK_*`；PATH 为 Node 目录 + 固定系统目录 + 继承的绝对目录；`startRuntime` 使用它，`CODEX_HOME` 取记录中的保存值 | 测试 1、33；反向验证 M6、M7、M8 失败 | 服务一致。**启动器自身派生的 Codex 命令行与依赖构建没有使用白名单**，见 PH2-P1-01 |
| 白名单有无多放 | 逐项核对：`CLAUDE*`、`CODEX_*`（`CODEX_HOME` 另由保存值给出）、`ANTHROPIC_*`、`OPENAI_*`、`NODE_OPTIONS`、`GIT_CONFIG_*` 都不在内；`SKILLDOCK_*` 只有设置与路径，没有凭据类变量；代理变量按 HLD 明文允许 | 代码逐行核对 | 没有多放 |
| Claude 命令行：显式 → 保存 → 会话路径 → 桌面应用最高版本 → PATH → 用户目录；保存并以 `--version` 核验，失效重新发现 | `claude-cli.mjs:51-90`；会话路径由启动器在锁内、门槛之后记录（`launch.mjs:285`，0.10.x 不读的 `settings/claude-cli.json`） | 测试 2；反向验证 M9、M19 失败；本机 `CLAUDE_CODE_EXECPATH` 指向桌面应用自带命令行（只查看了路径） | 一致；保存值不追随桌面应用升级，见 PH2-P2-08 |
| 调用 Claude 命令行附加禁止自更新；只在配置根存在时运行 `plugin list`，不创建 `~/.claude` | `claudeCliEnvironment` 加 `DISABLE_AUTOUPDATER=1`、保存的根目录；`gate-cli.mjs:45、57` 先判断目录存在 | 测试 3；反向验证 M10 失败（去掉判断后替身命令行的阻断项进入结果） | 一致 |
| 门槛：先文件证据，通过后才由命令行确认（36b 7.4） | `launch-plan.mjs:116-122`；引导程序确认后以 `SKILLDOCK_GATE_CHECKED=1` 通知 `launch.mjs` 锁内只重读文件；该变量属启动链一次性变量，不传给服务 | 测试 3（单元）、8 | 口径一致（第 3.3.1 节）；接线没有测试、确认依据不输出、测试会运行本机 Codex 命令行，见 PH2-P2-04；快速拒绝的顺序见 PH2-P2-03 |

#### 3.3.1 命令行确认与文件证据的口径

| 情形 | 文件证据（`migrationGate`） | 命令行确认（`commandLineGateEvidence`） | 判断 |
|------|---------------------------|----------------------------------------|------|
| 计入范围 | 所有 marketplace 的 `skilldock` 版本目录；Codex 取每个 marketplace 的最高版本，Claude 计入每个未带废弃标记的目录 | Codex：已安装清单中名为 `skilldock` 的条目；Claude：`skilldock@*` 条目的 `installPath` | 一致；Codex 命令行能补出“已安装版本低于缓存最高版本”的情形 |
| 版本来源 | `skills/skill-manager/assets/app/package.json` | Codex 取清单中的版本；Claude 读 `installPath` 下同一文件 | 一致 |
| 带废弃标记 | 跳过 | 跳过 | 一致 |
| 不是 JSON、没有合法版本 | 不算安装 | 不算安装 | 一致 |
| `package.json` 读不出 | 不可读，不通过 | 跳过 | 命令行只在文件证据通过后运行，且 `installPath` 位于同一缓存根之下，这一差异只在 `installPath` 位于已扫描缓存之外时才会出现 |
| 命令行不可用、超时、形状不符 | — | 记入 notes，Claude 改读 `installed_plugins.json` | 回落方向正确；notes 未输出，见 PH2-P2-04 |
| 失败时的可观察行为 | 退出 4，stdout 为空，stderr 为原因与步骤；重启任务只给原因 | 同左；阻断项注明“依据：…命令行插件清单”与构成判定的配置项 | 一致 |

### 3.4 阶段 2c：分发（DEC-SDX-013、014）

| 条文 | 实现 | 证据 | 判断 |
|------|------|------|------|
| Codex MCP 配置改名并由 manifest 显式引用，Claude 不加载 | `.mcp.json` → `codex.mcp.json`；`.codex-plugin/plugin.json` 的 `mcpServers` 指向它；冻结代码不引用该文件名（`git grep`），`plugin-contents.mjs` 先读 manifest 字段 | 冒烟：Claude 中 `MCP servers (0)`，安装目录只有 `codex.mcp.json`，没有 `.mcp.json`、`.claude-plugin` | 一致 |
| 单一 manifest；仓库校验器 | 插件只有 `.codex-plugin/plugin.json` | `validate_codex_compat.py --profile repository`：退出 0，37 个技能 | 一致 |
| 技能说明与斜杠命令宿主中立 | `SKILL.md` 分节写 Codex 与 Claude 的打开方式、Node 规则、命令行发现、白名单、`SKILLDOCK_NO_DIALOG`、`SKILLDOCK_CLAUDE_BIN`；命令描述去掉“Codex 专属” | 文字核对 | 一致 |
| marketplace 条目标注支持的 Agent | `skilldock` 写明 Codex 与 Claude；`teamdesk` 标“仅支持 Codex” | 冒烟：插件浏览器显示两条说明；其他条目已有 `description`，Codex 接受该字段 | 一致 |

### 3.5 阶段 2d：Claude 侧安装、冒烟、Homebrew npm（REQ-SDX-017）

- `installedClaudeVersion` 夹具按 HLD 9.3 V6 的形态（插件缓存、无 Claude manifest、提交摘要目录）；测试 34 证实两侧互相查看、复用、停止对方启动的实例，较新的一侧接受 `start` 转交。
- `findNpm` 的 `via` 与 `libexec`：P6 中 Homebrew Node 与前缀下的 npm 配对成功；反向验证 M13、M14 失败。
- 冒烟：本轮按委托运行一次，通过（只装上 SkillDock、版本为提交摘要前 12 位、`Skills (2)`、`MCP servers (0)`、TeamDesk 标注可见、安装副本的 `doctor` 只读）。但它实际联网取回了 Claude 插件目录，见 PH2-P2-07。

### 3.6 `0eb4b2f` 文档

实施计划的上游版本、进度表与阶段 6 事项、`18-codex-node-runtime.md` 新增规则，与代码一致；两处措辞偏差（“各自取最高版本”只对 Node 层成立，见 PH2-P2-02；“检查三处”实为检查两处、一处生成）不另计。

### 3.7 与 0.10.2、0.10.3 冻结行为的兼容（HLD 11A 条件 1a；36b 6.3）

| 核对项 | 证据 | 判断 |
|--------|------|------|
| 兼容矩阵（真实 0.10.2、0.10.3 代码调用真实 0.11 工作区代码） | 工作区 `0eb4b2f` 上 `tests/compat-matrix.test.mjs` 55/55 通过（75 秒，沙箱内，禁止执行本机 Agent 命令行与外网） | 未发现回退 |
| 非 0 退出时 stdout 为空 | 真实入口实测：shell 无 Node（P4）、引导程序之后的归属拒绝（P6）stdout 均为 0 字节；启动器入口失败时只写 stderr（`launch.mjs:400-407`，阶段 2 未改）；兼容矩阵中 0.10.3 转交与 0.10.2 原生入口的用例通过。`doctor` 沿用 0.10.2（输出 JSON 后以 1 退出，与 `ab6856f` 相同） | 一致 |
| 只有 `/bin/sh`、PATH 中没有 Node | `launch.sh` 只用 POSIX 结构与绝对路径的 `/usr/bin/head`；`PATH=/usr/bin:/bin` 时按清单查找，找到即运行引导程序，找不到时退出 1、只写 stderr（P4、测试 56）；`HOME` 未设置时因 `set -u` 失败，与 0.10.2 相同 | 一致 |
| `native.sh` 从不弹窗 | 不调用 `osascript`，不运行引导程序 | 一致 |
| 重启任务（7.1）与 `SKILLDOCK_NO_DIALOG` 不弹窗 | shell 与引导程序都排除；引导程序分支有测试，shell 分支无测试（PH2-P2-05） | 行为一致 |
| 不写 0.10.x 读取的文件 | 新文件都在 `settings/` 下；`git grep` 证实 `ab6856f`、`337547a` 不读取 `settings/`、`node-path`、`runtime.json`、`claude-cli.json` | 一致；写入时点见 PH2-P2-06 |
| 源码布局（36b 7.4） | 新增模块都在 `server/`、`scripts/` 允许的目录树内；`scripts/node-guide.applescript` 只从安装目录调用，不需要进入运行目录 | 一致 |

结论：阶段 2 不改变 0.10.3、0.10.2 冻结代码的可观察行为。

### 3.8 启动器导入的模块不依赖 `node_modules`

`scripts/launch.mjs` 与 `scripts/bootstrap.mjs` 的静态导入闭包共 25 个文件，没有任何包名导入、没有动态导入；`background-updates.test.mjs` 的“未安装依赖时启动器可导入”用例通过；冒烟中没有 `node_modules` 的 Claude 安装副本运行 `doctor` 成功。

### 3.9 反向验证（变异实验）

在沙箱中逐项修改导出副本的一个文件、只跑相关用例、随后逐字节还原（`run-mutations.json`）：

| # | 变异 | 结果 |
|---|------|------|
| M1、M1b | 门槛换回 `74cce24`、`38bf3df` 版 | 失败（守住） |
| M2、M3、M3b、M3c | 不是 JSON 计为在用；去掉未知根目录分支（单元、启动器）；去掉 Codex 缓存提前返回 | 均失败（守住） |
| M4 | 去掉“旧服务仍在运行”的第 1 步 | 失败（守住） |
| M5 | 去掉读不出时的权限步骤 | 没有用例覆盖 |
| M6、M7、M8 | 放行 `CLAUDE*`；PATH 原样继承；服务改回整份环境 | 均失败（守住） |
| M9、M10 | 会话路径排到保存值前；去掉配置根存在判断 | 均失败（守住） |
| M11 | 门槛永不调用命令行确认 | **45 项全部通过**（未守住） |
| M12～M15 | 保存值不复用；去掉 `via`；去掉 `libexec`；忽略 `SKILLDOCK_NO_DIALOG` | 均失败（守住） |
| M16 | shell 分支对重启任务也弹窗 | **全部通过**（未守住） |
| M17、M18、M19 | shell 片段偏离清单；去掉日志轮换；不记录会话命令行 | 均失败（守住） |
| M20 | `launch.mjs` 永不做命令行确认 | **45 项全部通过**（未守住） |

## 4. 问题清单

### 4.1 P0

无。

### 4.2 P1

**PH2-P1-01 启动器派生的 Codex 命令行与依赖构建仍继承调用方的全部环境（含 Claude、Codex 会话变量与凭据）**

| 项 | 内容 |
|----|------|
| 位置 | `scripts/launch.mjs:346`（每次 `start`/`restart` 探测 Codex 命令行，`resolveCodexCli` 未传 `env`，默认 `process.env`）；`scripts/launch.mjs:351` → `assets/app/server/runtime.mjs:28、42`（`prepareRuntime` 默认 `environment = process.env`，`npm ci` 与 `npm run build` 在其上运行）；`scripts/bootstrap.mjs:26、33、43`（`cli` 动作探测并以 `env: process.env` 透传 Codex 命令行；`doctor` 探测） |
| 依据 | DEC-SDX-024：“服务与命令行子进程只继承白名单内的环境变量，剔除 Claude 与 Codex 的会话变量”；HLD 3.3“进程环境”；HLD 7.2“Claude 与 Codex 的会话变量不进入长驻服务与子进程”；36b 6.3“服务与命令行子进程的环境仍按白名单构造（HLD 7.2），不继承会话变量”；实施计划阶段 2“进程环境白名单”；`fe777f2` 说明“Claude and Codex session variables are never inherited” |
| 复现 | 替身 Codex 命令行记录收到的变量名，变量取假值。P7：`launch.sh doctor` 与 `launch.sh cli --version` 中，两次 `--version`、两次 `plugin --help` 与透传调用都收到 `ANTHROPIC_API_KEY`、`CLAUDE_CODE_OAUTH_TOKEN`、`CLAUDECODE`、`CLAUDE_CODE_ENTRYPOINT`、`CODEX_THREAD_ID`。P7c：`launch('start')`（进程环境带会话变量，与 `launch.sh` 调用时相同）中的 `--version`、`plugin --help` 同样收到。P7d：`npm run build`（会执行依赖中的第三方构建代码）收到同一组变量。同一阶段中服务（测试 33）与门槛的命令行确认（`gate-cli.mjs` 使用 `childEnvironment`、`claudeCliEnvironment`）已按白名单，说明这几处是遗漏 |
| 影响 | 每次从 Claude 或 Codex 会话打开 SkillDock，会话凭据交给 Codex 命令行与依赖构建代码；Codex 会话变量还可能改变 Codex 命令行的行为。属本阶段范围内已批准安全规则的未完成实现；不涉及冻结代码，修复面小 |
| 建议 | `launch.mjs:346` 与引导程序的 `doctor`、`cli` 改为 `resolveCodexCli({ …, env: childEnvironment(env) })`，透传调用用 `childEnvironment(process.env)`；`prepareRuntime` 由启动器传入白名单环境（若需保留 `npm_config_*`、`NPM_CONFIG_USERCONFIG` 等 npm 配置变量，在 HLD 3.3 写明后纳入白名单）；仿照测试 33 为 Codex 命令行探测与构建各补一条断言 |
| Owner 决定 | 不需要 |

### 4.3 P2（不阻断，可选整改）

| ID | 位置 | 依据 | 复现或推理 | 建议 |
|----|------|------|-----------|------|
| PH2-P2-01 显式运行环境变量与保存值 | `toolchain.mjs:169-187`；`background-registration.mjs:34-36` | HLD 3.10“后台入口脚本优先使用保存的路径，两侧入口共用同一保存值”；3.8 后台核验 Node；`SKILL.md` 第 28 行公开 `SKILLDOCK_NODE_BIN`；应用 README 第 105～106 行（显式 `npm-cli.js`，“错误配置会明确失败”） | (a) `SKILLDOCK_NODE_BIN` 选中的 Node 不保存，而新 `run.sh` 不再把注册时的 Node 作为第一个候选：P3 中前台用显式 Node，新 `run.sh` 改用 Homebrew 25.9，旧 `run.sh` 用的是显式 Node。显式路径不在扫描清单中、本机其余候选又不能构建时，后台更新会失败。(b) 已有保存值时 `SKILLDOCK_NPM_CLI` 被忽略，指向不存在文件的显式 npm 也不报错（P1 两种情形都返回 `saved`）；阶段 2 之前它对所有候选生效 | (a) 显式选择也保存（来源记为 `explicit`，前台仍以环境变量为准），或 `run.sh` 在保存值之后保留后台上下文的 `node`；(b) 设了 `SKILLDOCK_NPM_CLI` 时不复用保存值，或要求保存的 `npmCli` 与之相同 |
| PH2-P2-02 shell 片段在同一版本管理器内按字典序取第一个可运行版本 | `node-candidates.mjs:65-78`；`launch.sh`、`native.sh` 第 28～34 行；后台 `run.sh` | HLD 3.10 第 6 项“同一管理器内取最高版本”与“单一事实源”；`18-codex-node-runtime.md`“各自取最高版本” | P2：nvm 有 v22.12.0、v22.20.0、v24.1.0 时，Node 层取 v24.1.0，shell 层取 v22.12.0。`launch.sh` 只用它运行引导程序、`native.sh` 只运行 MCP 服务，影响小；后台 `run.sh` 在保存值失效时用它构建。现有测试只比对文本，不检查顺序 | shell 片段对每个管理器的展开结果按版本倒序取第一个可运行者；或在 HLD 3.10 与 18 文档写明“shell 层任取可运行者，构建用 Node 以 Node 层为准”，并补一条顺序用例 |
| PH2-P2-03 迁移失败后的快速拒绝排在命令行确认之后 | `launch-plan.mjs:116-128` | 36b 7.4“对同一目标的非交互重启任务…直接拒绝”；HLD 3.7 避免旧服务反复重试；PRD Q10（0.10.2 约每秒重试） | P5：有失败记录、文件证据通过时，重启任务在 `MIGRATION_FAILED_BEFORE` 之前先运行 `codex --version`、`claude --version`（真实命令行下还有 `plugin --help` 与两次 `plugin list --json`）。0.10.2 协调器每轮等待这些进程，期间旧服务暂停写操作（`pauseForRestart`），而结果总是拒绝 | 重启任务先查失败记录，再做命令行确认；交互入口不变 |
| PH2-P2-04 门槛命令行确认：接线无测试，测试会运行本机 Codex 命令行，确认依据不输出 | `launch-plan.mjs:116-122`；`launch.mjs:279`；`tests/helpers/launcher-fixture.mjs:13`；`process-env.mjs:20-22`；`codex-runtime.mjs` 的候选 | 36b 7.4；HLD 7.3“启动器输出中注明所用…命令行路径与版本”；夹具约定“启动不看到本会话的 HOME、Codex 或 Claude 变量” | (a) M11、M20 让命令行确认失效后 45 项全部通过：没有“文件证据通过、命令行报告旧版本 → 退出 4 且注明依据、不写文件”的接线用例，也没有“引导程序已确认、启动器不再确认”的用例；启动器层的读不出提示同样没有断言（M5）。(b) 测试没有固定命令行：`isolated()` 去掉 `SKILLDOCK_*`，构造的 PATH 含 `dirname(process.execPath)` 与固定系统目录，应用目录固定含 `/Applications/ChatGPT.app`。以记录器替换 `execFile` 证实：在测试世界中会依次执行 nvm 目录下的 `codex`（@openai/codex）与 ChatGPT 应用内的 codex-cli，`CODEX_HOME` 为临时目录，`planLaunch` 用例中 `HOME` 未设置。结果依赖本机，命令行自身可能联网。本轮在禁止执行这些命令行的沙箱中重跑，结果同样是 60 项通过、1 项跳过。(c) `commandLineGateEvidence` 的 notes 被丢弃，门槛通过时不输出用了哪个命令行、是否改用安装记录 | 测试以替身固定 `SKILLDOCK_CODEX_BIN`、`SKILLDOCK_CLAUDE_BIN`，或在非命令行确认的用例中传 `commandLines: false`；补上述接线用例与启动器层读不出提示的断言；notes 写一行到 stderr |
| PH2-P2-05 `launch.sh` 的对话框与调用方同一进程组，且无测试 | `launch.sh:54-61` | HLD 3.10“对话框以独立进程弹出”；引导程序分支用 `detached` | P4（替身 `osascript`，以结束调用方进程组模拟宿主清理）：shell 分支的对话框进程随进程组结束，引导程序分支仍存活。本机找不到任何 Node 的用户（例如只装 Claude 的用户）走的正是 shell 分支。M16 删除 shell 分支的重启任务排除后测试全部通过（唯一的 shell 无 Node 用例在有 Homebrew Node 的机器上跳过，且只测 `SKILLDOCK_NO_DIALOG`）。V12 的记录没有说明实测走的是哪个分支 | 让 `osascript` 脱离调用方进程组（例如 `set -m` 后再 `&`）；V12/V17 的真实宿主实测覆盖 shell 分支；用替身 `osascript` 与替换过固定候选的副本补一条 shell 分支用例 |
| PH2-P2-06 归属拒绝之前，引导程序已在数据目录写入 Node 选择 | `bootstrap.mjs:39-41`（早于 `launch.mjs:238` 的 `checkOwner`） | DEC-SDX-007；HLD 3.7“门槛通过前只写入 0.10.2 不读取的新文件”；r4 第 4.4 节留给本轮确认 | P6：数据目录有另一来源的 0.10.x 记录时，启动以 1 退出、stdout 为空、给出拒绝提示，但 `settings/runtime.json` 与 `settings/node-path` 已写入。`settings/` 不被 0.10.2、0.10.3 读取（`git grep` 证实），不影响冻结代码，也不是接管；但会覆盖该目录真正所有者（其他源码实例或 fork 的 0.11）保存的选择 | 把保存移到 `launch.mjs` 归属检查通过之后（引导程序经环境变量交给启动器写入），或在 `planLaunch` 中先做归属预检；若接受现状，在 HLD 3.10 写明 |
| PH2-P2-07 Claude 分发冒烟实际联网，与说明不符 | `tests/claude-distribution-smoke.mjs:5、33`；实施计划“进度”表 | HLD 3.3“带 `--available` 的列表会联网并在 Claude 配置目录写入缓存”；首轮 HLD 评审 P2-08 的实测（约 3 MB） | 本轮按委托运行一次（临时 HOME 与 `CLAUDE_CONFIG_DIR`，已设 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`）：临时配置目录中出现带 `fetchedAt` 的 `plugin-catalog-cache.json`（536 KB）与 `plugin-directory-cache-v2.json`（2.4 MB），即 Claude 命令行取回了远端插件目录。文件头写的是“nothing is downloaded” | TeamDesk 标注改从 `plugin details` 或 marketplace 文件读取，去掉 `--available`；或在文件头与计划中写明会联网，运行前征得 Owner 同意 |
| PH2-P2-08 保存的 Claude 命令行不追随桌面应用升级 | `claude-cli.mjs:54-57、85-86` | HLD 3.3 发现顺序（会话路径第 2，桌面应用按版本取最高第 3）与“失效即重新发现” | 桌面应用升级后旧版本目录仍保留（本机同时有 2.1.286、2.1.288），保存值一直有效，SkillDock 会继续用旧命令行管理插件，而会话已在用新版；测试 2 明确断言“保存值先于会话路径” | 保存值来源为 `desktop` 或 `session` 时，若有更高版本的桌面命令行或新的会话路径，改用并重新保存（显式与用户手动指定的除外）；或在 HLD 3.3 写明“保存值优先、不追随升级” |

### 4.4 其他观察（不计入问题）

- **PATH 构造顺序**：固定目录 `/usr/bin` 等排在 `/opt/homebrew/bin`、`/usr/local/bin` 与继承的 PATH 之前（`process-env.mjs:14、22`），与后台入口一直以来的顺序相同（`background-entry.mjs:30`），但与 macOS 默认 `/etc/paths`（`/usr/local/bin` 在前）及多数 Homebrew 用户的 PATH 相反，服务中的 `git` 等会解析到系统版本。HLD 只写“按规则构造”，建议在 HLD 3.3 写明规则。
- **白名单不含 npm 配置变量**：阶段 5 若在服务内构建，用环境变量配置 npm 源的用户会受影响；与 PH2-P1-01 的建议一并决定。
- **Claude 命令行的网络流量**：生产中调用 Claude 命令行时没有设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`（冒烟设置了）。HLD 7.3“无遥测”指 SkillDock 自身，不构成缺陷。
- **Claude 中技能与命令同名**：冒烟显示 `Skills (2) skill-manager, skill-manager`。DG-NO-LLD 把“命令与技能同名的处理”留给实现；阶段 2 保留两者，命令转读 `SKILL.md`，行为无害，建议在计划或 30 文档中记一句。
- **“重新检测”的工作目录**：对话框在 `osascript` 的工作目录下重跑启动链，只在调用方既没有 `--project` 也没有 `SKILLDOCK_PROJECT_DIR` 时影响项目选择；技能说明要求总是传 `--project`。
- **`resolveClaudeCli` 的来源记录**：保存值版本变化时把来源改记为 `saved`（`claude-cli.mjs:85-86`），只影响诊断。
- **后台重建运行目录不传构建日志**（第 21 轮范围外观察 2）：仍在，不属阶段 2。
- **Claude 插件清单形状**：门槛按首轮 HLD 评审的实测（`plugin list --json` 返回逐条记录）解析数组；形状不符时回落到安装记录，方向正确。本轮没有重测。

## 5. 测试与实验记录

### 5.1 测试运行

实验目录：scratchpad 的 `verify/phase2-review/`。导出副本 `export-0eb4b2f/`（`git archive 0eb4b2f plugins/skilldock .claude-plugin AGENTS.md`，`node_modules` 为指向仓库同名目录的符号链接）。统一环境：`env -i HOME=<实验目录>/home TMPDIR=<实验目录>/tmp PATH=<nvm Node 22.14.0>:/usr/bin:/bin:/usr/sbin:/sbin npm_config_offline=true`，`NODE_OPTIONS=--import=guard.mjs` 拒绝并记录任何发往 4771 端口或非本机地址的 Node 连接（自检用另一个本机端口与 `192.0.2.1` 验证了拦截，没有用 4771 自检）；`perl alarm` 限时。第一次运行之后，所有测试与实验都在 `sandbox-exec -f hermetic.sb` 中进行：禁止执行本机 Codex、Claude 命令行（nvm 目录下的 `codex`、`@openai/codex`、ChatGPT 应用内的 codex-cli、Claude 桌面应用与 `~/.local/share/claude`），禁止本机以外的出站连接。

| 命令 | 结果 | 输出 sha256 |
|------|------|-------------|
| `node --test --test-concurrency=1 tests/toolchain.test.mjs tests/agent-cli.test.mjs tests/launch-plan.test.mjs tests/migration.test.mjs tests/launcher.test.mjs`（未加沙箱） | 61 项：60 通过、1 项按设计跳过（本机有 `/opt/homebrew/bin/node`），68 秒 | `b747448e…c2d5` |
| 同上，沙箱内 | 60 通过、1 跳过，62 秒 | `23cf812b…d873` |
| 工作区 `0eb4b2f`：`node --test --test-concurrency=1 tests/compat-matrix.test.mjs`，沙箱内；前后 `git status --short` 均为空 | 55/55 通过，75 秒 | `8452f453…117c` |
| `node --test --test-name-pattern 'fresh plugin launcher imports before node_modules' tests/background-updates.test.mjs`，沙箱内 | 1/1 通过 | `56d4612d…6456` |
| 变异实验 M1～M20（`mut/run-mutations.mjs`，沙箱内） | 第 3.9 节 | `c556e9c6…f2af` |
| `node tests/claude-distribution-smoke.mjs`（工作区，临时 HOME，`SKILLDOCK_CLAUDE_BIN` 指向桌面应用自带的 2.1.288 命令行；只运行一次） | 通过；见 PH2-P2-07 | `b923ca1a…ee26` |
| `python3 -B plugins/testany-eng/scripts/validate_codex_compat.py --profile repository`（`/usr/local/bin/python3`） | 退出 0，37 个技能 | — |
| `import-closure.mjs scripts/launch.mjs scripts/bootstrap.mjs` | 25 个文件，没有包名导入或动态导入 | — |

所有拦截日志都没有生成，即没有任何 Node 进程尝试连接 4771 或外网。文中“测试 N”指上表第 1 次运行输出中的序号（第 1～3 项为 `agent-cli`，第 4～9 项为 `launch-plan`，第 10～34 项为 `launcher`，第 35～48 项为 `migration`，第 49～61 项为 `toolchain`）。

### 5.2 补充探针

| 探针 | 内容 | 结果文件 |
|------|------|---------|
| P1 | 已有保存值时的 `SKILLDOCK_NPM_CLI`（有效与无效） | `probes-p1-p4.json` |
| P2 | nvm 多版本时 shell 片段与 Node 层的选择（固定系统路径在副本中替换为不存在的路径） | `probe-p2-order.json` |
| P3 | 前台用 `SKILLDOCK_NODE_BIN` 后，新旧 `run.sh` 在 launchd 式环境中选用的 Node | `probes-p1-p4.json` |
| P4 | 无 Node 时 shell 分支与引导程序分支的对话框（替身 `osascript`，不弹出真实对话框）：返回时间、stdout、进程组结束后是否存活 | `probes-p1-p4.json` |
| P5 | 有迁移失败记录的重启任务，在快速拒绝之前执行了哪些命令行（记录器替换 `execFile`，不执行） | `probe-p5.json` |
| P6 | 另一来源的数据目录：真实 `launch.sh start` 被拒绝前写了哪些文件 | `tmp/p6/` |
| P7、P7c、P7d | 替身 Codex 命令行与构建脚本记录收到的变量名（假值） | `tmp/p7/` |
| P8 | 启动器层对读不出的 `package.json` 的提示（R4-P2-03） | `probe-p8.json` |
| 命令行发现 | 以记录器替换 `execFile`，确认测试世界中门槛确认会执行哪些本机命令行（不执行） | 见 PH2-P2-04 |

探针脚本放在导出副本中运行，结束后已删除；夹具实例均已停止。

### 5.3 安全约束遵守情况与披露

- 没有向 `127.0.0.1:4771` 发送任何请求；实验端口由 `listen(0)` 分配并断言不等于 4771。用户真实的 SkillDock 服务（`~/.local/share/skilldock` 下的运行目录）未被访问或停止。
- 没有读写真实的 `~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；没有执行 `launchctl`；测试世界中的更新计划保持关闭。
- **披露 1**：第一次定向测试（未加沙箱）中，作者的测试按现有设计在门槛命令行确认路径执行了本机的 Codex 命令行（nvm 目录下的 `codex`，`CODEX_HOME` 为临时目录）。网络拦截只覆盖 Node 进程，不能排除该命令行自身的联网。发现后其余运行都改在沙箱中进行，并记为 PH2-P2-04。
- **披露 2**：按委托运行的冒烟实际联网，Claude 命令行把约 3 MB 的远端插件目录缓存写入临时配置目录（PH2-P2-07）。没有下载或执行任何可执行文件。
- **披露 3**：核对追溯脚本时误列了一次 `~/.claude/plugins/cache/testany-agent-skills/testany-eng/` 的子目录名（三个版本号），没有读取任何文件内容。另外只列出了 `~/Library/Application Support/Claude/claude-code/` 的版本目录名、查看了当前会话 `CLAUDE_CODE_EXECPATH` 的路径与会话变量的名称（不含取值）。
- 没有下载任何东西，没有运行 `npm install`/`ci`、`pip install`，没有访问 nodejs.org。没有修改被审文件，只新建本报告与 HLD 第 22 轮、契约第 14 轮两份报告；没有提交或推送。删除只发生在实验目录与夹具自建的临时目录内。实验结束后没有残留进程（只有用户自己原本在运行的 SkillDock 服务）。

## 6. 状态分层

| 层 | 状态 |
|----|------|
| 源码（本报告） | CHANGES_REQUESTED：P0 0、P1 1、P2 8；阶段 1 复核 r4 的 3 项 P2 全部关闭 |
| CI（exact SHA） | NOT_RUN（分支未推送） |
| 环境 | 不适用（无部署） |

## 7. 下一步

1. 修复 PH2-P1-01，并为 Codex 命令行探测与构建环境补断言；修复后只需对改动部分做 delta 复核。
2. P2 中建议优先处理 PH2-P2-04（测试不再运行本机命令行，补接线用例）与 PH2-P2-03（快速拒绝顺序），二者改动小；PH2-P2-05 宜在 V12/V17 的真实宿主实测中一并确认；其余可随阶段 3～6 处理。
3. HLD 11A 条件 3 的全量重跑仍是 0.11.0 合并前的条件。
