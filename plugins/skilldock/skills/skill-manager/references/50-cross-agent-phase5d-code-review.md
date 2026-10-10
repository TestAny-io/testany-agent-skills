# 代码评审报告：阶段 5d（SkillDock 自身，`2226ae1`、`3001024`、`8809862`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 范围 | `git diff fb4d8e2 8809862 -- plugins`：36 个文件，增 1132 行、删 249 行（含 `native/server.mjs`、`native/ui.html`、`native/build.json` 构建产物），diff sha256 前缀 `8ba940c72061`。`2226ae1`（5d1）16 个文件 +291/−37；`3001024`（5d2a）18 个文件 +467/−147；`8809862`（5d2b）21 个文件 +476/−167 |
| Candidate | `8809862`（tree `0073886058d1…`）；中间提交 `2226ae1`（tree `1068787c8a4d…`）、`3001024`（tree `193a37038425…`）；基线 `fb4d8e2`（tree `f83903fe27cb…`）；分支 `feature/skilldock-0.11-cross-agent`（本地，未推送） |
| 事实源（均取 `8809862` 中的版本） | PRD `34`（sha256 `e061ec258421…`，REQ-SDX-006、007）；HLD `35` v1.24（`59cafec20e6b…`）3.7、3.8 与末尾“阶段 5d1”“阶段 5d2a”“阶段 5d2b”修订节；契约索引 `36` 0.25（`3db8719e1838…`）；`36a`（`a4dd81b45644…`）第 5、8 节；`36b`（`b5e9644ce711…`）第 2、6.3、7.3、7.4、12 节与附录 A（G-01 等）；`36c` 0.24（`2606f687967b…`）第 6 节、7.2、第 8、9 节；实施计划 `37`（`ec508eb5ce4f…`）阶段 5 中 5d1、5d2a、5d2b 的拆分行与进度。格式参考 `47` |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审代码；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-10 |
| 工作区绑定 | 开始时主工作区 HEAD 为 `8809862`。评审期间 HEAD 前进到 `6663b90`（他人提交“phase 5c review (49)”，不在本轮范围，只读查看过提交标题与统计）；结束时主工作区另有他人未提交的 `server/scheduler.mjs`、`server/service.mjs` 改动（非本评审所为，未查看）。全部阅读、测试、实验与变异都在 `git archive 8809862` 的导出副本与本地克隆（检出 `8809862`，供兼容矩阵取冻结版本）中进行，不依赖主工作区；对主工作区唯一的写入是本报告 |

## 2. 结论

**APPROVED（带 P2、P3）**

- P0：0
- P1：0
- P2：1（PH5D-P2-01）
- P3：7（PH5D-P3-01～07）

要点：

- 5d1 的三件事（代号 2 下协调器按启动记录 `preferred` 切换、后台按两侧并集取运行来源、启动器持锁时跳过的后台补登记）方向正确，主要保护都有用例钉住。唯一的 P2 是：切换到更高版本后若新版在停止旧实例之后才失败，启动器恢复出的旧实例是新进程，内存中的退避归零，立即再次发起，形成无上限的“停止—恢复”循环（PH5D-P2-01）。36b 7.4 为代号 1 设了持久化的快速拒绝，代号 2 下没有对应保护。
- 5d2a `agent.updateSkilldock` 的锁顺序（实例锁 → Codex 锁 → Claude 锁）、错误码（全部复用已有）、只读一侧可用、已是最新不运行命令、操作记录与通知协调器都与 36c 7.2 一致；Claude 作用域与工作目录与现有插件更新路径一致，但缺少对“项目目录已不存在”的 project/local 安装的处理（PH5D-P3-01），读回以“该 Agent 所有 SkillDock 的最高版本”判定，会误报失败或成功（PH5D-P3-02）。
- 5d2b 门槛一键更新的顺序（先转交、再门槛、指名的一侧才更新、重启任务一律不更新、更新后重判、出现更高版本时转交、失败退出码 4 附原因与原有步骤）正确，引导安全的导入闭包只含 Node 内置模块；原生工具参数只有 `agent` 枚举、只对界面可见，不能被用作任意启动。两处小问题：原生入口重算门槛时先走转交判定，转交情形下不给一键更新（PH5D-P3-03）；`SKILLDOCK_UPDATE_AGENT` 不在 `LAUNCH_ONLY` 中，会随环境白名单进入服务等长期进程（PH5D-P3-04，现有守卫使其暂无危害）。
- 界面确认确实先于执行（Agent 环境页经确认框发送请求；门槛界面先点按钮、出现说明后才有“确认更新”）；新增文案中英日译文齐全。
- 测试：25 项去保护变异中 9 项未被发现，其中“版本相同不切换”的用例实际命中的是另一条分支（PH5D-P3-06）。
- 对阶段推进的影响：按 `37`“独立代码评审没有 P0/P1”的完成标志，5d 可以推进。建议在 0.11.0 发布（以及任何真实数据上的 UAT）之前处理 PH5D-P2-01；PH5D-P3-07 第 1 条（发布时 `package.json` 升到 0.11.0）是发布前必须完成的事项。

