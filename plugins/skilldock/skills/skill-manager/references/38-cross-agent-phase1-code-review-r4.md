# 代码评审报告（第 4 轮复核）：复核 r2 的 P2 整改（`74cce24`）与复核 r3 的 P2 整改（`731515d`）

> 本报告是独立代码复核意见，不是批准提交、推送、合并或发布的授权。源码结论、CI 状态与环境状态分开报告。
>
> 本轮与契约第 13 轮（[36-cross-agent-api-contract-review-r13.md](36-cross-agent-api-contract-review-r13.md)）、HLD 第 21 轮（[35-cross-agent-hld-review-r21.md](35-cross-agent-hld-review-r21.md)）合并进行，实验共用。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| Review ID | `CRV-bfc3a77c-f24c-455d-8bd7-e7e9fca2725a`（`remediation_delta_review`，第 4 轮，覆盖两个 Candidate） |
| 上一轮 | 第 2 轮 `CRV-325a8bc5-2a5e-4e08-a8a3-9f32e4561a07`（[r2](38-cross-agent-phase1-code-review-r2.md)，APPROVED，R2-P2-01～04）；第 3 轮 `CRV-26db86ff-1639-41cc-9cc1-e9983ddfad0f`（[r3](38-cross-agent-phase1-code-review-r3.md)，APPROVED，CR3-P2-01～02）。另有 HLD 第 20 轮 R20-P2-02 的实现部分 |
| 评审者 | 独立 Lead Dev Reviewer（Claude，委托子任务），按 `testany-eng:code-reviewer` 2.7.1 执行（`SKILL.md` sha256 `a25f5462…379b`）；不与作者会话或前几轮评审共享上下文 |
| 日期 | 2026-10-08 |
| 仓库 / 分支 | `github.com/TestAny-io/testany-agent-skills`，`feature/skilldock-0.11-cross-agent`（本地，未推送） |
| Candidate A | `74cce24ddb2db7ff35253382e85083ca9210d126`（tree `60dd2496…6ebe`），基线 `38bf3df`（代码与 r2 批准的 `2b0c6a7` 逐字节相同）。范围 4 个路径（`server/migration.mjs`、`server/service.mjs`、`tests/launcher.test.mjs`、`tests/migration.test.mjs`），增 51 行、删 8 行；`--name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none` 清单 sha256 `7909f902…6220`，完整 diff sha256 `e4ea2cf3…92f8` |
| Candidate B | `731515dade6a5c95607509cf14efaf7b68bbd4dc`（tree `bc694641…aae`），基线 `f9a7fd0`（代码与 r3 批准的 `66767a9` 逐字节相同）。范围 4 个路径（`server/launch-plan.mjs`、`scripts/launch.mjs`、`tests/launch-plan.test.mjs`、`tests/migration.test.mjs`），增 66 行、删 4 行；清单 sha256 `2c63e303…9fc9`，完整 diff sha256 `db5ecb00…c9e4` |
| 累积链 | `2b0c6a7`（r2）→ `74cce24`（本轮）→ `2b7a4f3`（只改文档）→ `66767a9`（r3）→ `f9a7fd0`（只改文档）→ `731515d`（本轮）→ `e316c79`（只改文档，代码与 `731515d` 相同）。本轮之后，阶段 1 代码的累积链每一段都有独立复核；没有 replace refs 或 grafts |
| 直接受影响的调用方 | `migrationGate` 的调用方（`launch-plan.mjs` 的 `migrationCheck`，经 `bootstrap.mjs` 的 `planLaunch` 与 `launch.mjs` 锁内两处）；`withOperation` 与关闭计划路径的全部服务写操作；`legacyOwnership` 的唯一调用方 `launch.mjs` `checkOwner`（`start`、`restart`、`status`、`stop`，锁外一次、锁内一次）；冻结代码 `337547a` 的 `handover.mjs`、`ab6856f` 的 `self-update.mjs`、`launch.mjs` |
| 工作区绑定 | 开始时 HEAD 为 `e316c79`。评审期间另一位作者先后提交了 `38bd668`（phase 2a，22:03，改 `bootstrap.mjs`、`launch.sh`、`toolchain.mjs` 等）与 `fe777f2`（phase 2b），两者都不改 `references/`；工作区另有该作者的未提交改动。这些都不在本轮范围，本轮没有读取或改动它们；测试与实验全部在 `git archive` 导出的不可变副本中运行（见第 5 节） |
| 事实源 | HLD-SDX-001 v1.13（`3d6295b0…0c6a`）3.7 第 724～728 行、DEC-SDX-007、009、010、022；API-SDX-001 v0.13：36b 6.3 第 204～205 行、附录 A.5 G-18；冻结代码 0.10.2 = `ab6856f`、0.10.3 = `337547a` |
| Scope Lock | `564e76a6e6f04f11c48317440ff7687a5f71de79f5449d1d4616803e47d2c6a8`（`scope_lock_digest.py` 生成，payload 为实验目录 `scope-lock-r4.json`）。批准来源回到 HLD v1.0 的用户批准与 DEC-SDX-007/009/010/022、DG-NO-LLD；v1.13 的有限增量经 HLD 第 21 轮核对，在已批准边界内 |

