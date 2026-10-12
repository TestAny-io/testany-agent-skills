# 代码评审报告（复核）：SkillDock 0.11.0 阶段 1 评审意见的修正

> 本报告是独立代码复核意见，不是批准提交、推送、合并或发布的授权。源码结论、CI 状态与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| Review ID | `CRV-325a8bc5-2a5e-4e08-a8a3-9f32e4561a07`（`remediation_delta_review`，第 2 轮） |
| 上一轮 | `CRV-7ab23f8a-9f99-401b-9493-4d5657dbe75f`，[38-cross-agent-phase1-code-review.md](38-cross-agent-phase1-code-review.md)，结论 CHANGES_REQUESTED（P1-01；P2-01～P2-13） |
| 评审者 | 独立 Lead Dev Reviewer（Claude，按 `testany-eng:code-reviewer` 2.7.1 执行） |
| 日期 | 2026-10-08 |
| 仓库 / 分支 | `testany-agent-skills`，`feature/skilldock-0.11-cross-agent`（本地，未推送） |
| 评审基线 | `4e647617d9f368b026bdaa63ecfff6a4caebcd75`（上一轮 Candidate） |
| Candidate | `2b0c6a71daa709c4f1f30c735fb30b27a304f9f1`（tree `5ce842afe72d652ed94a85e2aa419ae67d33d5be`） |
| 范围 | `git diff 4e64761 2b0c6a7 -- plugins/skilldock ':!plugins/skilldock/skills/skill-manager/references'`，10 个路径（name-status 清单 sha256 `3857dee4…a0d3`，完整 diff sha256 `778ee3f3…23ca6`）；另核对直接受影响的调用方：`launcher-record.mjs`、`process-lock.mjs`、`background-worker.mjs`、`background.mjs`、`project-context.mjs`、`installs.mjs` 与 0.10.2 冻结代码（`ab6856f`）的 `self-update.mjs`、`service.mjs`、`index.mjs` |
| 工作区绑定 | 工作区 HEAD 为 `38bf3df`（Candidate 之后只改 references）；评审前后均核对：工作区干净，范围内代码与 `2b0c6a7` 逐字节相同 |
| 事实源 | HLD-SDX-001 v1.10、契约 API-SDX-001 v0.10（`38bf3df`；相对 Candidate 提交时的 v1.9 / v0.9，与本轮 delta 相关的条文只有 36b G-17 的措辞澄清，与测试一致）；实施计划 37（阶段 5 已登记 0.11 自更新协调器）；冻结代码 0.10.2 = `ab6856f`、0.10.3 = `337547a` |
| Scope Lock | 沿用上一轮 `4b908bda8ace4f4798d3d9e917693a9940387ac6bc7c16688922a873d14bc434`（正常整改，不重新求批准） |

## 2. 结论

**APPROVED**（源码层）。

- P0：0
- P1：0（P1-01 已关闭）
- P2：新 4 项（不阻断，见第 4 节）；上一轮 P2-01～P2-13 均已处理或按约定延后
- SCOPE_DECISION / EVIDENCE_BLOCKED：无
- 是否需要 Owner 决定：不需要。迁移路径“先取锁、后停旧实例”的顺序可接受，HLD 只需在下一次修订中把 3.7 第 1、2 步与 6.6 时序图的文字改成实际顺序（R2-P2-02），属工程侧的精度修订，走正常的 HLD 增量复审即可

全部输入为不可变提交：本结论即 `2b0c6a7`（tree `5ce842af…`）的 Code Review Approval Certificate；`38bf3df` 在范围内代码与其逐字节相同，结论同样适用。它不授予推送、合并、CI 或发布权限。

## 3. 逐条复核

### 3.1 P1-01（停旧实例之后才取锁，锁忙超时后不回滚）

