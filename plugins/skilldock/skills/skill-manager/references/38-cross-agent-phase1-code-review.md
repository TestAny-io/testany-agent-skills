# 代码评审报告：SkillDock 0.11.0 阶段 1（数据格式、迁移与单实例）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论、CI 状态与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| Review ID | `CRV-7ab23f8a-9f99-401b-9493-4d5657dbe75f`（`initial_full_review`，第 1 轮） |
| 评审者 | 独立 Lead Dev Reviewer（Claude，按 `testany-eng:code-reviewer` 2.7.1 执行） |
| 日期 | 2026-10-08 |
| 仓库 / 分支 | `testany-agent-skills`，`feature/skilldock-0.11-cross-agent`（本地，未推送） |
| 评审基线 | `af9c785b118936a2288f596797c06e2d745984d2` |
| Candidate | `4e647617d9f368b026bdaa63ecfff6a4caebcd75`（tree `e3d8bf04c4aa1e08b00f917d56602c47a8799de7`）；含 `3f3c08c`（1a）、`deee5f7`（1b）、`e4b9f98`（1c）、`4e64761`（1d），中间的 `f3634e8` 只改 references |
| 范围 | `git diff af9c785 4e64761 -- plugins/skilldock ':!plugins/skilldock/skills/skill-manager/references'`，36 个路径（name-status 清单 sha256 `39b8896b…01000`，完整 diff sha256 `11c66889…fb0`） |
| 工作区绑定 | 工作区 HEAD 为 `07ab0dc`（Candidate 之后只改 references）；评审前后均核对：工作区干净，范围内代码与 `4e64761` 逐字节相同 |
| 事实源 | 契约 API-SDX-001 索引 v0.9（36a 0.2、36b 0.9、36c 0.9）；HLD-SDX-001 v1.9；实施计划 37 阶段 1；冻结代码 0.10.2 = `ab6856f`、0.10.3 = `337547a`。契约 v0.9 与 HLD v1.9 本身处于“P2 增量待复核”状态，本轮按用户指定作为基线 |
| Scope Lock 摘要 | `4b908bda8ace4f4798d3d9e917693a9940387ac6bc7c16688922a873d14bc434`（payload 保存在评审会话临时目录，未入库） |

## 2. 结论

**CHANGES_REQUESTED**（按技能术语为 `CHANGES_REQUIRED`）。

- P0：0
- P1：1（P1-01：重启 0.11 实例时，旧实例已被停止，之后才等待实例锁与 Codex 锁；锁被他人占用超过 60 秒时既不启动新实例也不回滚，实例停摆）
- P2：13（不阻断；见第 3.2 节）
- SCOPE_DECISION / EVIDENCE_BLOCKED：无
- 是否需要 Owner 决定：不需要。P1-01 的最小修复不改变任何架构面；P2-10 只需在实施计划中登记阶段归属

总体判断：跨版本冻结面（启动记录新旧字段、`installation` 键顺序、健康检查冻结字段、计划文件与后台上下文版本、Claude 根目录记录、固定子目录、退出码 3/4 与“非 0 不写 stdout”）实现正确，0.10.2 / 0.10.3 冻结代码按契约读取 0.11 写下的文件的路径均有真实代码测试佐证；迁移顺序（停旧实例 → 实例锁 + Codex 锁内接管后台 → 计划 v2 → 已停止形态的启动记录 → 代号 2）与失败撤销正确；重启任务的接受时点、`executor`、终态、遗留任务关闭与快速拒绝符合 36b 7.4。阻断项只有 P1-01 一处，集中在“锁的获取晚于破坏性步骤”。

## 3. 问题清单

### 3.1 P1

#### P1-01 停止旧实例之后才获取实例锁与 Codex 锁，锁忙超时后不回滚，实例停摆

