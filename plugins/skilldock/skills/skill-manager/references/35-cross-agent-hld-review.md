# HLD 审查报告：SkillDock 跨 Agent 管理（HLD-SDX-001 v0.3）

> 本报告是评审意见，不是批准。技术结论、设计授权与执行许可分开列出；任何建议都不构成已有授权。

## 基本信息

| 项目 | 内容 |
|------|------|
| HLD / 本轮版本 | [35-cross-agent-hld.md](35-cross-agent-hld.md)，HLD-SDX-001，文档版本 0.3，`status: draft`，工作区未提交文件（分支 `docs/skilldock-cross-agent-prd`，HEAD `3450fbd`） |
| PRD | [34-cross-agent-prd.md](34-cross-agent-prd.md)，PRD-SKILLDOCK-002 v0.3（`status: approved`） |
| API 契约 | 无独立 API 工件。按 [03-engineering-design.md](03-engineering-design.md) 第 6 行约定，wire 类型以 `assets/app/shared/contracts.ts` 为唯一事实源；HLD 第 5 节只给增量范围（评估见下文“API 契约处理评估”） |
| Guardrails / ADR | 仓库没有独立 Guardrails 文档；项目级规则来自根 `AGENTS.md`、`CLAUDE.md`、`docs/plugin-development.md`。相关既有设计：17、18、24、30、33、marketplace-compatibility |
| 原始批准来源 | 见“第一道门 / 批准依据核验” |
| 模式与范围 | `formal_design`：新功能的完整 HLD，覆盖 REQ-SDX-001～017 与 MR-SDX-001～003 |
| 时间 / 轮次 | 2026-10-08，第 1 轮 |
| 评审者 | 独立的 Claude 评审会话，与作者会话不共享上下文；不是人类评审，也不代表任何 Owner |
| 风险 / 启用视角 | Security（写入边界、实例归属、进程环境）、数据（本机 JSON 状态迁移与数据代号）、SRE（单实例、后台任务、版本收敛）、Architect（Claude 命令行与 Codex 双宿主依赖）、QA（真实命令行隔离验证、读回指纹） |
| technical_verdict | **CHANGES_REQUIRED** |
| scope_status | **DECISION_REQUIRED** |

## Guardrails Trigger Check

- Decision: `suggest_guardrails`
- Why: HLD 遵守仓库“单一 manifest、单一版本 authority、main 即发布”等既有规则，没有新定义项目级默认规则；但 PRD 0.3 改变了运行环境默认行为，根 `AGENTS.md` 第 9 行（“使用 launch.sh 自动准备 Node.js/npm，不将手动安装全局 Node 作为前置步骤”）和根 `README.md` 第 79 行会与之冲突。
- Impacted domains: Release / 安装说明
- Guardrails status: 无独立 Guardrails 文档；仓库规则存在轻度 drift
- Recommended next action: 实现阶段同步根级规则与 README（见 P2-04）。这不是本轮准出门槛：冲突来自已获 Owner 批准的产品变更，只需同步文字，不需要新标准决策。

## 第一道门：批准范围与漂移

### 批准依据核验

| 对象 | 可核实证据 | 结论 |
|------|-----------|------|
| PRD v0.2 整体批准 | PRD 头部状态、修订历史第 3 行；本地提交 `928133e`（作者身份 kl-testany，提交信息写明 “approved by the product owner on 2026-10-07”） | 可作为基线。说明：这些记录由起草会话写入，并以用户的 Git 身份提交；Owner 的原话不在仓库中，评审者无法独立核实，按委托方说明采信 |
| PRD v0.3 有限修订 | 修订历史第 4 行、1.3 节 BRIEF-SDX-003、提交 `3450fbd` | 可作为基线，范围限于运行环境与 marketplace 只做标注 |
| HLD 10 节 Q2（marketplace 只做标注） | BRIEF-SDX-003 | 可追溯 |
| HLD 10 节 Q3（扫描本机 Node） | PRD 0.3、BRIEF-SDX-003 | 可追溯 |
| HLD 10 节 Q1（接受 0.10.x 旧入口无法给出友好提示） | **只出现在 HLD 自身**；PRD REQ-SDX-007 与 7.3 节原文未改，BRIEF-SDX-003 未提及 | 无法核实，见 DG-02 |

### 追溯工具结果

| 命令 | 结果 |
|------|------|
| `trace_lint.py --strict --format json` HLD | pass：0 error、0 warning、36 info（TRACE404：外部 REQ 引用，交给 RTM 解析） |
| `trace_lint.py --strict --format json` PRD | pass：0 / 0 / 0 |
| `trace_build_rtm.py --format json` PRD + HLD | pass：无 RTM001～RTM004 问题，unresolved 0，orphan 0；需求 17/17 有 `refines` 设计分配；决策 20、流程 5 全部挂接；风险 0/8、MR 0/3 为 uncovered |

