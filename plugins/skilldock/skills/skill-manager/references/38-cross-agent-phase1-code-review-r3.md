# 代码评审报告（第 3 轮复核）：归属判定死路的修正（`66767a9`）

> 本报告是独立代码复核意见，不是批准提交、推送、合并或发布的授权。源码结论、CI 状态与环境状态分开报告。
>
> 本轮与契约第 12 轮（[36-cross-agent-api-contract-review-r12.md](36-cross-agent-api-contract-review-r12.md)）、HLD 第 20 轮（[35-cross-agent-hld-review-r20.md](35-cross-agent-hld-review-r20.md)）合并进行，实验共用。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| Review ID | `CRV-26db86ff-1639-41cc-9cc1-e9983ddfad0f`（`remediation_delta_review`，第 3 轮） |
| 上一轮 | `CRV-325a8bc5-2a5e-4e08-a8a3-9f32e4561a07`，[38-cross-agent-phase1-code-review-r2.md](38-cross-agent-phase1-code-review-r2.md)，结论 APPROVED（`2b0c6a7`；R2-P2-01～04） |
| 本轮输入 | HLD 第 19 轮范围外观察 1 与契约第 11 轮第 10 节范围外观察 1“归属判定形成的死路”（两份报告都建议在 0.11.0 发布前以 HLD 有限增量与代码修正处理） |
| 评审者 | 独立 Lead Dev Reviewer（Claude，委托子任务），按 `testany-eng:code-reviewer` 2.7.1 执行（`SKILL.md` sha256 `a25f5462…379b`）；不与作者会话或前几轮评审共享上下文 |
| 日期 | 2026-10-08 |
| 仓库 / 分支 | `github.com/TestAny-io/testany-agent-skills`，`feature/skilldock-0.11-cross-agent`（本地，未推送） |
| 评审基线 | `2b7a4f3b7ce1134fd469d605e6d2e334cd5135b3`（其代码与 `74cce24` 相同） |
| Candidate | `66767a90fc1cec5cebbb8b50ec59c84c2d02ceca`（tree `d3ced3aca355125d2f52f43017ae371b37ff18d0`） |
| 范围 | `git diff 2b7a4f3 66767a9`：4 个路径（`server/launch-plan.mjs`、`shared/contracts.ts`、`tests/launch-plan.test.mjs`、`tests/migration.test.mjs`），增 58 行、删 10 行。按 `--name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none` 取得的清单 sha256 `f5069f63…518f`，完整 diff sha256 `75511573…4b44`；没有 replace refs 或 grafts。另核对直接受影响的调用方与依赖：`scripts/launch.mjs`（`checkOwner`、`stop`、迁移路径）、`server/installs.mjs`、`server/migration.mjs`（门槛）、冻结代码 `ab6856f`、`337547a` 的调用方 |
| 工作区绑定 | 工作区 HEAD 为 `f9a7fd0`（Candidate 之后只改 `references/`；`git diff 66767a9 f9a7fd0` 在 `references/` 之外为空）；评审前后均核对：工作区干净 |
| 事实源 | HLD-SDX-001 v1.12（`b09fb6d3…65c0`）3.7 第 724～727 行的有限增量，DEC-SDX-007、DEC-SDX-022，3.7 第 704 行迁移第 1 步；API-SDX-001 v0.12：36b 6.3 第 204 行、36c 第 6 节第 177 行；冻结代码 0.10.2 = `ab6856f`、0.10.3 = `337547a` |
| Scope Lock | 本轮的输入不是上一轮代码评审的整改，而是 HLD 有限增量，故按增量另立：`20f9e8e6a8dbefce776fb12789b27bad563936a8f8860506dfe118cb5963fb27`（`scope_lock_digest.py` 生成，payload 存于实验目录 `scope-lock-r3.json`）。批准来源回到 HLD v1.0 的用户批准（DEC-SDX-007、022、3.7）与 DG-NO-LLD；v1.12 的增量本身经 HLD 第 20 轮核对，在已批准边界内 |
| 未覆盖 | `74cce24`（第 2 轮 R2-P2-01、03、04 的整改）不在委托范围，没有做独立复核；其中 `migration.mjs` 的门槛作为本轮的直接依赖读过（第 25～63 行），没有发现与本轮判断冲突之处 |

## 2. 结论

**APPROVED**（源码层，对 `2b7a4f3` → `66767a9` 的增量）。

