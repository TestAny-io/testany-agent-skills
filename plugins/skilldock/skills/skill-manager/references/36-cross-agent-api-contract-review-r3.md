# API 契约复审报告（第 3 轮，delta）：API-SDX-001 v0.3

> 本报告是评审意见，不是批准。它回答三件事：第 2 轮问题 APIR2-P1-01、APIR2-P2-01～11 是否关闭；v0.3 的修订有没有引入新问题；HLD-SDX-001 11A 条件 1 是否已满足。本报告不授权编写 0.10.3 或 0.11.x，也不授权提交、推送、发布或任何环境操作。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 评审对象 | API-SDX-001 v0.3，工作区未提交（分支 `docs/skilldock-cross-agent-prd`，HEAD `ad96e3f`）。评审开始与结束时各算一次 sha256，两次相同：<br>`36-cross-agent-api-contract.md`（索引，v0.3）`7922ee562b07c9e8e772dc52a1833d15f30c45623a6d572ab5fb8cce1156d312`<br>`36a-cross-version-file-formats.md`（v0.2，未改）`a4dd81b456443c8472244ee0a4a0b006e95de147233c9e88e8ca3f2d9c278ed4`<br>`36b-launcher-handover-protocol.md`（v0.3）`7a8ed7352e0451484b8dc35b67001bfc804afab5544e44df816c17d4fbcebd43`<br>`36c-http-api-delta.md`（v0.3）`92c9fcb560429c96ecac7a0071c855153bcb657165ad6a0831acdaba53710dab` |
| 差异基线 | 契约 v0.2 原文（`scratchpad/contract-v02/`）。自行 `diff` 的结果与委托方提供的三份 diff 用 `cmp` 比较，逐字节相同；36a 与 v0.2 相同。改动量：索引 5 处（+26/−6 行），36b 24 处（+37/−26），36c 10 处（+34/−11） |
| 上游基线 | PRD-SKILLDOCK-002 v0.9（两处措辞修正后，sha256 `4e52dc970f25b564fbd916cbabf6a30296478f06e429478e660aa2248ea38d80`）；HLD-SDX-001 v1.4（sha256 `3a8f7a85d47fc1dfeae7a526bb1c1bf639d53aa88a9de390b5a379abfa8814f7`）。两者的增量核对见 [35-cross-agent-hld-review-r12.md](35-cross-agent-hld-review-r12.md) |
| 冻结代码事实源 | SkillDock 0.10.2：`git show ad96e3f:` 下的代码。工作区 `assets/`、`scripts/` 与 `ad96e3f` 无差异（`git diff --quiet`）。实验用 `git archive ad96e3f plugins/skilldock` 导出到 `verify/r12-lab/export/` 的副本；依赖包以只读符号链接指向工作区已有的 `node_modules`，未下载、未安装 |
| 上一轮 | [第 2 轮复审](36-cross-agent-api-contract-review-r2.md)：CHANGES_REQUESTED，APIR2-P1-01、APIR2-P2-01～11 |
| 模式与范围 | `delta`。按第 2 轮报告第 10 节：复审 36c 第 6 节及其直接影响，以及处理 P2 时改动的 36b 各节（4.2、4.7、6.2、7.1～7.4、12、附录 A）、36c 第 4、7.1、7.3、8 节与索引第 4、10、12 节。未改动的 36a 与 36b 其他各节沿用前两轮结论，不重审 |
| 采用标准 | testany-eng `api-reviewer`（2.5.0；与 2.7.1 的技能文件、追溯脚本逐文件相同），共享规则 `review-assurance`、`document-amendments`、`workflow-execution` |
| 评审者 | 独立的 Claude 评审会话（委托子任务），不与契约作者会话或前几轮评审会话共享上下文；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-08 |

## 2. 结论

- **结论：CHANGES_REQUESTED**（P0 0 项；P1 1 项，为新发现；P2 8 项，均为新发现）。
- **第 2 轮问题**：
  - APIR2-P1-01 **部分关闭**：两侧各自状态的表达（`SkillSide`、`Skill.perAgent`、顶层取 Codex 侧、按侧启禁并核对该侧 `revision`）已关闭。但修订新写的“更新、移除、恢复作用于真实目录、可移除性取两侧交集、`agent` 取 `codex`”与 PRD AC-005、HLD 3.4、0.10.2 的链接语义以及同一节的顶层字段规则冲突，本轮用真实 0.10.2 代码实验证实。这一残余记为新问题 **APIR3-P1-01**，不重复计数。
  - APIR2-P2-01～11 **全部已关闭**。其中 P2-02、P2-03、P2-04、P2-09、P2-10 在处理中带出新的精度问题，另列为 APIR3-P2。
- **0.10.3 冻结面**：36b 4.2、4.7、6.2、7.3 的改动可实现、可测、无歧义，与真实 0.10.2 `bootstrap.mjs`、`self-update.mjs` 的结构相容。36a、36b 中随 0.10.3 冻结的部分没有未关闭的 P0/P1。
- **HLD 11A 条件 1：未满足。** 原因只有一项：APIR3-P1-01 位于条件 1 明列的“多 Agent 字段形态”，契约评审尚未通过。本轮没有发现 K3、固定子目录或转交链第 3 步不可行，“回到 HLD 增量复审”的触发条件不成立。
- **范围**：v0.3 在 PRD 0.9、HLD v1.4 与 Owner 决定的授权内。新增的 0.11.x 义务（迁移失败后快速拒绝、任务记为 `ready`）属于工程层面的兼容义务，第 2 轮与 HLD 第 11 轮报告都建议过，不需要 Owner 另行决定。
- **证书**：契约未通过评审，本轮不签发契约准出证书。HLD 证书的绑定见 HLD 第 12 轮报告。