解读：

- RTM 的 17/17 只说明每条需求都有设计条目指向它，不等于设计已完整或可验证。下表的人工核对结果与之不同。
- MR 为 0/3 是预期结果：MR 的覆盖要靠测试用例的 `verifies` 关系，而 `hld-profile-v1` 不允许 HLD 直接指向 `MR-*`（`trace_lint.py` 的 `HLD_ALLOWED_RELATION_TARGET_PREFIXES`），作者改在 `PRD-SKILLDOCK-002` 关系的 note 中标注 MR，处理合理。
- 风险 0/8 是因为 HLD 9.1 讨论了 RISK-SDX-001/002/003/004/008，但元数据中没有 `mitigates` 关系（P2-11）。

### 需求覆盖

| 基线条目 | 验收 / 边界 | HLD 位置 | 状态 | 未覆盖 / 待澄清说明 |
|----------|-----------|----------|------|-------------------|
| REQ-SDX-001 环境发现 | 三种组合、自定义目录、默认启用、启用需读回 | 3.1、3.6、6.4 | 部分 | 自定义 `CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_PLUGIN_CACHE_DIR` 在 Codex 入口与后台任务中如何得到“实际生效的位置”没有设计（P1-03） |
| REQ-SDX-002 Claude 清单 | 技能、插件、marketplace、启用来源、托管与同步只读 | 3.2 | 已覆盖 | — |
| REQ-SDX-003 统一视图 | Agent 标识、同一真实文件只算一个 | 4.1、5.1 | 已覆盖 | — |
| REQ-SDX-004 Claude 插件更新与差异 | 关闭自动更新也能检出、差异、读回、需重载 | 3.3、6.2 | 部分 | 同一插件的多作用域安装无法区分（P1-02）；读回指纹在各来源类型下是否成立未经证实（GAP-01）；npm / archive 来源不提供差异，缩小了 AC-004（DG-01） |
| REQ-SDX-005 Claude 独立技能 | 预览、关联、差异、可恢复移除 | 3.4 | 已覆盖 | — |
| REQ-SDX-006 跨 Agent 后台计划 | 一个计划、全部关闭仍运行、Agent 不可用时暂停 | 3.8、6.3 | 部分 | 与 0.10.x 已注册后台任务的隔离不完整（P1-01）；后台进程中的 Claude 根目录解析未定义（P1-03） |
| REQ-SDX-007 单实例与版本收敛 | 一个服务、最新者运行、旧版不写新格式 | 3.7、6.1 | 部分 | “0.10.x 拒绝接管、不改写数据”的前提只部分成立（P1-01）；Q1 例外缺批准记录（DG-02） |
| REQ-SDX-008 Claude 入口 | 内置浏览器打开、状态与停止、无插件错误 | 3.9、6.1 | 已覆盖 | — |
| REQ-SDX-009 运行环境 | 扫描、保存、重扫、对话框引导、两侧共用 | 3.10 | 已覆盖 | — |
| REQ-SDX-010 同源跟踪（P1） | 并列两侧版本、两边都更新 | 3.11、6.5 | 已覆盖 | — |
| REQ-SDX-011 兼容性推断（P1） | 四种结论、依据、操作限制、确认 | 3.12 | 已覆盖 | — |
| REQ-SDX-012 写入边界 | 默认当前用户、项目共享逐次确认、托管只读、无凭证 | 3.5、7.2 | 已覆盖 | — |
| REQ-SDX-013 跨 Agent 文案 | 按启用 Agent 提示、README 覆盖两侧 | 4.3、8.4 | 已覆盖 | — |
| REQ-SDX-014 作者侧声明（P2） | 规范内声明、本仓库补齐 | 3.12 | 已覆盖 | — |
| REQ-SDX-015 Claude 插件启禁 | 读回生效状态、覆盖来源、托管不可停用 | 3.3 | 部分 | 启禁和读回需要指明是哪一个作用域的安装（P1-02） |
| REQ-SDX-016 能力对等 | 5.6 对照表逐行落地、写前重读、不重复更新 | 3.5 | 部分 | 5.6 中“安装插件（本地目录、Git）”在 Claude 侧没有落地路径（P1-04）；“已是最新不重复安装”依赖 P1-02 的安装身份 |
| REQ-SDX-017 从 Claude 安装 | 插件浏览器可装、只得到 SkillDock、仅 Codex 插件有标注 | 3.9、3.13、8.4 | 已覆盖 | — |
| MR-SDX-001 Codex-only 不变 | 未启用 Claude 时与 0.10.2 一致（运行环境例外已批准） | 5.2、8.3 | 已覆盖 | — |
| MR-SDX-002 数据无损迁移 | 计划、绑定、历史、偏好保留 | 5.3 | 部分 | 0.10.x 后台任务和同一安装回退时会读写共享状态（P1-01） |
| MR-SDX-003 不覆盖本地修改 | 手动与后台均保护 | 3.3、3.4 | 已覆盖 | — |