本结论不授予推送、合并或发布权限。

## 3. 新发现

行号均指 `8809862` 导出副本。实验编号见 6.3 节，变异编号见 6.4 节。

### PH5D-P2-01 代号 2 下切换失败并恢复旧实例后，恢复出的进程立即重试，“停止—恢复”无上限循环

- **位置**：`server/self-update.mjs:49-51`（退避只在进程内存中）、`:64-71`（代号 2 下只要 `preferred` 版本更高就置待办）、`:81`；`scripts/launch.mjs:368-376`（`recover` 只在回滚到 0.10.x 记录时写 `compat/migration-failure.json`）、`:284-287`（快速拒绝只在 `migrating` 时检查）。
- **问题**：5d1 让 0.11 协调器在代号 2 下主动切换到更高版本（可在另一侧）。启动器先构建再停旧启新；新版在**停止旧实例之后**启动失败时，`recover` 用 `startRuntime(rollback)` 恢复旧实例——这是一个新进程。新进程的协调器 `failures = 0`、`retryAt = 0`，启动记录（回滚记录照抄了原记录的 `preferred`）仍指向更高版本，于是在服务空闲后的第一个轮询周期再次发起。36b 7.3 已写明“计数只保存在服务进程内存中，服务重启后从零开始……恢复出旧服务时的反复重启由 0.11.x 的义务兜住（7.4）”，但 7.4 的快速拒绝与 `writeMigrationFailure` 只覆盖代号 1 的迁移；HLD 5d1 修订节只写了“退避沿用 0.10.3”，没有覆盖恢复后的情形。
- **失败场景**：代号 2，运行 Codex 0.11.0；Claude 侧（或计划自动应用）装上 0.11.1，它的服务在用户数据上启动即崩溃（新版缺陷、读某个状态文件失败等确定性原因）。→ 协调器发起 → 停 0.11.0、启 0.11.1 失败 → 恢复 0.11.0（新 pid）→ 新进程约 1 秒内再次发起（若恰逢失败的启动器尚未释放启动锁，则先退避 1 分钟再发起）→ 同样失败、同样恢复……退避永远停在第一档，界面每轮都断开重连、写操作返回 `APP_RESTARTING`、计划批次被打断，直到用户手动卸载 0.11.1。由于 5d1 允许把 SkillDock 自身加入自动应用的计划，这个循环可以在无人操作时开始。
- **证据**：实验 E1：第一个协调器失败后在同一进程内退避（5 秒后不再发起）；模拟恢复出的进程新建协调器，`restart.json` 已记为 `failed`、`restored: true`，第一次 `tick` 即再次调用启动器（`calls` 从 1 变 2）。代码中协调器在发起前不读 `restart.json`，也没有任何持久化的失败记录。
- **建议修法与取舍**：
  - 推荐：沿用 36b 7.4 的现成机制——`recover` 在代号 2 下同样写失败记录（目标应用目录与版本），并把重启任务的快速拒绝从 `if (migrating)` 中移出、对代号 2 也生效；目标变化或交互入口成功后照旧清除。改动约十行，复用已有文件与清除逻辑；可靠性上彻底止住循环；代价是自动切换到这个目标会停下，直到用户从入口重新打开或出现更新的版本（这正是 7.4 对代号 1 的取舍）。
  - 更轻的替代：协调器发起前读 `restart.json`，若最近一次任务的 `source` 与目标相同且为 `failed`、`restored: true`，以其 `completedAt` 为起点按 7.3 计算退避。不新增文件，但仍会每 30 分钟停止—恢复一次，用户体验不如前者。
  - 无论哪种，建议补一个“恢复出的进程不立即重试同一目标”的用例。

### PH5D-P3-01 一键更新不处理项目目录已不存在的 Claude project/local 安装，整次更新以误导性的错误失败

