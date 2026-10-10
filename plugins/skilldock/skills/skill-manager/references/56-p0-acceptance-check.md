# 0.11.0 发布前 P0 验收核对（PRD 第 11 节）

> 日期：2026-10-10（阶段 6c）
> 分支：`feature/skilldock-0.11-cross-agent`
> 范围：PRD-SKILLDOCK-002 第 11 节中 P0 需求的验收标准与回归保护。AC-010（同源跟踪）、AC-011（完整兼容性推断）属 0.11.0 之后的 M4（P1），AC-014 属 M5（P2），不在本表。
> 证据类型：**自动** = 本仓库测试（文件名省略 `.test.mjs`，`spec` 为浏览器端到端）；**实测** = 有记录的真实宿主实测（HLD 9.3）；**UAT** = 2026-10-10 另一台电脑试用（[53](53-uat-other-computer-codex.md)、[54](54-uat-other-computer-claude.md)）。
> 结论：**满足** / **部分**（附原因与去处）/ **待 Owner**（阶段 6e 的 V17 或最终 UAT）。本表由作者整理，阶段 6d 的独立评审逐条核对。

## AC-001 环境发现

| 验收项 | 证据 | 结论 |
|------|------|------|
| 只装 Codex、只装 Claude、两者都装时环境页正确 | 自动：`agents`（首次出现、未安装不显示、只读与启用）、`agent-ui`；UAT：Codex 与 Claude 计数与命令行读回一致 | 满足 |
| 自定义 `CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`CLAUDE_CODE_PLUGIN_CACHE_DIR` | 自动：`agents` “Claude root…”、`claude-root`、`custom-paths`；矩阵 S-14/S-15（自定义 Claude 目录） | 满足 |
| 未启用管理时写操作不可用并说明；启用后读回成功才显示已启用 | 自动：`agents`（只读拒绝、无法确认、启用需主证据）、`claude-actions`（只读、未安装、无命令行时拒绝） | 满足，一处例外经 Owner 认可：只读一侧也提供 SkillDock 自身的一键更新（逐次确认、只改 SkillDock 本身；HLD 第 10 节 DG-R24-1，2026-10-10），停用管理的确认框已注明 |
| 从 Claude 安装者首次 Claude 已启用；从 Codex 安装者 Codex 启用、Claude 只读 | 自动：`agents` “first appearance…” | 满足 |

## AC-002 Claude 清单

| 验收项 | 证据 | 结论 |
|------|------|------|
| 个人、项目技能、已安装插件与 marketplace 齐全，与 Claude 自身列表一致 | 自动：`claude-catalog`；实测：`claude-writes-smoke`（真实 Claude 2.1.288）；UAT：插件 5、marketplace 3 与命令行读回一致 | 满足 |
| 插件显示 marketplace、版本、范围、启用状态与覆盖来源 | 自动：`claude-catalog` “plugins: enablement source, overrides…”、`agent-ui` “Claude facts…” | 满足 |
| marketplace 显示自动更新实际值与上次刷新时间；桌面应用整体关闭自动更新时说明 | 自动：`claude-catalog` “marketplaces: auto-update…”；代码：`agents.mjs`、`claude-catalog.mjs` 的桌面应用说明 | 满足 |
| 托管与同步插件无写操作入口 | 自动：`claude-catalog`（managed、synced 保护）、`claude-actions` “capabilities…” | 满足 |

## AC-003 统一视图

| 验收项 | 证据 | 结论 |
|------|------|------|
| 每个对象显示 Agent 标识，筛选正确 | 自动：`agent-ui`、`multi-agent` | 部分：标识只显示图标，名称在悬停与读屏中（[41](41-ui-redesign-backlog.md) UI-05）；部分页面的计数口径不一（UI-02）。Owner 2026-10-10 同意随 0.11.0 发布，重设计时处理 |
| 两侧共用的技能只出现一次，更新或移除前提示同时影响两侧 | 自动：`shared-skills`、`multi-agent` | 满足 |
| 只有一个环境时不出现 Agent 切换 | 自动：`agent-ui` “the Agent dimension appears only with more than one environment present” | 满足 |

## AC-004 Claude 插件更新

| 验收项 | 证据 | 结论 |
|------|------|------|
| 第三方 marketplace 自动更新关闭时仍能检出新版本 | 自动：`claude-plugin-updates`（检查前刷新远端 marketplace，按条目来源暂存） | 满足 |
| 应用前可看逐文件差异；取消无写入 | 自动：`claude-plugin-updates` “the updates page shows a Claude plugin preview file by file…” | 满足 |
| 更新后读回版本，不符即失败 | 自动：`claude-plugin-updates`（读回不一致报告 `READBACK_CONTENT_CHANGED`） | 满足 |
| 区分“磁盘已更新”与“会话需重载” | 自动：结果提示“新会话生效，已打开的会话需要重载插件” | 满足 |
| 不代为更新的类型显示原因与手动途径，不可加入计划 | 自动：`claude-plugin-updates` “a source SkillDock never runs… not offered for checking; the plan pauses it” | 满足 |

## AC-005 Claude 独立技能

| 验收项 | 证据 | 结论 |
|------|------|------|
| 安装前预览，目标已存在拒绝覆盖 | 自动：`claude-skill-files` “installing into Claude…”、`claude-skill-guards` | 满足 |
| 来源可核对一致才自动关联，否则由用户确认 | 自动：`claude-skill-files` “linking a source…”、`shared-skills`（来源冲突） | 满足 |
| 更新前有差异；本地修改阻止覆盖 | 自动：`claude-skill-files`、`claude-updates` | 满足 |
| 移除可恢复；链接只移除链接 | 自动：`claude-skill-files`、`claude-skill-guards`、`shared-skills`（布局 A～D） | 满足 |

## AC-006 跨 Agent 后台更新

| 验收项 | 证据 | 结论 |
|------|------|------|
| 计划目标显示所属 Agent，两侧结果分别记录 | 自动：`claude-updates` “plans and batches take Claude targets…” | 满足 |
| 关闭 SkillDock、Codex、Claude 后到期仍运行；错过的周期只补做一次 | 自动：`background-updates`；实测：V13 真实 launchd 任务（2026-10-09） | 满足 |
| Agent 不可用时其目标暂停并说明，另一侧不受影响 | 自动：`agents`、`claude-updates`（暂停不算失败） | 满足 |
| 本机只有一个 SkillDock 后台计划任务 | 自动：`background-updates`（按数据目录注册一次）、`launcher`（两侧共用一个实例） | 满足 |

## AC-007 单实例与版本收敛

| 验收项 | 证据 | 结论 |
|------|------|------|
| 先后从两侧打开只有一个服务进程、一份数据 | 自动：`launcher` “either side uses the instance the other side started…” | 满足 |
| 两侧版本不同时运行较新版本，界面显示运行版本与各入口版本 | 自动：`launcher`、`self-update`（代号 2）；Agent 环境页显示各侧 SkillDock 版本 | 满足 |
| 旧版不写新格式数据，必要时只读并提示 | 自动：矩阵 A.1～A.4（[55](55-compat-matrix-coverage.md)） | 满足 |
| 一侧更新 SkillDock 后切换到新版本并保留计划、历史、项目、语言与主题 | 自动：`self-update`（代号 2）、`runtime-restart.spec`；V17 在真实 Codex 中的表现待测 | 待 Owner（V17） |
| 0.10.3 先于 0.11.0 发布；0.10.3 遇到较新数据不接管并提示 | 0.10.3 已于 2026-10-08 发布（TestAny-io/testany-agent-skills#54）；矩阵 A.2、A.3 | 满足 |
| 0.11.0 遇到低于 0.10.3 的安装时不写新数据，先引导一键更新 | 自动：矩阵 G-01～G-03、V18；`launch-plan` 一键更新各项 | 满足 |
| 同一 Agent 内回退到较旧版本时，旧版本不接管数据目录 | 自动：矩阵 R-01～R-04 | 满足（0.10.2 无友好提示，已登记残留 Q8、Q9） |

## AC-008 Claude 入口

| 验收项 | 证据 | 结论 |
|------|------|------|
| Code 标签页请求打开后，界面在内置浏览器面板显示；不可用时给出链接 | UAT：CC-02 | 满足 |
| 可查看状态与停止服务；停止不关闭后台计划 | 自动：`launcher`；`SKILL.md` 说明；UAT：CC-01、CC-05 | 满足 |
| 从 Claude 安装 SkillDock 后，插件错误列表与 `claude plugin list` 中没有 SkillDock 的错误 | 实测：`claude-distribution-smoke`（真实 Claude，临时目录，2026-10-08） | 待 Owner（最终 UAT 中从真实 Claude 安装 0.11.0 后核对） |

## AC-009 运行环境

| 验收项 | 证据 | 结论 |
|------|------|------|
| 已有满足要求的 Node 时首次打开自动选用并保存，设置中可见，之后复用 | 自动：`toolchain`、`node-candidates`、`launcher`（保存所选 Node） | 满足 |
| 保存的 Node 失效后重新扫描 | 自动：`toolchain`（保存值失效时重新检测） | 满足 |
| 没有可用 Node 时弹出对话框，不下载；安装后重新检测可继续 | 自动：`toolchain` “without a usable Node nothing is downloaded…”、“the shell entry without any usable Node exits 1 with guidance…”；实测：V12 | 满足 |
| 两侧都装时共用同一选择与运行目录 | 自动：`launcher` “either side…” | 满足 |
| 0.10.x 用过的 Codex 自带 Node 或已下载的私有 Node 仍被识别 | 自动：`toolchain` “candidates follow the fixed order…”（已下载的 Node 排在 Codex 工作区之后，阶段 6 评审 PH6-P3-03 后补） | 满足 |
| 首次构建需要联网时事先说明；断网失败不影响已运行的服务与数据 | `SKILL.md`、README 写明首次启动需要联网；`launcher`（新版构建失败保留旧服务） | 部分：启动时没有单独打印“需要联网”的提示，说明在文档中。Owner 2026-10-10 同意随 0.11.0 发布，记入 41 UI-15 |

## AC-012 写入边界

| 验收项 | 证据 | 结论 |
|------|------|------|
| 默认只影响当前用户；写共享 `.claude/settings.json` 需逐次勾选并提示影响协作者 | 自动：`claude-actions` “shared project settings need confirmation…”、“local settings…” | 满足 |
| 托管设置与同步插件只读 | 自动：`claude-catalog`、`claude-actions`、`claude-skill-visibility`（托管锁定） | 满足 |
| 页面与记录无凭证；外部网页无法触发有效写操作 | 自动：`backend-security`（Host、Origin、令牌）、`claude-catalog`（地址不带凭证）、`claude-plugin-updates`（来源显示不带凭证） | 满足 |

## AC-013 文案

| 验收项 | 证据 | 结论 |
|------|------|------|
| 只启用 Claude 时界面无“需要 Codex”的提示；只启用 Codex 时表述不变 | 阶段 6c 修正：插件页的“Codex CLI 暂不可用”只在本机装有 Codex 时显示（`agent-ui` “the "Codex CLI unavailable" notice…”）；没有 Codex 目录时项目选择器不提示 Codex 项目（`projects`）；插件安装窗口带上已启用管理的 Agent 后，marketplace 说明在只装 Claude 时不提“Codex 官方目录”（`agent-ui` “the plugin install dialog…”，第 26 轮 RR6-P3-01 后生效）；计划说明改为“无需打开 SkillDock、Codex 或 Claude” | 满足（最终 UAT 中在只装 Claude 的环境复核） |
| 新增文案中英日完整，无混排 | 自动：各测试文件的“every message seen above has a whole English and Japanese translation”、`i18n`；UAT：英文、日文抽查无残留中文 | 满足 |
| README 首屏定位、徽标与安装说明覆盖 Codex 与 Claude | 文档：阶段 6b（根 README 中英、插件 README 中英） | 满足 |

## AC-015 Claude 插件启禁

| 验收项 | 证据 | 结论 |
|------|------|------|
| 启禁后读回实际生效状态，被覆盖时显示覆盖来源 | 自动：`claude-actions` “enabling and disabling: … read back…”、`claude-catalog`（覆盖来源） | 满足 |
| 托管强制启用与组织要求的同步插件不可停用 | 自动：`claude-actions` “capabilities: managed installations…”、`claude-catalog` | 满足 |

## AC-016 Claude 侧能力对等

| 验收项 | 证据 | 结论 |
|------|------|------|
| 5.6 中“提供”的能力在只启用 Claude 的环境中可完成并读回 | 自动：阶段 4、5 各 Claude 测试（安装、启停、可见性、移除恢复、关联来源、更新、计划）；实测：`claude-writes-smoke` | 满足（服务端）。界面上“从本地目录或 Git 把插件装到 Claude”到 `122ef9f` 才第一次接通（此前一律装到 Codex），没有界面层用例，在最终 UAT 中实测（[61](61-final-uat-claude-desktop.md) 第 7A 节） |
| “按原生语义调整”的项在确认框或详情中显示原生规则 | 自动：`claude-actions`、`shared-skills`（`nativeRules`） | 部分：更新页检查结果中的原生规则只在应用需要确认时列出（UI-11）。Owner 2026-10-10 同意随 0.11.0 发布 |
| “不提供 / 不适用”的项在 Claude 对象上没有可点击入口并显示原因 | 自动：`claude-catalog`（能力按原生规则计算） | 满足：原有的反方向问题（Claude 对象上“管理更新”不可用，UI-14）已按 Owner 2026-10-10 的要求修复，见 `agent-ui` “"Manage updates" from any Agent's object…”（定位）与 “"Manage updates" stays available for Claude-only objects…”（菜单入口、停用确认框的例外） |
| 写操作前重新读取；发现在 Claude 中做过的改动时停止并提示 | 自动：`claude-actions`（锁内重读、`expectedRevision`、`SNAPSHOT_STALE`） | 满足 |
| 插件已被 Claude 自身更新到最新时，计划记为无需更新 | 自动：`claude-plugin-updates` “a plan keeps a versioned Claude plugin that Claude updated itself…” | 满足 |

## AC-017 从 Claude 安装

| 验收项 | 证据 | 结论 |
|------|------|------|
| 在 Claude 桌面应用中添加本仓库 marketplace 后，可从插件浏览器安装 SkillDock，其技能出现在 Claude 中 | 实测：`claude-distribution-smoke`（命令行、临时目录）；桌面应用的插件浏览器未实测 | 待 Owner（最终 UAT） |
| 安装 SkillDock 不会安装或启用仓库中的其他插件 | 实测：`claude-distribution-smoke` “只装上 SkillDock” | 满足 |
| 中英文 README 有 Claude 的安装、打开与更新说明，全程不要求终端 | 文档：`/plugin marketplace add` 与 `/plugin install` 在对话中输入；更新用 `/plugin` → Marketplaces → Update marketplace（先刷新目录）或 SkillDock 的更新页；终端命令列为可选 | 待 Owner：随第 1 项在最终 UAT 中实测桌面应用里的添加 marketplace、插件浏览器安装、刷新后更新，按实际界面路径修订 README（阶段 6 评审 PH6-P2-01） |
| 仅支持 Codex 的插件在 Claude 中有明确标注 | 仓库 Claude marketplace 中 TeamDesk 注明“仅支持 Codex”；实测：`claude-distribution-smoke` | 满足 |

## 回归保护

| 项 | 证据 | 结论 |
|------|------|------|
| MR-SDX-001 未启用 Claude 时，现有 Node 与浏览器回归全部通过，原生入口与后台更新行为不变 | 自动：全量 `npm test`；浏览器端到端 `npm run test:e2e`（见“运行结果”）；矩阵 V18-a | 满足 |
| MR-SDX-002 从 0.10.2 升级后计划、绑定、历史、来源、项目、偏好保留；未启用的计划不被开启 | 自动：`migration`、矩阵 G-08；`background-updates` “an already enabled plan migrates…” | 满足 |
| MR-SDX-003 手动与后台更新都不覆盖本地修改 | 自动：`claude-plugin-updates`、`claude-skill-files`、`background-updates`、`shared-skills` | 满足，带已知残余：SkillDock 首次检查之前对 Claude 插件做的本地修改识别不出（内容可从 Claude 保留 14 天的旧版本目录或更新前副本找回）；Owner 2026-10-10 登记为已知限制（HLD 第 10 节 DG-R24-2、PRD Q11） |

## 运行结果

- 全量 `npm test`（沙箱）：603/603 通过（含兼容矩阵 103 项）。
- 浏览器端到端 `npx playwright test`（沙箱，本机 Chrome、临时配置，端口 4821）：86/86 通过。首次运行时“large plugin catalogs…”一项失败，原因是用例拦截的地址仍是 `/api/state?mode=sandbox`，而界面从阶段 3 起请求 `…&multiAgent=1`；已修正用例的拦截地址。
- 兼容矩阵：103/103（[55](55-compat-matrix-coverage.md)）。

## 汇总

- **待 Owner**（阶段 6e）：AC-007 第 4 项（V17，按 [60](60-v17-real-codex-update.md)）、AC-008 第 3 项与 AC-017 第 1、3 项（从真实 Claude 桌面应用添加 marketplace、安装与更新 0.11.0，按 [61](61-final-uat-claude-desktop.md)）、AC-013 第 1 项的复核。
- **Owner 认可的例外与残余**：AC-001 第 3 项（只读一侧的 SkillDock 一键更新，DG-R24-1）、MR-SDX-003（首次检查前的本地修改，DG-R24-2）。
- **部分**（Owner 2026-10-10 同意随 0.11.0 发布，记入 [41](41-ui-redesign-backlog.md)）：AC-003 第 1 项（UI-05、UI-02）、AC-016 第 2 项（UI-11）、AC-009 第 6 项（UI-15）。AC-016 第 3 项（UI-14）已在发布前修复。

## 已知测试缺口（阶段 5 评审遗留，2026-10-10 登记）

以下是阶段 4、5 评审的变异实验中存活的项，对应的功能都已实现、经代码评审核对，只是没有能发现回归的用例。登记为已知测试缺口，不影响 0.11.0 的功能；后续版本补用例时按编号划掉。

| 编号 | 来源 | 未被钉住的行为 |
|------|------|------|
| N34 | [52](52-cross-agent-phase5-review-r2.md) | 重算门槛时跳过转交（原生入口经转交的真实路径） |
| A-M20 | [48](48-cross-agent-phase5ab-code-review.md)、52 | 在 Claude 清单中按项目路径匹配安装 |
| A-M27 | 48、52 | 核对压缩包声明的 sha256 |
| A-M37 | 48、52 | 技能目录插件核对修订号 |
| A-M38 | 48、52 | 技能目录插件排除 Git 工作树 |
| A-M39 | 48、52 | 技能目录插件只限两个技能根 |
| A-M42 | 48、52 | 技能目录插件的计划绑定含内容指纹 |
| B-M10 | [49](49-cross-agent-phase5c-code-review.md)、52 | 暂停豁免只给 2 版请求 |
| B-M23 | 49、52 | 1 版保存保留的目标豁免检查 |
| K05、K06 | [47](47-cross-agent-phase4cd-review-r2.md) | 两侧同步、快照冲突按规范化后的内容比较（不只按原文） |
| B55 | 47 | 批量取锁时不创建 Claude 根目录 |
| B56 | 47 | 批量移除 Claude 链接时保留来源记录 |
| B59 | 47 | Claude 副本的来源键用真实路径 |
| N22、K15、K16 | 47 | 界面三项：显示专用 manifest、更新对话框与技能卡片检查带说明（与 41 的 UI-10、UI-11 同属界面重设计） |
| B37 | 47（45 M37） | 共用技能的 Claude 一侧不在技能根中时不可移除 |
| B39 | 47（45 M39） | Claude 一侧更新时同步 Codex 一侧的来源记录 |
| N2、N3、N5、N7 | [59](59-cross-agent-6d-rereview-r2.md) | 界面接线：插件安装窗口的 Agent 按“已安装且已启用”过滤、窗口用传入的 Agent 选说明文字、从本地目录或 Git 安装插件时提供 Agent 选择、插件详情对 Claude 插件显示“管理更新”（现有用例只测辅助函数与源码片段） |
| N13（M11） | 59、[58](58-cross-agent-6d-rereview.md) | 计划的 `schedule.reconcile` 记录带目标的 Agent |
| M18、M19 | 58 | `marketplace-entry` 的可信度为 `inferred`；生成 marketplace 中插件的来源信息字段（只影响显示） |