合计 20 项：已覆盖 13 项，部分覆盖 7 项，未覆盖 0 项。HLD 自带映射表把 20 项全部标为 ✓，与本表不一致。

### 漂移与反向检查

- **遗漏**：P1-04（直接来源插件安装）。另有 P1-02，即对象身份缺维度，属于语义层的遗漏。
- **曲解**：8.4 和 3.7 把“0.10.x 会拒绝接管”写成确定结论，但 0.10.x 源码只在跨 Codex 安装时才拒绝（P1-01）。
- **缩小**：6.2 中 npm / archive 来源不提供差异，PRD 没有批准这一例外（DG-01）。
- **膨胀 / 新增职责**：新增了实例锁、安装登记、数据代号、Claude 配置根下的锁文件、在用户设置中写技能可见性，均可追溯到 REQ-SDX-006/007/012/016，没有发现未经批准的新功能。实例归属放宽（DEC-SDX-007/008）改变了“谁能成为运行源”的信任边界，但 REQ-SDX-007 要求跨入口单实例和最新者运行，放宽本身在批准范围内；具体归属键的选择见 P2-01。
- **可行性 / 真实入口**：V1～V6 的结论经本轮抽查与复现基本成立（见“技术与证据覆盖”）。不足在于实验都用 `env -i` 运行，没有覆盖真实调用环境（P1-03），也没有覆盖 git 类来源的安装复制语义（GAP-01）。

## Findings

### P0 / P1 缺陷

| 稳定 ID / 级别 | 当前失败与影响 | 有效依据 / 证据 | 最小修复及边界变化 |
|---------------|----------------|----------------|--------------------|
| HLDR-SDX-P1-01 / P1 | 与 0.10.x 共存及回退时的数据隔离不完整，“旧版不写新格式数据”在部分路径上没有保障 | REQ-SDX-007 AC3、MR-SDX-002、RISK-SDX-003；HLD 3.7、5.3、8.3、8.4、DEC-SDX-009/010；源码见下 | 在 HLD 中补充隔离设计；不改变边界 |
| HLDR-SDX-P1-02 / P1 | Claude 插件对象和计划目标缺少“作用域 + 项目路径”，同一插件的多处安装无法区分 | REQ-SDX-002/004/015/016、AC-016；`claude plugin list --json` 实测；`contracts.ts` 中 `Plugin.id`、`UpdateTarget` | 在 HLD 第 5 节定义 Claude 插件安装身份；不改变边界 |
| HLDR-SDX-P1-03 / P1 | Claude 环境根目录与命令行调用依赖启动进程的环境变量，跨入口和后台结果不一致，且长驻服务会继承 Claude 会话变量 | REQ-SDX-001 AC2、REQ-SDX-012；`launch.mjs:63`、`background.mjs` 的 plist 环境；本会话环境变量名 | 定义持久化的根目录解析与进程环境白名单；不改变边界 |
| HLDR-SDX-P1-04 / P1 | PRD 5.6 中“安装插件（本地目录、Git）”在 Claude 侧没有设计路径 | REQ-SDX-016 / AC-016 第 1 条、PRD 5.6 第 3 行；`claude plugin install --help`；`direct-plugins.mjs` | 补充映射与生命周期，或在确认不可行后交 Owner 决定（见下） |

#### HLDR-SDX-P1-01：0.10.x 共存与回退隔离不完整

- **有效依据**：REQ-SDX-007 AC3 要求“较旧版本不得写入较新格式的数据”；MR-SDX-002 要求计划与绑定无损；HLD 8.4 写明“0.10.x 会拒绝接管 0.11.0 的数据目录”，3.7 写明“以报错退出，不会改写数据”。
- **当前失败**（依据 0.10.2 源码）：
  1. **已注册的后台任务绕过归属检查。** LaunchAgent 执行数据目录中的 `background/entry.mjs`，后者直接调用运行目录里的 `runBackground(context)`，不经过 `checkOwner`。0.11.0 只在服务启动时调用 `background.ensure()` 改写该入口，Codex 锁忙时整段被跳过（`service.mjs:1061-1068` 捕获 `BUSY` 后继续），之后不再重试。在此期间，0.10.2 的后台任务继续读写共享的 `local/updates.json`、`background/status.json`。如果用户随后在 Codex 卸载 0.10.2，旧任务会判定“已卸载”，把共享计划置为停用，并注销同名 LaunchAgent（`background-worker.mjs:105-108`；任务标签只由数据目录决定），Claude 一侧的计划随之停止。
  2. **同一 Codex 安装回退时不一定拒绝。** 0.10.2 的 `checkOwner`（`launch.mjs:113-122`）和原生入口（`native-backend.mjs:60-61`）都按 `record.source` 的路径重新计算身份，而身份不含版本号。只要 0.11.0 的 Codex 缓存目录还在，计算结果与自身一致，0.10.2 就会接管 0.11.0 的数据目录。仓库 17 号文档记录过 Codex 会删除旧缓存，但这只是常见情况，不是拒绝接管的保证。
  3. **锁互斥存在空档。** DEC-SDX-010 让 0.11.0 先取实例锁，再“只取所涉 Agent 的锁”。0.10.x 不认识实例锁，只认 Codex 锁（`process-lock.mjs:55`，`service.mjs:121`）。0.11.0 在只涉及 Claude 的操作或共享状态写入中不取 Codex 锁时，与仍在运行的 0.10.x 后台任务没有互斥。
  4. **只读保护覆盖面不足。** DEC-SDX-009 只规定“运行版本”遇到更高数据代号时只读启动，没有覆盖后台任务、自更新协调器，以及“刷新到较低版本运行目录”（3.8：两侧并集后“以最高版本刷新”，最高版本被卸载后会降回较低版本）。
  - 可依赖的事实：0.10.2 的调度器对未知目标字段和非 1 的 `version` 会直接报错（`scheduler.mjs:6-8`、`:40`），读到新格式会失败而不是写坏。但第 1 条中的“已卸载”分支用的是原样读写，不经过这个校验。