## 3. 基线与 Guardrails

| 项 | 结果 |
|----|------|
| 契约可访问 | 是。四个文件完整读取；改动部分逐行核对 |
| PRD、HLD 基线 | PRD 0.9（措辞修正后）、HLD v1.4，摘要见第 1 节。两者的改动只是同步与措辞，没有改需求或设计决定（见 HLD 第 12 轮报告） |
| 协议类型 | 文件格式（36a）、进程间 / 命令行（36b）、HTTP（36c） |
| Lint | 不适用：没有 OpenAPI/AsyncAPI 文件；追溯规范 v1 没有 API profile，契约不带 metadata 不计缺陷。PRD、HLD 的 `trace_lint --strict` 与 RTM 已运行，结果见 HLD 第 12 轮报告 |
| Guardrails trigger check | `no_trigger`。v0.3 仍只约束 SkillDock 自身各版本之间的文件、进程与 HTTP 接口 |

## 4. 第 2 轮问题逐条核对

| 原 ID | 本轮结论 | 依据 / 证据 | 残余 |
|-------|---------|------------|------|
| APIR2-P1-01 共用技能的分 Agent 状态 | **部分关闭** | 36c 第 140～155 行 `SkillSide`；第 174 行 `perAgent` 只用于共用技能；第 183 行顶层取 Codex 侧、顶层不出现 `visibility`、`enablement`；第 184 行两侧状态独立；第 185 行启禁按侧执行、核对该侧 `revision`，不带 `agent` 的请求按 Codex（1 版客户端）。这些足以表达“Codex 启用、Claude 关闭”“Claude 侧被托管锁定、Codex 侧可写”“两侧路径与作用域不同”等情形，满足 PRD 5.2.2、5.6（Claude 侧显示实际档位）与 MR-SDX-001 | 第 186 行的写语义与 AC-005、HLD 3.4、0.10.2 链接语义及第 183 行冲突，转为 **APIR3-P1-01** |
| APIR2-P2-01 退避定义 | 已关闭 | 36b 7.3 第 233～237 行：失败含发起前失败；触发键只取 `context.json` 的 `digest`，通知只清零；计数只在内存中；等待判断在完整刷新之前；新增 U-04。逐项可在 `self-update.mjs` 结构上实现（见 5.2 节） | 计数口径的措辞见 APIR3-P2-08(f) |
| APIR2-P2-02 迁移失败后被反复重启 | 已关闭 | 36b 7.4 第 251 行新增 0.11.x 义务与 G-11；记录位置 `<state>/compat/migration-failure.json` 不在 0.10.x 的读取范围内（核对 0.10.2 `rootsFor` 与 36a 第 7、8 节） | 30 分钟到期后的周期性停止与拒绝时点见 APIR3-P2-01 |
| APIR2-P2-03 源码布局约束不全 | 已关闭 | 36b 7.4 第 242～246 行补全第 2 轮列出的 (a)～(d)；G-10 改为“以 0.10.2 冻结代码的 `prepareRuntime`、`verifyRuntime` 实测” | 本轮实验 T 又发现 tar 路径长度等约束，见 APIR3-P2-03 |
| APIR2-P2-04 任务记为 `ready` | 已关闭 | 36b 7.4 第 248 行；36c 第 73 行；G-08 第 435 行。写法与 0.10.2 `launch.mjs:184` 的 `ready` 记录一致，与 0.10.x 界面判断（`useRuntimeConnection.ts:33、44`）相容（见 5.3 节） | 其他失败出口的终态见 APIR3-P2-02 |
| APIR2-P2-05 门槛判定早于工具链 | 已关闭 | 36b 7.4 第 249 行：“在解析工具链、下载 Node、准备运行目录与停止旧实例之前” | — |
| APIR2-P2-06 bootstrap 无条件转发信号 | 已关闭 | 36b 4.2 第 62 行：只由运行转交链的进程在等待被调用方期间转发；未触发时与 0.10.2 相同。与 0.10.2 `bootstrap.mjs:43-46`（以子进程运行 `launch.mjs`、不处理信号）和 `native-backend.mjs:117-118`（`execFile` 超时只向 `/bin/sh`，即 exec 后的 bootstrap 发信号）一致 | 新规则缺少用例，见 APIR3-P2-07 |
| APIR2-P2-07 回落细节 | 已关闭 | 36b 4.7 第 111、114 行重新读取启动记录；第 118 行 `projectNotSwitched` 按健康检查 `project` 判断；第 120 行与 6.2 第 168 行 stdout 超过 64 KiB 视为失败 | 超限后是否继续读取未写，见 APIR3-P2-07 |
| APIR2-P2-08 7.1、7.2 精度 | 已关闭 | 36b 7.1 第 215、216、221、222 行与 `self-update.mjs:37-79` 逐条一致（含“只由通知发起的失败不再重试”“每次处理待办都刷新”“发起前失败写 `failed` 但不调用启动器”）；7.2 第 226 行；U-03 前提 | — |
| APIR2-P2-09 附录前提与断言 | 已关闭 | S-01 加“实例未运行”（第 378 行），与 S-07 不再冲突；S-19、B-04 排除本安装缓存下的 ≥0.11（第 397、410 行）；前言加构建用例的网络断言豁免（第 347 行） | 豁免的修饰范围过宽，见 APIR3-P2-04 |
| APIR2-P2-10 卸载与移除 marketplace 的确认规则 | 已关闭 | 36c 7.1 第 201 行 `confirm` 覆盖卸载 Claude 插件、移除 Claude marketplace；第 231 行 `CONFIRMATION_REQUIRED` 错误体带 `nativeRules`；示例第 252 行；第 8 节第 278 行。限定为 Claude 对象，1 版客户端的 Codex 请求不受影响 | marketplace 没有 `revision`，见 APIR3-P2-05 |
| APIR2-P2-11 编辑 | 已关闭 | (a) 索引第 48～50 行版本为 0.2 / 0.3 / 0.3；(b) 36c 第 73 行“缺省、`null` 或对象”，与 0.10.2 `index.mjs` 用 `JSON.stringify` 省略 `undefined`、界面以假值处理 `null` 一致；(c) 36b 第 326 行冻结清单加入第 9 节 | — |