| 验收点 | 结果 | 证据 |
|--------|------|------|
| 停旧实例之前取得实例锁与 Codex 锁，持有到新实例写好记录或回滚完成 | 满足 | `scripts/launch.mjs:336-348`：`withStateLocks` 内依次核对记录、停旧实例（`locked: true`）、迁移、`startRuntime`；失败时 `recover`（`:325-333`）也在锁内恢复旧实例 |
| 取不到锁就在停止前失败，旧实例不受影响 | 满足 | 测试 `launcher.test.mjs:256`（实例锁被占用）；实验 X2（Codex 锁被占用）与 X1（代号 1 迁移路径，Codex 锁被占用）：均以“另一项 SkillDock 操作……未停止现有服务”失败，旧实例 pid 不变，记录、计划、后台上下文逐字节不变，未写代号与 `migration-failure.json`；释放锁后同一命令正常迁移 |
| 锁在等待期间释放后可继续 | 满足 | 实验 X3：1.5 秒后释放实例锁，`restart` 成功切换 |
| 持锁段内的 stop 不再二次等锁 | 满足 | `launch.mjs:54-64`：`locked` 时直接比较后写入已停止形态 |
| 单独执行 stop：进程已退出后锁忙不再报错 | 满足 | 实验 X4：锁持续被占时 `stop` 约 10.2 秒返回“已停止”，进程已退出；记录保留 `running`，随后 `status` 报已停止、`start` 正常 |
| 回滚 0.10.x 记录不依赖再次取锁 | 满足 | 回滚在同一持锁段内完成（`launch.mjs:328`），迁移测试“failed takeover restores every file and the old instance”通过 |
| 锁持有期间不会与旧实例的停止过程互锁 | 满足（静态核对） | 0.11 服务的 `withOperation` 取锁不等待（`service.mjs:130-138`）；关闭时等待的 `restoreMissingRecord`、`refreshInstallations` 先试取 `launcher.lock`（启动器持有）即跳过；0.10.2 的 `pauseForRestart` 只置标志、关闭过程不取锁（`ab6856f` `service.mjs:1072-1073`、`index.mjs:73`）；后台工作进程取锁同样不等待 |

结论：**CLOSED**（`original_unfixed` → 已修复）。

**关于迁移路径的顺序与 HLD 不同**：代码为“启动锁 → 门槛 → 准备运行目录 → 实例锁与 Codex 锁 → 停旧实例 → 接管 → 计划 → 启动记录 → 代号 2 → 启动新实例 → 释放锁”；HLD 3.7“迁移与接管”第 1 步写“先取启动锁，再停止旧实例”，第 2 步“在实例锁与 Codex 锁内接管”，6.6 时序图写“停止存活的旧实例；取实例锁与 Codex 锁”。判断为**可接受**：

1. HLD 第 1、2 步各自的要求仍成立（停旧实例前已持启动锁；接管在两把锁内），写入顺序（计划 → 记录 → 代号最后）不变；
2. 持锁区间只是向前延伸到覆盖“停旧实例”。停旧实例本身会删除 0.10.x 记录或写已停止形态，属于 DEC-SDX-010 列出的共享状态写入，按决定本应持两把锁；HLD 第 1 步的目的（防止停止后、接管前旧后台或旧入口改写注册、拉起旧实例）在持 Codex 锁时更有保障——0.10.x 后台批次在这段时间内取不到锁；
3. 它正是 HLD 3.7“入口行为”中“先构建后停旧启新，失败回滚”的实现条件：锁忙发生在破坏性步骤之前；
4. 不新增锁、文件或进程，外部可观察的变化只有“锁忙时在停止前失败”；36b 的 S-17a（迁移期间 0.10.3 取启动锁失败）不受影响。

因此不需要 Owner 决定；建议在下一次 HLD 修订中把 3.7 第 1、2 步与 6.6 时序图（以及实施计划 37 阶段 1“固定顺序”一行）改成实际顺序，并在增量复审中核对（R2-P2-02）。

### 3.2 P2 复核