- **位置**：`server/service.mjs:1948`、`server/gate-cli.mjs:108`（`cwd: item.projectPath`，不检查存在与否）；`server/skilldock-update.mjs:41-45`（逐项执行，任何一项失败即整体失败）。
- **问题**：现有 Claude 插件更新路径对 project/local 安装先检查项目目录（`service.mjs:743-745` 返回 `PROJECT_PATH_MISSING`），清单也把这类安装标为只读（`claude-catalog.mjs:256`）。一键更新（服务与门槛两条路径）直接以记录中的项目路径作工作目录执行 `claude plugin update`；目录不存在时 Node 报 `spawn <claude 路径> ENOENT`，看上去像是命令行不存在。按清单顺序，排在它后面的安装（包括 user 作用域）不会被更新。`projectPath` 缺失时则回落到当前项目或主目录执行 `--scope project`，作用到的可能是另一个项目的安装。
- **失败场景**：Claude 的 `installed_plugins.json` 仍保留一个已删除项目中的 `skilldock@m`（project 作用域），user 作用域另有一份。→ 点“一键更新 SkillDock”→ 失败：“Claude 中的 SkillDock 更新失败（Claude 命令行 plugin update 失败：spawn …/claude ENOENT）。”，user 作用域那份未更新。
- **证据**：实验 E2（真实 `claudeWriter` + 替身命令行）：错误码 `SKILLDOCK_UPDATE_FAILED`，信息匹配 `spawn …claude-stand-in ENOENT`，替身只收到 `plugin marketplace update`，没有收到 user 作用域的 `plugin update`。沙箱中单独验证：`execFile('/bin/echo', [], { cwd: '/nonexistent' })` 的错误即 `spawn /bin/echo ENOENT`。
- **建议修法与取舍**：在两处 `list()` 中跳过（或标注）项目目录不存在、或缺少 `projectPath` 的 project/local 安装，成功信息里注明“某项目中的安装因目录不存在未更新”；全部都被跳过时按现有措辞返回 `PROJECT_PATH_MISSING`（已有错误码）。复杂度很低、与现有更新路径一致；不改变门槛的判定（那份安装若仍低于 0.10.3，重判后照旧给出清理步骤）。

### PH5D-P3-02 读回以“该 Agent 中所有 SkillDock 的最高版本”判定，可能误报失败或成功；超时被当作失败

- **位置**：`server/skilldock-update.mjs:27`（`highest`）、`:45`、`:49-51`。
- **问题**：`before`/`after` 含该 Agent 中所有名为 `skilldock` 的安装（所有 marketplace、所有作用域），读回只比较两次的最高版本。另外，命令行超时（`claudeWriter` 的 `CLI_TIMEOUT` 明确表示“结果尚未确认”）被统一包装成 `SKILLDOCK_UPDATE_FAILED`。
- **失败场景**：
  1. Codex 中同时有 fork 的 `skilldock@fork` 0.12.0 与被门槛拦下的官方 0.10.1：一键更新把官方的升到 0.11.0，却报“marketplace 中没有更新的 SkillDock（当前 0.12.0）”；门槛路径因此不再重判，退出码 4，用户重新打开才发现其实已通过。
  2. Claude user 作用域升级成功、project 作用域停在旧版：服务路径报“已把 Claude 中的 SkillDock 从 0.10.2 更新到 0.11.0”（门槛路径会由重判兜住，服务路径没有）。
  3. 超时后命令其实已完成：界面与操作记录记为失败。
- **证据**：实验 E3（两种情形均复现）、E4（`CLI_TIMEOUT` → `SKILLDOCK_UPDATE_FAILED`）。
- **建议修法与取舍**：按 `id + scope` 逐项比对：每一项都升高才算成功，部分升高时在成功信息中列出未升高的项；`CLI_TIMEOUT` 原样抛出（已有错误码，含“请刷新查看实际状态”）。改动集中在一个函数；多 marketplace 并存属少见情形，若想更省事，至少只比较 `before` 中被更新的同一 marketplace。

### PH5D-P3-03 原生入口重算门槛时先做转交判定，转交情形下不给一键更新；真实重算路径无用例

- **位置**：`server/native-backend.mjs:116-121`（`gateAgents` 调用完整的 `planLaunch`）；`server/launch-plan.mjs:164-165`（转交判定在门槛之前）。
- **问题**：原生入口自己的安装不是本族最高版本时，启动器先转交给更高版本，由后者被门槛拦下并以 4 退出；`gateAgents` 以入口自己的安装重算，`planLaunch` 返回 `kind: 'delegate'`，`plan.error` 为空，`agents` 为空，界面只显示普通错误，没有一键更新按钮。Claude 技能路径不受影响（转交时 stderr 原样传回，`SKILLDOCK_UPDATE_AGENT` 也会随环境传给被转交的启动器）。
- **失败场景**：Codex 0.11.0（原生入口）、Claude 0.11.1（user）与 Claude 0.10.2（仍被另一作用域引用、未带废弃标记）。→ 原生入口启动失败，只给手动步骤。
- **证据**：实验 E5：从 Claude 0.11.1 直接判定得到 `blockers: ['claude']`；从 Codex 0.11.0 判定得到 `delegate`；真实 `createNativeBackend`（不注入 `gateCheck`）返回普通错误而非 `SKILLDOCK_ERROR:`。对照 E5b（无转交）真实路径正确返回 `agents: ['claude']`。变异 M25 未被发现：现有用例都注入了 `gateCheck`。
- **建议修法与取舍**：`gateAgents` 在得到 `delegate` 时以目标安装的应用目录再判一次（或直接调用 `installationContext` + `migrationCheck`，跳过转交）；补一个不注入 `gateCheck` 的用例。复杂度低；收益是少见情形下的体验一致。