- **影响**：双 Agent 用户的共享计划可能被旧任务停用或注销；在同一安装回退的情况下，较旧代码可能改写新格式数据。这正是 RISK-SDX-003 描述的后果。
- **最小修复（不改变边界）**：在 HLD 3.7、5.3 中明确隔离方案，例如：
  - 接管时必须在 Codex 锁下改写后台入口和上下文，失败就重试或阻止写入新代号数据，不能跳过；
  - 新代号数据不写入 0.10.x 会读写的文件，或者明确依赖并测试 0.10.x 校验器的“直接失败”行为；
  - 规定在与 0.10.x 共存期间，共享状态写入同时持有 Codex 锁；
  - 数据代号检查覆盖所有写入方：服务、后台任务、自更新、原生入口；
  - 把上述场景加入测试义务。
  - 同时修正 8.4 中“0.10.x 会拒绝接管”的绝对表述。

#### HLDR-SDX-P1-02：Claude 插件安装身份缺少作用域与项目路径

- **有效依据**：REQ-SDX-002 要求显示“安装范围（user / project / local）”；REQ-SDX-004 要求读回“Claude 记录的已安装版本”；REQ-SDX-015 要求按作用域启禁；AC-016 要求已是最新时不重复安装。
- **证据**：在 scratchpad 下的隔离副本 `review-lab` 中，`claude plugin list --json`（2.1.288）对同一个 `labctl@lab-market` 返回两条记录：一条为 `scope: user`、版本 `6c719635cd48`；另一条为 `scope: project`、版本 `1813548694ef`，并带 `projectPath`。另外，`plugin update` 的 `--scope` 默认 auto-detect，`uninstall` 默认 user。现有契约中 `Plugin.id` 是 `plugin@marketplace`，`UpdateTarget` 只有 `{kind,id}`，0.10.2 的 `validateTarget` 只允许这两个键。HLD 5.1、5.3 只增加了 Agent 维度，3.3 写的是“使用该插件已安装的作用域”（单数）。
- **当前失败**：同一插件的 user 与 project 安装在快照、更新目标、绑定和读回中会冲突。后台任务以固定项目目录运行，无法正确更新其他项目里的 project / local 安装。读回到底取哪一条版本没有定义，可能误报完成或误报失败。
- **最小修复（不改变边界）**：在 HLD 第 5 节定义 Claude 插件的安装身份 = Agent + `plugin@marketplace` + scope + `projectPath`（project / local 作用域），并让对象 ID、计划目标、绑定、读回比对和命令行调用上下文（工作目录、`--scope`）都使用这个身份。字段细节在 `contracts.ts` 中落实。

#### HLDR-SDX-P1-03：Claude 环境根目录与进程环境不确定

- **有效依据**：AC-001 第 2 条要求自定义 `CLAUDE_CONFIG_DIR`、`CLAUDE_CODE_PLUGIN_CACHE_DIR` 时“显示并使用实际生效的位置”；REQ-SDX-012 要求页面与记录中无凭证。现有 Codex 设计把 `codexHome` 写入启动记录和后台上下文，不依赖当前进程的环境变量（`launch.mjs:63`，`background.mjs` 的 `context.codexHome`）。
- **当前失败**：
  1. HLD 3.1 只写“按 `CLAUDE_CONFIG_DIR` 解析”，没有说明在哪个进程解析、是否持久化。从 Codex 入口启动服务或由 launchd 运行后台任务时，环境里没有这个变量（plist 只设置 HOME 和 PATH），会退回 `~/.claude`。结果是自定义目录的用户在这些路径上看到错误的环境，或者被判为未安装，后台目标也会指向错误的目录树。
  2. 服务由 `{...process.env}` 启动。从 Claude Code 标签页启动时，长驻服务会继承 Claude 会话变量，并在之后数天里传给每次 `claude`、`git`、`npm` 子进程。本会话可见的变量名（只读取了名称，未读取值）包括 `CLAUDECODE`、`CLAUDE_CODE_SESSION_ID`、`CLAUDE_CODE_MESSAGING_SOCKET`、`CLAUDE_CODE_MESSAGING_TOKEN`、`CLAUDE_CODE_OAUTH_SCOPES`、`ANTHROPIC_BASE_URL`、`DISABLE_AUTOUPDATER`。V2、V3 都在 `env -i` 下完成，没有覆盖这种调用环境。
