# SkillDock 0.11.0 实现顺序

> 上游：[PRD-SKILLDOCK-002 v0.9](34-cross-agent-prd.md)、[HLD-SDX-001 v1.16](35-cross-agent-hld.md)、[API-SDX-001 v0.14](36-cross-agent-api-contract.md)
> 前置版本：0.10.3 已于 2026-10-08 发布（PR #54，main `337547a`）
> 日期：2026-10-08

## 排序原则

1. **先做不可逆、跨版本的部分**：数据格式、迁移门槛、启动记录与 0.10.x 的兼容义务都已随 0.10.3 冻结，做错的代价最高，其他功能也都建立在新数据格式上。
2. **先做只读，再做写入**：先让 Claude 环境能完整、正确地显示，再逐类开放写操作。只读阶段结束就是一个安全的中间状态，可以先做一次 UAT。
3. **先补实测，再定实现**：HLD 11A 条件 4 要求的 V11～V14 可能推翻设计前提，放在对应功能编码之前做。
4. **main 即发布**：全部阶段都在一个长期分支上本地提交。只在最后一个阶段，把 0.11.0 与 PRD、HLD、契约一起合并到 main（HLD 8.4）。

开发分支：`feature/skilldock-0.11-cross-agent`，从 main（0.10.3）新开，并合入文档分支 `docs/skilldock-cross-agent-prd`。

每个阶段的完成标志都包括四项：
- 阶段内单元测试与相关兼容矩阵用例通过；
- 独立代码评审（`testany-eng:code-reviewer`）没有 P0/P1；
- 本地提交；
- 向 Owner 汇报。

## 阶段 0：准备（不写功能代码）

| 事项 | 内容 | 依据 |
|------|------|------|
| 0.1 修契约 1b 的遗留 P2（已完成，契约 v0.6） | 按第 4、5 轮契约复审修：共用技能的四处边界、怎样识别“2 版”写请求、移除 marketplace 时两处不同的错误码、7.4“接受任务”的时点与遗留重启任务的清理；附带 S-01 措辞。修订后做一次契约增量复审 | 契约 r4、r5；HLD 11A 条件 1b |
| 0.2 实测 V11～V14 | V11 npm/archive 来源的指纹；V12 缺少 Node 时对话框在 Claude Bash 工具与 Codex 原生入口中的表现；V13 Claude 命令行在 launchd 下能否运行；V14 从 Claude 会话启动的服务在会话关闭后是否存活。全部在隔离目录中进行 | HLD 9.3、11A 条件 4 |
| 0.3 `contracts.ts` 增量 | 按 36c 写入类型（Agent、AgentEnvironment、SkillSide、ClaudeInstallation、EnablementSource 等），作为前后端共同的起点 | 36c 6 |
| 0.4 决定点 | 若决定把 AC-003 中“技能目录插件跨侧影响”登记为已知限制，先报 Owner 确认。已不适用：契约 v0.6 起按跨侧影响提示处理，未登记为限制 | 契约 r4 |

结果推翻设计前提时，回到 HLD 做增量复审。预计 1 次会话。

## 阶段 1：数据格式、迁移与单实例（M1，REQ-SDX-007）

最高风险阶段，所有跨版本义务都在这里落实。

- **数据层**：
  - 数据代号标记；
  - 启动记录 v2：新旧字段，旧字段严格按 36a 5.2，含 `installation` 键顺序；
  - 固定子目录 `compat/legacy-project`；
  - Claude 根目录记录；
  - 新格式计划文件；
  - 后台上下文 v2。
- **迁移门槛与接管**（DEC-SDX-022）：
  - 门槛只判断各 Agent 是否装有低于 0.10.3 的 SkillDock；
  - 交互入口当场引导（阶段 1 给出原因与手动步骤；一键更新随阶段 5 实现：门槛失败时由入口经启动器执行，与 `agent.updateSkilldock` 共用更新与读回，届时补 G-01 断言），非交互入口在解析工具链之前快速拒绝；
  - 固定顺序：先取启动锁，构建后取实例锁与 Codex 锁（取不到即在停旧实例之前失败），再停旧实例、接管后台注册，然后依次写计划文件、启动记录，最后写代号；
  - 迁移失败后快速拒绝（不按时间解除）；
  - 重启任务必须写终态；
  - 启动记录被删除后补写。
- **实例与版本收敛**：
  - 归属放宽到同一产品族（DEC-SDX-007），复用 0.10.3 的来源标识规范化；
  - 跨 Agent 选最高版本（DEC-SDX-008）；
  - 实例锁加各 Agent 配置锁（DEC-SDX-010）；
  - 安装登记。
- **健康检查 v2** 与接口版本规则（36c 4、5）；0.10.x 原生界面经代理访问 0.11 服务时的 1 版兼容。
- **0.10.x 调用 0.11.x 的义务**：
  - 项目回退；
  - 被 0.10.3 和 0.10.2 原生入口调用的冻结形式；
  - 源码布局在 0.10.2 允许列表内；
  - 保留 `runBackground(contextV1)`。
- **验证**：兼容矩阵中 0.11.0 关口的 G-01～G-12、G-16～G-18，以及用真实 0.11.0 写下的记录重跑全部 N、S、B、R 用例（条件 3 的前半）。

预计 2～3 次会话。

## 阶段 2：运行环境、Claude 入口与分发（M1，REQ-SDX-008、009、017）

- **运行环境**（DEC-SDX-012，3.10）：
  - 按“显式变量 → 保存值 → Codex 工作区 → 私有 Node → 常见位置 → 版本管理器 → PATH”扫描；
  - 保存并复用，失效时重扫；
  - 找不到时弹出对话框，不再下载；
  - shell 层与 Node 层共用一份候选清单。
- **Claude 命令行发现与进程环境白名单**（3.3，DEC-SDX-024）。
- **运行目录构建日志**：`<state>/build.log` 按大小轮换（第 19 轮范围外观察）。
- **分发**（DEC-SDX-013、014）：
  - Codex MCP 配置改名为 `codex.mcp.json`，并在 manifest 中显式引用；
  - `skill-manager` 技能说明与斜杠命令改为宿主中立；
  - Claude 中经内置浏览器面板打开；
  - marketplace 条目标注支持的 Agent（`teamdesk` 标“仅支持 Codex”）。
- **从 Claude 安装 SkillDock**（REQ-SDX-017）：Claude 侧安装的识别、被调用义务（任一侧被任一侧调用）。

预计 1～2 次会话。

## 阶段 3：Agent 环境层与 Claude 只读清单（M1，REQ-SDX-001、002、003）

- **Agent 环境层**（DEC-SDX-001）：
  - 环境发现（不创建任何 Agent 的根目录）；
  - 管理状态（已启用 / 只读 / 无法确认，DEC-SDX-018）；
  - Codex 默认已启用（MR-SDX-001）。
- **Claude 读路径**（DEC-SDX-004）：
  - 以命令行列表为主证据，读插件、marketplace、启用条目、技能可见性；
  - 启用状态来源、自动更新实际值、保护状态；
  - 主证据缺失时整个环境为“无法确认”。
- **统一视图**：
  - `multiAgent=1` 快照；
  - 共用技能按真实路径去重，并给出 `perAgent`；
  - 对象 ID 迁移。