| 字段 | 内容 |
|------|------|
| severity | P1 |
| scope_classification | `in_scope` |
| provenance | `initial_review` |
| violated_frozen_invariant | HLD 3.7“入口行为”：任一侧出现更高版本时切换，“先构建后停旧启新，失败回滚”；36b 6.3：`stop` 把启动记录改为“已停止”形态；0.10.x 既有语义：构建或启动失败时保留或恢复健康的旧实例 |
| exact_evidence | `scripts/launch.mjs:69-76` 先 SIGTERM 并等旧进程退出，再调用 `settle()`；`launch.mjs:50-57` 的 `settle()` 对 0.11 记录走 `withStateLocks`，默认最多等待 60 秒（`server/state-locks.mjs:15`），超时抛 `BUSY`；`launch.mjs:294` 只有 `stop()` 正常返回才置 `stopped = true`，因此 `settle()` 抛错时 `launch.mjs:312` 的回滚条件不成立；即便 `stop()` 成功，`launch.mjs:305` 启动新实例、`launch.mjs:314` 回滚旧实例又各自重新等待同一把锁 60 秒。长时间持有这两把锁的一方是现有代码：`server/background-worker.mjs:21-28` 的 `acquireWorkerLock` 在整个到期批次（含 `refreshBackgroundRuntime` 的 `npm ci` 与构建）期间持有；`server/service.mjs:123-138` 的 `withOperation` 在界面写操作期间持有 |
| reproducer_or_failure_path | 实验 E1（第 6.2 节）：用夹具启动 0.11 实例（代号 2），另起一个进程持有 `<state>/instance.lock`，执行 `launch('restart')`。约 70 秒后以 `BUSY`（“另一个 SkillDock 进程正在执行操作，请稍后重试。”）失败；旧实例 pid 已不存在，健康检查无响应；`launcher.json` 仍为 `status: "running"`、pid 指向已退出的进程；没有任何实例在运行。同一根因还覆盖：单独执行 `stop` 时进程已停而命令报错、记录不改为“已停止”；`startRuntime` 等锁超时后回滚也因等锁失败，报“恢复上一运行版本失败”；代号 1 迁移路径中 `withStateLocks(migrate)` 超时后，0.10.x 旧实例的回滚同样要先等这两把锁 |
| impact | 用户在后台批次运行（或界面写操作进行）期间切换项目、切换到新版本或执行 `restart`，界面直接停摆，启动记录与实际不符；最坏情况下 10 + 60 + 60 + 60 秒的等锁叠加构建时间，可能超出 36b 6.3 的 590 秒。新版本安装后后台工作进程会因“安装变化”立即准备新运行目录，恰与用户打开新版本的时机重合，因此并非纯理论窗口。数据不受损，重新打开可恢复 |
| minimum_boundary_preserving_fix | 对代号 2 的运行实例：在停止旧实例之前，以有限等待取得实例锁与 Codex 锁并一直持有到新实例写好记录或回滚完成；取不到锁就在停止前失败（旧实例不受影响）。至少应做到：确认旧进程已退出即视为 `stopped = true`，`settle()` 在进程已退出后的失败不再中断流程；回滚 0.10.x 记录时不依赖代号 2 的锁。补一个“实例锁被另一进程持有时重启”的测试，断言旧实例仍在运行或已被恢复 |
| architecture_surface_delta | `none`（只调整已有锁的获取时机，不新增锁、文件或进程） |

### 3.2 P2（不阻断，可选整改）

