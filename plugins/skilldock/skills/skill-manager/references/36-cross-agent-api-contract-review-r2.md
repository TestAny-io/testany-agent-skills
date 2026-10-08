# API 契约复审报告（第 2 轮，delta）：API-SDX-001 v0.2

> 本报告是评审意见，不是批准。它回答三件事：首轮问题 APIR1-P1-01～04、P2-01～11 是否关闭；v0.2 的修订有没有引入新问题；HLD-SDX-001 11A 条件 1 是否已满足。本报告不授权编写 0.10.3 或 0.11.x，也不授权提交、推送、发布或任何环境操作。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 评审对象 | API-SDX-001 v0.2，工作区未提交（分支 `docs/skilldock-cross-agent-prd`，HEAD `ad96e3f`）。评审开始与结束时各算一次 sha256，两次相同：<br>`36-cross-agent-api-contract.md`（索引）`d1ff30b161c07f5b7d718286e506cbd123041ed5d3abfb1b558f723801f476a4`<br>`36a-cross-version-file-formats.md` `a4dd81b456443c8472244ee0a4a0b006e95de147233c9e88e8ca3f2d9c278ed4`<br>`36b-launcher-handover-protocol.md` `29d1527fc96311d148873d2e8eec534d4a23babb3fa8a5e8a817c7bc540b4504`<br>`36c-http-api-delta.md` `13606ac7ce86cb489245f78e750104ef6461d7524b63e89540d13dd6d041b6a1` |
| 上游基线 | PRD-SKILLDOCK-002 v0.9（工作区，sha256 `783416668932892a1bf6b0a2554d06981eeba0b75c38f16ecd3b3fd19e891f51`，与委托说明一致）；HLD-SDX-001 v1.3（工作区，sha256 `de618a401c0e422e4ad1dafcc5fc7dd016963d282a13a3d44ea1f117bafd3d65`，与委托说明一致）。两者的增量核对见 [35-cross-agent-hld-review-r11.md](35-cross-agent-hld-review-r11.md) |
| 冻结代码事实源 | SkillDock 0.10.2：`git show ad96e3f:` 下的代码。工作区 `plugins/skilldock/skills/skill-manager/` 的 `assets/`、`scripts/` 与 `ad96e3f` 无差异（`git diff --quiet`）。实验用 `git archive ad96e3f plugins/skilldock` 导出的副本 |
| 上一轮 | [首轮契约评审](36-cross-agent-api-contract-review.md)：CHANGES_REQUESTED，APIR1-P1-01～04、P2-01～11 |
| 模式 | `delta`。首轮是覆盖四个文件全部内容的 `initial` 评审，其中经代码实验证实的结论（K3、`installation` 键顺序、`digest`、`url`、原生入口调用约定主体、来源规范化等）本轮直接沿用。v0.1 没有留存副本，因此本轮按首轮问题 ID 逐条核对 v0.2 全文；36b 本次整份重写，按全文重新阅读；新增的 36b 第 7 节与附录 A 新增、修订用例逐条核对 |
| 采用标准 | testany-eng `api-reviewer`，共享规则 `review-assurance`、`document-amendments`、`workflow-execution`。2.7.1 与 2.5.0 的 `skills/api-reviewer`、`skills/hld-reviewer`、`review-boundaries`、追溯脚本逐文件相同；2.7.1 缺 `document-amendments.md`，按 2.5.0 的同名文件执行 |
| 评审者 | 独立的 Claude 评审会话（委托子任务），不与契约作者会话或前几轮评审会话共享上下文；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-08 |

## 2. 结论

- **结论：CHANGES_REQUESTED**（P0 0 项；P1 1 项，为新发现；P2 11 项）。
- **首轮问题**：
  - APIR1-P1-01、P1-02、P1-04 已关闭；
  - APIR1-P1-03 的四个子项中，第 2～4 项已关闭；第 1 项改成了 `agents` 数组并规定去重，“归属多个 Agent”已能表达。但去重后的共用技能对象没有分 Agent 的状态字段，现有字段对它自相矛盾。这一残余作为新问题 APIR2-P1-01 跟踪，不重复计数；
  - APIR1-P2-01～11 全部已处理。其中几项在处理中带出新的精度问题，另列为 APIR2-P2。
- **HLD 11A 条件 1：未满足。** 原因只有一项：APIR2-P1-01 落在条件 1 明列的“多 Agent 字段形态”。0.10.3 发布即冻结的面（36a 全文、36b 第 3～12 节）已没有未关闭的 P0/P1。本轮没有发现 K3、固定子目录或转交链第 3 步（含兜底与 Claude 根目录记录）不可行，条件 1 中“回到 HLD 做增量复审”的触发条件不成立。
- **范围**：v0.2 在 PRD 0.9、HLD v1.3 与 Owner 决定（DG-NO-LLD、DG-RUNNING-PROJECT、DG-NO-RECORD、DG-BACKOFF）的授权内，没有发现未授权的职责、权限或数据范围扩张。36b 7.3 的退避参数（1 分钟起加倍，上限 30 分钟）与 PRD 0.9 Q10 的 Owner 决定一致。
- **可以保留的主体**（本轮实测或核对）：
  - 36b 第 7 节对 0.10.x 自更新协调器与后台入口的描述与冻结代码一致，有三处精度问题（APIR2-P2-08）；
  - 7.3 的退避可实现、可测，作为对 Owner 决定的落实成立，但“失败”的范围与状态寿命需写清（APIR2-P2-01、P2-02）；
  - 作者自查修正的 N-12、N-14、S-23 三处都正确，其中 N-14、S-23 由本轮真实代码实验证实。

## 3. 基线与 Guardrails