## 5. 重点核查

### 5.1 APIR2-P1-01：36c 第 6 节能否表达两侧状态，写语义是否自洽

**状态表达（已满足）**

| PRD 要求 | 契约承载 | 判断 |
|----------|----------|------|
| 5.2.2 一个对象可属于两个 Agent；AC-003 共用目录只出现一次 | `agents` 同时含两侧；ID 取 Codex 侧 | 满足（ID 随共用状态变化的问题见 APIR3-P2-06） |
| 5.2.2 安装范围、启用状态来源、保护状态按侧显示 | `SkillSide.scope`、`enablement`、`protection`、`reason` | 满足 |
| 5.6 Claude 技能显示实际档位，开关只在开 / 关之间，中间档先确认 | `perAgent.claude.visibility`；启禁按侧判断确认 | 满足 |
| AC-015、AC-016 不可操作的一侧显示原因 | `SkillSide.canToggle`、`reason` | 满足 |
| MR-SDX-001、36c 第 5 节：1 版客户端语义不变 | 顶层取 Codex 侧；不带 `agent` 的启禁按 Codex | 启禁满足；移除与更新不满足（APIR3-P1-01） |

**写语义（不自洽）**：实验 S 用真实 0.10.2 服务（`createService`，假的命令行适配器，`env -i` 临时 HOME）构造两种常见的共用布局：

| 布局 | 0.10.2 快照中的 Codex 侧记录 | `skill.remove` 的实际效果 |
|------|------------------------------|---------------------------|
| A：真实目录在 `~/.claude/skills/foo`，Codex 侧 `~/.agents/skills/foo` 为指向它的链接 | `isLink: true`、`removeKind: "link"`、`canRemove: true`、`canUpdate: false`，`reason` 为“此技能通过链接接入；移除只处理链接，更新请在真实来源目录进行。” | 只移走 Codex 侧链接；Claude 侧真实目录不变，**不影响 Claude** |
| B：真实目录在 `~/.agents/skills/bar`，Claude 侧为指向它的链接 | `isLink: false`、`removeKind: "directory"`、`canRemove: true` | 移走真实目录；Claude 侧链接悬空，**同时影响两侧** |

对应代码：`scanner.mjs:62、73-75`（链接只移除链接、链接不可更新）；`service.mjs:692-696`（`skill.remove` 移动的是发现路径 `path.dirname(record.path)`）；`service.mjs:221`（受管根之外的真实目录只允许启禁或移除直接链接，否则 `ROOT_BOUNDARY`）。

结论：36c 第 186 行“更新、移除与恢复作用于真实目录，一次操作同时影响两侧”只在布局 B 成立。详见 APIR3-P1-01。第 2 轮报告“最小修复”中的“作用于真实目录”一句没有区分链接情形，本轮以实验 S 更正。

### 5.2 36b 中随 0.10.3 冻结的改动

**4.2 信号规则（第 62 行）**

- 可实现：判定点 1 触发时，bootstrap 改为以子进程运行 0.11.x 启动脚本并在等待期间安装 SIGINT、SIGTERM 处理器；判定点 2、3 由 `launch.mjs` 做同样的事。未触发时 bootstrap 保持 0.10.2 的结构（`bootstrap.mjs:43-46`），原生入口超时只终止 bootstrap（`native-backend.mjs:117-118` 用 `execFile` 的 `timeout`，`launch.sh` 以 `exec` 进入 bootstrap），`launch.mjs` 继续完成，与 0.10.2 相同。
- 无歧义。判定点 1 与判定点 2、3 在原生入口超时下的结局不同（前者终止 0.11.x 启动器，后者让它继续），这是规则的直接结果，记为范围外观察（第 9 节）。
- 可测：需要新增用例（APIR3-P2-07）。

**4.7 回落（第 111～120 行）、6.2（第 168 行）**

- 重新读取启动记录：正确，覆盖“被调用方已重启实例、换了 `pid` 或端口”。与 0.10.2 原生入口退出 0 后“重读记录再核实”（`native-backend.mjs:149-151`）一致。
- `projectNotSwitched`：只在 `P` 有效且规范路径不等于回落时健康检查的 `project` 时给出。第 113 行“没有可用目标”的分支，`P` 必然有效且不同，规则自然成立；第 111、114 行按规则判断，覆盖了“被调用方切换了项目但随后失败”的情形。
- stdout 超限：视为被调用方失败，与 4.7 的回落规则衔接（被调用方实际已成功启动时，重新核实成立，回落为“沿用实例”，退出 0）。超限后应继续读取并丢弃、等待被调用方退出；0.10.3 不设超时，若停止读取，被调用方会阻塞在写 stdout 上。文中未写，见 APIR3-P2-07。