### PH5D-P3-04 `SKILLDOCK_UPDATE_AGENT` 会随环境白名单进入服务等长期进程

- **位置**：`server/process-env.mjs:12-13`（`LAUNCH_ONLY` 不含它）、`:34`（其余 `SKILLDOCK_*` 一律继承）；`scripts/launch.mjs:101`（服务环境）、`:361`（构建环境）；`server/native-backend.mjs:126`（普通启动原样传入继承的环境）。
- **问题**：这是“用户已同意”的一次性标志，但 `childEnvironment` 把它与其他 `SKILLDOCK_*` 设置一起传给服务进程、`npm` 构建进程，以及迁移失败后恢复出的 0.10.x 服务；`SKILLDOCK_GATE_CHECKED`、`SKILLDOCK_RESTART_JOB` 等同类标志都已列入 `LAUNCH_ONLY`。
- **失败场景**：目前没有可复现的危害：代号 2 下不再有门槛；恢复出的 0.10.x 服务只会以重启任务调用启动器，而 `planLaunch:170` 对重启任务有两道守卫（变异 M22 证明它们被钉住）。但若今后任何长期进程以非任务方式在代号 1 下调用启动器，就会在没有确认的情况下执行更新。原生入口所在进程的环境里若意外带有该变量，普通启动也会直接更新。
- **证据**：沙箱中 `childEnvironment({ SKILLDOCK_UPDATE_AGENT: 'claude', SKILLDOCK_GATE_CHECKED: '1', SKILLDOCK_RESTART_JOB: 'j', HOME })` 的结果保留了 `SKILLDOCK_UPDATE_AGENT`，另两个被去掉。
- **建议修法与取舍**：把它加入 `LAUNCH_ONLY`；原生入口普通启动时显式置空（`gateAgents` 已经这样做）。两行改动，没有体验代价。

### PH5D-P3-05 代号 2 下认不出家族时，Claude 侧来源目录被清理即被判为“已卸载”

- **位置**：`server/background-worker.mjs:59-67`（`found` 为空时回落）、`:30-33`（`directory` 形态：目录不存在即返回 `null`）、`:156-162`（`null` → 停用计划并注销任务）。
- **问题**：运行来源在 Claude 侧时，后台上下文的安装身份是 `directory`。`backgroundFamily` 依赖启动记录认定家族；记录缺失（被 0.10.x 启动器删除、镜像也读不出）时返回 `null`，回落到 0.10.2 判定，而 0.10.2 对 `directory` 的判定只看目录是否还在。若此时上下文中的来源恰好已被 Claude 清理（替换后保留 14 天），就会注销任务、关闭计划——这是 HLD 3.8 强调要避免的不可逆方向。HLD 5d1 修订节写的“Codex 侧须命令行确认，确认不了不删除任务”对 Claude 来源并不成立。
- **失败场景**：代号 2，后台来源为 Claude 0.11.0 目录；Claude 侧已有 0.11.1，旧目录过期被删；同时启动记录缺失且无法补写。→ 后台到期运行 → `uninstalled` → 计划关闭、LaunchAgent 被移除。条件需同时成立，概率低（来源每次运行都会刷新到最高版本，记录缺失通常会被 `restoreMissingRecord` 补写）。
- **证据**：实验 E6：无记录、旧目录已删、Claude 侧有 0.11.1 时，`resolveFamilySource` 返回 `null`。
- **建议修法与取舍**：代号 2 下回落时，若来源位于已知的插件缓存根（Claude 或 Codex）之下，目录不存在只抛“无法确认”（计划暂停、下次重试），不返回 `null`；或者在记录缺失时按上下文中的来源路径定位缓存根与家族。前者几行即可，代价是用户真的从 Claude 卸载且记录也丢失时，计划会停在“暂停”而不是自动注销（可在界面关闭）。

### PH5D-P3-06 若干新保护没有被用例钉住；“版本相同不切换”的用例命中另一条分支