| ID | 位置 | 依据 | 复现或推理 | 建议 |
|----|------|------|-----------|------|
| P2-01 | `server/migration.mjs:28-29`、`:35` | HLD 3.7：“文件证据也读不出来（例如目录无读权限）时……不提供确认后跳过”；作者取舍 1 声称“不可读即不通过” | 实验 E3：Claude 缓存中的 0.10.2 版本目录权限为 000 时，`.orphaned_at` 读取得到 EACCES，被当作“带废弃标记”跳过；`~/.claude/plugins` 权限为 000 时，`realOrNull(cacheDir)` 吞掉 EACCES，整个缓存根被当作不存在。两种情形门槛都判为通过。现有测试只覆盖 `skilldock` 目录不可读一种情形 | 只有 ENOENT 才视为“不存在 / 没有废弃标记”，其他错误一律记入 `unreadable`；缓存根 `realpath` 的非 ENOENT 错误同样记入。补对应测试 |
| P2-02 | `scripts/launch.mjs:60`、`:258-266`、`:261-262` | 36b 6.3：退出 0 之前启动记录为 `status: "running"`；`stop` 按 0.11 自身语义停止实例 | 实验 E2：记录为“已停止”形态而实例实际在运行（例如 `restoreRecord` 的健康检查因超时失败而写成已停止形态）时，`start` 复用实例并退出 0，记录仍是 `stopped`（0.10.3 第 2 步因此不再交还，每次都走第 3 步）；此时 `stop` 只看 `status` 就返回“此实例已停止”，进程并未停止。另外复用路径刷新记录时不做“比较后写入”，与并发 `stop` 的 `settle` 交错时可能把已退出实例重新写回 `running` | 复用路径在锁内按“比较后写入”刷新，并把 `status` 纠正为 `running`；`stop` 先核实 pid 与健康检查，再信任 `status` |
| P2-03 | `scripts/launch.mjs:290-293`；`server/index.mjs:34-43`；`server/launch-plan.mjs:68-78`；`server/background-worker.mjs:70-73` | HLD 3.7“字段的维护”；36b 6.3 完成条件 | 服务每 10 秒、后台每次唤醒都会在安装变化时刷新 `preferred` / 旧字段，但不检查 `launcher.lock`；启动器在准备运行目录前后比较整份记录，任何刷新都会让它以“运行实例已变化，已取消本次重启”退出。新版本安装后 10 秒内打开（构建远长于 10 秒）几乎必然失败一次；0.10.3 会回落交还，0.10.2 原生入口显示固定错误 | 刷新时像 `restoreMissingRecord` 一样先试取 `launcher.lock`，被占用就跳过；或启动器只比较 `pid`、`url`、`digest`、`status`、`running` |
| P2-04 | `scripts/launch.mjs:240` | 性能与 590 秒上限 | 每次非迁移启动都先在锁内才判断记录是否缺失；后台批次或界面写操作持锁时，即使记录存在也固定等 10 秒（E1 的 70 秒中有 10 秒来自这里） | 锁外先判断 `launcher.json` 是否存在，缺失时再取锁补写 |
| P2-05 | `server/migration.mjs:112-117`；`scripts/launch.mjs:152` | HLD 3.7 第 2 步：失败时“代号仍为 1、没有写入任何新格式文件” | 撤销按顺序逐个写回，任一文件写回失败即抛出，后面的文件（如 `local/updates.json`）不再恢复；错误又被 `catch(() => {})` 吞掉。概率低（需 I/O 失败），且下次 0.11 迁移可自愈，但可能留下“代号 1 + 计划 v2”的半迁移状态 | 撤销逐个尝试、汇总错误，并把撤销失败写进返回给用户的原因 |
| P2-06 | `scripts/launch.mjs:164`、`:296`；`server/launch-plan.mjs:121` | 36b 6.3：“Codex 主目录、Claude 根目录、Node 路径一律使用保存值” | Claude 根目录已按保存值实现；Codex 主目录仍取 `CODEX_HOME` 环境变量或 `~/.codex`。由 Claude 侧调用方（无 `CODEX_HOME`）启动、而 Codex 使用自定义目录时，门槛扫描不到 Codex 侧，启动记录的 `codexHome`、旧 `installation` 与服务管理的 Codex 目录都会变成 `~/.codex`。作者取舍 3 只声明了环境白名单 | 环境中没有 `CODEX_HOME` 时以现有启动记录（0.10.x 或 0.11）的 `codexHome` 作为保存值；或明确并入取舍 3，在阶段 2 关闭并补用例 |
| P2-07 | `scripts/launch.mjs:208-211`、`:257`、`:297-298` | 36b 6.3：“项目来自 ③～⑤：已有运行实例时沿用，不改变其项目” | 实例需要按新版本重启、而项目来自 ③～⑤ 时，新实例取回退值（例如过时的 `project.json`），不是运行实例的项目。触发面窄（0.10.3 技能入口不带 `--project`，且 `project.json` 与运行项目不同） | 运行中且项目非显式时，重启沿用健康检查的 `project` |
| P2-08 | `server/service.mjs:943-961` | 36a 5.3：`actualProject` 在“实例启动或切换项目时写入” | 界面内切换项目只写 `project.json` 与后台上下文，不更新启动记录的 `actualProject`。因 ③ 先于 ④，实际影响很小 | 切换后在锁内比较后写入 `actualProject`，或在契约中注明只在启动器切换时写入 |
| P2-09 | `scripts/launch.mjs:295` | 36a 第 7 节：“之后每次启动器运行时确认它存在（缺失即重建）” | 只在重建路径调用 `ensureLegacyProject`；复用、`status`、`stop` 路径不重建。若该目录被删，首次打开的 0.10.2 原生入口会以不存在的目录为工作目录而失败（HLD 第 5 轮 E1） | 代号 2 下的每次启动器运行都确认该目录存在 |
| P2-10 | `server/service.mjs:96-97`；`server/self-update.mjs:66` | DEC-SDX-009（写前检查代号）、36c 第 5、8 节 `DATA_GENERATION_NEWER`；HLD 3.7“由现有重启协调器切换” | 服务只在启动时读一次代号，写请求前不再核对；0.11 自更新协调器要求 `record.project` 等于服务项目，0.11 记录的旧 `project` 恒为固定子目录，因此协调器在代号 2 下从不发起。两者都不在作者声明的取舍中；计划 37 把“按最新者运行切换”放在阶段 5，但未写明协调器在阶段 1～4 不工作 | 在实施计划中登记这两项的阶段归属（不需要 Owner 决定），并在对应阶段补测试 |
| P2-11 | `server/index.mjs:24-31`、`:46-48` | 36c 第 4 节；0.10.2 健康检查超时 1.5～2 秒、0.10.3 为 2 秒 | 缓存过期后的第一次健康检查在请求路径里做全量安装发现，并发请求会各算一次。缓存目录多或磁盘慢时可能让旧版本核实超时 | 用定时器在后台刷新摘要，请求只读上一次结果 |
| P2-12 | `server/state-locks.mjs:30` | 可维护性 | `isOperationActive` 引用了未导入的 `occupied`、`inspect`，一旦被调用就抛 `ReferenceError`；目前无人导入（服务用的是 `process-lock.mjs` 的同名函数） | 删除该行 |
| P2-13 | `tests/*` | 计划 37 阶段 1 验证项；HLD 11A 条件 3 | (a) G-12 没有显式测试（实验 E4 证实行为正确）；(b) G-17 只测了“记 failed”，没测“记 ready”与窗口期任务；(c) G-09 只走了计划未启用的路径，没有覆盖代号 1 下启用计划的一次真实批次；(d) 没有覆盖 P1-01 的锁竞争；(e) `tests/launch-plan.test.mjs:111` 的 `createApp` 未传 `codexHome`，测试进程环境里若有 `CODEX_HOME` 会读取真实 Codex 目录（只读）；(f) R-03、R-04、N-12、N-14、N-15、S-18、S-26、S-28 在自动化矩阵中没有用例 | (a)～(e) 补测试或参数；(f) 在 11A 条件 3 的全量重跑中补齐，或给出实测证据 |