- P0：0
- P1：0
- P2：新 2 项（不阻断，见第 4 节）
- SCOPE_DECISION / EVIDENCE_BLOCKED：无
- 本轮输入（死路）：**CLOSED**（更新路径）。来源标识无法核实时仍被拒绝、提示不可执行，属设计层，记为 HLD R20-P2-02，本报告不另计
- 是否需要 Owner 决定：不需要

全部输入为不可变提交：本结论即 `66767a9`（tree `d3ced3ac…`）相对 `2b7a4f3` 的 Code Review Approval Certificate；`f9a7fd0` 的代码与其逐字节相同，结论同样适用。累积链上 `2b0c6a7` → `74cce24` 的增量没有被任何一轮代码评审覆盖（见第 1 节“未覆盖”）。本结论不授予推送、合并、CI 或发布权限。

## 3. 逐项核查

### 3.1 行为证据

`HLD v1.12 3.7 第 724～727 行 + DEC-SDX-007/022` → 生产入口 `launch.mjs` 第 189～210 行 `checkOwner`（`start`、`restart`、`status`、`stop` 都经过）与第 255 行锁内再核 → 实际 helper `legacyOwnership`（`launch-plan.mjs` 第 152～181 行），使用真实的 `canonical`、`readText`、`readJsonFile`、`sourceKeyFor`、`agentRoots`、`migrationGate`，没有替身 → 独立 oracle：HLD 第 725～727 行的三种情形与门槛结果 → 合法、非法、失败三类结果见下表 → 直接调用方：四个动作；`bootstrap.mjs` 的 `planLaunch` 不调用归属判定，只做门槛；重启任务按代码推演。

替身边界：Claude 侧 0.10.2 旧实例是仓库夹具中的最小应用（不是真实 0.10.2 代码）；“带废弃标记”由探针写入，不是真实 Claude 更新产生；后台接管只改写数据目录内的文件，不调用 `launchctl`。

### 3.2 与 HLD 有限增量逐项对照（探针 `r20-owner.mjs`，修正前后两版对照）

| # | 情形 | `66767a9` 归属 | 门槛 | `2b7a4f3`（修正前） | 对照 HLD |
|---|------|---------------|------|--------------------|---------|
| U1 | 仍在用，0.10.2，无废弃标记 | `claude-legacy` | 失败（1 个阻断项） | `claude-legacy` | 第 725 行，一致 |
| U2 | 带废弃标记的 0.10.2 | `family` | 通过 | `claude-legacy` | 第 726 行，一致 |
| U3 | 版本目录已删除 | `family` | 通过 | `claude-legacy` | 第 726 行，一致 |
| U4 | 仍在用，0.10.3（Claude 侧 0.10.3 写下的记录） | `family` | 通过 | `claude-legacy` | 第 726 行“已更新到 0.10.3 或以上”，一致；修正前这一情形同样被永久阻断 |
| U5 | 仍在用，`package.json` 权限 000 | `family` | 失败（不可读） | `claude-legacy` | HLD 未列；见 CR3-P2-01 |
| U6 | `package.json` 不是 JSON | `family` | 通过（不计为安装） | `claude-legacy` | 与门槛口径一致 |
| U7 | `package.json` 缺失 | `family` | 通过（不计为安装） | `claude-legacy` | 与门槛口径一致（等同“已删除”） |
| U8 | 废弃标记存在但权限 000 | `family` | 通过（按已废弃跳过） | `claude-legacy` | 与门槛口径一致 |
| U9 | 版本目录权限 000 | 抛出 EACCES | — | 抛出 EACCES | 修正前即如此（`canonical` 遇非 ENOENT 抛出）；`start` 先由 `bootstrap.mjs` 的门槛给出权限提示 |
| U10 | 带废弃标记，Claude 中已移除该 marketplace | `null` | 通过 | `claude-legacy` | 第 727 行（无法核实即拒绝）；提示见 HLD R20-P2-02 |
| U10b | 带废弃标记，`known_marketplaces.json` 不存在 | `null` | 通过 | `claude-legacy` | 同上 |
| U11 | 带废弃标记，Claude 中的 marketplace 来自 fork | `null` | 通过 | `claude-legacy` | 第 727 行，一致（DEC-SDX-007） |
| U12 | 其他 marketplace，仍在用 | `claude-legacy` | 失败 | `claude-legacy` | 第 725 行，一致 |
| U12b | 其他 marketplace，带废弃标记 | `null` | 通过 | `claude-legacy` | 第 727 行，一致 |
| U13 | 自定义 Claude 配置目录，带废弃标记，`CLAUDE_CONFIG_DIR` 可见 | `family` | 通过 | `claude-legacy` | 一致 |
| U13b | 同上，本进程看不到该目录 | `null` | 通过 | `null` | 修正前后相同；提示见 HLD R20-P2-02 |
| U14 | `CLAUDE_CONFIG_DIR` 指向不含该 marketplace 的目录，`CLAUDE_CODE_PLUGIN_CACHE_DIR` 指向 `~/.claude` 的缓存 | `family` | 通过 | `claude-legacy` | 同一缓存与两个配置目录配对时取默认配对（`resolveClaudeRoot` 的默认根在前），结果正确 |
| U15 | 版本目录名以点开头 | `null` | 通过 | `claude-legacy` | 路径形态不符，第 727 行“其他位置” |
| U16 | 记录来源是技能根而不是应用目录 | `null` | 失败 | `claude-legacy` | 同上；`start` 仍先由门槛以 4 退出 |