## 2. 结论

**APPROVED**（源码层；`74cce24` 相对 `38bf3df`、`731515d` 相对 `f9a7fd0`）。

- P0：0
- P1：0
- 上一轮 P2：R2-P2-03、R2-P2-04、CR3-P2-01、CR3-P2-02 已关闭；R2-P2-01 **部分关闭**（指向文件的链接仍被误判，余项并入 R4-P2-01）；HLD R20-P2-02 的实现**部分关闭**（自定义 Claude 配置目录不可见这一情形仍是通用提示，余项为 R4-P2-02）
- 新 P2：3 项（R4-P2-01～03，不阻断，见第 4 节）。另有一项设计层 P2（按“删除启动记录”一步操作时旧服务可能仍在运行）记在 HLD 第 21 轮 R21-P2-01，本报告引用实验证据，不另计
- SCOPE_DECISION / EVIDENCE_BLOCKED：无
- 是否需要 Owner 决定：不需要

全部输入为不可变提交：本结论即 `74cce24`（tree `60dd2496…`）与 `731515d`（tree `bc694641…`）各自相对其基线的 Code Review Approval Certificate；`e316c79` 的代码与 `731515d` 逐字节相同，结论同样适用。`38bd668`、`fe777f2` 及之后的提交、工作区未提交改动未审。本结论不授予推送、合并、CI 或发布权限。

## 3. 逐项核查

### 3.1 `74cce24`：R2-P2-01（门槛把插件目录中的普通文件判为不可读）

修正：`migration.mjs` 第 37～40 行在读废弃标记前先 `lstat` 条目：目录或符号链接继续按原逻辑；其他类型或已不存在则跳过；`lstat` 本身失败记为 `UNREADABLE`。

探针 `r21-gate.mjs`（每个情形一个新的临时 HOME，对比修正前 `38bf3df` 与修正后 `74cce24`；`e316c79` 与 `74cce24` 结果逐项相同）：