- **前端**：
  - Agent 筛选与对象标识（只有一个环境时不显示）；
  - “Agent 环境”页：版本、一键更新入口、Claude 根目录与 Node 设置。

阶段结束：Claude 支持为只读，是安全的中间状态。**建议 Owner 在此做第一次 UAT**：在独立数据目录中试用，不影响正在用的 SkillDock。

预计 2 次会话。

## 阶段 4：Claude 写操作与能力对等（M2，REQ-SDX-005、012、015、016）

- **插件**：
  - 启禁（REQ-SDX-015，含覆盖来源与托管锁定）；
  - 安装、卸载（可保留数据）；
  - marketplace 添加、刷新、移除（先列出受影响的插件）；
  - 全部经官方命令行（DEC-SDX-003），遵守白名单子命令与安全约束（DEC-SDX-019）；
  - 安装身份含作用域与项目路径（DEC-SDX-023）；
  - 从本地目录或 Git 安装（DEC-SDX-025）。
- **独立技能**：
  - 安装、更新、可恢复移除、恢复，复用现有文件事务（DEC-SDX-020）；
  - 可见性写入设置文件：结构化补丁，写前核对摘要，原子替换（DEC-SDX-006）；
  - 中间档位先确认。
- **写入边界**（REQ-SDX-012）：
  - 默认当前用户；
  - 写入项目共享设置需逐次确认；
  - `settings.local.json` 征得同意后写入 `.git/info/exclude`；
  - 托管设置只读。
- **能力对照**（DEC-SDX-017，PRD 5.6）：
  - 每个对象带能力标记与原因；
  - 服务端同样拒绝不支持的操作；
  - 所有写操作核对 `revision`，发现在 Claude 中已有改动时停止。
- **从阶段 3 挪入**：对象 ID 迁移；2 版请求下共用技能的规则（`CONFIRMATION_REQUIRED` 与 `nativeRules`、`expectedRevision` 与 `SNAPSHOT_STALE`、`SOURCE_CONFLICT`、跨侧影响提示）；Codex 环境的“无法确认”与未安装时目标暂停；在 SkillDock 中刷新 Claude marketplace（首次 UAT）；联网的 `--available` 清单按需请求（36c 第 10 节）。
- **界面**：按 Owner 决定（2026-10-09），这一阶段的界面只保证功能可用，不做打磨；界面问题记入 [41](41-ui-redesign-backlog.md)。

拆分（每步：定向测试 → 沙箱完整套件 → 提交 → 复核）：

| 步 | 内容 |
|----|------|
| 4a | Claude 插件与 marketplace 写操作：启停、从 marketplace 安装（预览给出作用域与原生规则）、卸载（保留数据）、marketplace 添加、刷新、移除（列出受影响插件）；Claude 配置根锁（实例锁 → Codex 锁 → Claude 锁，取锁不创建根目录）；能力标记与原因、`expectedRevision`、`CONFIRMATION_REQUIRED`；命令行白名单与机器可读结果；按插件清单读回 |
| 4b | Claude 独立技能：可见性写入（结构化补丁、写前摘要核对、原子替换、撤销只记被改条目、`.git/info/exclude` 征得同意）；安装、更新、可恢复移除、恢复复用文件事务，目标为 Claude 个人根或项目 `.claude/skills`；来源记录按 Agent 分区；对象 ID 迁移 |
| 4c | 2 版请求下的共用技能规则与跨侧影响提示（AC-003）、`SOURCE_CONFLICT`、批量移除含 Claude 对象；Codex 环境的“无法确认”与目标暂停 |
| 4d | 从本地目录或 Git 安装 Claude 插件（带 manifest 的放入技能目录；不带的经 SkillDock 管理的本地 marketplace，停用管理时可清理）；联网的 `--available` 清单原定按需请求，实现时决定不做（见进度） |

命令行写法以 Claude 2.1.288 的帮助为准（2026-10-09 在断网沙箱与临时目录中读取）：安装、卸载、启停都用 `-s/--scope` 显式传作用域，卸载有 `--keep-data`，结果用 `--json` 取最后一行；需要执行 marketplace 声明的命令（command 来源、headersHelper）时命令行要求 `-y` 或 `--accept-command`，SkillDock 不代为确认（DEC-SDX-019），只给出手动途径；marketplace 刷新为 `marketplace update <名称>`，移除不带作用域时从所有作用域删除声明。

预计 3～4 次会话。

## 阶段 5：更新、预览与后台计划（M2，REQ-SDX-004、006，MR-SDX-003）

- **编码前的实测**（HLD 11A 条件 4；2026-10-09 已完成，见进度）：V11 的 archive 部分、声明了版本的 npm 包、更新后是否重新安装依赖、`.in_use/` 是否会有内容、从隔离区副本经“从本地目录安装”重装；V13 的真实 launchd 任务（含一次联网更新）。两项联网下载前都先征得 Owner 许可。结果推翻设计前提时回到 HLD 增量复审。
- **Claude 插件更新**：
  - 在自有暂存区预览，应用前再核对（DEC-SDX-005）；
  - 按来源类型确定候选内容与读回规则（DEC-SDX-026，3.3A）；
  - 原地覆盖的 npm 插件，更新前把当前内容复制到隔离区供手动恢复（3.3A）；
  - 本地修改保护（MR-SDX-003）。
- **跨 Agent 后台计划**（DEC-SDX-011）：
  - 计划目标带 Agent 与安装身份；
  - 跨侧技能的确认（契约 36c 第 6 节）：另一侧已启用管理时，新增或改变这类目标、把含这类目标的计划改为自动应用或启用自动应用的计划都须确认；未确认的只检查不应用；1 版保存与继承的目标保持 0.10.2 行为；暂停的目标不阻断启用；手动批量执行按请求的 `confirm`；
  - Claude 目标使用保存的根目录与命令行；
  - 某个 Agent 不可用时，其目标记为暂停，不计入失败；
  - 两侧来源记录不同的共用技能，在批量执行（`updates.run`）与后台计划中标为不可检查（4c、4d 合并复审 P3-02：单个请求与更新页已在阶段 4 拒绝，批量与计划随本阶段）。
- **SkillDock 自身**：
  - 两侧都可加入计划；
  - 一键更新另一侧（`agent.updateSkilldock`，该侧无法确认时返回 `AGENT_UNCONFIRMED` 并给出手动步骤）；迁移门槛失败时由入口经启动器执行同一套更新与读回（HLD 3.7、6.6，G-01），是否写入契约按 36b 第 2、12 节判断；
  - 0.11 自身的自更新协调器按“最新者运行”在新数据格式下发起切换（阶段 1～4 中它在代号 2 下不发起，属已知取舍）；
  - 新实例启动时需要实例锁或 Codex 锁的写操作（例如计划已启用时补登记后台）在启动器持锁期间会跳过，确认由之后的周期补做，并在 HLD 3.8 写明。

拆分（每步：定向测试 → 沙箱完整套件 → 提交 → 复核；界面只保证可用，问题记入 41）：