## 4. 作者声明的 6 项范围取舍

| # | 取舍 | 判断 | 说明与条件 |
|---|------|------|-----------|
| 1 | 门槛只用只读文件证据（Codex 每个 marketplace 取最高版本目录；Claude 取所有未带废弃标记的目录；不可读即不通过），命令行确认与 `installed_plugins.json` 在阶段 2 补 | 可接受（阶段 1） | 文件证据在 Claude 侧偏保守（残留目录也拦），符合“无法确认不跳过”的方向。但“不可读即不通过”目前有两处漏判（P2-01），建议先修。另有已知残余：Codex 侧降级或固定旧版本时，“取最高版本目录”可能误判通过，阶段 2 的命令行确认须覆盖。0.11.0 合并前必须完成（G-01～G-03、V18） |
| 2 | 门槛失败只给手动步骤，一键更新在阶段 5 | 可接受 | HLD 3.7 本就要求一键更新不可执行时给手动步骤并“重新检查”，现有输出满足这条退化路径（G-03 的缓存目录与配置项已列出）。G-01 中的“一键更新”须在 0.11.0 关口前补上 |
| 3 | 服务与命令行子进程的环境白名单在阶段 2；当前只剔除转交相关变量 | 可接受 | 阶段 1 不调用 Claude 命令行，会话变量进入服务的风险有限。36b 6.3 同一条义务里的“Codex 主目录、Node 路径用保存值”未在取舍中声明，建议并入本条一并在阶段 2 关闭（P2-06）。S-11 的 0.11 关口断言届时补上 |
| 4 | Claude 锁在阶段 4 | 可接受 | 阶段 1 没有 Claude 写操作；`withStateLocks` 已固定“实例锁 → Codex 锁”的顺序，阶段 4 追加第三把锁即可 |
| 5 | 安装登记不持久化，按需发现 + 健康检查摘要 | 可接受 | 36a 第 2 节把安装登记列为 0.11 内部数据（随代码评审）；启动记录的 `running` / `preferred` 与按需发现已满足 DEC-SDX-008 和 3.7 的刷新义务。建议在 HLD 或计划中记一句这项实现取舍；摘要的计算方式见 P2-11 |
| 6 | 兼容矩阵只用真实 0.11 重跑部分 N/S/B/R；G-11/G-12/G-16/G-17 由单元测试覆盖；全部重跑按 11A 条件 3 在合并前完成 | 可接受（阶段 1），有条件 | G-11、G-16、G-17 的核心规则有单元测试；G-12 没有（P2-13a，本轮实验 E4 已证实行为）。11A 条件 3 全量重跑时须补齐 P2-13(f) 所列尚无自动化用例的条目 |