| # | 情形 | `38bf3df` | `74cce24` | 判断 |
|---|------|-----------|-----------|------|
| G0 | 基线：0.11.0 在用、0.10.2 带废弃标记 | 通过 | 通过 | 不变 |
| G1 | `<market>/skilldock/` 下有普通文件 `notes.txt` | 不通过（`notes.txt` EACCES） | **通过** | R2-P2-01 的主情形已修正 |
| G2 | `<market>/skilldock/` 下有指向文件的符号链接 | 不通过（EACCES） | **不通过（EACCES）** | 未修正：链接一律当目录处理，随后 `fs.access(R_OK\|X_OK)` 跟随链接检查文件的执行权限而失败。R2-P2-01 原文点名了“或指向文件的链接”，见 R4-P2-01 |
| G3 | 悬空链接 | 通过 | 通过 | 不变 |
| G4 | 指向 0.10.1 安装目录的链接 | 不通过（阻断项 0.10.1） | 不通过（阻断项 0.10.1） | 不变，正确 |
| G5 | 缓存根（marketplace 一级）下的普通文件 | 通过 | 通过 | 修正前已忽略（`listDirectory` 吞掉 ENOTDIR） |
| G6 | `<market>/skilldock` 本身是文件 | 通过 | 通过 | 修正前已忽略 |
| G7 | `<market>/skilldock/.DS_Store` | 通过 | 通过 | 点开头的名称被 `safeSegment` 过滤，修正前已忽略 |
| G8 | 版本目录权限 000 | 不通过（EACCES） | 不通过（EACCES） | 不变，正确（读不出的证据从不通过） |

新增断言的有效性：`migration.test.mjs` 第 92～93 行加入的两个文件是 `<market>/skilldock/.DS_Store`（G7）与缓存根下的 `notes.txt`（G5），两者在修正前就被忽略。把 `74cce24` 副本中的 `server/migration.mjs` 换回 `38bf3df` 的版本后，`gate evidence` 用例仍然通过（`run-mut-gate.out`）。即这条回归断言没有覆盖被修正的路径（G1），见 R4-P2-01。

结论：**部分关闭**（G1 已修正；G2 与测试有效性并入 R4-P2-01）。修正没有引入新的误判：`lstat` 失败（如插件目录可读不可进入）仍记为不可读，方向是“不通过”。

### 3.2 `74cce24`：R2-P2-03（服务写前代号检查）

| 验收点 | 结果 | 依据 |
|--------|------|------|
| (a) 关闭计划的快速路径在写文件、注销后台之前检查代号 | 满足 | `service.mjs` 第 1042 行 `ensureGeneration()` 位于 `verifyDirectoryRoot`、`writeJson(disabledFile)`、`background.remove` 之前；代号更高时只返回 `DATA_GENERATION_NEWER`，不写 `disabled.json`、不注销。测试 `migration.test.mjs` 第 237～239 行断言错误码且 `background/disabled.json` 不存在 |
| (b) 取锁之后再查一次 | 满足 | 第 143～144 行：取得实例锁（代号 2）与 Codex 锁之后再调用 `ensureGeneration()`，失败时先释放锁再抛出；`operationActive` 只在检查通过后置位。迁移在 `withStateLocks` 内写代号（`launch.mjs` 第 343～355 行），服务取锁不等待，所以“检查后、取锁前完成迁移”的窗口被第二次检查覆盖 |
| 不改变代号 1 服务的锁语义 | 满足 | 第 133～141 行未改：代号 1 只取 Codex 锁（0.10.x 锁法），代号 2 取实例锁与 Codex 锁 |
| 副作用 | 无新增 | `generation.json` 读不出或格式错时 `readGeneration` 返回无穷大，与原有第一次检查相同；`refreshSchedule` 只吞 `BUSY`，`DATA_GENERATION_NEWER` 照旧上抛（修正前已如此） |

第二次检查的竞态窗口很窄，没有构造确定性实验，按代码核对。结论：**已关闭**。

### 3.3 `74cce24`：R2-P2-04（锁竞争的回归测试）

| r2 实验 | 现有测试 | 结果 |
|---------|---------|------|
| X2：代号 2 `restart`，Codex 锁被占用 | `launcher.test.mjs` 第 256 行，`held` 取 `instance`、`codex` 两次 | 已覆盖 |
| X4：单独 `stop`，锁持续被占 | 第 268 行：进程已退出、`status` 为已停止、再 `start` 正常 | 已覆盖 |
| X1：代号 1 迁移路径锁忙 | `migration.test.mjs` 第 242 行：占用实例锁，断言旧实例存活、无 `generation.json`、计划文件逐字节不变、无 `migration-failure.json`，释放后重试迁移成功 | 已覆盖（占用的是实例锁而不是 Codex 锁；两把锁由同一个 `withStateLocks` 获取，Codex 锁一侧已由 X2 用例覆盖，组合足够） |