**7.3 退避（第 233～237 行）与 `self-update.mjs` 的结构**

| 契约条目 | 在 0.10.2 结构上的落点 | 判断 |
|----------|----------------------|------|
| 失败的范围 | 两处：工作进程 Promise 的拒绝分支（第 68～72 行，启动器非 0 退出或 `spawn` 出错）；外层 `catch`（第 77～80 行，`installationIdentity`、`captureSource`、安装身份不匹配、启动记录读取出错） | 可实现。`pauseForRestart` 返回假、记录不一致、目标与记录摘要相同等提前返回都不写 `failed`，不计入，与 7.3 一致 |
| 触发键与通知 | 0.10.2 只在 `!pending` 时读 `context.json`（第 37～41 行）；0.10.3 须每个周期都读以观察触发键。通知（`request()`）只清零 | 可实现。通知只在 `executeRequest` 的六类本地操作之后发出（`service.mjs:1006`）；服务内调度器 `startTimer: false`，后台定时更新在独立进程运行，不会向服务发通知，所以清零来自用户操作，不会被自动更新反复触发 |
| 等待判断在刷新之前 | 放在第 43 行门控之后、第 54 行 `snapshot('local', true)` 之前 | 可实现；等待期间不调用 `pauseForRestart`、不写 `restart.json` |
| 计数只在内存中 | 协调器闭包内的变量 | 可实现；恢复出的旧服务从零开始，由 7.4 的快速拒绝兜住 |
| 可测性 | U-01、U-02、U-04 | 需要给协调器加可注入时钟（现有只有 `pollMs`、`worker`、`startTimer`），属于实现细节 |

结论：7.3 可实现、可测、无歧义。唯一的措辞问题是“写下 `status: "failed"`”：0.10.2 在被调用方已写 `failed` 时不再改写（第 71 行），计数宜按“本次处理的结果为失败”计，而不依赖由谁写入（APIR3-P2-08(f)）。

### 5.3 36b 7.4 中新增的 0.11.x 义务

**源码布局（第 242～246 行）**：第 2 轮的 (a)～(d) 均已写入。实验 T 用真实 0.10.2 `source-bundle.mjs`，在 `src/` 下放一个目录前缀约 188 字节的文件：`captureSource` 成功，`materializeRuntime` 报“源码路径超过 tar 格式限制”。0.10.2 还只接受普通文件与目录、跳过 `.env*` 与 `.DS_Store`，并在构建后逐文件比较内容与权限（不只是数量）。G-10 作为黑盒判据能兜住这些条件，文字宜补（APIR3-P2-03）。

**重启任务记为 `ready`（第 248 行）**

- 成功后，运行中的是 0.11.x 服务，0.10.x 原生界面读的是 0.11.x 健康检查的 `restart`。0.10.2 的 `status()`（`self-update.mjs:86-90`）在 `sourceDigest` 等于自身摘要时直接报 `ready`；0.11.x 不要求摘要算法一致，所以必须显式记为 `ready`。写法“`ready`，含 `pid`、`completedAt`”与 0.10.2 `launch.mjs:184` 一致；`readRestart` 不做字段校验，多余或缺少 `updatedAt` 都不影响读取。
- “失败并恢复旧实例时记 `failed`，带 `restored: true`”：恢复出的 0.10.x 服务的 `status()` 因 `sourceDigest`（目标版本）不等于自身摘要，原样返回 `failed`、`message`、`restored`；界面显示失败信息，不暂停（`useRuntimeConnection.ts:44`）。一致。
- 缺口：恢复失败、或尚未停止旧实例就失败时没有规定终态（APIR3-P2-02）。

**门槛失败的非交互路径（第 249 行）**：“在解析工具链、下载 Node、准备运行目录与停止旧实例之前”，与 36a 第 8 节“门槛通过前只写 0.10.x 不读取的位置”一致，可实现：门槛判定只需要只读文件与宿主命令行，不需要 npm 或运行目录，可放在 bootstrap 解析参数之后。

**迁移失败后的快速拒绝（第 251 行）**

- 能打断“立即再发起 → 停止 → 迁移失败 → 恢复”的循环：0.10.2 逐秒重试与 0.10.3 恢复后清零的重试，在 30 分钟内都会在停止旧实例之前被拒绝，只剩 Q10 级别的快速失败；拒绝时 0.11.x 不写 `restart.json`，由仍在运行的旧协调器记失败。
- 记录位置 `<state>/compat/migration-failure.json`：0.10.2 只把 `<state>/compat/legacy-project` 当作项目目录，从它向上查找 `.git`、扫描 `.agents/skills`、`.codex/skills`，不读该文件；0.10.3 只读 36a 列出的文件。成立。
- 没有完全兜住：确定性的迁移失败会让实例每 30 分钟被停止和恢复一次；拒绝时点只写“停止旧实例之前”，比门槛路径晚（APIR3-P2-01）。

### 5.4 附录 A 的改动