“此时门槛本身也会失败”（第 725 行）在代号 1 下成立：凡判为 `claude-legacy` 的情形（U1、U12），门槛都失败，因为两者对同一版本目录使用相同的证据（废弃标记、`package.json` 版本、同一组缓存根）。代号 2 下门槛不运行，`claude-legacy` 是唯一的阻断，与修正前相同。

### 3.3 死路修正的完整性（端到端探针 `r20-e2e.test.mjs`）

| # | 前置状态 | 修正后结果 | 修正前（`2b7a4f3`） |
|---|---------|-----------|--------------------|
| E1 | 代号 1；Claude 侧 0.10.2 旧实例存活，记录为目录形态；0.10.x 计划与后台注册；旧目录带废弃标记；从 Codex 侧 0.11.0 运行 | `status` 报 running；`start` 迁移成功：旧 pid 已退出，新实例健康，记录 `format: 2`、`running`，代号 2，计划文件 2 版，后台上下文 2 版 | `status` 退出 1；`start` 被拒绝 |
| E1b | 同 E1，但实例锁被占用（`lockWait: 300`） | 以“另一项 SkillDock 操作……未停止现有服务”失败（退出 1）；旧实例存活；`launcher.json`、`local/updates.json`、后台 `context.json`、`generation.json`、`migration-failure.json`、`restart.json` 逐字节不变 | — |
| E2 | 记录中的进程已不在；旧版本目录已移出缓存 | `start` 清理记录后迁移成功 | 被拒绝 |
| E3 | 同 E1，执行 `stop` | 旧实例被停止，0.10.x 记录被删除，没有代号文件；之后 `start` 迁移成功 | `stop` 退出 1，旧实例与记录不变 |
| E4 | 旧目录没有废弃标记（仍在用，0.10.2） | `status`、`stop` 退出 1，`start`、`restart` 退出 4（`MIGRATION_BLOCKED`）；旧实例存活；上述六个文件逐字节不变 | 相同 |
| E5 | 仍在用，但 `package.json` 权限 000 | `start` 由门槛以“无法读取 …package.json（UNREADABLE）”退出 4，文件不变；`status` 报 running；`stop` 停止了旧实例并删除记录 | 三个动作都被归属判定拒绝 |
| E6 | 带废弃标记、进程已不在，Claude 中已移除该 marketplace | `start`、`stop`、再次 `start` 都以“此数据目录属于另一个源码实例……”退出 1，文件不变 | 被拒绝（`start` 退出 4） |
| E7 | 带废弃标记，记录中的 pid 被一个无关的存活进程占用 | `start` 以“无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。”退出 1，记录保留 | 被拒绝（退出 4） |

结论：

- **存活的旧 Claude 侧实例按迁移第 1 步先停止**：是。`launch.mjs` 第 336～338 行在构建之后取实例锁与 Codex 锁，锁内核对记录未变再停止；E1 与 E1b 分别证实成功路径与锁忙时不打断旧实例。
- **`status`、`stop`**：过期记录按同族处理（E1、E3）；仍在用时与修正前相同（E4）。
- **`package.json` 不可读**：`start`、`restart` 由门槛拦住；`stop`、`status` 按同族处理，见 CR3-P2-01。
- **Claude 配置目录与 `known_marketplaces.json`**：取包含来源的那条缓存所配对的配置目录，与 `inspect` 计算本安装来源标识的方式一致（U13、U14）；读不到即拒绝（U10、U10b、U13b、E6），提示问题记为 HLD R20-P2-02。
- **E7** 是 0.10.2 起即有、对全部 0.10.x 记录成立的残留（第 2 轮报告第 4.4 节），不是本修正引入。