结论：**已关闭**。

### 3.4 `731515d`：行为证据

`HLD v1.13 3.7 第 725～727 行 + DEC-SDX-007/022 + 36b 6.3、G-18` → 生产入口 `launch.mjs` `checkOwner`（第 189～216 行；锁外第 217 行、锁内第 262 行）与 `bootstrap.mjs` → `planLaunch` → `migrationCheck`（门槛，只在 `start`、`restart`、代号 1）→ 实际 helper `legacyOwnership`（`launch-plan.mjs` 第 153～189 行），使用真实的 `canonical`、`readText`、`sourceKeyFor`、`agentRoots`，没有替身 → 独立 oracle：HLD 3.7 三种情形、G-18 四种结果、门槛的同一证据口径 → 合法、非法、失败结果见下表 → 直接调用方只有 `checkOwner`；重启任务在接受之前经过同一检查，拒绝时不写 `restart.json`。

替身边界：Claude 侧旧实例是仓库夹具中的最小应用（不是真实 0.10.2）；“废弃标记”由探针写入；后台接管只改写数据目录内的文件，不调用 `launchctl`。

归属探针 `r21-owner.mjs`（r20 探针的副本，增 U5o、U6b、U17、U18），对比 `66767a9`（修正前）与 `e316c79`（= `731515d`）：

| # | 情形 | 修正前 | 修正后 | 门槛 | 判断 |
|---|------|--------|--------|------|------|
| U1、U12、U18 | 仍在用的 0.10.2（含其他 marketplace、marketplace 已从 Claude 移除） | `claude-legacy` | `claude-legacy` | 失败 | 不变 |
| U2、U3、U4、U13、U14 | 带废弃标记、已删除、0.10.3、自定义目录经环境变量可见、缓存与两个配置目录配对 | `family` | `family` | 通过 | 不变 |
| **U5** | 仍在用，`package.json` 权限 000 | `family` | **`claude-legacy`** | 失败（不可读） | CR3-P2-01 已修正 |
| U5o | 带废弃标记，`package.json` 权限 000 | `family` | `family` | 通过 | 废弃标记优先，与门槛一致 |
| **U6** | 仍在用，`package.json` 不是 JSON | `family` | **`claude-legacy`** | **通过**（不计为安装） | 与门槛口径不一致，见 R4-P2-03 |
| U6b | 仍在用，`package.json` 为 `{}` | `family` | `family` | 通过 | 与 U6 处理不同，见 R4-P2-03 |
| U7、U8 | `package.json` 缺失；废弃标记不可读 | `family` | `family` | 通过 | 不变 |
| U9 | 版本目录权限 000 | 抛出 EACCES | 抛出 EACCES | — | 不变（修正前即如此） |
| **U10、U10b** | 带废弃标记，marketplace 已从 Claude 移除；`known_marketplaces.json` 不存在 | `null` | **`claude-unverified`** | 通过 | R20-P2-02 的前两种情形已修正 |
| U11、U12b | 来自 fork；其他 marketplace 带废弃标记 | `null` | `null` | 通过 | 不变，正确（DEC-SDX-007） |
| **U13b** | 自定义 Claude 配置目录，本进程看不到（未设 `CLAUDE_CONFIG_DIR`） | `null` | **`null`** | 通过 | 仍是通用提示，见 R4-P2-02 |
| U17 | 自定义配置目录，只有 `CLAUDE_CODE_PLUGIN_CACHE_DIR` 可见 | `null` | `claude-unverified` | 通过 | 只有这种较少见的配置会得到新提示 |
| U15、U16 | 路径形态不符 | `null` | `null` | — | 不变 |

### 3.5 `731515d`：CR3-P2-01（`package.json` 存在但读不出）