| 项 | 结果 |
|----|------|
| 契约可访问 | 是，四个文件完整读取 |
| PRD、HLD 基线 | PRD 0.9、HLD v1.3，摘要见第 1 节。两者的修订只登记残留与 Owner 决定，没有改需求本身（见 HLD 第 11 轮报告） |
| 协议类型 | 文件格式（36a）、进程间 / 命令行（36b）、HTTP（36c）；多协议索引齐全 |
| Lint | 不适用：没有 OpenAPI/AsyncAPI 文件；追溯规范 v1 没有 API profile，契约不带 metadata 不计缺陷。PRD、HLD 的 `trace_lint --strict` 与 RTM 已运行，结果见 HLD 第 11 轮报告 |
| Guardrails trigger check | `no_trigger`。v0.2 仍只约束 SkillDock 自身各版本之间的文件、进程与 HTTP 接口，不改变项目级默认规则 |

## 4. 首轮问题逐条核对

| 原 ID | 本轮结论 | 依据 / 证据 | 残余 |
|-------|---------|------------|------|
| APIR1-P1-01 第 2 步例外转入第 3 步后下游失败没有回落 | **已关闭** | 36b 4.3 第 2 步第二条（第 74 行）与 4.7 两行（第 113、114 行）：第 3 步没有目标时回落交还；被调用方失败时重新核实运行实例，成立则退出 0 并带 `projectNotSwitched` 与 `warning`，否则退出 1。第 1 步回落时项目不同同样带 `projectNotSwitched`（第 111 行）。附录 N-17、S-20 断言了回落。Owner 采纳“回落交还”，不登记新残留，与 HLD 第 10 节 DG-RUNNING-PROJECT 的新措辞一致 | 重新核实前应重读启动记录，`projectNotSwitched` 宜按健康检查判断（APIR2-P2-07） |
| APIR1-P1-02 N-12 与冻结代码矛盾 | **已关闭** | N-12（第 358 行）改为真实 0.10.2 行为：没有启动记录时调用自身启动器，失败显示固定错误，计划数据不变；归入 PRD 0.9 Q8（Owner 决定 DG-NO-RECORD）。0.11.x 补写启动记录的义务写在 36a 5.4（第 181 行）与 36b 6.3（第 204 行），并有 G-07。0.10.3 原生入口的情形另列 B-04。与首轮实验 N12 和 `native-backend.mjs:53-72`（无记录时 `launchRoot` 为自身）一致 | B-04 前提可能先命中第 1 步（APIR2-P2-09） |
| APIR1-P1-03 多 Agent 字段形态与 PRD 不符 | **部分关闭** | 第 2 项“启用状态来源”：`EnablementSource`（36c 第 129～136 行）满足 PRD 5.2.2、AC-002、AC-015。第 3 项 marketplace 自动更新：`Marketplace.autoUpdate`（第 160 行）与 `AgentEnvironment.notes` 满足 AC-002。第 4 项安装预览：`PluginInstallPreview` 增加作用域、依赖插件、manifest 归属与原生规则（第 161 行），满足 PRD 5.6。第 1 项：`agents?: Agent[]` 与去重规则（第 155、164～167 行）已能表达对象属于两个 Agent | 共用对象的分 Agent 状态未定义，转为 **APIR2-P1-01** |
| APIR1-P1-04 0.10.x 自更新与后台入口调用 0.11.x 未定义 | **已关闭** | 36b 第 7 节：7.1、7.2 写明冻结代码的事实（本轮实验 B、C 证实，见 5.1 节）；7.3 是 Owner 决定 DG-BACKOFF 的落实；7.4 写明 0.11.x 的五项义务；附录有 U-01～U-03、G-08～G-10。0.10.2 的反复重试登记为 PRD 0.9 Q10。HLD v1.3 扩充了 DEC-SDX-021，本轮做了增量复审 | 7.3、7.4 的精度问题见 APIR2-P2-01～05、P2-08 |
| APIR1-P2-01 `PORT` 优先级与错误变体 | 已关闭 | 36b 6.1 第 147、154 行；附录前言写明原生入口进程环境不带 `PORT` | — |
| APIR1-P2-02 调用链防护 | 已关闭 | 重入防护（4.1 第 54 行）；0.11.x 不调用较旧启动脚本、不取 `native-start.lock`（6.3 第 174～176 行）；bootstrap 转发信号（4.2 第 62 行）；S-21 | 信号转发改变了未触发转交链时的中断语义（APIR2-P2-06） |
| APIR1-P2-03 回落时 stdout 不止一个 JSON | 已关闭 | 0.10.3 缓存被调用方的 stdout，只在成功时写出（4.7 第 118 行、6.2 第 166 行）；0.11.x 非 0 退出不写 stdout（6.3 第 201 行） | 超过 64 KiB 时的处理未定义（APIR2-P2-07） |
| APIR1-P2-04 来源规范化细节 | 已关闭 | 36a 9.3 规则 0（第 270 行）：只接受 `https`、`http`、`ssh`；scp 识别条件；含 `?`、`#`、`%` 的地址不可核实。9.1（第 244 行）：Claude 记录只用 `source`、`repo`、`url`。复核了带凭证、带端口、`@` 位于路径中等写法，按规则都不会把其他仓库判成官方仓库 | — |
| APIR1-P2-05 条件 6 未比较 marketplace 名 | 已关闭 | 36a 10.2 条件 6（第 301 行）要求 marketplace 名相同。仓库 `.claude-plugin/marketplace.json` 的 `name` 与 Codex 侧记录的名称都是 `testany-agent-skills`，不影响跨 Agent 转交 | — |
| APIR1-P2-06 信任假设与已知限制 | 已关闭 | 36b 11 第 310 行；5.1 第 132 行 | — |
| APIR1-P2-07 HTTP 细节 | 已关闭 | (a) 36c 5 第 89 行：1 版客户端可能收到的三个错误码及其 `message` 要求。0.10.2 界面对未知错误码的处理（`i18n.tsx` `ServiceMessage`：中文原样显示 `message`；英日显示通用提示加原文）与契约描述基本一致。(b) `restart` 与 `/api/session` 对 1 版客户端冻结（第 73、79 行）。(c) 第 75 行。(d) `expectedRevision` 必填（第 184 行） | 示例 `"restart": null` 与“`undefined` 或对象”的写法不一致（APIR2-P2-11） |
| APIR1-P2-08 附录 A 表述 | 已关闭 | (a) S-17a/b；(b) S-01、S-05 退出码；(c) S-16 前提；(d) 附录前言：R 组直接运行 `launch.mjs`、需要 0.10.2 构建的用例预置运行目录；(e) N-14 改写；(f) N-16、S-19、S-22（原 G-04 移入）；(g) 第 2、11 节“除 0.10.2 原有的临时锁文件外” | S-01 与 S-07 仍有冲突；“未联网”断言与 G-10 冲突（APIR2-P2-09） |
| APIR1-P2-09 启动记录损坏时的提示 | 已关闭 | 36a 5.3 第 173 行、36b 4.1 第 52 行、S-23。本轮实验 A 证实（5.5 节） | — |
| APIR1-P2-10 若干未定义细节 | 已关闭 | (a) 36b 3 第 42 行；(b) 590 秒（第 201 行）；(c) 不转发 `--migrate-from`（第 163 行）；(d) 跳过显式值时写 stderr、不另弹提示（第 194 行）；(e) “运行实例的项目”= 健康检查 `project`（第 68、195 行）；(f) 五级都无效时非 0 退出（第 193 行） | — |
| APIR1-P2-11 编辑与精度 | 已关闭 | (a) 36a 12、36c 12 改为第 9 节；(b) 36a 5.2 规则 ① 改为“同源”；(c) 36a 8 第 231 行写明写入顺序；(d) 36c 7.4 示例；(e) 36a 3 第 36 行、36b 11 第 312 行写明 1 MiB 上限 | 索引“契约清单”中三个分册的版本仍写 0.1（APIR2-P2-11） |