- **影响**：AC-001 第 2 条在 Codex 入口和后台场景下不成立；同一操作的结果取决于用户最先从哪个入口打开；会话级凭据会在会话结束后继续留在长驻进程里。
- **最小修复（不改变边界）**：
  - 在 HLD 3.1、3.8 中规定：Claude 配置根和插件缓存根在发现或启用时确定，写入数据目录和后台上下文；发生变化时需要重新核验；多个入口给出不同值时有明确的优先级。
  - 为启动服务和调用 Claude 命令行定义环境变量白名单，参照 `background-entry.mjs` 的最小环境，剔除 Claude 会话变量。
  - 在 9.3 中补一项在真实调用环境下的验证。

#### HLDR-SDX-P1-04：Claude 侧缺少“从本地目录或 Git 安装插件”的设计

- **有效依据**：PRD 5.6 第 3 行规定“安装插件（本地目录、Git、已添加的 marketplace）与安装预览”为“提供，按原生语义调整”；AC-016 第 1 条要求只启用 Claude 时也能完成并读回。
- **证据**：HLD 3.3 的白名单只有基于 marketplace 的安装。`claude plugin install --help` 写明只能从已有 marketplace 安装。Codex 侧的做法是在数据目录生成一个 `skilldock-<key>` marketplace 再安装（`direct-plugins.mjs` 的 `writeDirectMarketplace`）。如果 Claude 沿用这个做法，`marketplace add` 会把 `extraKnownMarketplaces` 写进用户设置——实验目录中的 `settings.json` 已出现这一键。
- **当前失败与影响**：两种结果都有问题。要么 0.11.0 缺少这项 P0 能力；要么到 LLD 阶段才引入一个未经评审的长期依赖：用户的 Claude 设置指向 SkillDock 数据目录。卸载 SkillDock 或更换数据目录后，Claude 中会留下无法加载的 marketplace，还可能出现重名。
- **最小修复**：在 HLD 3.3 中给出 Claude 侧的映射（例如 SkillDock 管理的本地 marketplace，或者 Claude 的 skills-dir 插件），并写明清理与迁移的生命周期。若工程上认为不可行，需要把 5.6 这一行改为“不提供”，这属于产品 Owner 的决定，不能由 HLD 自行缩小范围。

## Missing Info / Questions（证据缺口）

- **GAP-01（必要，阻止 FLOW-SDX-002 准出）：读回指纹在各来源类型下是否成立。** 6.2 依靠“候选指纹 = 安装目录指纹”判定更新成功，但目前只验证过本地目录来源。本轮复现发现：
  - 对目录型 marketplace，Claude 会复制整个工作树，包括未跟踪和已被 git 忽略的文件。把本仓库作为目录 marketplace 在隔离副本中安装 `skilldock` 后，缓存中有 10004 个文件，与工作树完全一致，而 git 跟踪的文件只有 233 个；未提交的 HLD 文件也被复制进去。缓存目录名 `3450fbdfa776` 就是仓库 HEAD 的前 12 位。
  - github、url、git-subdir 类来源的内容不在 marketplace 副本里，副本中只有 url 和 sha，因此 6.2 的“在 Claude 的 marketplace 副本中重算候选指纹”对这类来源不适用。
  - git 类来源复制到缓存时是否包含 `.git`、是否做过滤，尚未验证。
  - 最小证据：对目录、git URL、git-subdir 三类来源各做一次隔离实验，比较 SkillDock 暂存内容与 Claude 安装后的缓存，并据此规定外部来源在应用前用 sha 固定版本。
- **非阻断验证项**（建议在 LLD 前补齐，不影响本轮结论）：
  1. 缺少 Node 时的 macOS 对话框能否在两种入口中弹出：Claude 的 Bash 工具会阻塞等待、可能超时，沙箱也可能拦截；Codex 原生入口需要确定由哪一层弹出（见 P2-03）。
  2. Claude 写操作命令在 launchd 环境下能否正常运行。
  3. 已取得的部分证据：在 Claude 桌面应用的 agent 会话中，用新会话组启动的子进程在工具调用结束后仍存活，父进程变为 1；`CLAUDECODE=1` 不会阻止 `plugin list --json`。会话关闭后子进程是否仍存活尚未验证。