## 5. 关键行为证据（摘要）

| 不变量 | 生产入口 → 实际代码 → 独立依据 → 结果 |
|--------|----------------------------------|
| 0.10.2 读取 0.11 启动记录（36a 5.2） | 真实 0.11 启动器写记录 → `launcher-record.mjs` `buildRecord` / `legacyFields`（复用未改动的 0.10.2 `installationIdentity`）→ 契约 5.2 字段表与 `ab6856f` 的 `native-backend.mjs`、`launch.mjs` 读取逻辑 → G-06 断言旧字段、`installation` 键顺序（JSON 全等）；N-01～N-07、R-01/R-02 用真实 0.10.2 代码通过 |
| 0.10.3 第 2、3 步核实（36b 4.5、4.6） | 真实 0.11 写记录与健康检查 → `index.mjs` 健康检查冻结字段 → `337547a` 的 `handover.mjs` `verifiedInstance` 与 `inspect` → S-02、S-05/06、S-13、B-04 用真实 0.11 通过；`sourceKey` 为 `null` 时 0.10.3 不读取，不影响 |
| 门槛先于工具链、非 0 不写 stdout（36b 6.3、7.4） | `bootstrap.mjs` → `launch-plan.mjs` `planLaunch` / `migrationCheck`（只依赖 Node 内置模块，静态核对传递依赖 + 无 `node_modules` 的真实安装树实跑）→ G-01/G-02：退出 4、stdout 为空、未写 0.10.x 读取的文件 |
| 迁移顺序与撤销（HLD 3.7 第 1～5 步） | `launch.mjs` `migrate` → `background-registration.mjs` 接管并读回 → `convertPlan` → `writeRecord`（已停止形态）→ `writeGeneration` → 迁移测试断言顺序与内容；后台目录只读时撤销全部文件并恢复 0.10.x 实例，写下 `compat/migration-failure.json` |
| 重启任务（36b 7.4） | 0.10.x 协调器格式的 `restart.json` → 门槛与快速拒绝在接受之前、接受时写 `executor`、不比较摘要、不核对 `status` → G-08 用真实 0.10.2 实例迁移后记为 `ready`；E4：接受后在停旧实例前失败记为 `failed`（不带 `restored`）；健康检查按 `executor` 存活且持有 `launcher.lock` 判断 |
| 锁顺序与死锁 | `launcher.lock → instance.lock → Codex 锁` 在启动器、服务补写、后台工作进程中一致；全部为非阻塞尝试，`withStateLocks` 失败时先释放已得的锁再重试，不存在持锁等待另一把锁的环路。问题在于等待发生在破坏性步骤之后（P1-01） |

## 6. 测试与实验记录

### 6.1 测试运行

运行环境：`env -i HOME=<会话临时目录>/home TMPDIR=<会话临时目录>/tmp PATH=<nvm Node 22.14.0>:/usr/bin:/bin:/usr/sbin:/sbin`，不带 `CODEX_HOME`、`CLAUDE_*`、`PORT`、`SKILLDOCK_*`。工作目录 `plugins/skilldock/skills/skill-manager/assets/app`，代码与 `4e64761` 逐字节相同。