## 5. 重点核查

### 5.1 36b 第 7 节对冻结代码的事实描述

用真实 0.10.2 代码做了三组实验（命令见第 8 节）。

**7.1 自更新协调器（`server/self-update.mjs`，实验 B）**

实验条件：插件形态的安装身份，`pollMs=100`，真实 `startWorker`。被调用的“0.11.0”是 0.10.2 源码的副本，`launch.sh` 换成只记录参数、工作目录与环境并以 1 退出的替身，模拟门槛拒绝。

| 契约条目 | 代码 / 实测 | 判断 |
|----------|------------|------|
| 运行位置、轮询 | `createSelfUpdater` 默认 `pollMs = 1000`（第 32 行） | 一致 |
| 何时发起 | `background/context.json` 的 `digest` 与 `SKILLDOCK_SOURCE_DIGEST` 不同，或 `request()`，即服务在 `plugin.update`、`plugin.checkUpdate`、`plugin.install`、`plugin.installSource`、`skill.update`、`marketplace.refresh` 之后发出的安装变化通知（`self-update.mjs:37-41`，`service.mjs:1006`，`index.mjs:14`）；还要求启动记录的 `pid`、`state`、`project`、`runtime` 与本服务一致（第 50 行） | 一致 |
| 目标与刷新 | 插件形态时，每次处理待办都调用 `service.snapshot('local', true)` 完整刷新（第 54 行），再用 `captureSource` 计算摘要，与**启动记录的 `digest`** 比较（第 60～61 行）。B1：`context.json` 的摘要不同、目标摘要与记录相同时，2 秒内完整刷新 19 次，没有发起 | 基本一致。“每次发起都做一次完整刷新”应为“每次处理待办都刷新，即使最后不发起”（APIR2-P2-08） |
| 任务记录、命令、环境 | B2 实测：`restart.json` 的键为 `id, source, sourceDigest, previousPid, url, status, requestedAt`，失败后增加 `message, completedAt`；命令为 `restart`，不带 `--project`；工作目录为服务项目；环境含 `PORT`（记录地址端口）、`SKILLDOCK_STATE_DIR`、`SKILLDOCK_PROJECT_DIR`、`SKILLDOCK_RESTART_JOB`、`CODEX_HOME` | 一致 |
| 失败处理 | `message` 为“重启启动器退出（1）。”，状态 `failed`（第 68～76 行） | 一致 |
| 重试 | B2：`context.json` 摘要不同、被调用方持续失败时，2 秒内发起 19 次（与首轮 3 秒 29 次一致）。**B3：没有 `context.json`、只发一次安装变化通知时，只发起 1 次，失败后不再重试。** B4：发起前就失败（目标源码树含链接，`captureSource` 拒绝）时，2 秒内完整刷新 19 次、写 19 次 `failed`，一次也没有调用启动器 | 0.10.2 只在 `context.json` 摘要与运行中服务不同的期间逐秒重试，契约的“目标摘要仍不同则下一个轮询周期再次发起”不够准确；发起前失败同样逐秒循环（APIR2-P2-01、P2-08） |

**7.2 后台入口（`background-entry.mjs`、`refreshBackgroundRuntime`，实验 C）**

- 真实 0.10.2 `background-entry.mjs` 读取 `version: 1` 的上下文后，加载 `<runtime>/server/background-worker.mjs` 并以该上下文调用 `runBackground`；工作进程看到的 `SKILLDOCK_STATE_DIR`、`CODEX_HOME` 来自上下文。
- `version: 2` 时以 1 退出、不调用工作进程，并写 `background/status.json`（`outcome: "error"`）。
- 两点都与契约一致。
- 精度：运行目录来源取 Codex 命令行报告的“已安装且启用”的版本（`background-worker.mjs:20-31`），不是“最高版本”。第一次切到 0.11.x 运行目录由 0.10.x 工作进程完成；此后的刷新由已加载的 0.11.x 工作进程执行（`runBackground` 内调用 `refreshBackgroundRuntime`，第 123 行）。这一点关系到 7.3 的触发键（APIR2-P2-08）。

**7.4 源码布局（实验 D，真实 0.10.2 `scripts/source-bundle.mjs`）**