### 3.4 对冻结代码的影响

- `66767a9` 不改 0.10.x 代码；0.10.2、0.10.3 为 Claude 侧路径写目录形态记录（`337547a` `installation.mjs` 第 15～22 行），写法不变。
- 门槛失败或“仍在用”时，0.10.x 读取的文件逐字节不变（E4、E5 的 `start`、E1b）。
- 冻结调用方只区分 0 与非 0（`337547a` `handover.mjs` 第 289～290、348、377 行；`ab6856f` `self-update.mjs` 第 25 行）。部分原来退出 4 的情形改为 0（接管成功，满足 36b 6.3 的完成条件）或 1，都在已有分支内。
- 被停止的 Claude 侧旧实例与同族 Codex 侧旧实例走同一路径。

逐项结论见 HLD 第 20 轮报告专节：不改变 0.10.3、0.10.2 的任何可观察行为。

### 3.5 `contracts.ts`

`UpdateTarget` 增加 `confirmation?: "pending" | "confirmed"`（第 80～81 行），与 36c 第 177 行一致；可选字段，`src/UpdatesWorkspace.tsx` 只用 `kind`、`id` 组键，不受影响。`UpdateTarget` 也用于请求（第 467～468 行）与运行结果（第 132、142 行），请求中带回该字段时的处理由契约 APIR12-P2-01 补写；阶段 5 实现时服务端须忽略请求中的值。

### 3.6 代码与测试

- `absolute(record.source)` 取代 `typeof === 'string'`，拒绝超长或含控制字符的路径，比修正前更严。
- 路径形态检查与 `locate` 相同（7 段、`skilldock`、安全段名、`APP_TAIL`），版本目录、废弃标记与版本的读取与 `inspect`、门槛一致；同族判定与 Codex 插件记录分支使用同一归属键（marketplace 名 + 插件 + 来源标识）。
- 新增测试：`launch-plan.test.mjs` 覆盖仍在用、带废弃标记、已删除、0.10.3、其他 marketplace（不存在的路径）五种判定；`migration.test.mjs` 新增一项端到端（仍在用时退出 4，写入废弃标记后迁移成功）。只覆盖“进程已不在”，没有覆盖存活实例、`stop`、来源不同或无法核实，见 CR3-P2-02。

## 4. 新问题清单

### 4.1 P0

无。

### 4.2 P1

无。

### 4.3 P2（不阻断，可选整改）

| ID | 位置 | 依据 | 复现或推理 | 建议 |
|----|------|------|-----------|------|
| CR3-P2-01 | `server/launch-plan.mjs:175-176` | HLD v1.12 第 725～726 行只把“已更新到 0.10.3 或以上、带废弃标记或已删除”列为过期；门槛“读不出的证据从不通过”（`migration.mjs` 第 23、51 行） | `readJsonFile` 对“存在但不可读”返回 `null`，`version` 为 `undefined`，不满足 `claude-legacy` 条件，落入同族判定。`start`、`restart` 仍由门槛以 4 拦住（E5）；但 `stop` 会停止这个可能仍在使用的 Claude 侧 0.10.2 实例并删除它的记录，`status` 报运行中（E5）。修正前三个动作都退出 1。由本修正引入（`introduced_by_fix`）；需要人为把 `package.json` 改成不可读才会出现，影响限于用户主动执行 `stop` | 用 `readText` 区分“缺失”（`undefined`，不是安装，按已删除）与“存在但不可读”（`null`）：后者在未带废弃标记时按 `claude-legacy` 处理，或单独给出门槛同款的权限提示；补一个用例 |
| CR3-P2-02 | `tests/launch-plan.test.mjs`、`tests/migration.test.mjs` | HLD 3.7 第 726 行“存活且经核实的实例先停止，否则清理记录后继续”；第 727 行拒绝分支 | 新增的端到端测试只覆盖进程已不在的情形；存活实例在锁内先停止再迁移、锁忙时不停止（E1、E1b）、对过期记录执行 `stop`（E3），以及带废弃标记但来源为 fork 或 marketplace 已移除时拒绝（U10、U11）都没有回归测试。本轮实验证实行为正确 | 把 E1、E1b、E3 与 U10、U11 的断言补成测试（实验脚本见第 5.2 节，可直接改写）；CR3-P2-01 定案后一并补 |

### 4.4 其他观察（不计入问题）