## Decision Gates

- **DG-01（产品 Owner）：npm / archive 来源不提供差异预览。**
  - 旧行为：AC-004 要求所有可代为更新的 Claude 插件在应用前都能查看逐文件差异。例外清单只有 command 来源、headersHelper、同步插件和托管插件。
  - 新行为：HLD 6.2 规定 npm 和 archive 来源只显示版本，不提供差异，不能加入自动应用。
  - 影响：P0 验收项缩小；这不属于 REQ-SDX-016 允许的“原生冲突”或“平台不支持”。
  - 选项 A（保持既有边界）：把 npm 包和不需要 headersHelper 的 archive 下载到暂存区后生成差异，技术上可行。
  - 选项 B：Owner 批准这一例外，并在 PRD 中登记。
  - 推荐：由 Owner 选择。评审者默认要求 A；如果这类来源很少见，B 的代价可以接受，但必须有 Owner 的明确批准。
- **DG-02（产品 Owner）：Q1 过渡期例外缺少可追溯的批准记录。** HLD 10 节写的是“已同意（用户，2026-10-07）”，但 PRD 0.3 的 REQ-SDX-007、7.3 节和 BRIEF-SDX-003 都没有记录。按评审规则，作者自己的记录不能单独证明授权。此外，Owner 同意时依据的前提“0.10.x 拒绝接管、不改写数据”只部分成立（P1-01）。需要 Owner 在修正后的前提下重新确认，并像 0.3 修订那样登记到 PRD 或 BRIEF。在此之前，REQ-SDX-007 的“旧入口提示”仍按原文适用。
- **DG-03（产品 Owner，知悉即可，不阻断）：teamdesk 在 Claude 中的实际影响。** 隔离安装后，`claude plugin details teamdesk@testany-agent-skills` 显示 “Hooks (1) Stop”。也就是说，只做标注时 Claude 用户仍能安装 teamdesk，并会在每轮结束时触发 Stop hook。该 hook 的命令使用 `$PLUGIN_ROOT`，它在 Claude 中是否有值、hook 会失败还是会记录数据，都还没有核实。Q2 的决定符合 AC-017，但做决定时 Owner 不知道这一点，建议复核 Q2 时一并考虑。

## Optional Improvements（P2，不阻断，不自动续轮）

- **P2-01（工程 Owner 决定）**：DEC-SDX-007 / 008 的归属键只有“marketplace 名 + 插件名”。两个宿主各自维护 marketplace 注册表，同名的 marketplace 可能指向不同来源，例如 fork 或本地开发 clone。这样的安装只要版本号更高，就会成为长驻运行源和后台任务代码，即使它所在环境是只读的。建议把 marketplace 的来源标识纳入归属键，或者在来源不一致时拒绝并提示。版本相同但摘要不同时，后台也需要确定性的取舍规则，避免反复重建运行目录。
- **P2-02**：3.10 的扫描顺序把“已保存”放在“显式指定”之前。这会让 `SKILL.md:28` 文档化的 `SKILLDOCK_NODE_BIN` 覆盖在已有保存值之后失效。建议显式指定优先。
- **P2-03**：对话框只在 shell 层弹出。如果 shell 层只找到仅能用于引导的 Node（应用包内的 `cua_node`），而 Node 层找不到可构建的 Node，HLD 没有规定谁来弹窗。同时需要写明 `native.sh`（Codex 启动时的 MCP 发现入口）不弹窗，以保持 30 号文档“发现入口不联网、不构建、不启动网页后台”的约束。
- **P2-04**：文档同步范围还缺几处：根 `README.md:79`、根 `AGENTS.md:9`、插件 `README.md:56`、`SKILL.md:18` 仍写着自动准备 Node 或不需要 Node。8.4 只列了中英 README 和 CHANGELOG。
- **P2-05**：桌面应用自带命令行的目录结构（`claude-code/<版本>/<构建摘要>/claude.app`，本机同时有 2.1.286 和 2.1.288）不是公开契约，与 RISK-SDX-002 属于同一类风险。建议在 9.1 登记；从 Claude 入口启动时优先使用会话提供的 `CLAUDE_CODE_EXECPATH` 并持久化。
- **P2-06**：没有 manifest 的插件以 marketplace 提交摘要作为版本。本仓库每次提交都会让 Claude 侧的 skilldock 显示有新版本，导致更新提示过多、缓存反复切换；REQ-SDX-010 的“两侧版本 / 最新版本”也无法并列比较。建议规定以内容或 sha 判定“无需更新”的口径。
- **P2-07**：DEC-SDX-006 中有几处表述需要收紧：
  - “防止与 Claude 的并发写入互相覆盖”言过其实：Claude 不使用 SkillDock 的锁，摘要核对只能缩小冲突窗口；
  - “不读取其他键”应改为“不解析、不展示、不持久化”；
  - 撤销应只记录被改条目的旧值，不能沿用现有 `writeConfigPatch` 的整份备份，否则 `settings.json` 的 `env` 等内容会被复制进数据目录；
  - Claude 只在自己创建 `settings.local.json` 时把它加入 git 忽略，SkillDock 新建该文件时需要处理，“不入库”不能当作前提。