| 情形 | 结果 |
|------|------|
| 0.10.2 原样 | `captureSource` 成功，156 个条目 |
| 删除 `assets/app/playwright.config.ts` | 抛出 ENOENT |
| 删除 `assets/app/tests/` | 抛出 ENOENT |
| 删除 `scripts/native.sh` | 抛出 ENOENT |
| 新增 `assets/app/lib/x.mjs`（不在 `APP_TREES` 内） | 成功，但该文件不进入条目，即不会被物化到运行目录 |
| 物化运行目录后，在 `server/` 下多出一个构建生成的文件 | `verifySourceArtifacts` 报“源码在构建过程中发生变化” |
| 0.10.2 写入运行目录的 `.source-snapshot/manifest.json` | `format: 1`、`runtime: true`；0.11.x 的 `npm run build` 会用自己的 `source-bundle.mjs` 读取它 |

结论：7.4 写的“全部文件都在允许列表内”只是必要条件之一。另外还需要：

- 7 个 `APP_FILES`、5 个 `APP_TREES`、7 个 `ROOT_FILES` 必须全部存在；
- 构建不得在这 5 个目录树内新增文件；
- 0.11.x 的构建脚本须接受 0.10.2 写的 format 1 运行目录清单，并原样复制归档。

“产物通过 0.10.2 的运行目录核验”加上 G-10，可以从黑盒上兜住这些条件，所以义务是可检验的。文字宜补全（APIR2-P2-03）。

### 5.2 36b 7.3 退避：可实现性、可测性与漏洞

- **可实现**：在 0.10.2 `check()` 的结构上，把“是否处于等待期”的判断放在完整刷新（第 54 行）之前，就能做到“等待期间不刷新清单、不写 `restart.json`、不暂停写操作”。`pauseForRestart` 只在发起前调用（第 62 行），不受影响。
- **可测**：U-01、U-02 可以断言。分钟级的时间需要 0.10.3 给协调器加可注入时钟（现有只有 `pollMs`、`worker`、`startTimer` 可注入），这属于实现细节。
- **触发键**：
  - 0.10.2 中，只有 `context.json` 的摘要会让待办在每个周期重新出现（实验 B2、B3）。所以以它为触发键、以通知为单独的清零条件，抓住了循环的真正来源。
  - 契约把“由通知发起”的触发键记为“通知”，会产生歧义：通知发起的一次失败之后，下一周期因摘要不同而再次待办，触发键从“通知”变成摘要值，按字面算“触发键变化”而清零，于是多一次立即重试。次数有界，但宜写清（APIR2-P2-01）。
  - 0.11.x 工作进程在代号 1 下若用自己的算法重算摘要并改写 `context.json`，触发键会变化一次、清零一次，也有界。
- **安装变化通知**：通知只在用户经界面执行检查更新、更新、安装或刷新 marketplace 后发出（`service.mjs:1006`），属于用户主动操作，用它清零合理。另一侧在宿主中被手动更新时不会有通知，协调器最多等 30 分钟。PRD Q10 已写明此时用户可从 0.11 入口按门槛引导，可以接受。
- **漏洞 1：“失败”的范围未定义。** 发起前失败会写 `failed` 但不启动启动器（实验 B4），例如源码核验失败、`新版应用的安装身份不匹配`。7.3 只说“任务失败后”。若实现只统计启动器非 0 退出，这类失败在 0.10.3 中仍会逐秒循环（APIR2-P2-01）。
- **漏洞 2：状态寿命。** 计数若只在内存中，在“门槛通过后迁移失败、恢复旧实例”的路径上会失效：
  - 恢复出的是新进程，计数从零开始；
  - `context.json` 的摘要仍不同，恢复后立即再次发起；
  - 0.11.x 再次停止旧实例、迁移失败、恢复，循环往复，用户的实例被反复重启。
  
  这一情形 0.10.2 同样存在，且不在 Q10（Q10 只覆盖门槛不通过）。最小办法是给 0.11.x 加义务，不需要改动 0.10.3（APIR2-P2-02）。
- **等待期间是否还刷新清单**：按 7.3 不刷新。但 0.10.2 的结构里，摘要与运行中服务不同、目标又与记录相同（实验 B1）时，本来就会逐秒完整刷新，这不属于“失败”，7.3 也不覆盖。目前只在 Codex 回退插件版本等少见情形出现，记为观察，不计问题。

### 5.3 36b 7.4 中 0.11.x 义务是否充分

- **不要求摘要算法一致：安全。**
  - 0.10.2 的 `launch.mjs:146-154` 用 `id`、`source`（等于自身应用目录）、`previousPid`（等于当前启动记录的 `pid`）把任务绑定到当前实例与目标安装；`restart.json` 位于用户自己的数据目录，权限 `0600`。
  - 摘要比对只额外防止“决定之后源码又变了”。0.11.x 启动的永远是它自己所在的安装，放弃这一比对不会让它执行别的代码。
  - 有一个连带影响：0.10.x 原生界面（`useRuntimeConnection.ts:31-32`）在健康检查 `restart.status` 不是 `ready` 时一直显示“重启中”并暂停操作。0.10.2 服务端把任务报告为 `ready` 的捷径正是摘要相等（`self-update.mjs:89`）。0.11.x 不要求摘要一致，就必须在成功后显式把任务记为 `ready`，契约没写（APIR2-P2-04）。
- **源码布局约束：可检验，但文字不全**（见 5.1 节；APIR2-P2-03）。
- **门槛失败的非交互路径：** 契约写的是“在停止旧实例之前判定并拒绝”。
  - 0.10.2 的结构是：bootstrap 先解析工具链（`allowInstall: true`，可能下载 Node 到 `<state>/node/`），`launch.mjs` 再准备运行目录（`npm ci`），之后才停止旧实例。
  - 0.11.0 若沿用这一结构，可以字面满足 7.4，却与 36a 8“门槛通过前只允许写 0.10.x 不读取的位置”冲突（`<state>/node/`、`<state>/runtimes/` 都被 0.10.x 读取）。再与 Q10 的逐秒重试叠加，可能逐秒联网。
  - 宜明确“早于工具链解析、Node 下载与运行目录准备”（APIR2-P2-05）。