| 动作 | 修正前（r3 E5） | 修正后（本轮 F3、F5） | 判断 |
|------|----------------|---------------------|------|
| `stop` | 停止可能仍在用的旧实例并删除记录 | 退出 1，`MIGRATION_BLOCKED`；旧实例存活；`launcher.json`、`local/updates.json`、后台 `context.json` 等六个文件逐字节不变 | 已修正 |
| `status` | 报运行中 | 退出 1，同上 | 与“仍在用”的处理一致 |
| `start`（真实入口 `bootstrap.mjs`） | 门槛以 4 退出（权限步骤） | 相同：门槛先于工具链与启动器，以 4 退出，stdout 为空，给出“为当前用户开放 … 的读取权限后重试”（F5） | 不变 |
| `start`（直接调用 `launch()`） | 门槛以 4 退出 | 归属判定以 4 退出，给出“更新 Claude 中的 SkillDock”步骤（F3） | 只影响测试或程序化调用；真实入口先走门槛 |

结论：**已关闭**。提示文字“Claude 中装有低于 0.10.3 的 SkillDock”在版本读不出时并不确切，并入 R4-P2-03。

### 3.6 `731515d`：R20-P2-02 的实现（来源无法核实时的单独提示）

- `marketplace` 与本安装相同、该缓存所配对的配置目录中查不到来源标识时返回 `claude-unverified`（`launch-plan.mjs` 第 181～184 行），`checkOwner` 以 `OWNER_UNVERIFIED`、退出 1 拒绝，给出原因与三条步骤（`launch.mjs` 第 201～207 行）。
- 实验 F1：U10 情形、旧实例存活，`start`、`status`、`stop`、`restart` 都以 `OWNER_UNVERIFIED` 退出 1；旧实例存活；六个文件逐字节不变；`planLaunch` 为 `continue`（门槛通过），拒绝发生在启动器写任何文件之前。
- 实验 F5（真实命令行，Codex 缓存中的完整副本）：`launch.mjs status`、`stop` 退出 1，stdout 为空，stderr 为原因与“处理步骤”三条；符合 36b 6.3“非 0 时 stdout 为空，原因与处理步骤只写 stderr”。
- 实验 F2：U13b 情形（R20-P2-02 第三种情形，自定义 Claude 配置目录从 Codex 侧不可见）仍得到“此数据目录属于另一个源码实例；旧 testany-eng 用户可使用 --migrate-from testany-eng……”的通用提示；设置 `CLAUDE_CONFIG_DIR` 后同一数据目录 `status` 为 running（同族）。原因：来源不在任何已知缓存之下，`legacyOwnership` 在循环外返回 `null`，到不了新分支。HLD v1.13 第 727 行与 G-18 都写了“Claude 配置目录不可见”时给出原因与步骤，见 R4-P2-02。

结论：**部分关闭**（marketplace 已移除、清单缺失两种情形已关闭；配置目录不可见的主要情形未关闭）。

### 3.7 `731515d`：CR3-P2-02（回归测试）

| r3 要求 | 现有测试 | 结果 |
|---------|---------|------|
| E1 存活的过期 Claude 侧实例在锁内先停止再迁移；E1b 锁忙时不停止 | `migration.test.mjs` 第 292 行（同一用例先锁忙、后迁移，断言旧 pid 已退出） | 已覆盖 |
| E3 对过期记录执行 `stop` | 第 306 行（断言实例停止、0.10.x 记录按 0.10.2 删除） | 已覆盖 |
| U10 来源无法核实、U11 来自 fork | `launch-plan.test.mjs` 第 98～104 行（单元层：fork 为 `null`，清单为空为 `claude-unverified`） | 已覆盖（启动器层的退出码、步骤与“文件不变”没有用例，本轮 F1、F5 实测相符；建议随 R4-P2-02 补一条） |
| CR3-P2-01 | `launch-plan.test.mjs` 第 92～97 行（权限 000 为 `claude-legacy`） | 已覆盖 |

结论：**已关闭**。

### 3.8 对冻结代码的影响