| ID | 作者处理 | 复核结果 | 依据 |
|----|---------|---------|------|
| P2-01 | 只有不存在才算缺失，其他错误记为不可读 | 已关闭；修正引入一处新的误判（R2-P2-01） | `migration.mjs:28-47`；测试 `migration.test.mjs` 门槛证据用例新增版本目录 000、`~/.claude/plugins` 000 两种情形，均 `passed: false`。实验 X6：插件目录下有普通文件（如 `notes.txt`）时，新代码把它记为不可读（EACCES），旧代码忽略 |
| P2-02 | 复用时在锁内比较后写回 running；stop 先核实实例 | 已关闭 | `launch.mjs:276-281`、`:66-76`；测试 `launcher.test.mjs:298`：记录改为 `stopped` 后 `start` 复用并改回 `running`；再改为 `stopped` 后 `stop` 真正停止进程 |
| P2-03 | 刷新前试取 `launcher.lock`，被占用就跳过 | 已关闭 | `launch-plan.mjs:77-87`；服务的 10 秒刷新与后台工作进程（`background-worker.mjs:71`）走同一函数；测试 `launch-plan.test.mjs:173` 断言持锁时不刷新 |
| P2-04 | 锁外先判断记录是否缺失 | 已关闭 | `launch.mjs:254`；实验 X5：实例锁被占用、记录存在时复用耗时 13 毫秒（上一轮固定 10 秒） |
| P2-05 | 撤销逐个尝试、汇总失败并写进原因 | 已关闭 | `migration.mjs:120-129`、`launch.mjs:160-161`；实验 X7：第一个文件无法写回时其余文件仍恢复，错误为“以下文件未能恢复：context.json（EACCES）” |
| P2-06 | 无 `CODEX_HOME` 时取记录中的 `codexHome`（启动器与引导程序） | 已关闭 | `launch.mjs:181`、`launch-plan.mjs:135`；0.10.2 记录同样带 `codexHome`；测试 `launcher.test.mjs:326`：不带 `codexHome` 的 `restart` 沿用记录中的自定义目录 |
| P2-07 | 换版本且项目非显式时沿用运行实例的项目 | 已关闭 | `launch.mjs:288-294`；`explicit` 只对 ①② 为真（`project-context.mjs:59`、`:65-68`），与复用规则一致；测试 `launcher.test.mjs:311` |
| P2-08 | 服务每 10 秒把实例内切换的项目同步到 `actualProject` | 已关闭 | `launch-plan.mjs:75-76`（只在记录的 pid 等于本实例且为 running 时写）；`index.mjs:42`；测试 `launch-plan.test.mjs` 末段 |
| P2-09 | 迁移后每次运行都确认固定子目录存在 | 已关闭 | `launch.mjs:212`（在 `status`、`stop` 分支之前）；测试 `launcher.test.mjs:326` |
| P2-10 | 服务写前检查代号；协调器登记到阶段 5 | 已关闭；检查的覆盖面有两处可改进（R2-P2-03） | `service.mjs:125-128`；测试 `migration.test.mjs:225`；实施计划 37 阶段 5 已写明“阶段 1～4 中它在代号 2 下不发起，属已知取舍”（在 `38bf3df`） |
| P2-11 | 安装摘要改为定时器刷新 | 已关闭 | `index.mjs:22-34`、`:50`；请求路径只读上次结果，`close` 等待进行中的刷新 |
| P2-12 | 删除坏导出 | 已关闭 | `state-locks.mjs` 不再导出 `isOperationActive`；仓库内引用均来自 `process-lock.mjs` |
| P2-13 | 补测试；(c)(f) 留到 11A 条件 3 | (a)(b)(d)(e) 已关闭；(c)(f) 延后可接受 | (a) G-12：`launcher.test.mjs:267`；(b) G-17：`:281`（记 ready 与窗口期任务）；(d) 锁竞争：`:256`（只覆盖实例锁与代号 2，见 R2-P2-04）；(e) `createApp` 已传 `codexHome`；(c)(f) 属 HLD 11A 条件 3 的合并前全量重跑，P2 不结转为阻断 |

### 3.3 其他随修正提交的改动

| 改动 | 结果 | 依据 |
|------|------|------|
| 归属判定的退出码 4 只用于 `start`、`restart` | 正确 | 契约 36b 6.3：4 表示迁移门槛未通过或快速拒绝，门槛只在 `start`、`restart` 执行；`status`、`stop` 以 1 退出（`launch.mjs:204-206`） |
| 依赖安装与构建输出写入 `<state>/build.log` | 正确 | 36b 6.3“依赖安装与构建的输出写入 `<state>` 下的日志文件，stderr 只写摘要”；`runtime.mjs:43-50` 以 0600 追加打开、`finally` 关闭，失败原因附日志路径；实验 X2 确认文件生成。后台工作进程不传 `log`，输出仍进后台日志，不在该义务范围内 |

## 4. 新问题清单

### 4.1 P0

无。

### 4.2 P1

无。

### 4.3 P2（不阻断，可选整改）