- **后台工作进程、重启任务核对**：充分。实验 C 证实了 0.10.x 入口传给工作进程的上下文与环境。

### 5.4 36c 第 6 节与 PRD 5.2.2、5.6、AC-002、003、015、016

| PRD 要求 | 契约承载 | 判断 |
|----------|----------|------|
| 5.2.2 Agent：一个对象可同时属于两个 | `agents?: Agent[]`，非空、有序、缺省为 `["codex"]`；`multiAgent=1` 时显式给出 | 满足 |
| AC-003 两侧共用的同一技能目录只出现一次；更新或移除前提示同时影响两侧 | 按真实路径去重，ID 取 Codex 侧；更新、移除、恢复时带 `kind: "scope"` 的 `NativeRule` | 满足“只出现一次”与提示；**共用对象的分 Agent 状态无法表达（APIR2-P1-01）** |
| 5.2.2 安装范围 | `Plugin.installation.scope` | 满足 |
| 5.2.2 启用状态来源；AC-002 覆盖来源；AC-015 被覆盖时显示来源、托管与同步插件不可停用 | `EnablementSource{decidedBy, overriddenBy, locked}`，`Protection` | 满足 |
| 5.2.2 marketplace 自动更新；AC-002 实际值含默认、桌面整体禁用时说明 | `Marketplace.autoUpdate{enabled, isDefault, note}`，`AgentEnvironment.notes`；`refreshedAt` 沿用 | 满足 |
| 5.2.2 保护状态 | `Protection` 加现有 `managed`、`reason` | 满足（共用对象见 APIR2-P1-01） |
| 5.6 安装预览：选择范围、依赖插件、Claude 专用 manifest | `PluginInstallPreview` 的 `scopes`、`defaultScope`、`dependencies`、`manifests`、`nativeRules` | 满足 |
| 5.6 独立技能启禁：显示实际档位，中间档先确认 | `visibility` 四档；`skill.toggle` 在后两档须 `confirm` | Claude 独有技能满足；共用技能见 APIR2-P1-01 |
| AC-016 “按原生语义调整”的项在确认框或详情中显示原生规则 | 预览与 `ActionResult.nativeRules`；`CONFIRMATION_REQUIRED` 只覆盖共享作用域、可见性中间档、清理托管 marketplace | 卸载插件（会删数据）与移除 marketplace（会卸载插件）在执行**之前**的原生规则从哪里来，没写清（APIR2-P2-10） |
| AC-016 不提供的能力没有入口并显示原因 | `canToggle`、`canRemove` 等加 `reason`；`UNSUPPORTED_FOR_AGENT` | 满足（共用对象见 APIR2-P1-01） |

### 5.5 作者自查修正的三处

| 位置 | 判断 | 证据 |
|------|------|------|
| N-12（没有启动记录时 0.10.2 调用自身启动器） | 正确 | 首轮实验 N12；`native-backend.mjs:53-72`。“0.11.x 补写后恢复”成立：补写的记录旧 `source` 指向 Codex 侧 ≥0.10.3，0.10.2 下次准备时会改调它 |
| N-14（旧 `source` 所指缓存被删除） | 正确 | **实验 N14**：真实 0.10.2 原生入口加真实 0.10.2 `launch.mjs`（`launch.sh` 换成直接执行 `launch.mjs` 的包装，以跳过可能联网的工具链解析）。首次打开调用的是自身 0.10.2 启动器（`start --project <固定子目录>`），启动器报“无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。”并以 1 退出，面板显示 “redact is not a function”。10 秒内再读一次仍是同一错误。启动记录摘要前后相同，0.11.x 替身实例仍存活，计划文件仍为 `version: 2` |
| S-23 / 36a 5.3 / 36b 4.1（代号为 1 时无法解析的启动记录不触发转交链） | 正确 | **实验 A**：代号 1（无 `generation.json`）、`launcher.json` 内容为 `{not json`。真实 0.10.2 `launch.mjs` 的 `start`、`restart`、`status`、`stop` 都以 1 退出，stdout 为空，stderr 为“启动记录不可读：…”，数据目录逐文件哈希不变。0.11.x 用原子替换写记录，迁移第 4、5 步之间代号仍为 1 时记录可以解析（会触发），门槛前不写记录，所以这一分支不会遮住 0.11.x 的数据；结果是不接管、不写文件，并保持 MR-SDX-001 的文案 |

### 5.6 附录 A 新增与修订的用例

| ID | 能否从 PRD、HLD、契约推出 | 与冻结代码是否一致 | 备注 |
|----|--------------------------|-------------------|------|
| N-16 | 能（6.1 取值顺序；4.3 第 2 步例外；6.3 ①②） | 一致（`native-backend.mjs:113`） | — |
| N-17 | 能（4.7） | 一致：退出 0 后 0.10.2 重读记录并核实（`native-backend.mjs:149-151`） | — |
| S-17a | 能（4.2） | 一致：`acquireFileLock` 不等待，文案取自 `launch.mjs:141`；BUSY 时不写文件 | 前提依赖 0.11.0 迁移持有同一个 `launcher.lock`（HLD 3.7 迁移第 1 步） |
| S-17b | 能（4.2 第三个判定点） | 不涉及 0.10.2 | — |
| S-19 | 能（4.4） | 一致：`parseLaunchArguments` 只校验绝对路径与控制字符，不存在的路径能通过解析 | 前提未排除第 1 步（APIR2-P2-09） |
| S-20、S-21、S-22 | 能（4.7；4.1；4.5 末段） | 不涉及 | — |
| S-23 | 能（36a 5.3） | 一致（实验 A） | — |
| B-04 | 基本能 | 一致（0.10.3 原生入口沿用 0.10.2 选择逻辑） | 本安装缓存目录下有 ≥0.11 时先走第 1 步，“第 3 步兜底”不总成立（APIR2-P2-09） |
| U-01、U-02 | 能（7.3） | 不涉及 | — |
| U-03 | 能（7.1、Q10） | 一致（实验 B2、首轮实验） | 前提应写明“后台计划已启用，`context.json` 摘要与运行中服务不同”，否则不会重复发起（实验 B3；APIR2-P2-08） |
| G-07 | 能（36a 5.4、36b 6.3） | 不涉及 | — |
| G-08 | 能（7.4） | 不涉及 | 宜加断言：任务最终为 `ready`，0.10.x 界面不停在“重启中”（APIR2-P2-04） |
| G-09 | 能（7.4） | 一致（实验 C） | — |
| G-10 | 能（7.4） | 一致（实验 D 说明了 0.10.2 的实际检查项） | 与附录前言“每条都断言未联网（npm 缓存为空）”冲突：构建要 `npm ci`（APIR2-P2-09） |