| 命令（`node --test …`） | 结果 | 用时 |
|------------------------|------|------|
| `tests/state-model.test.mjs tests/installs.test.mjs tests/launch-plan.test.mjs tests/project-context.test.mjs` | 22/22 通过 | 0.4 秒 |
| `tests/launcher.test.mjs tests/migration.test.mjs` | 22/22 通过 | 18 秒 |
| `tests/compat-matrix.test.mjs` | 55/55 通过（含真实 0.11 的 N-01～N-07、S-02、S-05/06、S-13、B-04、R-01/R-02、G-01～G-10） | 67 秒 |
| `tests/background-updates.test.mjs tests/self-update.test.mjs tests/native-backend.test.mjs tests/source-bundle.test.mjs` | 34/34 通过 | 3 秒 |

合计 133 项全部通过。未运行其余测试文件（`backend-*`、`toolchain` 等）：它们不在本次变更面内（`service.mjs` 只在代号 2 改了加锁方式，代号 1 路径不变），为确保不访问默认端口、不联网，本轮未逐一核实后执行；建议作者或 CI 跑一次全量（已知 `toolchain.test.mjs` 中的一条在未改动的 0.10.2 上也失败）。

说明：兼容矩阵中的真实 0.11 启动器会在临时 `CODEX_HOME` 下执行本机 ChatGPT.app 内 Codex 命令行的 `--version`（只读）；后台注册全部用替身或保持未启用，测试断言临时 HOME 下没有 `Library/LaunchAgents`。

### 6.2 补充实验（会话临时目录，夹具来自 `tests/helpers/launcher-fixture.mjs`）

| ID | 目的 | 结果 |
|----|------|------|
| E1 | 另一进程持有 `instance.lock` 时执行 `restart` | 约 70 秒后以 `BUSY` 失败；旧实例已退出；没有实例在运行；记录仍为 `running`、pid 已失效（P1-01） |
| E2 | 记录为“已停止”形态而实例在运行时执行 `start` | 复用并退出 0，记录仍为 `stopped`；0.10.3 第 2 步条件不成立（P2-02） |
| E3 | 门槛遇到版本目录、祖先目录不可读 | 两种情形 `passed: true`、`unreadable: 0`（P2-01） |
| E4 | G-12：已接受的重启任务在停旧实例前失败 | `restart.json` 为 `failed`、带 `executor` 与 `completedAt`、不带 `restored`；旧实例保持健康（行为正确，缺测试，P2-13a） |

### 6.3 安全约束遵守情况

未向 `127.0.0.1:4771` 发送任何请求；未读写真实 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；未执行 `launchctl bootstrap/bootout`；未联网下载；未提交或推送；未修改被审代码；本轮启动的实例均已停止，没有遗留进程。

## 7. 其他观察（不计入问题）

- 本机存在 5 个来自更早测试运行的遗留进程（pid 61543、61604、61664、61759 启动于 18:15，pid 82526 启动于 18:30），运行的是 `/var/folders/.../T/skilldock launcher …` 与 `skilldock-compat-…` 下已被删除目录中的夹具服务，监听随机本机端口。它们不是本轮产生的，本轮未触碰，请作者确认后自行清理。用户真实的 SkillDock 进程未受影响。
- 应用 `package.json` 仍为 `0.10.3`，测试中临时改为 0.11.x；版本号按计划在阶段 6 提升。在此之前不要用本分支对真实数据目录运行启动器，否则会以 `writtenBy: "0.10.3"`、`appVersion: "0.10.3"` 完成迁移，0.10.3 入口无法交还。
- 契约 r8 留给本轮的观察：`HealthResponse.sourceDigest?` 保持可选是合理的，由启动器启动的实例总会设置 `SKILLDOCK_SOURCE_DIGEST`。

## 8. 状态分层

| 层 | 状态 |
|----|------|
| 源码（本报告） | CHANGES_REQUESTED：P1-01 待修 |
| CI（exact SHA） | NOT_RUN（分支未推送） |
| 环境 | 不适用（无部署） |

## 9. 下一步

1. 按 P1-01 的最小修复调整锁的获取时机，并补“锁被占用时重启”的测试；
2. 可选处理 P2（建议优先 P2-01、P2-02、P2-03、P2-13a）；
3. 修复后提交新 Candidate，复审只覆盖 P1-01、实际 delta 及其直接影响路径。