| ID | 位置 | 依据 | 复现或推理 | 建议 |
|----|------|------|-----------|------|
| R2-P2-01 | `server/migration.mjs:37-42` | HLD 3.7：门槛只判断是否装有低于 0.10.3 的 SkillDock；“文件证据读不出来”才给权限处理步骤 | 插件目录（`<cache>/<market>/skilldock/`）下若有名称合法的普通文件或指向文件的链接，读取 `<条目>/.orphaned_at` 得到 ENOTDIR（`readText` 返回 `null`），随后 `fs.access(条目, R_OK | X_OK)` 因文件无执行权限失败，被记为“无法读取（EACCES）”，门槛不通过，并提示“为当前用户开放该文件的读取权限”——文件本来可读，按提示操作无法解除。实验 X6：`4e64761` 判为通过，`2b0c6a7` 判为不可读。由 P2-01 的修正引入（`introduced_by_fix`）；Claude 与 Codex 在该层只建版本目录、点开头的文件已被过滤，触发概率低，且方向是“不通过”，旧版本照常工作 | `readText` 为 `null` 时先 `stat` 该条目：存在且不是目录就跳过；只有目录本身不可读才记入 `unreadable`。补一个“插件目录下有普通文件”的用例 |
| R2-P2-02 | HLD 3.7“迁移与接管”第 1、2 步，6.6 时序图；实施计划 37 阶段 1“固定顺序” | 文档与实现一致（见 3.1 节判断） | 实现为“取实例锁与 Codex 锁 → 停旧实例 → 接管”，HLD 时序图写“停旧实例；取实例锁与 Codex 锁” | 下一次 HLD 修订改成实际顺序，并写明“锁忙时在停止旧实例前失败，不计为迁移失败”；增量复审核对 |
| R2-P2-03 | `server/service.mjs:125-128`、`:1034-1039` | DEC-SDX-009（服务写前检查代号） | (a) 关闭计划的路径在 `withOperation` 之前写 `disabled` 文件并调用 `background.remove`（可能注销后台任务），不经过代号检查；(b) 检查在取锁之前，理论上存在“检查后、取锁前完成迁移”的窗口。当前只有未来的代号 3 或在代号 1 上启动的 0.11 服务会触发，迁移前启动器也会先停掉本服务，实际影响很小 | 把检查移到取锁之后；关闭计划路径在写文件前同样检查（代号更高时只返回 `DATA_GENERATION_NEWER`，不注销后台） |
| R2-P2-04 | `tests/launcher.test.mjs:256` 及迁移测试 | 计划 37 阶段 1 验证项 | 锁竞争测试只占用实例锁、只走代号 2；Codex 锁被占用、代号 1 迁移路径锁忙、单独 `stop` 时锁忙三种情形没有回归测试（本轮实验 X1、X2、X4 证实行为正确） | 把 X1、X2、X4 的断言补成测试（实验脚本见第 5.2 节） |

### 4.4 其他观察（不计入问题）

- 服务与后台工作进程刷新或补写记录时会短暂持有 `launcher.lock`（毫秒级，只在确有变化时）。此时恰好启动的 0.10.x 或 0.11 启动器取锁失败即以“另一个启动操作正在运行”退出；`restoreMissingRecord` 原本即如此，窗口极小，可接受。
- 单独 `stop` 遇到锁持续被占时，记录保留 `running` 与已退出的 pid。若该 pid 之后被其他进程占用，下一次 `start` 会以“无法核实记录中的进程……”拒绝，直到该进程退出。这与机器重启后记录 pid 失效的残留相同（0.10.2 起即有），本轮只是多了一条到达路径。
- （修正前即存在，不在本轮 delta 内）新实例在启动器持锁期间启动，其服务启动时的 `withOperation`（计划已启用时 `background.ensure()`）必然因锁忙而跳过，`4e64761` 已如此。后台上下文的运行目录随后由后台工作进程的 `refreshBackgroundRuntime` 更新，入口文件按上下文加载代码，暂未发现违反批准条文的后果；请作者在阶段 5 实现后台计划时确认这是有意的。
- `build.log` 只追加不轮转；只在准备新运行目录时写入，增长有限。

## 5. 测试与实验记录

### 5.1 测试运行