- 两个提交都不改 0.10.x 代码，也不改 0.10.2、0.10.3 写启动记录的方式（`337547a` `installation.mjs`）。
- 拒绝都发生在写任何文件之前：`checkOwner` 在锁外（`launch.mjs` 第 217 行，早于 `mkdir` 与取锁）与锁内（第 262 行，早于接受重启任务与任何写入）；F1、F3 的六个文件逐字节不变。
- 退出码变化都落在冻结调用方已有的分支内：冻结调用方只区分 0 与非 0（`337547a` `handover.mjs` 第 289～290、348、377 行；`ab6856f` `self-update.mjs` 第 25 行）。变化的情形是：`package.json` 读不出且仍在用时 `status`、`stop` 由 0 改为 1；`package.json` 不是 JSON 且仍在用时四个动作由 0（迁移或停止旧实例）改为 4 或 1。两者都是更保守的方向，旧实例不再被停止。
- 0.10.3 转交链只在代号 2 或较新记录下触发（`handover.mjs` 第 316～318 行），对非 0 结果按既有逻辑回落或返回 1，未变。

逐项结论见 HLD 第 21 轮报告专节：不改变 0.10.3、0.10.2 冻结代码的可观察行为。

## 4. 新问题清单

### 4.1 P0

无。

### 4.2 P1

无。

### 4.3 P2（不阻断，可选整改）

| ID | 位置 | 依据 | 复现或推理 | 建议 |
|----|------|------|-----------|------|
| R4-P2-01 | `server/migration.mjs:38-44`；`tests/migration.test.mjs:92-93` | R2-P2-01 原文（“名称合法的普通文件或指向文件的链接”）；HLD 3.7 只有“文件证据读不出来”才给权限步骤 | (a) 指向文件的链接仍被判为“无法读取（EACCES）”，门槛不通过且提示“开放读取权限”，按提示无法解除（G2；`original_unfixed` 的余项）。(b) 新增断言放置的两个文件在修正前就被忽略；把 `migration.mjs` 换回 `38bf3df` 后该用例仍通过，即回归断言没有守住修正（`remediation_delta`）。触发概率低（Claude、Codex 在该层只建版本目录），方向是“不通过”，旧版本照常工作 | 对符号链接改用 `fs.stat` 跟随后判断：目标不是目录就跳过，悬空链接跳过；断言改为在 `<market>/skilldock/` 下放一个合法名称的普通文件和一个指向文件的链接 |
| R4-P2-02 | `server/launch-plan.mjs:166-189`、`scripts/launch.mjs:201-215` | HLD v1.13 3.7 第 727 行“来源标识无法核实（该 marketplace 已不在 Claude 中、Claude 配置目录不可见）时同样拒绝，提示说明原因与可行步骤”；36b G-18 同句；R20-P2-02 第三种情形（U13b） | Claude 使用自定义配置目录、从 Codex 侧打开时，记录来源不在任何已知缓存之下，`legacyOwnership` 返回 `null`，提示仍是通用的“另一个源码实例……--migrate-from testany-eng……”（F2）。只有“缓存可见、配置目录不可见”（U17）才得到新提示。拒绝本身正确（退出 1、不写文件），缺的是原因与可行步骤（例如“从 Claude 一侧打开，或设置 `CLAUDE_CONFIG_DIR`”） | 二选一，都不需要 Owner 决定：① 循环外对目录形态记录补一条形态判断：来源形如 `<X>/plugins/cache/<本安装的 marketplace>/skilldock/<版本目录>/skills/skill-manager/assets/app` 而 `<X>` 不在已知根中时，同样返回 `claude-unverified`（仍是拒绝，只改提示），并补一条启动器层断言（退出码、步骤、文件不变）；② 或把 HLD 第 727 行与 G-18 的“配置目录不可见”收窄为实际覆盖的情形，并在通用提示中加一句“Claude 使用自定义配置目录时，从 Claude 一侧打开或设置 `CLAUDE_CONFIG_DIR`” |
| R4-P2-03 | `server/launch-plan.mjs:176-180`、`scripts/launch.mjs:208-213` | HLD 3.7 第 725 行“此时门槛本身也会失败”；第 727 行只把“存在但读不出”列为仍在用；门槛把不是 JSON 的 `package.json` 计为“不是安装”（`migration.mjs:53`）；r3 判 U6（`family`）“与门槛口径一致” | (a) `JSON.parse` 失败时 `version = null`，仍在用的目录被判为 `claude-legacy`，而门槛通过（U6、F4）：真实入口会先解析工具链、再由启动器以 4 退出，“门槛本身也会失败”不成立；同一函数对 `{}`（无版本）判为 `family`（U6b），处理不一致。(b) `package.json` 读不出（U5）或不是 JSON 时，提示仍说“Claude 中装有低于 0.10.3 的 SkillDock”，版本实际未知，也没有提权限（`status`、`stop` 只走这条提示）。由本修正引入（`introduced_by_fix`）；需要人为损坏或改权限才会出现，方向是拒绝，旧实例不受影响 | 只把 `text === null`（存在但读不出）当作仍在用；不是 JSON 的情形与门槛一致（按“不是安装”），或者门槛也同样计为读不出，两处取同一口径；版本未知时提示改为“无法读取 … 的版本”，并附门槛同款的权限步骤 |