### 5.7 与 HLD v1.3 的一致性

DEC-SDX-021、3.7、5.4 新增行、第 10 节三项决定与 36b 4.3、4.7、6.3、7.3、7.4 一致。HLD 中未改动的两行与契约 v0.2 有出入：

- 5.1 的错误行仍写“新错误码只在新增路径上出现”；
- 5.4 调用约定行仍写“`PORT` 取自旧记录地址”。

这两处以契约为准，列为 HLD 第 11 轮的 P2。

## 6. 问题清单

### 6.1 汇总

| ID | 级别 | kind | 位置 | 问题 | 影响条件 1 |
|----|------|------|------|------|-----------|
| APIR2-P1-01 | P1 | defect | 36c 第 6 节第 155、157～159、164～167 行 | 共用技能对象缺少分 Agent 的状态字段，`enabled` 等单值字段对它自相矛盾（APIR1-P1-03 第 1 项的残余） | 是（“多 Agent 字段形态”）；不影响 0.10.3 代码 |
| APIR2-P2-01～11 | P2 | defect / optional | 见 6.3 | 精度、可测性、编辑 | 否 |

### 6.2 P1 详情

**APIR2-P1-01 共用技能对象的分 Agent 状态无法表达**

- **依据**：
  - PRD 5.2.2：一个对象可同时属于两个 Agent。
  - AC-003：共用技能目录只出现一次。
  - PRD 5.6：Claude 独立技能显示实际档位，开关只在“开 / 关”之间切换。
  - AC-016：不提供的能力在 Claude 对象上没有入口并显示原因。
  - 36c 第 166 行：共用对象的“启禁仍按各 Agent 的设置分别执行，请求须带 `agent`”。
  - HLD 11A 条件 1 明列“多 Agent 字段形态”。
- **当前缺陷**：
  - 去重后，一个共用技能对象同时代表 Codex 中的技能和 Claude 中的技能。Codex 的启用状态与 Claude 的可见性互相独立：同一目录在 Codex 启用、在 Claude 关闭，是正常状态。
  - 但 `Skill` 只有单值的 `enabled`、`canToggle`、`canRemove`、`reason`、`scope`、`path`、`managed`/`protection`。
  - 第 157 行又规定 Claude 技能的 `enabled` 与 `visibility` 对应。对共用对象，`enabled` 既要表示 Codex 状态，又要与 Claude 档位对应，两者冲突。
  - 后果：
    - 界面无法分别显示两侧的开关状态与不可操作的原因（例如 Claude 侧被托管设置锁定、Codex 侧可写）；
    - 两侧发现路径与作用域不同（例如 Codex 用户级、Claude 项目级经链接指向同一目录）时，`path`、`scope` 只能放一侧；
    - 共用对象的 `UpdateTarget.agent`、`ActionResult.agent` 取哪一侧未定义。
- **影响**：0.11.0 实现者只能临时自定字段，这些字段绕过契约评审；问题要到 UAT 才会暴露。不影响 0.10.x 与 0.10.3 的冻结面。
- **最小修复**（只增字段，不改边界）：
  - 给 `Skill` 增加按 Agent 的状态，例如 `perAgent?: Partial<Record<Agent, { path: string; scope: string; enabled: boolean | null; visibility?: SkillVisibility; enablement?: EnablementSource; canToggle: boolean; canRemove: boolean; reason?: string; protection?: Protection; revision?: string }>>`；
  - 规定共用对象的顶层 `enabled`、`canToggle`、`path`、`scope` 取 Codex 侧（保持 MR-SDX-001 与 1 版客户端语义），Claude 侧状态只在 `perAgent.claude` 中给出；
  - 写明共用对象的 `skill.toggle` 按请求的 `agent` 取对应状态与 `expectedRevision`；
  - 写明更新、移除、恢复作用于真实目录（或说明作用于哪一侧的发现路径），`UpdateTarget.agent` 与 `ActionResult.agent` 的取值；
  - 附录或测试中补一条“两侧状态不同的共用技能”。

### 6.3 P2（不阻断，不按数量计入准出）