- **来源标识无法核实时的提示**（U10、U10b、U13b、E6）：实现与 HLD 第 727 行一致（拒绝），但提示仍是“此数据目录属于另一个源码实例；旧 testany-eng 用户可使用 --migrate-from testany-eng 接续数据……”，不说明原因与出路。属设计层，记为 HLD R20-P2-02，此处不重复计数。
- **E7**：记录中的 pid 被无关进程占用时以“无法核实……”退出 1，0.10.2 起即有；过期 Claude 记录现在也会走到这里（修正前一律退出 4）。
- 探针 E2 第一次运行时，把旧版本目录改名为 `sha-old.moved-away` 但留在缓存目录内，门槛把它当作一个 0.10.2 安装而失败；这是探针的模拟方式不对（任何合法段名的目录都被计为安装，符合门槛设计），改为移出缓存后通过。

## 5. 测试与实验记录

### 5.1 测试运行

运行环境：`env -i HOME=<实验目录>/home TMPDIR=<实验目录>/tmp PATH=<nvm Node 22.14.0>:/usr/bin:/bin:/usr/sbin:/sbin npm_config_offline=true`，不带 `CODEX_HOME`、`CLAUDE_*`、`PORT`、`SKILLDOCK_*`；外层以 540 秒闹钟限时。工作目录为仓库的 `plugins/skilldock/skills/skill-manager/assets/app`，代码与 `66767a9` 逐字节相同。

| 命令 | 结果 | 用时 |
|------|------|------|
| `node --test --test-concurrency=1 tests/launch-plan.test.mjs tests/migration.test.mjs` | 17/17 通过（含新增的归属判定用例与“Claude 侧更新后不再阻断”的端到端用例） | 15 秒 |

未运行兼容矩阵与全量测试（按委托）。作者报告的结果（相关 39 项、原生产物测试与兼容矩阵 57 项全部通过；最近一次全量 332 项只失败已知的 `toolchain.test.mjs` 一项）本轮未复跑，仅作参考；本轮 delta 未改动 `toolchain.mjs`。

### 5.2 补充实验

实验目录为 scratchpad 的 `verify/apir12-r20-lab/`（本轮新建）。`66767a9` 与 `2b7a4f3` 的 `plugins/skilldock` 用 `git archive` 导出，`node_modules` 为指向仓库同名目录的符号链接（只读导入）。端到端探针在导出副本中运行，夹具自带隔离 HOME；端口由 `listen(0)` 分配，断言不等于 4771；仓库地址设为不可达的 `127.0.0.1:9`。

| 文件 | 内容 | 结果 |
|------|------|------|
| `r20-owner.mjs` | 归属判定与门槛的 19 个情形（U1～U16），分别对两版代码运行 | 第 3.2 节；输出 `owner-66767a9.json`、`owner-2b7a4f3.json` |
| `r20-e2e.test.mjs` | 端到端探针 E1～E7（复制到导出副本的 `tests/` 下运行） | `66767a9`：8 项中 7 项一次通过，E2 修正探针后通过（第 4.4 节）；`2b7a4f3`：E1～E3 按修正前的死路失败。输出 `run-e2e.out`、`run-e2e-E2.out`、`run-e2e-pre.out` |
| `scope-lock-r3.json` | 本轮 Scope Lock payload | 摘要 `20f9e8e6…fb27` |

实验结束后 `pgrep -fl apir12-r20-lab` 没有残留进程。

### 5.3 安全约束遵守情况

未向 `127.0.0.1:4771` 发送任何请求；未读写真实 `~/.claude`（只读取了 `plugins/cache/testany-agent-skills/testany-eng/` 中的评审技能与脚本）、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；未执行 `launchctl`；未联网下载；删除只发生在实验与夹具自建的临时目录内；未提交或推送；未修改被审代码或文档；未打印凭证。本轮启动的实例均已停止。

## 6. 状态分层

| 层 | 状态 |
|----|------|
| 源码（本报告） | APPROVED：P0/P1 为 0；新 P2 2 项可选；本轮输入（死路）在更新路径上关闭 |
| CI（exact SHA） | NOT_RUN（分支未推送） |
| 环境 | 不适用（无部署） |

## 7. 下一步

源码复核到此结束，不需要再一轮。可选：处理 CR3-P2-01（改动小）与 CR3-P2-02（把实验补成测试）；HLD R20-P2-02 的提示与契约 APIR12-P2-01、02 按各自报告处理。合并前建议对 `74cce24` 做一次只限其改动的复核，使累积链完整；HLD 11A 条件 3 的全量重跑仍是 0.11.0 合并前的条件。