| ID | 判断 | 备注 |
|----|------|------|
| S-01 | 正确；与 S-07 不再冲突 | — |
| S-19、B-04 | 正确；排除了第 1 步 | — |
| U-03 | 正确；前提与实验 B2、B3 一致 | — |
| U-04 | 正确；对应 7.3“失败的范围” | 排在 U-03 之前（APIR3-P2-08(c)） |
| G-08 | 正确；“任务最终记为 `ready`，界面不停在‘重启中’”可断言 | G-08 必然改写计划文件，与前言的“计划文件哈希不变”冲突（APIR3-P2-04） |
| G-10 | 正确 | 文字约束见 APIR3-P2-03 |
| G-11 | 能从 7.4 推出；需要 0.11.0 提供迁移失败的注入手段与可控时钟 | 宜补断言（APIR3-P2-01(c)） |
| 前言网络断言的豁免 | 方向正确 | “除需要构建的用例外”修饰了全部四项断言，与末句“只豁免‘npm 缓存为空’一项”冲突（APIR3-P2-04） |

### 5.5 36c 的其他改动

- **`CONFIRMATION_REQUIRED` 带 `nativeRules`**（第 231、252、278 行）：形态清楚，只扩展这一个错误码；界面在执行前可显示 AC-016 要求的原生规则。限定为 Claude 插件与 Claude marketplace，不会让 1 版客户端收到新错误码。
- **`confirm` 新覆盖的范围**（第 201 行）：卸载 Claude 插件（默认删除数据）、移除 Claude marketplace（会卸载其插件），与 PRD 5.6 一致。marketplace 没有 `revision`，确认后执行时无法核对确认框列出的受影响插件是否已变（APIR3-P2-05）。共用技能的移除不在覆盖范围内（APIR3-P1-01 第 4 点）。
- **`restart` 的形态**（第 73 行）：“缺省、`null` 或 `{id, status, message?, restored?}`”与 0.10.2 代码、0.10.x 界面一致。

### 5.6 与 HLD v1.4 的一致性

- HLD 3.7 第 695 行新增的两项义务（迁移失败后快速拒绝、任务记为 `ready`／失败恢复记 `failed` 带 `restored`）与 36b 7.4 一致。
- HLD 5.1 错误行（第 838 行）、5.4 调用约定行（第 868 行）已与 36c 第 5 节、36b 6.1 一致。
- HLD 3.4（第 634、635 行）写明 Claude 独立技能“完全复用现有文件事务与来源记录”“来源记录按 Agent 分区保存”。这与 PRD AC-005 一致，36c 第 186 行偏离了它（APIR3-P1-01），HLD 不需要修改。
- HLD 5.4 最后一行的 0.11.x 义务摘要未同步新增的两项，记为 HLD 第 12 轮的 P2。

## 6. 问题清单

### 6.1 汇总

| ID | 级别 | kind | 位置 | 问题 | 影响条件 1 |
|----|------|------|------|------|-----------|
| APIR3-P1-01 | P1 | defect | 36c 第 183、186 行；索引第 161 行 | 共用技能的更新、移除与恢复写语义与 AC-005、HLD 3.4、0.10.2 链接语义及第 183 行顶层字段规则冲突（APIR2-P1-01 的残余） | 是（“多 Agent 字段形态”）；不影响 0.10.3 冻结面 |
| APIR3-P2-01～08 | P2 | defect / optional | 见 6.3 | 精度、可测性、编辑 | 否 |

### 6.2 P1 详情

**APIR3-P1-01 共用技能的更新、移除与恢复写语义自相矛盾，且与链接语义冲突**

- **依据**：
  - PRD AC-005（第 1292 行）“移除可恢复；链接只移除链接”；REQ-SDX-005 验收（第 110 行）“链接只移除链接本身”；AC-003“更新或移除**前**提示同时影响两侧”。
  - HLD 3.4（第 634、635 行）：Claude 独立技能的更新、可恢复移除、恢复“完全复用现有文件事务与来源记录”，来源记录按 Agent 分区保存。
  - 0.10.2 代码与实验 S（5.1 节）：链接一侧只移除链接、不可更新；只有发现路径就是真实目录的一侧，移除才会影响另一侧。
  - 36c 第 5 节第 85、88 行：不得改变 1 版客户端可见的行为。
- **缺陷**：
  1. 第 186 行“作用于真实目录，一次操作同时影响两侧”在布局 A 不成立。按 AC-005 与 0.10.2，移除 Codex 侧只移除链接，Claude 侧不受影响。若按字面移除真实目录，要越过 Codex 受管根（`ROOT_BOUNDARY`）移走 Claude 根中的目录，而界面显示的顶层 `reason`（按第 183 行取 Codex 侧）正写着“移除只处理链接”；1 版客户端看到的移除行为也随之改变。
  2. 第 183 行规定顶层 `canRemove`、`reason` 取 Codex 侧；第 186 行又规定“可移除性取两侧的交集，`reason` 说明是哪一侧”。同一字段两条规则。
  3. 更新：链接一侧 `canUpdate` 为 `false`；真实目录在 Claude 根时，只有 Claude 侧能更新，来源记录也在 Claude 分区。第 186 行把 `UpdateTarget.agent` 固定为 `codex`，这类共用技能就无法更新。`SkillSide` 没有 `canUpdate`、`removeKind`（或 `isLink`），界面无法分别显示两侧的更新与移除能力。
  4. AC-003 要求“前”提示。单个 `skill.remove` 没有预览，第 186 行“预览或确认结果”中的 `NativeRule` 只能随执行结果返回；第 201 行 `confirm` 的覆盖范围不含共用技能。若对 2 版客户端改用 `CONFIRMATION_REQUIRED`，还须写明 1 版客户端保持 0.10.2 行为（第 5 节）。
  5. 以 `agent: "codex"` 更新或移除共用技能会改动 Claude 侧可见内容，但是否须带、带哪一侧的 `expectedRevision` 未定义（第 204 行只写“Claude 对象的写请求必须带”）。