| ID | 位置 | 问题与建议 |
|----|------|-----------|
| APIR2-P2-01 | 36b 7.3（第 231～233 行）；U-01、U-02 | 退避定义宜在 0.10.3 编码前写清（冻结行为）：<br>(a) “失败”包括发起后任何写下 `status: "failed"` 的情形，含启动器调用前的核验或摘要计算失败（实验 B4：不写清时仍会逐秒循环）；<br>(b) 触发键定义为观察到的 `context.json` 的 `digest`（文件不存在时为空），通知只作为单独的清零条件，不作为触发键取值，避免“通知”与摘要来回切换造成额外清零；<br>(c) 写明计数只在服务进程内有效还是持久化（另见 P2-02） |
| APIR2-P2-02 | 36b 7.4；HLD 3.7 迁移第 2 步 | 门槛通过后迁移失败并恢复旧实例时，恢复出的旧服务会立即再次发起：0.10.3 的内存计数已清零，0.10.2 本来就不退避。用户实例因此被反复停止又恢复，这不在 Q10 内。<br>建议给 0.11.x 加一项义务：这种失败之后，在一段时间内对同一目标的非交互重启任务在停止旧实例之前快速拒绝，并把失败记录写在 0.10.x 不读取的位置。这样 0.10.2 与 0.10.3 都只剩 Q10 级别的快速失败，不需要改 0.10.3。<br>另一种做法是 0.10.3 从 `restart.json` 的上次失败（同一 `sourceDigest`、`completedAt`）推算等待时间，但这会进入冻结面 |
| APIR2-P2-03 | 36b 7.4 “源码布局”；G-10 | 补全实验 D 证实的约束：<br>(a) `APP_FILES`、`APP_TREES`、`ROOT_FILES` 必须全部存在（缺任何一个，`captureSource` 都报 ENOENT）；<br>(b) 允许列表之外的文件不会进入运行目录；<br>(c) 构建不得在五个目录树内新增文件；<br>(d) 0.11.x 的构建脚本须接受 0.10.2 写的 `format: 1`、`runtime: true` 清单，并原样复制归档与许可证。<br>G-10 写成“用 0.10.2 冻结代码的 `prepareRuntime` 与 `verifyRuntime` 实测” |
| APIR2-P2-04 | 36b 7.4 “重启任务”；36c 4 `restart`；G-08 | 0.11.x 完成 0.10.x 重启任务后，须把 `restart.json` 记为 `ready`（0.10.x 格式，含 `pid`、`completedAt`），或保证健康检查的 `restart` 为 `ready` 或不出现。否则 0.10.x 原生界面停在“重启中”并暂停操作：`useRuntimeConnection.ts:31-32`；0.10.2 判断 `ready` 依赖摘要相等，见 `self-update.mjs:89`。门槛通过后又失败时，同理记为 `failed` 并带 `restored`。G-08 加对应断言 |
| APIR2-P2-05 | 36b 7.4 “门槛失败的非交互路径” | 把“在停止旧实例之前”收紧为“在解析工具链、下载 Node 与准备运行目录之前”。这与 36a 8 已有的“门槛通过前只写 0.10.x 不读取的位置”一致，也避免 Q10 的逐秒重试叠加逐秒联网或构建 |
| APIR2-P2-06 | 36b 4.2 第 62 行 | bootstrap 无条件转发 SIGINT、SIGTERM，会改变**未触发**转交链时的 0.10.2 语义。0.10.2 的原生入口 600 秒超时只终止 bootstrap（`native-backend.mjs:117-118`，`bootstrap.mjs:43-46` 未处理信号），`launch.mjs` 继续完成构建与启动。转发后它会在构建或“停旧启新”之间被终止，影响代号 1 下的 Codex-only 用户（MR-SDX-001）。建议只在转交链已触发、正在等待被调用方时转发；该行为随 0.10.3 冻结，宜在编码前改 |
| APIR2-P2-07 | 36b 4.7（第 111、114 行）、6.2（第 166 行） | (a) 回落前的“重新执行 4.5”须重新读取启动记录，因为被调用方可能已重启实例、换了 `pid` 或端口；<br>(b) `projectNotSwitched` 宜在健康检查 `project` 不等于 `P` 的规范路径时才给出；<br>(c) 被调用方 stdout 超过 64 KiB 时视为被调用方失败，不截断转出 |
| APIR2-P2-08 | 36b 7.1“重试”“目标”行、7.2 第一段；U-03；PRD Q10 | (a) 0.10.2 只在 `context.json` 摘要与运行中服务不同的期间逐秒重试；只由通知发起的失败不重试（实验 B3）。<br>(b) 每次处理待办都完整刷新，即使最后不发起（实验 B1）。<br>(c) 运行目录来源是 Codex 命令行报告的已安装且启用版本，不是“最高版本”；切换后的刷新由 0.11.x 工作进程执行。<br>U-03 前提补“后台计划已启用、`context.json` 摘要不同”。PRD Q10 的“约每秒重试”是偏保守的表述，可不改 |
| APIR2-P2-09 | 附录 A | (a) S-01 的“否则为 1”与 S-07 冲突：实例运行中时第 1 步失败会回落为 0，S-01 前提宜加“实例未运行”。<br>(b) S-19、B-04 前提宜排除本安装缓存目录下的 ≥0.11，或在期望中加入第 1 步。<br>(c) 附录前言要求每条都断言“未联网（npm 缓存为空，`<state>/node/` 无新增）”，但 G-10 必须执行 `npm ci`；0.11.0 关口中启动真实 0.11.0 的用例（N-03、N-08、G-08 等）也需要构建。应写明预置离线 npm 缓存或预构建运行目录，或豁免这些用例的该项断言 |
| APIR2-P2-10 | 36c 7.1、7.3、第 8 节 | AC-016 要求确认框显示原生规则。卸载插件（默认删除数据目录）与移除 marketplace（会卸载其插件）在执行**之前**的规则从哪里来，没有写：要么这两个操作也用 `CONFIRMATION_REQUIRED` 并在错误体中带 `nativeRules`，要么写明由客户端按快照与固定文案生成 |
| APIR2-P2-11 | 索引第 4 节；36c 4 第 53、73 行；36b 12 | (a) 索引“契约清单”的三个分册版本仍为 0.1，应为 0.2。<br>(b) 36c 示例用 `"restart": null`，冻结说明写“`undefined` 或对象”。0.10.x 界面对 `null` 也能正常处理，宜统一为“缺省或 `null`”。<br>(c) 36b 12 的冻结清单宜加入第 9 节，即 0.10.3 原生入口的错误显示（B-03 依赖它） |

## 7. HLD 11A 条件 1 的判断

**未满足。**