| 步 | 内容 |
|----|------|
| 5a | 更新目标与 Claude 更新项：`UpdateTarget.agent`（单次检查与应用、手动批量与计划都接受 Claude 目标，按 Agent 去重）；多 Agent 快照为 Claude 插件与只属于 Claude 的技能生成更新项（路线、能否检查、不代为更新的原因：command 来源、带 headersHelper 的条目、`@synced`、managed 范围、项目路径缺失等，DEC-SDX-019）；`update.check`、`update.apply` 按目标的一侧分派；只属于 Claude 的技能与技能目录插件经现有文件事务检查与更新；计划中的 Claude 目标改按 HLD 3.8 暂停（管理未启用或无法确认时），不再一律暂停；技能变为两侧共用、对象 ID 改变时计划目标与绑定的迁移 |
| 5b | Claude 插件（从 marketplace 安装）的更新：按 HLD 3.3A 取得候选内容（marketplace 相对路径、Git 类、npm、archive），预览与差异，应用前再核对，经命令行 `plugin update`，读回版本与指纹；本地修改保护（MR-SDX-003）；版本为 `unknown` 的插件更新前复制到隔离区（含 `node_modules`）；读回不一致时如实报告；project、local 作用域以安装所在项目为工作目录 |
| 5c | SkillDock 生成的本地 marketplace 中插件的更新（从原始来源重新暂存、替换数据目录中的内容、刷新 marketplace、`plugin update`、读回）；批量与计划中两侧来源不同的共用技能标为不可检查；跨侧技能在计划中的确认（36c 第 6 节） |
| 5d1 | SkillDock 自身：0.11 自更新协调器在代号 2 下发起切换（两侧取最高版本）；后台按两侧并集取运行来源（HLD 3.8）；启动器持锁期间需要锁的写操作跳过并由之后的周期补做（HLD 3.8 写明）；两侧都可加入计划 |
| 5d2a | `agent.updateSkilldock`（该侧无法确认时返回 `AGENT_UNCONFIRMED` 并给出手动步骤）与“Agent 环境”页的一键更新；更新与读回放在引导安全的共用模块 |
| 5d2b | 迁移门槛失败时由入口经启动器执行同一套更新与读回（G-01）：启动器、Claude 技能说明、原生入口 |

预计 2 次会话。

## 阶段 6：文案、文档与 0.11.0 发布（M3，REQ-SDX-013）

- **文案**：
  - 中英日三语改为跨 Agent 表述；
  - 与宿主相关的提示按对象所属 Agent 选择。
- **文档同步**（HLD 8.4）：
  - 根 `README.md`（含“在 Claude 中安装 SkillDock”一节；删去“无需预装 Node、自动准备运行环境”的旧说法）、根 `AGENTS.md`（Node 准备规则已在阶段 2 先行修正，安装段落补 Claude）；
  - 插件中英 README、`SKILL.md`（阶段 2 已改为宿主中立，随最终行为复核）、`references/18-codex-node-runtime.md`（阶段 2 已登记新规则）；
  - 回退说明。
- **TeamDesk 版本**：阶段 2 给共享 marketplace 中的 `teamdesk` 条目加了“仅支持 Codex”的说明（插件文件未改）。合并前按 `plugins/teamdesk/AGENTS.md` 的版本规则决定是否随本次合并升 TeamDesk 的版本号。
- **发布关口**：
  - 条件 3：用真实 0.11.0 跑完兼容矩阵全部用例；完成 V18（门槛的环境组合）；在真实 Codex 中完成 V17（需要 Owner 配合，会用到真实 Codex 的插件更新），用结果校正 Q9；
  - 全部 P0 验收标准；
  - 浏览器端到端测试；
  - Owner 的最终 UAT。
- **版本与合并**：
  - 升到 0.11.0，写 CHANGELOG；
  - PRD、HLD、契约与实现一起合并 main（合并即发布，须 Owner 确认）；
  - 0.10.3 与 0.11.0 之间的发布间隔由 Owner 决定。

预计 1～2 次会话，另加 UAT 时间。

## 0.11.0 之后

| 版本 | 内容 |
|------|------|
| M4（P1） | 同源跟踪与“两边都更新”（REQ-SDX-010，DEC-SDX-016）；完整兼容性推断与用户确认（REQ-SDX-011）；届时增补 36c |
| M5（P2） | 作者侧声明键 `skilldock-agents`（REQ-SDX-014），本仓库补齐声明 |

## 需要 Owner 参与的节点

| 时点 | 事项 |
|------|------|
| 阶段 0 | 若把 AC-003 的技能目录插件跨侧影响登记为已知限制，需确认 |
| 阶段 3 结束 | 第一次 UAT（只读 Claude 支持） |
| 阶段 6 | V17（真实 Codex 中更新插件）；最终 UAT；确认合并发布与发布间隔 |
| 任意阶段 | 实测或评审推翻设计前提时，做 HLD 增量复审并请 Owner 决定 |

## 进度