- **影响**：0.11.0 实现者面对一个会移动用户目录的写操作，只能在冲突的规则中自选；按字面实现会越过受管根，并与界面显示的原因相反。不影响 0.10.x 与 0.10.3 的冻结面。
- **最小修复**（只改 36c 第 6 节对应几行与 `SkillSide`，不改边界）：
  - 移除、恢复按请求的 `agent` 作用于**该侧的发现路径**，沿用 0.10.2 与 AC-005：该侧是链接就只移除链接，只影响该侧；该侧发现路径就是真实目录时移走目录，另一侧随之失效，这时才需要“同时影响两侧”的提示。`ActionResult.agent` 为请求的一侧；不带 `agent` 的请求按 Codex（1 版）。
  - 更新作用于真实目录，只能经“发现路径就是真实目录、且有来源记录”的一侧发起（该侧 `canUpdate`），`UpdateTarget.agent` 取该侧；预览带 `kind: "scope"` 的 `NativeRule`。
  - `SkillSide` 增加 `canUpdate` 与 `removeKind`（或 `isLink`）。删去“可移除性取两侧交集”；顶层 `canRemove`、`canUpdate`、`reason` 只表示 Codex 侧（1 版语义），每侧能力看 `perAgent`。
  - 写明移除前提示的来源（2 版客户端用 `CONFIRMATION_REQUIRED` 加 `nativeRules`，或由客户端按 `perAgent` 生成），以及 1 版客户端保持 0.10.2 行为；写明这类写请求核对哪一侧的 `revision`（建议核对两侧，1 版请求免带）。
  - 补用例：布局 A、B 各一条，覆盖移除、更新与两侧状态不同的启禁，放在 0.11.0 关口（HLD 3.13A 已列这一维度）。
  - 若一侧是插件附带技能（例如 Codex 用户技能链接到 Claude 插件中的技能目录），写明是否按共用对象处理。
  - 若作者希望“移除共用技能”同时从两侧移除（含移除另一侧的链接），这超出 AC-005，须交产品 Owner 决定。

### 6.3 P2（不阻断，不按数量计入准出）