- **位置与证据**（6.4 节）：25 项变异中 9 项未被发现：
  - M1（协调器对版本相同或更低的 `preferred` 也切换）：`tests/self-update.test.mjs:183` 构造的是“记录写 2.4.0、目录中是 2.5.0”，被 `pkg?.version !== target.version` 拦下，从未走到版本比较。真实情形中 `preferred` 低于 `running`（例如用户卸载了正在运行的更高版本）时，这道比较是防止降级重启的唯一保护。
  - M9、M17、M18：服务一键更新的 Claude 锁、门槛更新的 Codex 锁与 Claude 锁去掉后没有用例失败（门槛更新只测了启动锁）。
  - M14：`canUpdate` 不看“无法确认”——现有用例里“无法确认”总伴随命令行不可用，后者已让它为假；命令行可用但设置文件损坏的情形未测。
  - M19：门槛更新不排除 `managed` 作用域。
  - M20：更新后不重判门槛（启动器随后只按文件证据再判，命令行确认部分失去覆盖）。
  - M8：补登记在“准备重启”期间也执行。
  - M25：见 PH5D-P3-03。
- **建议**：补最小用例：`preferred` 版本等于或低于 `running`、目录版本与记录一致时不发起；门槛与服务更新在对应锁被占用时返回 `BUSY`、不运行命令；命令行可用但环境无法确认时 `canUpdate` 为假；托管作用域不被更新；更新“成功”但重判仍拦下时退出 4。都是夹具内的几行断言。

### PH5D-P3-07 发布约束与文档的小处

1. **`CURRENT_GENERATION_MINIMUM` 与 `package.json`**：候选中 `package.json` 为 0.10.3、`CURRENT_GENERATION_MINIMUM` 为 0.11.0。在代号 2 的数据上，按当前版本号安装的本候选会让后台报“已安装的 SkillDock 都低于 0.11.0……计划暂停”，0.10.3 的转交链也认不出它。HLD 5d1 修订节已注明发布时须升版本，但只靠人工。建议在发布检查表中列出，或给启动器加一道保险：自身版本低于 `CURRENT_GENERATION_MINIMUM` 时拒绝写入代号 2（任何在真实数据上做 UAT 的构建同样需要升版本）。
2. **36c 7.2**：“成功与失败都写一条操作记录”——实现与用例只记录执行到更新命令之后的结果，前置拒绝（`AGENT_NOT_INSTALLED`、`NOT_FOUND`、`CLI_UNAVAILABLE`、`AGENT_UNCONFIRMED`）不记录。建议措辞改为“执行更新后的成功与失败”。
3. **HLD 5d2b**：“持启动锁（与 0.10.x 的后台刷新、自更新串行）”——0.10.x 后台工作进程只持 Codex 锁、不取启动锁（0.10.2 冻结代码 `background-worker.mjs:62/85`）；与它串行实际靠门槛更新 Codex 侧时取的 Codex 锁。效果成立，机制描述宜改准。
4. **`SKILL.md` 退出码 4 一段**：两侧都被拦下时，宜写明每次只指名一侧、更新后若仍被另一侧拦下再询问一次，避免与“不要反复重试”相混。
5. **`src/i18n/errors.json`** 没有 `SKILLDOCK_UPDATE_FAILED` 的兜底译文（与 `READBACK_CONTENT_CHANGED`、`SOURCE_CONFLICT` 情况相同）；带不可预知细节的英日界面消息会显示通用提示加原文。可随下一次译文整理补上。

## 4. 重点关注项的核对结果