| 阶段 | 状态 | 提交与验证 |
|------|------|-----------|
| 阶段 0 | 已完成 | 契约 v0.6 起的 1b 修订；V11～V14 实测见 HLD 9.3 |
| 阶段 1 | 已完成 | 迁移、门槛、单实例与 0.10.x 兼容义务；代码复核到第 4 轮（[r4](38-cross-agent-phase1-code-review-r4.md)）通过，其 P2 与 HLD 第 21 轮、契约第 13 轮 P2 在 `7971fd8` 处理（HLD v1.14、契约 v0.14，待增量复审） |
| 阶段 2 | 已完成，代码复核第 3 轮与 HLD 第 24 轮通过 | 2a 运行环境 `38bd668`；2b Claude 命令行与环境白名单 `fe777f2`；2c 分发 `7d19e86`；2d Claude 侧安装 `e0ed4ab`（两侧互调用例；可选冒烟 `tests/claude-distribution-smoke.mjs` 在临时 HOME 中真实安装：只得到技能与命令、MCP 服务为 0、TeamDesk 标注可见、`doctor` 只读）。冒烟顺带发现 Homebrew Node 与 npm 配对失败，已在 `e0ed4ab` 修正。代码评审（[报告](38-cross-agent-phase2-code-review.md)）P1 1 项、P2 8 项，已在 `a925599`、`35f0b71`、`ef67997`、`af3ffad`、`1f761c8` 修复（HLD v1.15 同步文字）。代码复核第 2 轮（[报告](38-cross-agent-phase2-code-review-r2.md)）APPROVED，P2 3 项与 HLD 第 23 轮两处措辞在 `58dc726` 修复（HLD v1.16）；第 3 轮窄范围复核（[报告](38-cross-agent-phase2-code-review-r3.md)）APPROVED，HLD 第 24 轮 APPROVED（带条件，证书绑定 v1.16），其余只涉及测试的 P2 在随后的提交中修复（未再开评审轮次）。HLD 第 24 轮的三条观察（3.3 除外清单未列对话框与 `codesign`、处理表措辞、多余空行）留到下次修订 HLD 时一并处理。冒烟不再请求远端插件目录，须在禁止外连的沙箱中运行；测试世界不再运行本机的 Agent 命令行；完整套件在禁止外连、禁止执行本机 Agent 命令行的沙箱中通过 |
| 阶段 3 | 已完成，代码复核第 3 轮通过；Owner 首次 UAT 已结束（2026-10-09），界面重新设计挪到 Claude 版完成之后（[待重新设计清单](41-ui-redesign-backlog.md)） | 3a Agent 环境层与管理状态 `d599c8d`；3b Claude 只读清单 `9256420`；3c 多 Agent 快照与共用技能 `12af853`（测试世界修正 `3620cf0`）；3d Agent 筛选、标识与“Agent 环境”页 `36cfc75`（确认框名称 `b7e6699`）。沙箱中完整套件 372 项通过；在临时世界（替身命令行、端口 47912）中目测了技能库、插件、市场来源与“Agent 环境”页，并走通了启用 Claude 管理。挪到后续阶段：对象 ID 迁移（阶段 3 中 Claude 对象还不能进入计划、来源或操作记录，Codex 对象的 ID 在共用时不变，没有要迁移的记录）随阶段 4 的第一批 Claude 写操作实现；Codex 环境的“无法确认”状态暂不计算（保持 0.10.2 行为，MR-SDX-001）；一键更新另一侧的 SkillDock 仍在阶段 5；切换 Claude 根目录后刷新后台上下文随阶段 5 的 Claude 后台目标实现。代码评审（[报告](39-cross-agent-phase3-code-review.md)）P1 2 项、P2 13 项已在 `1343a5e` 修复，沙箱中完整套件 381 项通过。评审指出的另一组挪动一并登记：共用技能在 2 版请求下的规则——移走或更新真实目录时以 `CONFIRMATION_REQUIRED` 与 `nativeRules` 提示同时影响两侧（AC-003）、`expectedRevision` 与 `SNAPSHOT_STALE`、`SOURCE_CONFLICT`、跨侧影响提示——随阶段 4 实现；在此之前，这类请求暂按 1 版语义处理（与 0.10.2 相同，移除进可恢复区）。Codex 环境的“无法确认”状态与 Codex 未安装时目标暂停，随阶段 4 的能力对照一并实现。复核第 2 轮（[r2](39-cross-agent-phase3-code-review-r2.md)）发现只读的 Codex 在检查插件时仍会补写技能选择，已在 `fe66fa2` 修复；第 3 轮（[r3](39-cross-agent-phase3-code-review-r3.md)）APPROVED，其新 P2 与测试缺口在随后的提交修复，沙箱中完整套件 384 项通过。已知残留：只读时检查的结果（含附注与“不可应用”）保留到下一次检查，重新启用 Codex 管理后需重新检查；管理状态写入后的读回没有独立测试（只能靠注入故障构造）。UAT 时请注意：这一版中两边共用的技能被移除或更新时，不会提示会同时影响 Codex 与 Claude（随阶段 4 实现），移除的内容进入可恢复区。首次 UAT（[说明](40-phase3-uat-guide.md)）的反馈与处理：（1）0.10.2 起，Codex 插件与 marketplace 操作后的读回只要清单里有任何提示就判为“无法确认终态”，Owner 刷新 marketplace 时因另一个插件的来源链接失效而误报；改为只核实本次操作的对象（所在清单须完整读到、目标记录未被忽略），无关提示照常显示，后台任务判断 SkillDock 是否已卸载用同一规则；（2）Claude 插件页补上“未安装”的插件，取自 Claude 在本机保存的 marketplace 副本（HLD 3.2 表中的辅助来源，不联网，只读；契约 36c 第 6 节补充其 ID 写法），在 SkillDock 中刷新 Claude marketplace 随阶段 4；（3）桌面应用为会话自带的插件（内置浏览器、电脑操作等）不在 Claude 配置目录中，只在 Claude 卡片上注明不列出。沙箱中完整套件 389 项通过。复核（[uat1](39-cross-agent-phase3-uat1-review.md)）APPROVED 带 P2 2 项、P3 5 项，随后一并处理：被忽略的记录按插件 ID 与“名称@市场”两种身份记下，没有身份的记录让该清单无法确认任何对象（读回与后台卸载判断都遵守）；提示指名被忽略的记录，后台区分“清单没读到”与“记录无法安全使用”；补齐评审列出的未覆盖保护的测试；Claude 名称按“字母、数字、点、下划线、连字符”校验，去重并入 Claude 自己的安装记录（含其他项目的安装），marketplace 副本读不了时给出提示；契约 36c 第 10 节补充未安装插件的来源。Owner 第二批反馈：插件页计数跟随 Agent 筛选，选“全部”时标题旁分别显示两侧数量；Agent 标识改为图标——Claude 用 Simple Icons 16.0.0 中的 Claude 标志（CC0，声明见 THIRD_PARTY_NOTICES.md），Codex 用 Lucide 的通用终端图标（OpenAI 的标志需要 OpenAI 许可，Simple Icons 16.0.0 因此删除了它）。`7a4f531` 沙箱中完整套件 400 项通过；复核 r2（[报告](39-cross-agent-phase3-uat1-review-r2.md)）APPROVED 带 P2 1 项、P3 6 项。Owner 随后决定：界面问题不再零碎修改，等 Claude 版（阶段 4、5）完成后整体重新设计；r2 中的界面项（P2-01、P3-03、P3-04、P3-06 第 1 条与计数测试）记入 [41](41-ui-redesign-backlog.md)。r2 的后端项随即处理：被忽略记录的身份必须形如“名称@市场”（按最后一个 @ 拆分），对不上形状的记录让该清单无法确认任何对象；后台判断 SkillDock 是否卸载时，被忽略记录的名称与 SkillDock 相同也视为可能是它；补官方目录安装读回、提示合并与去掉控制字符的测试；Claude marketplace 副本格式不对或市场名不合规时给出提示 |
| 阶段 4 | 已完成（Owner 决定不单独 UAT，阶段 5 完成后一起试用）：4a、4b 合并复审（[报告](44-cross-agent-phase4ab-review-r2.md)）APPROVED（P3 6 项，已处理）；4c 已完成（两侧技能事务合并、共用技能的 2 版规则、批量移除、Codex 的“无法确认”），评审（[报告](45-cross-agent-phase4c-code-review.md)；首次评审因 Owner 暂停而中止、未出报告）APPROVED（P2 5、P3 7），已全部处理；4d 评审（[报告](46-cross-agent-phase4d-code-review.md)）CHANGES REQUESTED（P1 1、P2 6、P3 10），已全部处理；4c、4d 合并复审（[报告](47-cross-agent-phase4cd-review-r2.md)）APPROVED（P3 6，已处理）。4a～4d 均已通过独立评审。2026-10-09 Owner 决定阶段 4 不单独做 UAT，阶段 5 完成后一起试用 | 4a Claude 插件与 marketplace 写操作（本次提交）：新模块 `server/claude-writer.mjs`（白名单子命令、显式作用域、`--json` 取最后一行、遇到 marketplace 声明的命令返回 `HOST_MANAGED` 不代为确认）、`server/claude-actions.mjs`（Claude 配置根锁、锁内重读与 `expectedRevision`、`CONFIRMATION_REQUIRED` 与 `nativeRules`、按插件与 marketplace 清单读回、操作记录带 `agent: "claude"`）、`server/local-settings.mjs`（新建未被忽略的 `.claude/settings.local.json` 时征得同意写入 `.git/info/exclude`）；Claude 清单给出按原生规则计算的能力标记，管理未启用或无法确认时服务端统一标为只读；错误体在 `CONFIRMATION_REQUIRED` 时带 `nativeRules`；1 版快照不含 Claude 的操作记录。界面只保证可用：Claude 对象的写请求自动带修订号，服务端要求确认时弹出按规则生成的确认框（可选保留插件数据、写入 exclude），添加来源可选 Agent，安装 Claude 插件可选范围。启停的缺省作用域按安装范围（HLD v1.17、契约索引 0.15 / 36c 0.14 的有限修订，待增量复核）。定向测试 `tests/claude-actions.test.mjs`（含全部新提示的英、日翻译检查）；可选冒烟 `tests/claude-writes-smoke.mjs` 在断网沙箱与临时目录中用真实 Claude 2.1.288 走通添加 marketplace、安装、用户与项目本地设置中的启停、保留数据卸载、刷新与移除 marketplace，前后核对真实 Claude 配置的修改时间与缓存条目数未变。4b 拆为 4b1（技能可见性）与 4b2（技能文件事务、来源分区、对象 ID 迁移）。4b1（本次提交）：`server/claude-settings.mjs` 对设置文件做结构化补丁（只改 `skillOverrides` 中的一项、保留缩进与其他键、写前再核对摘要、同目录临时文件原子替换、链接写到目标、撤销只记旧值且不进快照）；Claude 技能的 `skill.toggle` 写可见性条目：中间两档改为开或关须确认，个人技能写用户设置（当前由项目设置决定时写本地设置），项目技能写本地设置，共享设置须确认，按清单读回；托管设置决定时不可切换（HLD 3.4 补充见 v1.17）。测试 `tests/claude-skill-visibility.test.mjs`；翻译检查抽为 `tests/i18n-helper.mjs`。4b2（本次提交）：只属于 Claude 的技能复用文件事务的底层原语（暂存、带边界核验的移动、可恢复区、来源记录），写入 Claude 个人技能目录或当前项目的 `.claude/skills`（移除与更新也只作用于这两处，上级目录中的项目技能属于仓库与其他项目，不在此列）；Claude 的来源记录存在注册表的 `claudeSources` 分区，按真实目录保存（对象 ID 迁移：技能变为两侧共用、ID 改为 Codex 侧时，记录按真实路径保留，共用期间 Claude 一侧的修改随 4c，恢复为只属于 Claude 后重新使用；目录改名或删除后记录成为孤儿，尚不显示“无法解析”；计划目标的迁移随阶段 5 的 Claude 计划目标实现）；预览记下所属一侧，另一侧的请求使用它返回 `STALE_PREVIEW`（文件差异按预览自己的一侧核对）；恢复按操作记录所属的一侧处理并检查该侧的管理状态；链接只移除链接，也不读写来源记录。可见性的撤销数据只记录（含读回失败时），暂不提供撤销，与 Codex 的启停一致。两侧共用技能在 Claude 一侧的移除、更新与来源关联随 4c。界面：技能安装对话框在两侧都启用管理时可选择安装到哪一侧与位置。Claude 技能的更新检查经更新页（`update.check`）随阶段 5。测试 `tests/claude-skill-files.test.mjs`。4a 评审（[报告](42-cross-agent-phase4a-code-review.md)）CHANGES REQUESTED（P1 1、P2 3、P3 9），随后处理：P1 移除 marketplace 时，项目共享设置声明了它或其中有 project 范围安装，确认中说明会改动共享的 `.claude/settings.json`（Claude 从所有层删除声明，按 HLD 3.3 的既有规则逐次说明，不另作取舍）；托管设置声明的不可移除；P2 启停缺省层按决定层（HLD v1.17 同步）、只有 Claude 可管理时添加来源发往 Claude（`creationAgent`）、补齐读回、锁、能力标记、本地设置与工作目录的测试；P3 错误码按契约（`PROJECT_PATH_MISSING`、`HOST_MANAGED`）、超时说明“结果未确认”、拒绝重复参数与空或不合规的对象名、`check-ignore` 关闭 fsmonitor 且不为已跟踪文件询问、锁内重读后再看“无法确认”、记录前核验状态目录并脱敏、1 版快照先过滤再截断、上级目录的技能目录插件在当前项目启停、Claude 结果不追加“Codex 会话”、确认重发沿用首次的修订号、写入 exclude 默认不勾选（记入 41）、契约措辞；冒烟补“项目本地设置中安装”与“仍有插件时移除 marketplace”：真实 Claude 记录的项目路径与工作目录一致，移除 marketplace 时 Claude 会卸载从它安装的插件。4b 评审（[报告](43-cross-agent-phase4b-code-review.md)）APPROVED（带 P2 4、P3 9），随后处理：可见性的中间档、共享设置与同名技能一次确认，补丁读取时再核对旧值（含写入层中的中间档）；Claude 更新与来源预览的文件差异按预览的一侧核对；移除或恢复链接不读写来源记录；设置补丁补齐临时文件清理、悬空链接、原权限、超出安全范围的整数与键名；只修改个人目录与当前项目中的技能，Claude 的插件目录列为受保护根，来源键与操作一致；共用技能的 Claude 一侧在快照中标为不可修改并返回 `UNSUPPORTED_FOR_AGENT`；只有 Claude 可管理时技能安装也可选位置。P2-04（Claude 事务的编排复制自 Codex 分支）先按评审的最低要求逐项补 Claude 一侧的测试（`tests/claude-skill-guards.test.mjs`）；两侧合并为一份按侧参数化的实现放在 4c 开头做（4c 处理共用技能时要同时改这两条分支）。合并复审的 P3 随后处理：显式写入层低于决定层时返回 `SCOPE_INEFFECTIVE`、不写入（36c 第 8 节新增）；技能切换先读写入层的条目，中间档、同名技能、共享设置与本地设置文件的选择一次确认，补丁内再核对该条目；新建设置文件的权限交给 umask；多级链接解析到最终目标，指向不存在目录的链接拒绝；移除 marketplace 后核对各层的声明已删除，项目共享设置中只有插件条目时同样说明；项目目录不存在时移除 marketplace 返回 `PROJECT_PATH_MISSING`；SkillDock 自身不标为可移除；补相应测试。4c 第一步（本次提交）：Codex 与 Claude 的技能文件事务合并为一份按侧参数化的实现：`skillOperation` 承担来源预览与关联、安装预览与安装、检查更新与更新、移除、恢复的编排，侧对象（`codexSkillSide`、`claudeSkillSide`）只提供记录查找与来源键、来源分区、安装根、恢复位置、移动边界与文字；Codex 一侧逐项保持 0.10.2 的取值与顺序。完整套件不变（443 项通过）；变异实验：去掉共用实现中的本地修改核对，有用例失败（4c 评审更正：四处核对各只有一侧的用例钉住，并非两侧同时失败）。4c1（本次提交）：2 版请求作用于两侧共用的技能时，服务端先核对覆盖两侧的修订号（`SNAPSHOT_STALE`）；移走共用的真实目录前要求确认（`nativeRules` 的 `scope` 一条说明两侧都会失去）；独立技能的内容位于另一侧插件目录中时，移除目录或更新前要求确认并列出受影响的插件；关联来源与另一侧记录不同即 `SOURCE_CONFLICT`；Claude 一侧按自己的发现路径操作（链接只移除链接、可见性写 Claude 自己的条目、两侧都能更新时以 Codex 为准、来源不同则两侧都不能更新并说明）；一侧更新后另一侧同源记录的内容指纹同步，恢复这次更新时一并还原；共用技能的检查更新与更新结果带“两侧看到的内容都会改变”。1 版请求保持 0.10.2 行为。界面为共用技能带上共同的修订号；Claude 一侧的操作入口记入 41（UI-09）。测试 `tests/shared-skills.test.mjs`。4c2、4c3（本次提交）：2 版批量移除（同名副本）的预览读多 Agent 快照，可以包含 Claude 副本（ID 校验在带 `agent` 时接受 Claude 技能 ID），各项按所属一侧核对，Claude 副本取 Claude 锁、写 Claude 分区与带侧别的操作记录，可按 Claude 一侧恢复；批中有移走共用真实目录或改写另一侧插件内容的项时，预览带 `nativeRules`，执行须 `confirm: true`；1 版保持 0.10.2。Codex 命令行不可用时“Agent 环境”页显示 Codex“无法确认”，不拒绝写操作；Claude 已启用管理时，Codex 未安装则其计划目标全部暂停、命令行不可用则插件目标暂停（HLD v1.17 修订表）。后台计划中跨侧技能的确认随阶段 5。冒烟前后对真实配置的核对为手工步骤：只比较 `~/.claude/settings.json`、`plugins/installed_plugins.json`、`plugins/known_marketplaces.json` 的修改时间与插件缓存目录条目数，不读内容。4d（本次提交）：从本地目录或 Git 安装 Claude 插件（`plugin.previewInstall`、`plugin.installSource` 带 `agent: "claude"`，HLD 3.3、DEC-SDX-025）。来源带 Claude manifest 时作为技能目录插件放入个人技能目录或当前项目的 `.claude/skills`（作用域 `user`、`project`），复用技能文件事务的边界核验与 Claude 分区的来源记录，按 Claude 清单读回，不经命令行、不写设置；位于这两处的技能目录插件可移除（确认后移到可恢复区，可从操作记录恢复），上级目录中的仍不可移除并说明原因。来源没有 Claude manifest、但有 Claude 能加载的技能或命令时，在数据目录 `claude-direct-plugins/` 下生成 SkillDock 管理的本地 marketplace（名称 `skilldock-` 加来源摘要），登记到 Claude 后经命令行安装，只允许 `user`、`local`，本地作用域新建未被忽略的 `.claude/settings.local.json` 时征得同意写入 `.git/info/exclude`；两者都没有的来源拒绝，同一来源已安装时说明。生命周期：从它安装的最后一个插件被卸载、或在 Marketplace 页移除它时，一并删除生成的文件与登记；停用 Claude 管理时确认框列出这些 marketplace，可勾选“一并清理”（逐个经普通的 marketplace 移除流程并读回，全部成功后才停用，失败则管理保持启用），不勾选则照常停用并在结果中列出遗留项；快照把它们标为单插件来源并显示原始来源。Claude 命令行不可用时 Claude 本就“无法确认”，这些写入一律拒绝。决定：不提供联网的 `--available` 清单——可安装插件取自本机 marketplace 副本，刷新 marketplace 即更新（2026-10-09 已向 Owner 说明，Owner 当日确认；36c 第 10 节同步）；HLD 3.3 的“更换数据目录前先移除再重建”不适用（0.11 不提供更换数据目录）；README 卸载说明中的清理步骤随阶段 6。界面：安装对话框对插件来源也可选 Agent 与范围；“Agent 环境”页 Claude 启用说明改为当前能力，停用确认框带“一并清理”选项。契约索引 0.16、36c 0.15 为有限修订，待增量复核。测试 `tests/claude-plugin-sources.test.mjs`（初版 9 项，含用例触发到的新提示的英、日翻译检查）；完整套件在沙箱中 459 项通过。可选冒烟 `tests/claude-writes-smoke.mjs` 补 4d 步骤：断网沙箱与临时目录中，真实 Claude 2.1.288 接受 SkillDock 生成的 marketplace，无 manifest 来源安装后读到版本（取自来源的 Codex manifest）与技能，卸载后 marketplace 与用户设置中的声明一并删除，停用管理时勾选清理同样删除；带 manifest 来源被识别为 `名称@skills-dir`，移除与恢复后 Claude 均读回一致；前后核对真实 Claude 配置的修改时间与缓存条目数未变。4d 评审处理（本次提交）：P1 没有任何 manifest 的来源以来源本身命名（本地目录名；Git 取子路径末段或仓库名），不再取暂存目录名 `candidate`；P2 清理经 `marketplace remove` 后读回，读回不符则保留文件与登记；清理失败不改变已完成的卸载或移除，结果说明出路并另记失败记录；安装失败时撤销这次生成的 marketplace，同一来源内容变了再装时按 Codex 侧做法备份后替换；“最后一个插件”同时看 Claude 的安装记录（含其他项目），仍有安装时保留并说明；不提供联网 `--available` 清单的决定写入 HLD v1.18（用户已于 2026-10-09 确认，HLD 第 10 节 DG-NO-AVAILABLE），36c 第 10 节去掉旧说法；新增保护补用例（含锁、读回、受保护根、删除边界、界面复选框的默认值与出现条件），本地变异实验中（在完整应用副本中先确认基线全部通过），评审列出的 M01～M09、M11，以及我为 P1、P2、P3 修复所设的去保护变异，共 17 项都使用例失败（合并复审另设的变异中有 7 项未被发现，见 47 号报告 P3-05，已补其中 N03、N11、N12、N16）；界面复选框的默认值与出现条件补了用例；P3 生成的 marketplace 按名称、Claude 读取的目录与数据目录位置三者核对身份，同名而指向别处的视为用户自己的（安装返回 `MARKETPLACE_EXISTS`、清理不动它），删除只限它自己的目录；技能目录插件的移除与记录、来源记录一次写入，写不进则移回；Claude 的 `plugin.installSource` 拒绝 `enabledSkills`；移除技能目录插件时列出指向它的 Codex 技能；停用时的清理只在管理已启用时执行，Claude 中已没有的登记在 Claude 锁下只删 SkillDock 自己的文件并留记录；项目中被个人目录同名插件遮蔽时如实说明；安装对话框对 Claude 来源改写说明、显示“专用 manifest”，确认页不再说可以更新；翻译检查覆盖用例没有触到的新提示；契约索引 0.17、36c 0.16。技能目录插件与无 manifest 插件的更新随阶段 5；生成的 marketplace 在 Claude 中“刷新”只重读数据目录中的副本，不从原始来源取新内容；从 Claude marketplace 安装的预览显示 manifest 记入 41（UI-10）。测试 `tests/claude-plugin-sources.test.mjs` 18 项。4c 评审处理（本次提交）：P2 更新页的 `update.check`、`update.apply` 以技能为目标时同样经过共用技能规则（修订号、跨侧确认、来源冲突，说明随结果返回），技能卡片的更新对话框显示这些说明；两侧来源不同时 2 版的检查更新与更新返回 `SOURCE_CONFLICT`（此前只在快照中标为不可更新）；2 版批量移除的环境检查按各项所属的一侧（只含 Claude 副本时不因 Codex 只读整批拒绝）；批量移除的整组签名含各副本由哪些 Agent 看到与各侧的移除方式，预览之后才变成共用的目录会停下；Codex 命令行不可用时 Codex 保持存储的管理状态、以说明写出（不再显示为“无法确认”，界面的安装目标与停用开关照常，与 PRD 5.1 一致；HLD v1.18 改写）；P3 关联来源在预览时即说明另一侧的来源，本地目录按真实路径比较；Claude 一侧切换用同一快照的修订号；过时文字更正；Claude 技能安装预览先校验作用域再暂存来源；共用技能的 Claude 一侧在托管设置下不可移除、不可更新；补用例（更新页、冲突、预览说明、链接同源、子目录不同、关联须修订号、指向插件的链接不需确认、托管、批量按侧与锁与来源记录、预览后变共用、批量跨侧确认、1 版批量不确认、Codex 未安装全部暂停），我为各项修复所设的去保护变异都使用例失败（合并复审另设的变异中 K05、K06、K17、B27、B55、B56、B59 未被发现，已补 K17、B27）；Claude 一侧更新时同步 Codex 记录（M39）与共用技能 Claude 一侧不在技能根中（M37）未补用例；更新页的说明与批量移除预览的说明在界面中的显示记入 41（UI-11）；契约索引 0.18、36c 0.17。合并复审处理（本次提交）：P3-01 更新页要求确认或修订号过期时不再把该项记为失败（`CONFIRMATION_REQUIRED`、`SNAPSHOT_STALE` 不记错误），确认后照常应用；P3-02 批量执行与后台计划中来源冲突的共用技能随阶段 5（写入阶段 5 与 36c 第 6 节）；P3-03 生成的 marketplace 的身份核对接受同一目录的其他写法（规范化路径与真实路径），Claude 中同名而指向别处时只删 SkillDock 自己的文件并如实说明，不再说“已移除”；P3-04 无 manifest 来源的 Git 子路径按解析后的相对路径取名（`./`、结尾斜杠），来源写成仓库的 `.git` 目录时取仓库名，名称取自目录名而不合规时说明来处与改法；P3-05 补用例（更新页确认后完成、子目录不同即冲突、清理后设置中仍有声明、记录写不进时移回、移除时删去来源记录、只删文件的一支持锁、路径的另一种写法、同名外部 marketplace、Git 命名），K05、K06、B55、B56、B59 与界面三项（N22、K15、K16）未补；P3-06 DEC-SDX-004 正文指向 DG-NO-AVAILABLE，36c 第 10 节改称，安装失败时保留也说明。可选冒烟在本次提交的代码上用真实 Claude 2.1.288 于断网沙箱重跑通过，新增断言生成的 marketplace 被标为单插件来源；前后核对真实 Claude 配置的修改时间与缓存条目数未变。契约索引 0.19、36c 0.18 |
| 阶段 5 | 进行中：编码前实测已完成 | V11 补测（archive、声明版本的 npm 包、依赖、`.in_use/`、从副本重装）与 V13 真实 launchd 任务（含一次联网更新）于 2026-10-09 在 Owner 许可下完成：下载 2 个约 35 KB 的公开压缩包（`vladikk/modularity` 的两个提交）；npm 部分用本机假 npm 源、在断网沙箱中进行；launchd 任务用临时标签与临时目录，结束后卸载，未写 `~/Library/LaunchAgents`；前后核对真实 Claude 配置未变。结果写入 HLD v1.19（9.3、3.3A；11A 条件 4 已满足）：archive 与声明版本的插件按版本建目录、旧目录保留 14 天；安装内容不被改写；依赖在每次新建版本目录时安装（npm 来源须 `npm-shrinkwrap.json`）；`.in_use/` 为空；“从副本重装由 Claude 重装依赖”的前提被推翻——副本改为保留 `node_modules`，恢复前须先卸载原插件。5a（本次提交）：新模块 `server/claude-updates.mjs` 为多 Agent 快照生成 Claude 一侧的更新项（只属于 Claude 的技能、由 Claude 主导的共用技能——这时 Codex 一侧的同一项让位、技能目录插件、Claude 插件；不代为更新的写明原因）；`targetKey` 对非 Codex 目标带侧别，Codex 目标的键与 0.10.2 相同；计划与批量接受带 `agent` 的目标（Codex 目标写成不带）；`update.check`、`update.apply` 的侧别取自目标，Claude 目标经 Claude 技能文件事务检查与更新（技能目录插件按插件解析来源、提示与恢复按插件措辞），修订号缺省时取当前快照；调度器在 Claude 已启用管理时使用多 Agent 快照，否则保持 0.10.2；Claude 目标在管理未启用、未安装或无法确认时暂停；只属于 Claude 的技能变为两侧共用时，计划目标与绑定按真实目录迁移并留记录；Claude 只读时其更新项不可检查。界面：更新页为两种新路线补文案，`claude-plugin` 不可检查时按“由宿主管理”提示。契约索引 0.20、36c 0.19。测试 `tests/claude-updates.test.mjs`（5 项，含翻译检查）。5b（本次提交）：编码前先用 Claude 2.1.288 在断网沙箱中离线核实（本地目录 marketplace、`file://` Git 仓库；脚本在会话临时目录）：本地目录 marketplace 的相对路径插件复制进缓存；版本为 `unknown` 的插件原地覆盖；manifest 固定版本而内容改变时 Claude 报告已是最新、不更新；Git 来源无版本时为提交号前 12 位——写入 HLD v1.20。新模块 `server/claude-plugin-updates.mjs`（读取 marketplace 条目、判断来源类型、按来源暂存候选内容、预测 Claude 的版本、判定 current/blocked/available、复制安装目录；联网获取都可替换）；`claude-catalog.mjs` 导出原始列表 `claudeLists`；`files.mjs` 的 `inspectTree` 可排除顶层条目；命令行白名单加入带作用域的 `plugin update`；服务中 `claudePluginUpdate` 在 Claude 锁下检查与应用（本地修改基线、应用前各项核对、版本为 `unknown` 时先复制、读回、读回不一致后暂停自动应用直到手动应用一次、project 与 local 范围以安装所在项目为工作目录），更新页的 Claude 插件项可检查（SkillDock 生成的本地 marketplace 中的插件留给 5c）。只复用已有错误码。契约索引 0.21、36c 0.20。测试 `tests/claude-plugin-updates.test.mjs`（9 项：本地目录、版本未变、原地覆盖与副本、本地修改与来源变化、读回不一致与暂停、Git、npm 与压缩包、凭证命令与 command 来源、项目工作目录，含翻译检查）；变异实验中 10 项去保护变异有 9 项使用例失败，“应用前核对安装指纹”与本地修改基线重复，属纵深防御（48 号评审在 44 项变异下有 26 项未被发现，这一说法偏宽；评审处理时已补用例）。5c1（本次提交）：SkillDock 生成的本地 marketplace 中的插件可检查与更新——检查从原始来源重新暂存（不改动数据目录中的副本），应用时核对来源后替换副本与条目版本、刷新 marketplace、经命令行更新并读回，失败时副本与条目还原，成功后登记的来源指纹与提交更新；两侧来源不同的共用技能在多 Agent 快照中不可检查，批量与计划照此跳过。HLD v1.21、契约索引 0.22、36c 0.21。测试：`tests/claude-plugin-sources.test.mjs` 补一项（替身按 Claude 规则把插件复制进缓存并模拟更新），`tests/shared-skills.test.mjs` 补一项。5c2（本次提交）：跨侧技能在计划中的确认（36c 第 6 节）——调度器为每个计划目标记下来源（1 版或 2 版请求）与确认状态；另一侧已启用管理时，2 版保存新增或改变这类目标、或开始自动应用，须带 `confirm`，否则返回 `CONFIRMATION_REQUIRED` 并列出“技能（插件）”；带 `confirm` 时全部待确认的都记为已确认；原样重新提交的目标保持原状态；经 2 版保存而未确认的，后台只检查、不应用并说明原因；2 版手动批量按请求的 `confirm` 处理；1 版保存只替换 Codex 目标，Claude 目标连同确认保留（关闭计划时写的记录同样保留），1 版快照与 1 版保存的返回都看不到它们；多 Agent 快照为这类目标标出 `confirmation`，请求中带回的该字段被忽略。界面：更新页计划区列出待确认的技能并可确认（重新保存计划并带 `confirm`；样式留待重新设计，见 41 UI-12）。开发中修正了两处缺陷：快照与跨侧判断互相调用造成的无限递归（测试挂起的原因），以及关闭计划时写的记录覆盖了保留的 Claude 目标。契约索引 0.23、36c 0.22。测试：`tests/shared-skills.test.mjs` 补两项，`tests/agent-ui.test.mjs` 补一项。5d1（本次提交）：自更新协调器在代号 2 下读启动记录的首选目标，版本高于运行中的安装时发起重启任务（目标可在另一侧，版本相同不切换，退避沿用 0.10.3，目标变化时重来）；后台按启动记录认定家族，在两侧取支持当前数据的最高版本作运行来源，只剩低于 0.11.0 的版本时报错暂停、不注销任务，两侧都找不到时沿用 0.10.2 的判定——Claude 清理被替换的旧版本目录不再被当作卸载；新实例启动时因启动器持锁而跳过的后台补登记，由入口每 10 秒的维护周期补做；SkillDock 自身两侧都是普通的插件更新项。HLD v1.22（3.8 新增一条与“阶段 5d1”修订节；注明发布 0.11.0 时 `package.json` 须升版本）。测试：`tests/self-update.test.mjs` 补三项，`tests/launch-plan.test.mjs` 补三项，`tests/background-updates.test.mjs`、`tests/claude-plugin-updates.test.mjs` 各补一项，`tests/agent-ui.test.mjs` 补一条译文检查。5d2a（本次提交）：新模块 `server/skilldock-update.mjs`（引导安全：刷新 marketplace、按 Agent 更新、读回比较版本，手动步骤另起一行；`agents.mjs` 的手动步骤与 `gate-cli.mjs` 读取 Claude 安装版本的函数移入）；服务实现 `agent.updateSkilldock`（只读一侧同样可用，无法确认或命令行不可用时拒绝并给出手动步骤，已是最新时不运行命令，Claude 侧持 Claude 锁，成功与失败都写操作记录，成功后通知自更新协调器）；环境列表的 `skilldock.canUpdate` 按条件给出；“Agent 环境”页在较旧的一侧显示“一键更新 SkillDock”，确认后执行；顺带修正三处过时文案（Claude 启用说明、只读提示、Claude 插件安装预览中的“更新随后续版本提供”）并删除其旧译文。HLD v1.23、契约索引 0.24、36c 0.23。测试：新文件 `tests/skilldock-update.test.mjs`（4 项），`tests/agent-ui.test.mjs` 补一项，`tests/agents.test.mjs` 断言更新。5d2b（本次提交）：迁移门槛时的一键更新（G-01）——`gate-cli.mjs` 新增 `gateUpdate`（持启动锁与该侧的锁，Codex 经 `plugin marketplace upgrade`、`plugin add`，Claude 经命令行白名单的写命令，读回比较版本）；`planLaunch` 在门槛拦下、且 `SKILLDOCK_UPDATE_AGENT` 指名被拦下的一侧时执行（重启任务不执行），再判定门槛，更新出同一家族更高版本时转交，失败时退出码 4 附原因与步骤；Claude 技能说明的退出码 4 一段改为征得同意后带该环境变量重试；原生入口在退出码 4 时只读重算门槛，以结构化错误返回被拦下的 Agent，新增工具 `skilldock_gate_update`，界面首屏错误下列出“一键更新 X 中的 SkillDock”并内联确认。HLD v1.24、契约索引 0.25、36c 0.24（第 9 节）。测试：`tests/launch-plan.test.mjs` 补三项（含替身 Codex 命令行），`tests/native-backend.test.mjs`、`tests/agent-ui.test.mjs` 各补一项，`tests/compat-matrix.test.mjs` 补 G-01 一键更新的端到端用例（真实启动脚本 + 替身 Claude 命令行）。5c 评审处理（[49](49-cross-agent-phase5c-code-review.md)，CHANGES REQUESTED：P1 1、P2 1、P3 6，全部处理）：P1——计划关闭时保存的跨侧技能经“已关闭”记录进入计划时被当成 0.10.x 继承的目标、从不要求确认，改为记录带请求版本，调度器并入时为没有状态的目标补上来源，这类目标显示待确认、启用自动应用时要求确认（关闭计划不被拦住，写入 36c）；P2——“原样重新提交”只看目标身份（36c 原有定义）；P3——生成 marketplace 的副本改为移动、还原失败时保留备份并说明位置，Git 提交按完整引用名解析（附注标签、同名后缀分支），Claude 未启用管理时批量与计划保持 0.10.2（36c 澄清），`crossHold` 先短路再取跨侧信息、演练模式不做跨侧判断，确认条目改为与语言无关的写法，帮助文字补“下次运行时间从现在重新计算”，删除残留译文，补齐评审列出的用例（计划关闭时新增、开始自动应用要求确认、另一侧未启用时照常应用、1 版来源与 1 版批量照常、重新关联来源后确认不变、生成 marketplace 失败还原与超时不还原、还原失败保留备份、Git 引用）。HLD v1.25、契约索引 0.26、36c 0.25。5a、5b 评审处理（[48](48-cross-agent-phase5ab-code-review.md)，CHANGES REQUESTED：P1 2、P2 5、P3 9）：P1-01——Claude 一侧替换共用目录后释放 Codex 对它的链接固定，计划中已落地的更新不因绑定一时取不到而报失败，补“共用 → 只属于 Claude”的计划目标迁移；P1-02——安装内容与来源一致时基线随之更新、读回暂停解除，读回不一致时以实际装入的内容为基线，`unknown` 版本的提示给出出路；P2——两侧指纹都排除 `node_modules`，附注标签（5c 处理时已修），更新页的 Claude 插件差异，不代为更新的插件与项目目录缺失在列表中即不可检查、计划中暂停，计划绑定安装身份与条目来源；P3——读回不一致改用 `READBACK_CONTENT_CHANGED`，`managed` 只看范围，预览归属先于消耗，路径按真实路径判断边界，npm 包名以 `-` 开头视为无法识别、范围取最高版本，压缩包手动跟随重定向（只接受 https、拒绝本机）并边读边计数，`unknown` 插件在检查结果中先说明，计划暂停与快照用同一判断（补测时发现命令行不可用时不暂停），补齐评审列出的用例，翻译断言改为一次列出全部缺失；1 版“检查全部”覆盖 Claude 对象记为契约例外。HLD v1.26、契约索引 0.27、36c 0.26 |

## 估算

合计约 11～14 次会话，不含 UAT 等待时间。阶段 1 与阶段 4、5 的工作量最大。