### 4.4 其他观察（不计入问题）

- **按“删除启动记录”一步操作时旧服务可能仍在运行**（实验 F6）：`OWNER_UNVERIFIED` 第 1 步是“若 Claude 中已不再使用那份 SkillDock：删除 `launcher.json` 后重新打开”。旧实例仍在运行时照做，同端口启动以“端口已占用；请设置其他 PORT”失败；换端口后迁移成功（代号 2、计划 2 版），旧实例仍在运行并通过健康检查，绕过了 HLD 3.7 第 1 步“先停止存活的旧实例”。这一步来自 HLD 第 20 轮评审自己的推荐措辞（当时没有写“其服务已停止”），属设计层，记为 HLD R21-P2-01，此处不重复计数。
- `legacyOwnership` 只看第一个包含来源的 Claude 缓存配对；同一缓存先后与两个配置目录配对、第一个查不到来源时，结果为 `claude-unverified` 而不继续查第二个。修正前同样只看第一个（结果为 `null`），拒绝不变，只是提示更具体；不是本轮引入。
- 门槛对 `lstat` 失败记为 `UNREADABLE`（不是具体错误码）；提示仍给出路径与权限步骤，可接受。
- `38bd668`（phase 2a）、`fe777f2`（phase 2b）与工作区未提交改动不在本轮范围。只读看过 `38bd668` 的 `bootstrap.mjs`：`planLaunch`（门槛）仍在解析工具链之前，F5 的顺序不变；它在 `start`、`restart` 解析工具链时把选中的 Node 保存到 `<state>/settings/`，这一写入发生在启动器的归属检查之前（例如 R4-P2-03 的情形）。`settings/` 不在 HLD 3.7 列出的 0.10.x 读取文件之内，留给 phase 2 的代码评审确认。

## 5. 测试与实验记录

### 5.1 测试运行

由于工作区有其他作者的未提交改动（`runtime.mjs`、`toolchain.mjs` 等会被测试夹具复制或导入），测试没有在工作区运行，而是在 `git archive e316c79 plugins/skilldock` 导出的副本中运行（代码与 `731515d` 逐字节相同；`node_modules` 为指向仓库同名目录的只读符号链接）。

运行环境：`env -i HOME=<实验目录>/home TMPDIR=<实验目录>/tmp PATH=<nvm Node 22.14.0>:/usr/bin:/bin:/usr/sbin:/sbin npm_config_offline=true`，并以 `NODE_OPTIONS=--import=<实验目录>/guard.mjs` 加载拦截模块：任何发往 4771 端口或非本机地址的 `fetch`、TCP 连接与 `https` 请求都被拒绝并记录（模块自检时成功拦截并记录了对 4771 的探测）。外层以 540 秒闹钟限时。