| 关注项 | 结论 | 依据 |
|--------|------|------|
| 协调器在代号 2 下的触发 | 正确 | 只认本进程的当前记录（`pid`、`state`、`runtime`、`status: running`）；`preferred` 与 `running` 路径不同且版本严格更高才置待办；发起前核对目标目录中的版本与记录一致，不一致只等下一次刷新、不计失败（`self-update.mjs:57-63`、`:86-90`）。用例与 M2 证明后者被钉住；版本比较见 PH5D-P3-06 |
| 退避与触发键 | 同一进程内正确；恢复出的新进程见 PH5D-P2-01 | 触发键为目标路径加版本，变化即清零；失败后 1 分钟起加倍；M3 被发现 |
| 与服务每 10 秒刷新 `preferred` 的关系 | 可接受 | 一键更新成功后的通知会在下一轮被“目标尚未出现”消耗，实际切换延后到下一次 `preferred` 刷新（≤10 秒）；不影响正确性 |
| 与启动器持锁的关系 | 可接受 | 目标启动器取不到启动锁时以 1 退出，计入一次失败并退避；`refreshInstallations` 在启动锁被占用时本轮跳过 |
| 与 0.10.x 冻结调用方的关系 | 无影响 | 代号 2 下 0.10.x 服务与后台都不运行；代号 1 下 0.11 服务不会运行（迁移在启动器内完成）；0.10.x 协调器的重启任务一律不触发一键更新（`launch-plan.mjs:170` 两道守卫，M22 被发现） |
| 重启任务是否仍满足 36b 7.4 | 满足 | 任务格式与 0.10.x 相同；`source` 为 `preferred.appPath`（`locate` 已取真实路径），与目标启动器的 `appDir` 规范化方式一致；接受、`executor`、终态与改写规则未变；代号 2 下缺少的“恢复后不再自动重试”见 PH5D-P2-01 |
| 后台家族解析 | 基本正确 | 按记录中运行安装的 marketplace 与来源身份认定家族，两侧取不低于 0.11.0 的最高版本；只剩更低版本时抛错暂停、不注销（M4、M5 被发现）；Claude 清理被替换的旧目录不再被当作卸载（用例）；回落路径的边角见 PH5D-P3-05 |
| `CURRENT_GENERATION_MINIMUM` 与 `package.json` | 发布前须处理 | PH5D-P3-07 第 1 条 |
| 换侧时安装身份 | 正确 | `refreshBackgroundRuntime` 按新来源重算身份（M6 被发现）；Claude 来源为 `directory` 形态 |
| 补登记的重试 | 正确 | 只在启动时因 `BUSY` 跳过后置位；每 10 秒补做一次，成功即停；`closing`、`restarting` 时不做；与正常操作冲突时 `withOperation` 立即返回 `BUSY`、留到下一轮，不排队、不阻塞（M7 被发现，M8 未被发现） |
| `agent.updateSkilldock` 的锁 | 正确 | `withOperation` 持实例锁与 Codex 锁，Claude 侧再取 Claude 锁，顺序与 DEC-SDX-010 一致；释放在 `finally` 中（M9 未被发现） |
| 错误码 | 只复用已有的 | `AGENT_NOT_INSTALLED`、`NOT_FOUND`、`CLI_UNAVAILABLE`、`AGENT_UNCONFIRMED`、`SKILLDOCK_UPDATE_FAILED`、`READBACK_FAILED`（36c 第 8 节或 0.10.2 既有）；门槛路径的 `MIGRATION_BLOCKED`、退出码 4 为既有启动器错误；原生结构化错误沿用既有 `SKILLDOCK_ERROR:` 约定 |
| 读回判定 | 基本正确 | 要求读回版本高于更新前（M15 被发现）；判定口径见 PH5D-P3-02 |
| Claude 作用域与工作目录 | 基本正确 | 跳过 `managed`；user 作用域以当前项目（服务）或主目录（门槛）为工作目录，project/local 以其项目为工作目录，与现有更新路径一致；命令经白名单（`claudeWriteArgs` 要求 `--scope` 与 `--json`、对象名合法）；项目目录不存在的情形见 PH5D-P3-01 |
| `planLaunch` 的顺序与边界 | 正确 | 先转交，后门槛；只有门槛拦下且被指名的一侧才更新；重启任务不更新；未被拦下的 Agent 不更新（用例）；更新失败退出 4，信息含原因、手动步骤与原有处理步骤；更新后重判，出现更高版本时转交（M21 被发现）；返回的 `context` 虽是更新前的，但引导程序只使用 `gateChecked`，`launch.mjs` 自己重算 |
| 引导安全 | 正确 | `gate-cli.mjs`、`skilldock-update.mjs`、`claude-writer.mjs` 等导入闭包只含 Node 内置模块；新文件都在 0.10.2 源码允许列表的目录树内 |
| 原生入口结构化错误与新工具 | 正确（转交情形见 PH5D-P3-03） | 只在退出码 4 时重算，重算时清空 `SKILLDOCK_UPDATE_AGENT`、更新函数为抛错替身；工具参数为 `z.enum(['codex','claude'])`，后端再校验；`visibility: ['app']`；工具只能触发与 `skilldock_read` 相同的启动，额外效果仅是带上已确认的一侧并绕过 10 秒限制；打包产物 `build.json` 69 个输入、4 个产物哈希一致 |
| 界面确认先于执行 | 正确 | Agent 环境页按钮只调用 `onConfirm(spec)`；门槛界面先显示说明与“确认更新/取消”，确认后才调用工具（用例断言渲染时没有“确认更新”） |
| 翻译完整性 | 齐全 | `GateUpdate.tsx`、`AgentEnvironments.tsx`、`App.tsx`、`InstallDialog.tsx` 中新增的 `t()` 字面量全部有英、日译文（脚本核对）；服务端新消息由 `assertTranslated` 覆盖；兜底译文见 PH5D-P3-07 第 5 条 |

## 5. 文档判定