- 条件 1 要求：5.4 全部项、3.13A 期望结果表与 `contracts.ts` 相关增量（含多 Agent 字段形态）在契约中定稿并通过独立契约评审；HLD v1.3 另要求 APIR1-P1-01～04 在复审中关闭。
- 本轮 APIR1-P1-01～04 均已关闭（P1-03 的残余另列为 APIR2-P1-01），但 APIR2-P1-01 位于条件 1 明列的“多 Agent 字段形态”，契约尚未通过评审。
- 0.10.3 冻结面（36a、36b）没有未关闭的 P0/P1。APIR2-P2-01、P2-06 涉及随 0.10.3 冻结的行为，虽不阻断，仍建议在 0.10.3 编码前一并改。
- 本轮没有发现 K3、固定子目录或转交链第 3 步不可行，条件 1 的“回到 HLD 增量复审”不触发。
- 修订 APIR2-P1-01 后，对 36c 第 6 节及其直接影响做一次 delta 复审即可，不需要重审 36a、36b。

需要 Owner 决定的事项：**没有必须由 Owner 决定的事项。** 以下两项可供 Owner 斟酌，均非必要：

- 若希望在修 APIR2-P1-01 期间先开始编写 0.10.3，可把条件 1 拆成“0.10.3 冻结面”和“0.11.0 HTTP 字段形态（0.11.0 编码前）”两部分。这会修改 HLD 11A，须由 Owner 决定并做 HLD 增量复审。直接修 APIR2-P1-01 更简单。
- APIR2-P2-02 若作者不采用 0.11.x 义务而选择登记残留，则属于残留范围变化，须交 Owner 知悉。

## 8. 实际运行的命令与结果

所有实验都在 `scratchpad/verify/r11-lab/` 下进行：

- 使用 `env -i HOME=<lab>/run/<情形>/home CLAUDE_CONFIG_DIR=<…>/.claude CODEX_HOME=<…>/.codex PORT=55197 PATH=/usr/bin:/bin` 与本机已有的 Node 22.14.0；
- `55197` 是本轮用 `net.createServer().listen(0)` 找到的空闲端口，启动前后用 `lsof` 确认没有其他监听；
- 实验中的启动记录地址都用该端口，没有向 `127.0.0.1:4771` 发出任何请求。

| # | 命令 | 结果 |
|---|------|------|
| 1 | `shasum -a 256`：PRD、HLD、四个契约文件（开始与结束各一次）；`git show ad96e3f:…/34-cross-agent-prd.md` | 见第 1 节；v0.8 为 `0bc34ec1…2fb8` |
| 2 | `git rev-parse`、`git status --short`、`git diff --quiet ad96e3f -- assets scripts` | 分支、HEAD 与委托说明一致；冻结代码未改动 |
| 3 | `git archive ad96e3f plugins/skilldock \| tar -x`（导出到 `verify/r11-lab/export/`）；从工作区 `node_modules/yaml` 本地复制一份供 `self-update.mjs` 导入 | 真实 0.10.2 代码副本（未下载） |
| 4 | `bash expA.sh`（实验 A，S-23） | 4 个动作均退出 1，stderr 为“启动记录不可读”，数据目录不变 |
| 5 | `node expB.mjs B1/B2/B3/B4`（实验 B，真实 `createSelfUpdater` 与 `startWorker`，替身启动脚本） | B1：19 次刷新、0 次发起；B2：19 次发起；B3：1 次发起后不重试；B4：19 次刷新与 `failed`、0 次发起；参数与环境见 5.1 节 |
| 6 | `bash expC.sh`（实验 C，真实 `background-entry.mjs`） | v1 上下文加载替身工作进程；v2 上下文以 1 退出并写 `status.json` |
| 7 | `node expD.mjs`（实验 D，真实 `source-bundle.mjs`） | 见 5.1 节表 |
| 8 | `node expN14.mjs`（实验 N14，真实原生入口与真实 `launch.mjs`，替身 0.11.x 健康服务） | 见 5.5 节 |
| 9 | `diff -rq` 比较 testany-eng 2.5.0 与 2.7.1 的技能、共享规则与追溯脚本 | 相同；2.7.1 缺 `document-amendments.md` |
| 10 | `lsof` / `pgrep` 检查 | 实验端口与 `r11-lab` 进程均无残留 |

## 9. 未审范围、约束遵守与披露

**未能核实**：

- 0.10.3 与 0.11.x 尚不存在，转交链、退避、补写记录与 0.11.x 义务的真实行为只能按契约文字推演，由 V20 与兼容测试矩阵把关。
- 36c 依赖的 Claude 命令行 JSON 输出与设置原始取值（Q-A2、Q-A3）本轮未核实。
- `contracts.ts` 的增量尚未写入。
- Owner 的原话由委托说明转述，评审者只核对了它与 PRD BRIEF-SDX-010、HLD 第 10 节的一致性。

**约束遵守**：

- 仓库中只新增本报告与 `35-cross-agent-hld-review-r11.md`；未修改 PRD、HLD、契约或其他仓库文件；未 commit、push，未切换分支。
- 临时文件只写在 `verify/r11-lab/` 下。
- 未下载、未安装任何东西。
- 在 `~/.claude` 下只读取了 `plugins/cache/testany-agent-skills/testany-eng/` 中的评审技能、共享规则与追溯脚本（即评审标准本身），以及版本目录名；未读取任何配置文件。未读取 `~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`。宿主来源记录的格式沿用首轮的只读结论。
- 未启动、停止或访问真实的 SkillDock 实例；未运行 Claude 或 Codex 命令行。
- 本报告不含凭证。

## 10. 最小下一步

1. 契约作者修订 APIR2-P1-01（36c 第 6 节共用对象的分 Agent 状态），P2 可一并处理。其中 APIR2-P2-01、P2-06 随 0.10.3 冻结，建议在编码前处理。
2. 对修订部分做一次 delta 复审：36c 第 6 节，以及若处理了 P2，则加上 36b 4.2、4.7、7.3、7.4 与附录 A 的对应行。通过后条件 1 满足，可开始编写 0.10.3。