| ID | 位置 | 问题与建议 |
|----|------|-----------|
| APIR3-P2-01 | 36b 7.4 第 251 行；G-11 | 迁移失败后的快速拒绝：<br>(a) 30 分钟到期后，确定性的迁移失败会让实例每 30 分钟被停止和恢复一次（0.10.2 逐秒重试恰在到期时命中，0.10.3 退避后也会命中）。建议同一目标连续失败时加倍拒绝窗口（可沿用 7.3 的曲线并设上限），或在交互重试成功、目标变化之前不按时间解除。<br>(b) 拒绝时点只写“停止旧实例之前”。宜与门槛失败路径相同，即“解析工具链、准备运行目录之前”；否则在 0.10.2 逐秒重试下，30 分钟内每秒都会重新解析工具链并核验运行目录（`verifyRuntime` 每次读取并哈希全部源码文件）。<br>(c) G-11 宜加断言：不写 0.10.x 读取的文件；交互入口不受限；窗口到期或目标变化后的行为 |
| APIR3-P2-02 | 36b 7.4 第 248 行；36c 第 73 行；G-08 | 只规定了成功（`ready`）与“失败并恢复旧实例”（`failed`，`restored: true`）。0.10.2 `launch.mjs:187-193` 对接受任务后的任何失败都写 `failed`，`restored` 按实际取值。0.11.x 宜同样：恢复失败、或尚未停止旧实例就失败时，也写终态 `failed`（`restored` 为 `false` 或省略），不得停在 `preparing`、`restarting`。旧实例未恢复时没有 0.10.x 协调器代写失败；之后起来的服务若按 `restart.json` 报告（0.10.2 `status()` 对非 `ready` 状态原样返回，`self-update.mjs:86-90`），0.10.x 界面会一直显示“重启中”并暂停操作。另宜写明 0.11.x 健康检查的 `restart` 由 `restart.json` 派生，不使用摘要相等的捷径 |
| APIR3-P2-03 | 36b 7.4 第 242～246 行；G-10 | 源码布局还缺几项实测约束：<br>(a) tar 路径限制：文件名超过 100 字节或目录前缀超过 155 字节时，0.10.2 `materializeRuntime` 失败（`source-bundle.mjs:75-79`；实验 T）；<br>(b) 只接受普通文件与目录，跳过 `.env*`、`.DS_Store`（第 34、44 行）；<br>(c) “构建不得新增文件”应为“不得新增或修改文件与权限”（第 141～142 行逐文件比较）；<br>(d) 构建在 0.10.x 选用的 Node 下运行（`runtime.mjs:37-41` 用 `process.execPath`）。<br>G-10 作为黑盒判据能兜住，文字宜补 |
| APIR3-P2-04 | 36b 附录 A 前言第 347 行；G-08；索引第 85 行 | “除需要构建的用例外，每条用例都要断言：计划文件哈希不变；后台注册未变；未联网；记录运行命令……”按字面，N-03、N-08、G-08、G-10 四项断言都被豁免，与末句“只豁免‘npm 缓存为空’一项”冲突，也削弱了索引第 85 行赖以承接 MR-SDX-002 的“计划文件哈希断言”。另外 G-08 会迁移，计划文件必然改写，本来就不能断言哈希不变。建议：前言只豁免“npm 缓存为空”；会迁移的用例改为断言计划内容按 36a 第 8 节无损迁移 |
| APIR3-P2-05 | 36c 第 175、201、204 行；7.3 第 226、231 行 | `Marketplace` 没有 `revision`，第 204 行却要求“Claude 对象的写请求必须带 `expectedRevision`”。按字面，Claude marketplace 的刷新、移除无法满足；按宽松理解，确认移除后执行时无法核对确认框列出的受影响插件是否已变（AC-016“写操作前重新读取；发现在 Claude 界面中做过的改动时停止并提示”）。建议给 `Marketplace` 加 `revision`（覆盖从它安装的插件集合），或写明执行前重新计算受影响插件、与确认时不同就再次返回 `CONFIRMATION_REQUIRED`。并写明哪些写请求须带 `expectedRevision`（只对已存在、带 `revision` 的对象） |
| APIR3-P2-06 | 36c 第 182、191 行；索引 Q-A3 第 123 行 | 对象 ID 随共用状态变化：只属于 Claude 的技能用 `claude:skill:…`，用户再从 Codex 链接它后变为 Codex 侧 ID；反之亦然。来源记录（HLD 3.4 按 Agent 分区）、计划目标与操作记录若按 ID 关联，会在转换时失联，与 Q-A3“变更须保持已有计划目标可解析”冲突。建议写明按真实路径把旧 ID 解析到共用对象，或登记为已知限制 |
| APIR3-P2-07 | 36b 4.2、4.7、6.2；附录 A | 本轮新增的 0.10.3 冻结规则缺少期望结果行：<br>(a) 被调用方重启实例、换了 `pid` 或端口后失败，回落用新记录核实；<br>(b) 被调用方 stdout 超过 64 KiB：有运行实例时回落退出 0，没有时退出 1；<br>(c) 信号：未触发转交链时原生入口超时，`launch.mjs` 照常完成；判定点 1 触发时 SIGTERM 转发给被调用方。<br>另在 4.7 写明超限后继续读取并丢弃、等待被调用方退出，不主动终止 |
| APIR3-P2-08 | 多处 | 编辑与精度：<br>(a) 索引第 10 节变更记录中 0.3 行排在 0.1、0.2 之间（第 129～131 行）；<br>(b) 索引第 108、109 行未列 U-04、G-11；<br>(c) 附录 A.3 中 U-04 排在 U-03 之前；<br>(d) 36c 第 185 行“`skill.toggle` 必须带 `agent`”与同句“不带 `agent` 按 Codex 处理”宜写成“2 版客户端必须带”；<br>(e) 写明 `perAgent` 是否只在 `multiAgent=1` 时给出；<br>(f) 36b 7.3 第 233 行宜改为“本次处理的结果为失败即计入”，不依赖由谁写入 `failed`（0.10.2 `self-update.mjs:71` 在被调用方已写 `failed` 时不再改写） |

## 7. HLD 11A 条件 1 的判断

**未满足。**

- 条件 1 要求：5.4 全部项、3.13A 期望结果表与 `contracts.ts` 相关增量（含多 Agent 字段形态）在契约中定稿并通过独立契约评审；首轮契约评审的 APIR1-P1-01～04 须在复审中关闭。
- 本轮：APIR1-P1-01～04 已在第 2 轮关闭；APIR2-P1-01 的状态表达部分已关闭，写语义残余 APIR3-P1-01 仍位于条件 1 明列的“多 Agent 字段形态”，契约评审未通过。
- 0.10.3 冻结面（36a 全文；36b 第 3～6.2、7.3、8～10 节）没有未关闭的 P0/P1。0.11.x 义务（36b 6.3、7.4）只有 P2。APIR3-P2-07 涉及随 0.10.3 冻结的行为的用例，宜在 0.10.3 编码前补上。
- 本轮没有发现 K3、固定子目录或转交链第 3 步不可行，条件 1 的“回到 HLD 增量复审”不触发。
- 修订 APIR3-P1-01 后，只需对 36c 第 6 节相应几行、`SkillSide` 及其直接影响（7.1 `confirm`、`expectedRevision`，以及新增用例）做一次 delta 复审，不需要重审 36a、36b。

需要 Owner 决定的事项：**没有必须由 Owner 决定的事项。** 以下可供 Owner 斟酌：

- 这是第三轮只剩 0.11.0 HTTP 问题阻塞 0.10.3 编码。若希望先开始编写 0.10.3，可把条件 1 拆成“0.10.3 冻结面（0.10.3 编码前）”和“0.11.0 HTTP 字段形态（0.11.0 编码前）”。这会修改 HLD 11A，须由 Owner 决定并按条件 5 做 HLD 增量复审。直接修 APIR3-P1-01 也只是几行。
- APIR3-P1-01 若选择“移除共用技能同时从两侧移除”，超出 AC-005，须由产品 Owner 决定。
- APIR3-P2-01 若作者不改窗口规则而选择登记“每 30 分钟停止并恢复一次”为残留，须交 Owner 知悉。

## 8. 实际运行的命令与结果

所有实验都在 `scratchpad/verify/r12-lab/` 下进行：