- **P2-08**：读取路径的副作用需要说明。在隔离副本中，首次运行 `plugin list --json --available` 联网并在 Claude 配置目录写入约 3 MB 缓存（`plugin-catalog-cache.json`、`plugin-directory-cache-v2.json`）；`plugin list --json`、`marketplace list --json`、`--version` 没有写入。建议可安装列表按需获取，不放在首屏。
- **P2-09**：Claude 中 skilldock 的命令与技能同名。`plugin details` 显示 “Skills (2) skill-manager, skill-manager”，需要确定 Claude 用户实际得到的是哪一个入口。
- **P2-10**：共享 marketplace 已经列出 skilldock，因此有人可能已在 Claude 中装过 0.10.x。隔离安装当前 0.10.2 后，`plugin details` 显示 “MCP servers (1) skilldock”。这类安装生成的启动记录身份为 `directory`，HLD 5.3 中“读取旧记录时视为 Codex 安装”对它们不成立。
- **P2-11**：在元数据中为 RISK-SDX-001/002/003/004/008 补充 `mitigates` 关系；第 1 节映射表应如实标注“部分”。
- **P2-12**：`acquireFileLock` 会自动创建父目录（`process-lock.mjs:26`）。在只装 Claude 的机器上，如果 0.11.0 仍去取 Codex 锁，就会创建 `~/.codex`，再按 3.1 的“配置根存在”规则把 Codex 误判为已安装。
- **P2-13**：启用来源目前只列了 user / project / local / managed 四级。托管设置的来源（文件、MDM、服务端下发）如何识别没有说明；PRD 8.1 写的是六级。
- **P2-14**：Q1 决定中提到的“一键更新另一侧 SkillDock”在 3～5 节没有对应的设计或操作。
- **P2-15**：接口版本的兼容规则（何时递增、不匹配时入口怎么做）以及“对象属于多个 Agent”的字段形态，交给 LLD 和契约增量评审。
- **P2-16**：对没有历史记录的 Claude 插件，可以用 `installed_plugins.json` 中的 `gitCommitSha` 取得对应来源作为基线，从而发现首次检查之前已经存在的本地修改。

P2 共 16 项，只作统计，不影响准出。

## 技术与证据覆盖

| 维度 | 已审证据 / 实际结果 / N/A 理由 |
|------|-------------------------------|
| 架构职责、决策与替代方案 | 环境集合扩展、官方命令行写入、单后台任务、单实例与最新者运行，方向合理，与 PRD 8.3 的建议一致。主要缺陷集中在实例归属与共存（P1-01）以及对象身份（P1-02） |
| 技术栈、复用与维护成本 | 沿用 Node 与 React，不引入数据库；复用文件事务、diff、Git 检出、重启协调器，复用盘点有源码出处。新增的长期依赖：Claude 命令行的路径结构（P2-05） |
| 接口、数据及生命周期 | 契约增量方向正确（只增字段、未声明时只返回 Codex 对象，与 0.10.x 原生入口拒绝未知参数的行为相符）。缺 Claude 安装身份（P1-02）。数据迁移见 P1-01 |
| 新旧兼容、发布与恢复 | MR-SDX-001 的设计成立。0.10.x 共存与回退见 P1-01 和 DG-02。用户主动降级没有数据回滚路径，与 PRD 7.4 不冲突：PRD 只要求自更新失败时保留旧版 |
| 可观测性、风险和可测试性 | 本机日志和操作记录足以度量 PRD 2.3 的指标，没有遥测，符合 PRD。真实命令行在隔离目录中可测（V2 成立，本轮复现）；读回指纹的可测性见 GAP-01 |
| Security | 写入边界：托管 / 同步只读、项目共享设置逐次确认、不自动接受命令，成立。缺口：进程环境继承（P1-03）、归属键（P2-01）、设置备份内容（P2-07） |
| 数据 / 迁移 | 数据代号的思路正确，但覆盖的写入方不全（P1-01） |
| SRE | 单后台任务、到期才扫描、Agent 不可用时暂停不退避，均成立；共存期间的锁互斥见 P1-01 |
| QA | 隔离实验方法可复用；需要补充真实调用环境与各来源类型的实验 |
| 实际管理入口与执行器 | V3 成立：`install`、`enable`、`uninstall` 的 JSON 结果只有结论与作用域，版本以 `plugin list` 读回。V4 成立：实验中 user、project、local 三处 `skillOverrides` 的写法与报告一致。V6 本轮复现：去掉根 `.mcp.json` 后 MCP 服务为 0、技能为 2；保留根 `.mcp.json` 的对照组 MCP 为 1。V1、V5 只核对了实验目录结构（Codex manifest 的 `mcpServers` 指向 `./codex.mcp.json`；m1/m2/m3 三种 marketplace 布局），没有重新运行 Codex。`plugin list --json` 冷启动约 0.7 秒。实测前后用户真实配置摘要一致（`real-before.txt` 与 `real-after.txt` 无差异） |