| 命令 | 结果 | 用时 |
|------|------|------|
| `node --test --test-concurrency=1 tests/launch-plan.test.mjs tests/migration.test.mjs tests/launcher.test.mjs` | 41/41 通过（与作者报告一致） | 59 秒 |

拦截日志为空：测试期间没有任何发往 4771 或外网的请求。未运行兼容矩阵与全量测试（按委托）。作者报告的全量结果（332 项只失败已知的 `toolchain.test.mjs` 一项）本轮未复跑，仅作参考；两个 Candidate 都没有改动 `toolchain.mjs`。

### 5.2 补充实验

实验目录为 scratchpad 的 `verify/apir13-r21-lab/`（本轮新建）。`38bf3df`、`74cce24`、`66767a9`、`e316c79` 的 `plugins/skilldock` 各自用 `git archive` 导出。端到端探针放在导出副本的 `tests/` 下运行，夹具自带隔离 HOME，端口由 `listen(0)` 分配并断言不等于 4771，仓库地址不可达。

| 文件 | 内容 | 结果 |
|------|------|------|
| `r21-gate.mjs` | 门槛对非目录条目的 9 个情形（G0～G8），三版代码对照 | 第 3.1 节；`gate-<提交>.json` |
| `mut-gate/` + `run-mut-gate.out` | `74cce24` 副本换回 `38bf3df` 的 `migration.mjs`，只跑 `gate evidence` 用例 | 仍通过（R4-P2-01 (b)） |
| `r21-owner.mjs` | 归属判定与门槛的 23 个情形（U1～U18），修正前后对照 | 第 3.4 节；`owner-66767a9.json`、`owner-e316c79.json` |
| `r21-e2e.test.mjs` | 端到端探针 F1～F6 | F1～F6 全部按预期运行（`run-e2e.out`、`run-e2e-F6.out`）：F1 无法核实时四个动作退出 1、文件不变；F2 配置目录不可见时为通用提示；F3 读不出时 `stop` 不再停止旧实例；F4 不是 JSON 时门槛通过、启动器拒绝；F5 真实命令行 stdout 为空、`bootstrap.mjs start` 在门槛处以 4 退出；F6 按第 1 步删除记录并换端口后迁移成功而旧实例仍在运行 |
| `scope-lock-r4.json` | 本轮 Scope Lock payload | 摘要 `564e76a6…c6a8` |

测试输出摘要：`run-tests.out` sha256 `a650550c5d8b…`。实验结束后 `pgrep -fl apir13-r21-lab` 没有残留进程。

### 5.3 安全约束遵守情况

未向 `127.0.0.1:4771` 发送任何请求（拦截模块日志为空）；未读写真实 `~/.claude`（只读取了 `plugins/cache/testany-agent-skills/testany-eng/` 中的评审技能与追溯脚本）、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；未执行 `launchctl`；未联网下载；删除只发生在实验与夹具自建的临时目录内；未提交或推送；未修改被审代码、文档或其他作者的未提交改动；未打印凭证。本轮启动的实例均已停止。

## 6. 状态分层

| 层 | 状态 |
|----|------|
| 源码（本报告） | APPROVED：P0/P1 为 0；上一轮 P2 中 4 项关闭、2 项部分关闭（余项转为新 P2）；新 P2 3 项可选 |
| CI（exact SHA） | NOT_RUN（分支未推送） |
| 环境 | 不适用（无部署） |

## 7. 下一步

源码复核到此结束，不需要再一轮。可选：R4-P2-02 建议在 0.11.0 发布前处理（与 HLD R21-P2-01 的提示修改一起，改动集中在同一段提示）；R4-P2-01、R4-P2-03 改动小，可随手处理。处理后只需对改动部分做 delta 复核。HLD 11A 条件 3 的全量重跑仍是 0.11.0 合并前的条件；`38bd668`、`fe777f2` 起的 phase 2 代码需另行评审。