| 文档与位置 | 判定 | 说明 |
|-----------|------|------|
| HLD v1.24 状态行与版本 | 一致 | v1.22～v1.24 均写明待增量复核 |
| HLD 3.8 新增“启动器持锁期间”一条 | 一致 | 与 `service.mjs:2189-2205`、`index.mjs:46` 一致 |
| HLD 5d1 修订节 | 基本一致 | 协调器、后台来源、补登记与实现一致；“确认不了不删除任务”对 Claude 来源不成立（PH5D-P3-05）；退避只覆盖同一进程（PH5D-P2-01） |
| HLD 5d2a 修订节 | 一致 | 只读一侧可用、步骤、读回、通知协调器 |
| HLD 5d2b 修订节 | 基本一致 | 锁的串行机制描述不准（PH5D-P3-07 第 3 条） |
| 契约索引 `36` 0.24、0.25 | 一致 | 说明 `SKILLDOCK_UPDATE_AGENT` 不写入 36b 的理由成立（36b 第 2 节不覆盖门槛交互、第 12 节允许新增环境变量） |
| 36c 第 6 节 `canUpdate` | 一致 | 与 `agents.mjs:112` 一致 |
| 36c 7.2 `agent.updateSkilldock` | 基本一致 | 操作记录措辞偏宽（PH5D-P3-07 第 2 条） |
| 36c 第 9 节 | 一致 | 结构化错误与工具参数、10 秒限制 |
| 36b 第 6.3、7.4 节 | 满足 | 非 0 退出时 stdout 为空；重启任务不更新；更新只在 0.11 交互入口发生，不影响冻结调用方 |
| `37` 5d1、5d2a、5d2b 拆分行与进度 | 一致 | 所述改动与测试均已实现；三段都写“本次提交”属编辑性 |
| `SKILL.md` 退出码 4 一段 | 基本一致 | 见 PH5D-P3-07 第 4 条 |

## 6. 验证命令与结果

所有命令都在沙箱中运行：`sandbox-exec -f …/scratchpad/verify/phase2-review/hermetic.sb`（拒绝外网、拒绝执行真实 Claude/Codex 命令行），并设置临时 `HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME`（`scratchpad/review-5d-home*`）。

### 6.1 准备

- `git -C <仓库> archive 8809862 plugins/skilldock/skills/skill-manager | tar -x -C scratchpad/review-5d/`，把主工作区 `assets/app/node_modules` 软链接进副本。
- 兼容矩阵需要 Git 历史：`git clone --no-hardlinks --no-checkout <仓库> scratchpad/review-5d-clone && git -C … checkout 8809862`（本地克隆，不联网，不改主工作区），同样软链接 `node_modules`。

### 6.2 测试

| 命令 | 结果 |
|------|------|
| 导出副本 `npm test` | 518 项：462 通过、56 跳过（兼容矩阵在无 Git 历史时跳过）、0 失败 |
| 本地克隆 `npm test` | 518/518 通过，0 跳过（与主工作区在 `8809862` 的基线一致），含 G-01 一键更新端到端用例 |
| 导出副本 `npx --no-install tsc --noEmit` | 通过 |
| 定向测试（`skilldock-update`、`launch-plan`、`background-updates`、`self-update`、`native-backend`、`agents`、`agent-ui`、`claude-plugin-updates`，`--test-timeout=180000`） | 89/89 通过（变异基线） |
| `native/build.json` 哈希核对（脚本） | 69 个输入、4 个产物全部一致 |
| 新增界面文案译文核对（脚本） | 4 个文件中带中文的 `t()` 字面量均有英、日译文 |

### 6.3 实验（`review-5d-clone/.../tests/zz-review-5d-experiments.test.mjs`，评审者编写，不属于候选）

`node --test --test-timeout=120000 tests/zz-review-5d-experiments.test.mjs`：7/7 通过（每项断言的都是报告描述的行为）。

| 编号 | 内容 | 结果 |
|------|------|------|
| E1 | 代号 2：首个协调器失败后同进程退避；模拟恢复出的新进程立即再次发起 | 复现（PH5D-P2-01） |
| E2 | 真实 `claudeWriter` + 替身命令行：project 作用域项目目录不存在 | `spawn … ENOENT`，user 作用域未更新（PH5D-P3-01） |
| E3 | 多 marketplace、多作用域的读回 | 误报失败、误报成功均复现（PH5D-P3-02） |
| E4 | `CLI_TIMEOUT` | 被包装为 `SKILLDOCK_UPDATE_FAILED`（PH5D-P3-02） |
| E5 | 真实 `createNativeBackend`、转交情形 | 返回普通错误，不给一键更新（PH5D-P3-03） |
| E5b | 同上、无转交（对照） | 返回 `SKILLDOCK_ERROR:`，`agents: ['claude']` |
| E6 | 代号 2、无记录、Claude 旧来源已删、另有 0.11.1 | `resolveFamilySource` 返回 `null`（PH5D-P3-05） |