- 使用 `env -i HOME=<lab>/run/<情形>/home CLAUDE_CONFIG_DIR=<…>/.claude CODEX_HOME=<…>/.codex SKILLDOCK_STATE_DIR=<…>/.local/share/skilldock PORT=57071 PATH=/usr/bin:/bin` 与本机已有的 Node 22.14.0；
- `57071` 是本轮用 `net.createServer().listen(0)` 找到的空闲端口，实验前后用 `lsof` 确认没有监听。本轮实验不需要开端口，没有发出任何网络请求，没有向 `127.0.0.1:4771` 发出任何请求。

| # | 命令 | 结果 |
|---|------|------|
| 1 | `shasum -a 256`：四个契约文件、PRD、HLD（开始与结束各一次） | 见第 1 节，与委托说明的前缀一致，两次相同 |
| 2 | `git rev-parse HEAD`、`git branch --show-current`、`git status --short`、`git diff --quiet ad96e3f -- assets scripts` | HEAD `ad96e3f`，分支一致；冻结代码未改动 |
| 3 | `diff scratchpad/contract-v02/<文件> <工作区文件> \| cmp - <委托 diff>`（三份）；36a 直接 `diff` | 三份逐字节相同；36a 无差异 |
| 4 | `git show ad96e3f:<路径>`：`scanner.mjs`、`service.mjs`、`self-update.mjs`、`launch.mjs`、`bootstrap.mjs`、`launch.sh`、`native-backend.mjs`、`installation.mjs`、`useRuntimeConnection.ts`、`contracts.ts`、`source-bundle.mjs`、`runtime.mjs`、`paths.mjs` | 用于第 4、5 节的代码核对 |
| 5 | `git archive ad96e3f plugins/skilldock \| tar -x -C verify/r12-lab/export`；`node_modules` 以符号链接指向工作区已有目录 | 真实 0.10.2 代码副本（未下载、未安装） |
| 6 | `node freeport.mjs` 与 `lsof` | 空闲端口 57071 |
| 7 | `node expS.mjs <app> A` 与 `B`（实验 S：真实 `createService`，假命令行适配器，`background: false`） | 见 5.1 节表格；输出 `expS-A.out`、`expS-B.out` |
| 8 | `node expT.mjs <app 副本> <运行目录>`（实验 T：真实 `captureSource`、`materializeRuntime`，副本 `src/` 下加一个长路径文件） | `captureSource` 成功（157 个条目）；`materializeRuntime` 报“源码路径超过 tar 格式限制”；输出 `expT.out` |
| 9 | `pgrep -fl r12-lab`、`lsof` | 无残留进程，实验端口无监听 |

追溯脚本的运行见 HLD 第 12 轮报告。

## 9. 未审范围、约束遵守与披露

**范围外观察（不计入本轮）**：

- 索引第 3 节第 36、38 行引用“36b 第 10 节”（核验实际在第 5、11 节）、“36b 第 11 节”（冻结清单实际在第 12 节），v0.2 已有，建议顺手更正。
- 判定点 1 触发时，原生入口 600 秒超时的 SIGTERM 会转发给 0.11.x 启动器，而 6.3 没有写 0.11.x 收到 SIGTERM 时的义务（v0.2 起如此，由 590 秒上限缓解）。判定点 2、3 触发时 bootstrap 被终止，`launch.mjs` 与被调用方继续。两种结局不同，属于已接受的设计；建议 0.11.x 的迁移在可恢复点响应终止。

**未能核实**：

- 0.10.3 与 0.11.x 尚不存在，转交链、退避、快速拒绝与 `ready` 记录的真实行为只能按契约推演，由 V20 与兼容测试矩阵把关。
- 实验 S 只验证了 0.10.2 的 Codex 侧语义；Claude 侧的发现与写入由 0.11.0 实现，本轮按 HLD 3.4“复用现有文件事务”推断。
- 36c 依赖的 Claude 命令行 JSON 输出与设置原始取值（Q-A2、Q-A3）本轮未核实；`contracts.ts` 的增量尚未写入。

**约束遵守**：

- 仓库中只新增本报告与 `35-cross-agent-hld-review-r12.md`；未修改 PRD、HLD、契约或其他仓库文件；未 commit、push，未切换分支。
- 临时文件只写在 `verify/r12-lab/` 下（导出副本、实验脚本与输出、追溯结果）。读取了 `verify/r11-lab/r11-rtm.json` 作比较，未改动它。
- 未下载、未安装任何东西。
- 在 `~/.claude` 下只读取了 `plugins/cache/testany-agent-skills/testany-eng/` 中的评审技能、共享规则与追溯脚本（评审标准本身）及版本目录名；未读取任何配置文件。未读取 `~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`。
- 未启动、停止或访问真实的 SkillDock 实例；实验中的 0.10.2 服务对象只在临时 HOME 内运行，没有监听端口；未运行 Claude 或 Codex 命令行。
- 本报告不含凭证。

## 10. 最小下一步

1. 契约作者修订 APIR3-P1-01（36c 第 6 节共用技能的写语义与 `SkillSide`），P2 可一并处理。其中 APIR3-P2-07 关系到 0.10.3 关口用例，建议在 0.10.3 编码前处理。
2. 对修订部分做一次 delta 复审：36c 第 6 节相应几行、7.1 的直接影响与新增用例；若处理了 P2，加上 36b 7.4 与附录 A 的对应行。通过后条件 1 满足，可以开始编写 0.10.3。