## API 契约处理评估

把 `contracts.ts` 作为唯一事实源、HLD 只给增量和兼容约束，这一做法本身足够，不需要机械地补一份独立 API 工件。理由：这是只绑定 loopback 的本机 API，调用方只有同包发布的 React 界面和原生入口；仓库已有这一约定（03 号文档）；兼容策略为只增字段、未声明时只返回 Codex 对象、缺省视为 Codex，在 HLD 层已经表达清楚。

前提条件有三点：

1. 身份和兼容层面的决定不能留到实现阶段再定。P1-02 的 Claude 安装身份必须先在 HLD 层确定。
2. 接口版本的递增与不匹配规则，以及多 Agent 对象的字段形态（P2-15），要在 LLD 中写明。原生入口的路由白名单要与之同步修改。
3. `contracts.ts` 的增量涉及跨版本兼容（0.11.0 原生入口与更新版本服务互访），建议在 LLD 评审时作为契约增量单独审一次，可以用 api-reviewer 只审该增量，而不是只在代码评审中顺带检查。本 HLD 评审不代签该契约。

## 放行结论

| 门槛 | 实际结果 |
|------|----------|
| P0 / P1 均为零 | 否：P0 0 项，P1 4 项（HLDR-SDX-P1-01～04） |
| 必要证据缺口关闭 | 否：GAP-01 未关闭 |
| 范围具有有效原始授权 | 否：DG-01（AC-004 缩小）、DG-02（Q1 缺批准记录）待产品 Owner 决定 |
| 本轮正式覆盖完整 | 三道门已全部执行；部分覆盖的 7 项已在上文列明。Codex 侧 V1、V5 没有重新运行，未声称已复现 |

- technical_verdict：**CHANGES_REQUIRED**
- scope_status：**DECISION_REQUIRED**
- 执行许可：本轮只授权写这份评审报告。不包括修改 HLD 或 PRD、实现、commit、push、PR、安装、发布或 main 合并。本报告不签发 HLD 准出证书。

## 历程与下一步

| 轮次 | 原 ID | 变化 / 证据 / 结论 |
|------|-------|--------------------|
| 1 | — | 首轮正式评审：P1 4 项、必要证据缺口 1 项、待 Owner 决定 2 项（另有 1 项只需知悉）、P2 16 项 |

最小下一步：

1. 作者按 P1-01～04 修订 HLD，补做 GAP-01 的三类来源隔离实验。
2. 产品 Owner 就 DG-01 作出选择；在修正后的前提下重新确认 DG-02，并登记到 PRD；可选地结合 DG-03 复核 Q2。
3. 下一轮只复审上述原 ID 的变化及其直接影响。P2 不要求整改，不作为续轮理由。
4. HLD 通过后，在 LLD 阶段把 `contracts.ts` 增量作为契约增量单独评审。

## 附：本轮实际执行的校验

所有隔离实验都在 scratchpad 下的 `review-lab`（复制自作者的 `claude-lab`）中进行，使用 `env -i` 并设置临时 `HOME` 与 `CLAUDE_CONFIG_DIR`。没有运行会调用模型的命令，没有读取或修改用户真实的 `~/.claude`、`~/.codex`、数据目录或 LaunchAgents。

1. `trace_lint.py --strict --format json`：HLD、PRD 各一次，均 pass。
2. `trace_build_rtm.py --format json`：PRD + HLD，pass，结果见前文。
3. Claude 2.1.288：
   - 查看帮助：`plugin --help`，`install`、`update`、`uninstall`、`enable`、`disable`、`list` 各子命令的 `--help`，`marketplace --help`；
   - 读取：`plugin list --json`、`plugin list --json --available`、`marketplace list --json`；
   - 写入（仅在隔离副本内）：`plugin install labplug@lab-market`、`marketplace add <本仓库路径>`、`plugin install teamdesk@… / skilldock@…`；
   - 查看组件：`plugin details`；
   - 对比列表命令执行前后隔离目录的文件状态；
   - 带 `CLAUDECODE=1` 运行列表命令。
4. 用新会话组启动 `sleep` 探针进程，确认工具调用结束后仍存活，随后已清理。
5. 只读取了当前会话环境变量的名称（未读取值）；仓库 `git status` 在实验前后一致。