### 6.4 变异（完整 skill-manager 目录的导出副本 `review-5d-mut`，先确认定向测试 89/89 通过，每项变异后还原；脚本 `scratchpad/review-5d-mutate.mjs`，结果 `review-5d-logs/mutations.txt`）

25 项：16 项被发现，9 项存活。只跑定向测试文件，不含兼容矩阵（G-01 端到端用例对 M17～M20 也不会失败：其前置状态下这些保护不起作用）。

| 编号 | 去掉的保护 | 结果 |
|------|-----------|------|
| M1 | 协调器只在版本严格更高时切换 | **存活** |
| M2 | 核对目标目录中的版本 | 被发现 |
| M3 | 代号 2 下的退避 | 被发现 |
| M4 | 后台按 0.11.0 过滤 | 被发现 |
| M5 | 只剩低版本时报错暂停 | 被发现 |
| M6 | 换侧时更新安装身份 | 被发现 |
| M7 | 忙时记为待补做 | 被发现 |
| M8 | 准备重启时不补登记 | **存活** |
| M9 | 服务一键更新持 Claude 锁 | **存活** |
| M10 | 已是最新时不运行命令 | 被发现 |
| M11 | 拒绝无法确认的 Claude | 被发现 |
| M12 | 成功后通知协调器 | 被发现 |
| M13 | 失败写操作记录 | 被发现 |
| M14 | `canUpdate` 看“无法确认” | **存活** |
| M15 | 读回要求版本升高 | 被发现 |
| M16 | 门槛更新持启动锁 | 被发现 |
| M17 | 门槛更新 Codex 侧持 Codex 锁 | **存活** |
| M18 | 门槛更新 Claude 侧持 Claude 锁 | **存活** |
| M19 | 门槛更新排除托管作用域 | **存活** |
| M20 | 更新后重判门槛 | **存活** |
| M21 | 更新后出现更高版本时转交 | 被发现 |
| M22 | 重启任务不更新（两道守卫同时去掉） | 被发现 |
| M23 | 一键更新绕过 10 秒限制 | 被发现 |
| M24 | 只在退出码 4 时给结构化错误 | 被发现 |
| M25 | 重算门槛时清空 `SKILLDOCK_UPDATE_AGENT` | **存活**（真实 `gateAgents` 无用例） |

## 7. 未覆盖的范围与剩余风险

- **未运行真实命令行**：按委托未运行真实 Claude、Codex 命令行与 `launchctl`，未联网。`codex plugin marketplace upgrade … --json`、`codex plugin add … --json` 与 Claude 的 `plugin marketplace update`、`plugin update --scope … --json` 的真实输出与副作用（特别是 Claude 更新后旧版本目录是否带废弃标记、多作用域时的行为）只由替身与既有实测（HLD 9.3）支撑，建议在 UAT 中各跑一次一键更新（服务路径与门槛路径各一侧）。
- **时间预算**：门槛更新的每条命令超时 300 秒，Codex 一侧最多四条命令，总和可超过原生入口执行启动脚本的 600 秒上限；超时后启动脚本被结束、命令行子进程可能继续完成。正常网络下不会触及，未计为问题。
- **真实 0.11.x 跨侧切换**：协调器发起、另一侧启动器接受任务、停旧启新的完整链路只由单元级替身与既有兼容矩阵覆盖，没有“代号 2 下 Codex 0.11.0 → Claude 0.11.1”的端到端用例；PH5D-P2-01 的循环也只在单元级复现。
- **阶段 5a～5c** 由其他评审者评审，本轮未看；评审期间主工作区新增的 `6663b90`（5c 评审处理）未纳入。
- **界面视觉**：只做了静态渲染断言与译文核对，未在浏览器或 Codex 原生界面中目测门槛提示与按钮布局。

## 8. 操作披露与结束状态

- 读取：主工作区只读查看 `git log`、`git diff`、`git show`（含 0.10.2 冻结提交 `ab6856f` 中的两个文件以核对锁的使用）；未读写真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`。
- 写入：主工作区只新增本报告；其余文件都在 `scratchpad/` 下（导出副本、本地克隆、变异副本、实验文件、日志）。没有 `git add`、`commit`、`push`。
- 运行：所有测试、实验与变异都在沙箱中运行；没有运行真实 Claude/Codex 命令行或 `launchctl`，没有联网或下载，没有访问 127.0.0.1:4771/4781（实验 E5 使用临时空闲端口，确认无人监听）。
- 报告中不含任何密钥或凭证。