运行环境：`env -i HOME=<会话临时目录>/home TMPDIR=<会话临时目录>/tmp PATH=<nvm Node 22.14.0>:/usr/bin:/bin:/usr/sbin:/sbin`，不带 `CODEX_HOME`、`CLAUDE_*`、`PORT`、`SKILLDOCK_*`；外层以 600 秒闹钟限时。工作目录 `plugins/skilldock/skills/skill-manager/assets/app`，代码与 `2b0c6a7` 逐字节相同。

| 命令 | 结果 | 用时 |
|------|------|------|
| `node --test --test-concurrency=1 tests/launcher.test.mjs tests/migration.test.mjs tests/launch-plan.test.mjs tests/state-model.test.mjs tests/installs.test.mjs` | 47/47 通过（含新增的锁竞争、G-12、G-17、已停止形态纠正、换版本沿用项目、固定子目录与保存的 Codex 目录、门槛不可读、代号检查、刷新避开启动锁） | 37 秒 |

未运行兼容矩阵与全量测试（按要求）。作者报告的全量结果（329 项、328 通过，唯一失败为 0.10.2 上同样失败的 `toolchain.test.mjs` 一条）本轮未复跑，仅作参考；本轮 delta 未改动 `toolchain.mjs`。

### 5.2 补充实验（会话临时目录，夹具来自 `tests/helpers/launcher-fixture.mjs`；脚本 `experiments.test.mjs`、`x6.mjs`、`x7.mjs` 保存在会话草稿目录，未入库）

| ID | 目的 | 结果 |
|----|------|------|
| X1 | 代号 1 迁移路径：另一持有者占用 Codex 锁，0.10.x 实例运行中 | 约 5.7 秒（含构建，等锁 2 秒）以 `BUSY` 与“未停止现有服务”失败，退出码按 1；0.10.x 实例仍在运行；记录、计划、后台上下文逐字节不变，无 `generation.json`、无 `migration-failure.json`。释放锁后重试正常迁移 |
| X2 | 代号 2 `restart`：只占用 Codex 锁 | 停止前失败，旧实例与记录不变；`<state>/build.log` 已生成 |
| X3 | 等待期间释放实例锁 | `restart` 成功，旧进程已退出、新进程运行 |
| X4 | 单独 `stop`，实例锁持续被占 | 约 10.2 秒返回“已停止”、进程已退出；记录保留 `running`；随后 `status` 为已停止，`start` 正常启动并写回 `running` |
| X5 | 实例锁被占、记录存在时 `start` 复用 | 13 毫秒复用（P2-04 不再固定等 10 秒） |
| X6 | 插件目录下有普通文件时的门槛判定，对比 `4e64761` 与 `2b0c6a7` | 旧：`passed: true`；新：`passed: false`，`unreadable` 为该文件（EACCES）（R2-P2-01） |
| X7 | 撤销时第一个文件无法写回 | 其余文件仍恢复；错误汇总“以下文件未能恢复：context.json（EACCES）”（P2-05） |

输出摘要（sha256 前 12 位）：`test-run1.txt` `27251d681c9b`，`exp-run1.txt` `1df71bfebec8`。

### 5.3 安全约束遵守情况

未向 `127.0.0.1:4771` 发送任何请求（所有实例使用临时空闲端口）；未读写真实 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；未执行 `launchctl`；未联网下载；未永久删除文件（实验目录由夹具与脚本自身清理）；未提交或推送；未修改被审代码；未打印凭证。本轮启动的实例均已停止：实验前后本机 SkillDock 相关进程只有用户自己的进程（Codex 应用启动的 0.10.2 原生入口与真实数据目录下的服务），本轮未触碰。会话草稿目录 `r2/` 中另有 19:15～19:19 由其他会话留下的 `exp/`、`logs/` 与三个夹具目录，非本轮产生，本轮未改动。

## 6. 状态分层

| 层 | 状态 |
|----|------|
| 源码（本报告） | APPROVED：P1-01 已关闭，P0/P1 为 0；新 P2 4 项可选 |
| CI（exact SHA） | NOT_RUN（分支未推送，无远端分支） |
| 环境 | 不适用（无部署） |

## 7. 下一步

源码复核到此结束，不需要再一轮。可选：处理 R2-P2-01（门槛误判，改动小）与 R2-P2-04（把实验补成测试）；R2-P2-02 随下一次 HLD 修订处理；R2-P2-03 可在阶段 5 前处理。HLD 11A 条件 3 的全量重跑（含 P2-13 (c)(f)）仍是 0.11.0 合并前的条件。
