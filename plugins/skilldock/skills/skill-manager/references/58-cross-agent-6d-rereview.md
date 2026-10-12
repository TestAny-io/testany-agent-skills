# 阶段 6d 增量复核报告：HLD 第 26 轮 / 契约第 16 轮 / 阶段 6d 代码复核（`316eae8..258fd24`）

> 本报告是独立评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。HLD、PRD、契约的批准与 Owner 决定都由产品 Owner 作出。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 被评审提交 | `258fd24`（tree `e4a093bee567…`），分支 `feature/skilldock-0.11-cross-agent`；基线 `316eae8` |
| 范围 | `git diff 316eae8 258fd24`：36 个文件，增 892 行、删 190 行（diff sha256 前缀 `f571bffa033c`）。提交：`65061fa`（Owner 要求的 UI-14 修复与 Owner 决定）、`a255f8d`（两份评审报告入库，只读引用）、`258fd24`（处理两份报告）。只核对这些改动及其直接影响；根目录 README 与 CHANGELOG 的改动属直接影响，一并核对 |
| 处理对象 | [35-cross-agent-hld-review-r24.md](35-cross-agent-hld-review-r24.md)（HLD 第 25 轮 + 契约第 15 轮）：HLDR24-P2-01～04、P3-01～08；[57-cross-agent-phase6-review.md](57-cross-agent-phase6-review.md)（阶段 6 代码评审）：PH6-P2-01～02、P3-01～08；`65061fa` 的 UI-14 修复 |
| Owner 决定（委托转述，2026-10-10） | HLDR24-P2-01 接受现状（只读一侧也提供 SkillDock 自身的一键更新）；HLDR24-P2-02 登记为已知残余（PRD 0.10 Q11、HLD DG-R24-2） |
| 基线文档 sha256（`git show 316eae8:`） | HLD v1.29 `5b5de515968dedb969d197a5f0d147fa36d4cd09126c67fac28b64abb454fe13`；索引 0.30 `16d8ea778cd9babd71ca251a856ae15af38adb32679142668563ac151e8893a3`；36c 0.29 `18642a1214ce6a4e5e9bf8c4933af1700f7d864a8821fdb6e911f79bf83ad913`；PRD 0.9 `e061ec2584217dbdead4e7ad4487a43f7dc61a68ac992485d30665b61b243631`（均与 r24 证书一致） |
| 本轮文档改动量 | HLD 14 处（增 33 删 13）；索引 3 处（增 4 删 3）；36c 5 处（增 6 删 6，第一处正文改动在第 108 行，即第 6 节）；PRD 2 处（增 4 删 2）；36a、36b 0 行 |
| 轮次说明 | 按 HLD 第 12 节 v1.30 表的记法（第 24 轮 = 38-r3 第 6 节，第 25 轮 = r24 报告），本轮建议记为 **HLD 第 26 轮、契约第 16 轮**，并兼作阶段 6d 代码复核 |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被评审的文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-10 |
| 工作方式 | `git archive 258fd24` 导出到 scratchpad 的 `rereview-6d/export/`（`node_modules` 软链接到原工作树；为兼容矩阵在导出目录 `git init` 并以 `objects/info/alternates` 只读引用原仓库对象）；变异实验在另一份完整拷贝 `rereview-6d/mut/` 中进行，每次只改一处、跑完即还原，结束时与导出目录逐文件相同。全部测试经 `sandbox-exec -f …/verify/phase2-review/hermetic.sb`、`env -i`、`HOME`/`TMPDIR` 指向 scratchpad、Node v22.14.0、加载连接守卫（拒绝并记录对 4771 与非回环地址的连接）运行 |

## 2. 结论

**APPROVED（带 P3）**

- P0：0
- P1：0
- P2：0
- P3：5（RR6-P3-01～05）

要点：

- **两份报告的 22 条意见**：20 条已关闭，2 条部分关闭（PH6-P3-02 中安装窗口一处文字的改动没有生效；PH6-P2-01 的桌面应用实测按原建议放在 6e，文档与 `56` 已按建议改）。两项 Owner 决定（DG-R24-1、DG-R24-2）已写入 HLD 第 10 节、PRD 0.10 Q11、`56`、CHANGELOG 与界面文字。
- **代码改动正确**。`entryPlace` 把本地目录与 Git 托管 marketplace 自身的来源（去掉 ref、地址去凭证）并入绑定，npm 包地址与压缩包都只取 origin；1 版快照在合并计划记录之后再按 Agent 过滤，运行记录中的 Claude 项也不给 1 版；调度器的迁移、核实记录带目标的 Agent；`directSourceInfo` 与 `contracts.ts` 同步，`tsc --noEmit` 通过。我在拷贝中补写的两个探针用例证实服务端接线与 1 版过滤都按 36c 0.30 工作。UI-14 修复（`focusMatches` 与两侧对象的“管理更新”）正确，原生产物在拷贝中重建后与提交逐字节相同。
- **新增与修改的用例大多有效**：针对新用例的 16 项变异中 14 项被发现（`entryPlace` 六种、Codex 一侧 `agent.*`、`save: false`、已下载的 Node、Codex 命令行提示、`focusMatches` 两种、V18-a 的提示、R-03/N-14/N-12 的断言）。但服务端接线与 1 版过滤、调度器记录带 Agent、菜单入口的启用条件、停用确认框的例外文字没有用例钉住（RR6-P3-02）。
- **文档与冻结行为**：HLD v1.30、索引 0.31、36c 0.30、PRD 0.10 与实现一致；36a、36b 未改（sha256 与第 15 轮证书相同），36c 第 4、5 节与 HLD 11A 条件 1a 段落未改；代码改动只涉及 0.11 自身与 1 版客户端经代理看到的显示内容，**不改变 0.10.3、0.10.2 的可观察行为**。兼容矩阵中本轮改动的 10 个用例在本机沙箱内全部通过。
- 五项 P3：安装窗口的文字改动因未传入 `agents` 而无效（P3-01）；新代码的用例缺口（P3-02）；1 版快照的运行进度仍计入 Claude 项（P3-03）；文档版本引用与几处措辞（P3-04）；本提交再次“契约与代码同提交、后复核”（P3-05）。都不阻断证书重新绑定。

## 3. 逐条关闭情况

行号均指 `258fd24` 导出副本；`assets/app/` 下的文件省略该前缀，`references/` 下的文件只写文件名。

### 3.1 HLD 第 25 轮 / 契约第 15 轮（r24 报告）

| 编号 | 状态 | 依据 |
|------|------|------|
| HLDR24-P2-01 只读一侧的一键更新 | **已关闭**（Owner 决定：接受） | HLD 第 10 节 DG-R24-1（`35`:1208）写明理由与例外；停用确认框改为“不再修改它们（经你确认的 SkillDock 自身一键更新除外）”（`src/AgentEnvironments.tsx:36`，`messages.json` 英日同步）；36c 第 6 节 `canUpdate` 注释引用 DG-R24-1（`36c`:108）；`56`:15 AC-001 第 3 项改为“满足，一处例外经 Owner 认可”；CHANGELOG“已知限制”第 2 条（`CHANGELOG.md:216` 起）。确认框文字没有用例（变异 M21 存活，见 RR6-P3-02） |
| HLDR24-P2-02 首次检查前的本地修改 | **已关闭**（Owner 决定：登记为已知残余） | HLD 3.3 改为实际行为并引用 DG-R24-2（`35`:619）；第 10 节 DG-R24-2（`35`:1209）；PRD 0.10 修订记录（`34`:690）与 Q11（`34`:1387）；`56`:142 MR-SDX-003 注明残余；CHANGELOG“已知限制”第 1 条。与实现一致（首次检查记录基线，此前的修改不可比）。措辞小处见 RR6-P3-04 第 4 条 |
| HLDR24-P2-03 修订表与正文不一致 | **已关闭** | a：3.3 基线（`35`:619）；b：3.3A Git 一行读回改为“不另核对列表中的版本前缀”（`35`:627）；c：原地覆盖的范围含本地目录 marketplace 中无版本插件（`35`:636）；d：技能目录插件原地加载、本地 marketplace 插件按版本复制进缓存且是否补装依赖未实测（`35`:637、642）；e：3.7 一键更新的串行改为 Codex 锁与启动锁两层（`35`:707，与 `server/gate-cli.mjs` 取 `launcher.lock`、Codex 或 Claude 操作锁一致）；元信息写明“修订表是对应版本的事实源，与正文不一致时以修订表为准”（`35`:424）。v1.30 表“位置”一栏有三处指向正文未改的小节，见 RR6-P3-04 第 2 条 |
| HLDR24-P2-04 条件 1b 的时序 | **已关闭**（记录已补） | `37`:211“6d 结果”写明契约 0.15～0.30 属事后复核，“0.11.0 合并前若再改契约，先复核再编码”。本提交自身仍是契约 0.31 与代码同提交，见 RR6-P3-05 |
| HLDR24-P3-01 HLD 元信息与证书记录 | **已关闭** | 版本 1.30（`35`:421）；状态行“截至 v1.29 共 25 轮”、v1.16 经第 24 轮核对（`35`:424）；第 10 节 HLD 批准行（`35`:1201）；11A 标题“第 7～25 轮延续”（`35`:1213）；条件 5 写到 v1.29 并注明 v1.30 待增量复审（`35`:1222）；`37`:3 上游改为 PRD 0.10、HLD 1.30、API 0.31。第 24 轮（38-r3 第 6 节）没有新 P2，未补处理表不影响 |
| HLDR24-P3-02 契约元信息 | **已关闭** | 索引状态行列出第 13、14、15 轮并注明 0.31 待增量复核（`36`:10）；索引第 4 节 36c 版本 0.30（`36`:50）；索引变更记录 0.31（`36`:159）；36c 状态行列出第 12、14、15 轮与 v0.30（`36c`:12）。36a 状态行属冻结文件，按 1a 不改是正确的。索引“PRD 引用”仍为 0.9，见 RR6-P3-04 第 1 条 |
| HLDR24-P3-03 `contracts.ts` 未同步 | **已关闭** | `shared/contracts.ts:61` `SourceInfo.kind` 加入 `marketplace-entry`；`entrySourceInfo` 带 `label`（`server/claude-plugin-updates.mjs:85`）；SkillDock 生成的 marketplace 中插件改用 `directSourceInfo`，补齐 `kind`、`confidence`、`owner`、`evidence`（`server/direct-plugins.mjs:100`，列表 `:110`、检查结果 `server/service.mjs:814`）；两条新标签有英日译文（`server-messages.json`）；导出副本中 `npm run typecheck` 通过 |
| HLDR24-P3-04 1 版快照的调度器附加记录 | **已关闭**（有残余） | `server/service.mjs:269-275`：先合并 `extraActivity`，再对 1 版按 `codexOnly` 过滤；1 版 `updateRuns` 去掉 `target.agent` 非 Codex 的项（`:273`）；`schedule.reconcile`、`schedule.migrate` 带目标的 Agent（`server/scheduler.mjs:200`、`:276`）；36c 第 10 节同步（`36c`:343）。探针 PROBE-6D-1 证实实现正确；仓库没有用例（RR6-P3-02）；运行级 `total`/`status` 与 `updateProgress` 仍计入 Claude 项（RR6-P3-03） |
| HLDR24-P3-05 用例缺口 | **已关闭** | ① Codex 一侧 `agent.setManagement` 的用例（`tests/agents.test.mjs:102-104`），变异 M12 被发现；② Git 带 ref、压缩包、npm 地址都有用例（`tests/claude-plugin-updates.test.mjs:505`），M04、M05、M06 被发现；③ `marketplace-entry` 排除仍由 N21 间接钉住（M24 被发现），可接受 |
| HLDR24-P3-06 绑定位置的两处边界 | **已关闭**（实现）；接线无用例 | `entryPlace`（`server/claude-plugin-updates.mjs:68-77`）：`local`、`git-market` 带 `market: marketPlace(known.source)`（`:57-61`，取 `source`、`repo`、`url`（去凭证）、`path`、`package`，不含 ref）；npm 用 `https:` 地址时取 origin（`:73`）。`claudeEntrySource` 把 `known_marketplaces.json` 中的 `source` 带入（`server/service.mjs:472`）。单元用例覆盖“换仓库是另一来源、ref 不进绑定、去凭证”（M01～M03 被发现）；服务端接线没有用例（M07 存活，探针 PROBE-6D-2 补证，见 RR6-P3-02）。0.11 试用中已保存的这类目标首次运行会要求重新选择一次，HLD v1.30 表已写明 |
| HLDR24-P3-07 措辞 | **已关闭** | 36c 7.2 改为“尽力写一条操作记录……写入失败不影响已生效的开关”（`36c`:238）；36c 第 6 节写明去掉“账号、密码、查询串与片段”（`36c`:202） |
| HLDR24-P3-08 轮次编号冲突 | **已关闭** | 状态行与条件 5 写明“第 24 轮 = 38-r3 第 6 节、第 25 轮 = r24 报告”（`35`:424、1222；v1.30 表） |

### 3.2 阶段 6 代码评审（57）

| 编号 | 状态 | 依据 |
|------|------|------|
| PH6-P2-01 README 的 Claude 安装与更新路径 | **部分**（文档与 `56` 已按建议改；桌面应用实测按原建议在 6e） | 各 README 改为“添加本仓库 marketplace 之后”才可从插件浏览器安装（`README.md:163`、`README.en.md` 同段、`plugins/skilldock/README*.md:59`）；更新改为 `/plugin` → Marketplaces → `testany-agent-skills` → Update marketplace（先刷新目录），或 SkillDock 更新页（`README.md:167`、`README.en.md:97`、应用 README 同段）；`56`:133 AC-017 第 3 项改为“待 Owner：随第 1 项在最终 UAT 中实测……按实际界面路径修订 README”，汇总（`56`:152）同步。注意：README 现写“Update marketplace 会先刷新目录、再更新从它安装的插件”，这一宿主行为同样未经实测，须在 6e 一并核实 |
| PH6-P2-02 R-03、N-14（实例未运行）断言不足 | **已关闭** | `tests/compat-matrix.test.mjs:203-207` `failedOnPlan`：无 `launcher.json`、`server.log` 含 `INVALID_UPDATE_STATE`、端口无服务；用于 N-12（`:390`）、N-14 实例未运行（`:422`）、R-03（`:804`，另断言 stderr“未能启动”）。本轮沙箱内这些用例两版都通过；变异 M23（关键字改为不存在的值）使 5 个用例失败，断言确实生效。`55` R-03 一行已属实 |
| PH6-P3-01 `agent.*` 过滤与 `save: false` 未钉住 | **已关闭** | Codex 一侧两次切换后 1 版不可见（`tests/agents.test.mjs:102-104`，M12 被发现）；经 PATH 找到的替身命令行被打印且不写 `settings/claude-cli.json`（`tests/launcher.test.mjs:454-459`，M13 `save: true` 被发现） |
| PH6-P3-02 AC-013 界面条件与 Codex 专属文字 | **部分** | 提示条件提为 `showsCodexCliNotice`（`src/agent-requests.ts:42`，`src/App.tsx:1118`）并有用例（`tests/agent-ui.test.mjs:299`，M15 被发现）；计划说明改为“无需打开 SkillDock、Codex 或 Claude”（`src/UpdatesWorkspace.tsx` 三种语言）。**安装窗口的说明没有生效**：`src/InstallDialog.tsx:114` 按 `agents` 选文字，但 `src/App.tsx:1427` 打开插件安装窗口时不传 `agents`（缺省 `[]`），只装 Claude 时仍显示“从 Codex 官方目录……”（渲染探针证实），`56`:106 的结论因此偏宽，见 RR6-P3-01 |
| PH6-P3-03 已下载的专用 Node 无用例 | **已关闭** | `tests/toolchain.test.mjs:107-111` 放置 `<state>/node/node-v24.21.0-darwin-arm64/bin/node`，断言以 `skilldock-private` 排在 Codex 工作区之后；M14（改候选模式）使列表断言失败；`56` AC-009 第 5 项证据改指该用例 |
| PH6-P3-04 条目来源标为“已核实” | **已关闭** | `confidence: 'inferred'`（`server/claude-plugin-updates.mjs:85`），36c 第 6 节同步；无用例（M18 存活，只影响显示，见 RR6-P3-02） |
| PH6-P3-05 V18 的归类与 V18-a 的前提 | **已关闭** | HLD 3.13A（`35`:823）与 DEC-SDX-027 rationale（`35`:233）把 V18 移出“真实宿主行为”并注明以临时目录中的真实 0.11.0 启动器完成；V18-a 断言“Claude 命令行不可用，改用安装记录”（`tests/compat-matrix.test.mjs:850`），M22（改 `server/gate-cli.mjs:70` 的提示）被发现；`55` 第 3 节同步 |
| PH6-P3-06 6c 的“登记测试缺口” | **已关闭** | `37`:206 引用改为“阶段 5 进度行中‘仍未补’所列”；`56`:156 起“已知测试缺口”逐项登记了 57 列出的 N34、A-M20、A-M27、A-M37～M39、A-M42、B-M10、B-M23、K05、K06、B55、B56、B59、N22、K15、K16。另有两项（47 的 B37、B39）未登记，见 RR6-P3-04 第 5 条 |
| PH6-P3-07 文字小处 | **已关闭** | 1、2：CHANGELOG 去掉“应用自带”、改为“达到 5 秒”、补“（本机有 Claude 配置目录时）”；3：各 README 回退说明改为“不改动计划、绑定、历史与偏好（可能删除启动记录，0.11 下次打开时补写）”并说明独立数据目录的适用范围；4：插件 README“在 Codex 中使用时需要……”；5：`55` S-27、S-28 注明真实版在注入点之前不运行真实代码 |
| PH6-P3-08 运行时构建用真实 HOME 运行 npm | **已关闭** | `tests/compat-matrix.test.mjs:65` 设 `npm_config_userconfig=/dev/null`、`npm_config_logs_dir` 与 `npm_config_cache` 指向运行时旁的临时目录。本轮矩阵运行结束后，临时 HOME 的 `~/.npm/_logs` 中没有新增日志（其中的 11 份都来自此前 `launcher` 用例的 `npm ci`/`npm run build`，工作目录为 `skilldock launcher …`） |

### 3.3 UI-14（`65061fa`）

| 项 | 判定 | 依据 |
|----|------|------|
| 卡片菜单“管理更新” | 正确 | `src/App.tsx:730`：两侧对象都可用，只对未安装的插件禁用；跳转并设定位 |
| 插件详情的“管理更新” | 正确 | `src/App.tsx:1593`：所有已安装插件（含带 `installation` 的 Claude 插件）都显示，接线 `:1431` |
| 更新页定位 | 正确 | `focusMatches`（`src/UpdatesWorkspace.tsx:511`）认对象自身的更新项，或 `affectedSkillIds` 含该技能的插件项（Codex 系统技能经 `codex-system-skills` 项的 `affectedSkillIds` 也能定位）；定位说明按插件 / 随插件更新的技能 / 独立技能三种措辞（`:839`），英日译文齐全；Claude 对象的 ID 由 `claudeIds` 生成，与 Codex 同名插件不冲突 |
| 用例 | 定位部分有效 | `tests/agent-ui.test.mjs:280`：M16、M17 被发现；菜单与详情按钮的启用条件没有用例（M20 存活），见 RR6-P3-02 |

## 4. 新改动的重点核对

### 4.1 `entryPlace`（`server/claude-plugin-updates.mjs:55-77`）

- **marketplace 自身来源进入绑定**：只在 `known_marketplaces.json` 中该 marketplace 的 `source` 是对象时带入（`server/service.mjs:472`），否则绑定退回为 `{kind, relative}`。`marketPlace` 按固定键序输出，`JSON.stringify` 比较稳定；`ref`、`sha`、`lastUpdated` 等不进入；`url` 经 `publicSource` 去账号、密码、查询串与片段，绑定文件中不留凭证。
- **探针 PROBE-6D-2**（在拷贝中追加到 `claude-plugin-updates.test.mjs`，未入库）：本地目录 marketplace 中的插件加入自动应用计划；只给 marketplace 来源加一个 `ref`，下一轮仍为 `current`；把来源的 `path` 改到别处而副本位置不变，下一轮为 `skipped / TARGET_BINDING_CHANGED`。原实现通过；去掉 `service.mjs:472` 的带入（M07）后失败。
- **npm 地址取 origin**：`spec.startsWith('https:')` 时取 `new URL(spec).origin`，与压缩包一致；解析失败时保留原值。这意味着同一主机上换成另一个包地址不会要求重新选择——这是 r24 P3-06 建议的取舍，绑定中的插件缓存目录身份仍在，记为观察，不计问题。
- **对已有绑定的影响**：0.11 试用中已保存的本地或 Git 托管 marketplace 条目（含 SkillDock 生成的 marketplace，`directSourceInfo` 同时给其来源信息加了 `kind`、`owner`）首次运行会报告 `TARGET_BINDING_CHANGED`，重新选择一次即可；0.10.x 从未有 Claude 目标，不受影响。HLD v1.30 表已写明。
- 检查与应用路径用的是 `marketplaceEntry` + `pluginSource`，不经 `claudeEntrySource`，预览与应用之间的来源核对不受 `marketSource` 影响。

### 4.2 1 版快照的过滤与调度器记录（`server/service.mjs:269-275`、`server/scheduler.mjs:200、276`）

- 过滤顺序改为“合并调度器记录 → 1 版过滤 → 排序 → 取 200 条”；`schedule.configure` 不带 Agent，照常给 1 版；迁移、核实记录对 Claude 目标带 `agent: 'claude'`，被过滤；Codex 目标不带 `agent`，保持原样。
- `updateRuns` 以浅拷贝重建（不改调度器状态），只去掉 `target.agent` 非 Codex 的项，`host` 类项（`update-run`、`interrupted-run`）保留。
- 无调度器分支现在也按 `createdAt` 排序；正常路径早已如此，不是新风险。
- **探针 PROBE-6D-1**（追加到 `claude-updates.test.mjs`，未入库）：只属于 Claude 的技能进入计划、变为两侧共用后迁移；多 Agent 快照中迁移记录 `agent` 为 `claude`、运行记录有 Claude 项；1 版快照中没有迁移记录、有 `schedule.configure`、运行记录无 Claude 项。原实现通过；M08（去掉运行记录过滤）、M09（恢复旧顺序）、M10（迁移记录不带 Agent）各自使它失败。
- **探针 PROBE-6D-3**：同一情形下 1 版快照 `updateRuns[0].items` 为 0，但该次运行 `total` 为 1，`updateProgress` 为 `total 1、completed 1、counts.current 1`，计划目标为 0 个（RR6-P3-03）。

### 4.3 `directSourceInfo` 与 `contracts.ts`

- 来源信息形状与 `contracts.ts` 一致（`kind: 'tracked'`、`confidence: 'verified'`、`owner: 'SkillDock'`、`label`、`evidence` 与原有字段），`tsc --noEmit` 通过；界面只在更新页的来源、证据摘要中读取这些字段。`kind: 'tracked'` 在服务端只对技能（`server/sources.mjs:83`）与 Codex 插件路径有含义，Claude 插件条目不经这些分支。
- `targetSignature` 对生成 marketplace 的插件取 `kind`、`owner`、`sourceType`、`source`、`subpath`、`ref` 进绑定，与 4.1 的一次性重新选择是同一批目标。

### 4.4 界面

- `showsCodexCliNotice`：与原内联条件等价，提出后有用例。
- `InstallDialog`：见 RR6-P3-01。
- `AgentEnvironments`：停用确认框按 Owner 决定写明例外，中英日一致。
- 计划说明：三种语言都加上 Claude；在只装 Codex 的环境中多提一个 Claude，所述仍属实。

### 4.5 用例有效性（变异实验汇总）

基线：变异拷贝中 `agents`、`claude-plugin-updates`、`claude-plugin-sources`、`claude-updates`、`background-updates`、`multi-agent`、`shared-skills`、`backend-updates`、`direct-plugins`、`agent-ui`、`launcher`、`toolchain` 共 194/194 通过；矩阵 N-12、N-14、R-03、V18-a 共 8/8 通过（本机沙箱内，非 CI 等价全量）。

| 编号 | 变异 | 结果 |
|------|------|------|
| M01 | `entryPlace` 本地 / Git 托管条目去掉 marketplace 来源 | 被发现（`claude-plugin-updates` 第 505 行用例） |
| M02 | `marketPlace` 带上 ref | 被发现 |
| M03 | `marketPlace` 的 url 不去凭证 | 被发现 |
| M04 | npm 地址保留完整地址 | 被发现 |
| M05 | 压缩包取完整地址 | 被发现 |
| M06 | Git 来源带 ref | 被发现 |
| M07 | `service.mjs:472` 不带入 `marketSource`（接线） | **存活**（9 个文件 140 项）；探针 PROBE-6D-2 发现 |
| M08 | 1 版不过滤运行记录中的 Claude 项 | **存活**；PROBE-6D-1 发现 |
| M09 | 恢复旧顺序（计划记录不经 1 版过滤） | **存活**；PROBE-6D-1 发现 |
| M10 | `schedule.migrate` 不带 Agent | **存活**；PROBE-6D-1 发现 |
| M11 | `schedule.reconcile` 不带 Agent | **存活**（触发核实需构造外部同步，未写探针；与 M10 同一写法） |
| M12 | 1 版不过滤 `agent.*` | 被发现（`agents`） |
| M13 | 启动器 `save: true` | 被发现（`launcher`） |
| M14 | 去掉已下载 Node 的候选模式 | 被发现（`toolchain`，失败于列表断言） |
| M15 | Codex 命令行提示恒显示 | 被发现（`agent-ui`） |
| M16 | `focusMatches` 不认 `affectedSkillIds` | 被发现 |
| M17 | `focusMatches` 只认插件（UI-14 修复前） | 被发现 |
| M18 | `marketplace-entry` 可信度改回 `verified` | **存活**（只影响显示） |
| M19 | `directSourceInfo` 去掉 `kind`/`confidence`/`owner`/`evidence` | **存活**（只影响显示） |
| M20 | 卡片“管理更新”回到只对含 Codex 的对象启用 | **存活**（加跑 `i18n`、`agents` 仍存活） |
| M21 | 停用确认框去掉一键更新例外 | **存活**（加跑 `i18n`、`agents` 仍存活） |
| M22 | 门槛“无法确认”提示文字改变 | 被发现（V18-a） |
| M23 | `failedOnPlan` 的日志关键字改为不存在的值 | 被发现（N-12、N-14×2、R-03×2 共 5 项失败） |
| M24 | `targetSignature` 不再跳过 `marketplace-entry` 描述 | 被发现（N21） |

## 5. 文档与冻结行为

### 5.1 HLD v1.30

| 改动 | 与实现 | 判断 |
|------|--------|------|
| 元信息（版本、状态行、修订表优先） | — | 一致 |
| DEC-SDX-027 rationale、3.13A：V18 移出真实宿主行为 | 矩阵 V18-a～d 用真实 0.11.0 启动器 | 一致 |
| 3.3 基线、3.3A 四处、3.7 串行 | `service.mjs` 基线逻辑；`gate-cli.mjs` 取锁；V11、V8 记录 | 一致 |
| 第 10 节 DG-R24-1、DG-R24-2 与 HLD 批准行 | 界面文字、`agents.mjs` 的 `canUpdate`；首次检查的基线 | 一致 |
| 11A 标题、条件 5 | — | 一致；条件 1a、1b 段落未改 |
| 第 12 节 v1.30 表（10 行） | 逐行对照第 3、4 节 | 一致；“测试缺口”一行所称“绑定位置（……marketplace 来源）”的用例只在单元层（RR6-P3-02）；三处“位置”指向未改的正文（RR6-P3-04） |

`trace_lint.py --strict`：HLD `PASS`（Errors 0、Warnings 0、Infos 49，与第 25 轮相同）；PRD `PASS`（0/0/0）。

### 5.2 契约索引 0.31、36c 0.30

- 索引：版本、状态、第 4 节 36c 版本、第 10 节 0.31 一行；与 36c 改动一一对应。
- 36c：`canUpdate` 注释、第 6 节来源信息与绑定位置、7.2 `agent.setManagement` 的尽力写入、第 10 节 1 版快照的范围；都与实现一致。第 6 节说 marketplace 自身来源取“仓库、地址或路径”，实现另含 `package`，且来源缺失时不带入，属可接受的细节。
- 36c 第 4、5 节（第 39～91 行）没有改动；36a、36b sha256 与第 15 轮证书相同。

### 5.3 PRD 0.10

- 只增修订记录一行与 Q11；需求条目、验收标准与冻结承诺未改。Q11 与实现、HLD DG-R24-2 一致（措辞小处见 RR6-P3-04 第 4 条）。

### 5.4 对 0.10.3、0.10.2 冻结行为的影响

| 交集 | 本轮改动 | 判断 |
|------|---------|------|
| 36a、36b、36c 第 4～5 节、HLD 11A 1a | 0 行改动 | 未改 |
| 启动器、门槛、转交链（`scripts/`、`gate-cli.mjs`、`launch-plan.mjs` 等） | `258fd24` 未改这些代码，只改用例 | 不变 |
| 计划文件（`updates.json`）新内容：绑定中的 `market`、记录中的 `agent` | 只出现在 version 2 计划文件中；0.10.2 遇到 version 2 即 `INVALID_UPDATE_STATE`（R-03 现已断言），0.10.3 不接管 | 不变 |
| 1 版客户端经代理看到的快照 | 多过滤计划记录与运行记录中的 Claude 项，属 36c 第 5、10 节“只返回 Codex 一侧”的收紧；不改字段形态 | 不改变冻结语义（显示上的残余见 RR6-P3-03） |
| 兼容矩阵 | 本轮改动的 N-12、N-14×4、R-03×2、V18-a～d 共 10 项，本机沙箱内 10/10 通过，守卫无拦截记录 | 未发现回退 |
| 原生产物 | 拷贝中 `node scripts/native-bundle.mjs` 重建，`assets/native/` 五个文件与提交逐字节相同 | 一致 |

结论：**HLD v1.30、索引 0.31、36c 0.30、PRD 0.10 的改动与实现一致，不改变 0.10.3、0.10.2 的可观察行为，也不要求它们改变。**

## 6. 新发现

### RR6-P3-01 安装窗口的 marketplace 说明改动没有生效；`56` AC-013 的结论偏宽

- **位置**：`src/InstallDialog.tsx:14`（`agents = []`）、`:114`；`src/App.tsx:1427`；`references/56-p0-acceptance-check.md:106`。
- **问题**：`258fd24` 让说明在 `agents` 不含 Codex 时改为“从已连接的 Marketplace 选择插件。”，但插件安装窗口由 `App.tsx:1427` 打开，不传 `agents`，缺省为空数组，条件 `agents.includes("codex") || !agents.length` 恒真，只装 Claude 时仍显示“从 Codex 官方目录或已连接的 Marketplace 选择插件。”。渲染探针（按 `App.tsx` 的传参渲染 `InstallDialog`，快照只有 Claude 环境）输出仍含“Codex 官方目录”；补传 `agents: ['claude']` 时才不含。`56` AC-013 写“安装窗口的 marketplace 说明在只装 Claude 时不提‘Codex 官方目录’”，与实际不符。同一原因下，插件从本地目录或 Git 安装时的 Agent 选择（`chooseAgent = fromSource && agents.length > 1`）在插件窗口中也不会出现——这是 `3c9ee80` 以来的既有情况，不在本轮 diff 内，只作提示。
- **影响**：只是文字（不是“需要 Codex”的提示，57 也按 P3 处理）；但验收核对把未生效的修正记为已完成。
- **建议**：在 `App.tsx:1427` 传入与技能安装窗口相同的 `agents`（或在窗口内按 `data.agents` 判断），补一条渲染用例；或把 `56` 该句改回“记入 41 / 最终 UAT 复核”。

### RR6-P3-02 新代码的用例缺口：服务端接线、1 版过滤、调度器记录、菜单入口与确认框文字

- **位置**：`server/service.mjs:272-275`、`:472`；`server/scheduler.mjs:200`、`:276`；`server/claude-plugin-updates.mjs:85`；`server/direct-plugins.mjs:100`；`src/App.tsx:730`、`:1593`；`src/AgentEnvironments.tsx:36`；HLD v1.30 表“测试缺口”一行；`56`:123。
- **问题**：变异 M07～M11、M18～M21 在仓库用例下全部存活（第 4.5 节）。其中 M07～M10 我用两个探针证实实现正确、探针可发现回归；M11 与 M10 同一写法。HLD v1.30 表称已补“绑定位置（……marketplace 来源）”的用例，实际只在 `entryPlace` 单元层，服务端是否把 `known_marketplaces.json` 的来源带入没有用例；36c 0.30 新写入的“1 版 `updateRuns` 不含 Claude 项”“不含计划关于 Claude 目标的记录”没有用例；`56` AC-016 第 3 项引用的 `agent-ui` 用例只覆盖定位，不覆盖菜单与详情按钮对 Claude 对象可用（UI-14 的另一半）；Owner 决定要求的停用确认框例外文字也没有用例。
- **影响**：实现现在正确；之后的改动若回退这些行为，现有用例发现不了（与 r24 P3-05、57 P3-01 同类）。
- **建议**：把本报告的 PROBE-6D-1、PROBE-6D-2 补入仓库（第 7 节有要点）；`agent-ui` 补一条：只属于 Claude 的技能与已安装插件的菜单“管理更新”可用、未安装插件不可用，以及停用确认框含“SkillDock 自身一键更新除外”；可信度与生成 marketplace 的来源字段可在现有来源用例中顺带断言。补齐前，HLD v1.30 表与 `56` 的相应说法宜注明“单元层 / 仅定位部分”。

### RR6-P3-03 1 版快照的运行进度仍计入 Claude 项

- **位置**：`server/scheduler.mjs:76-88`（`progress`）、`:91`；`server/service.mjs:273`；36c 第 10 节（`36c`:343）。
- **问题**：1 版快照过滤了 `updateRuns[].items`，但运行记录的 `total`、`status`，以及 `updateProgress` 的 `total`、`completed`、`counts`、运行中的 `current`，仍按包含 Claude 目标的完整运行计算。PROBE-6D-3：只含一个 Claude 目标的计划运行一次后，1 版快照中该次运行 `items` 为 0、`total` 为 1，`updateProgress` 为 `total 1、completed 1、counts.current 1`，计划目标 0 个。
- **影响**：只影响 0.10.x 界面经代理显示的数字（例如“1/1 已检查”却没有条目）；36c 第 5 节已说明“Claude 已启用管理时 1 版的检查全部会覆盖 Claude 对象、1 版界面看不到其结果”，不改变冻结语义。
- **建议**：1 版快照按过滤后的条目重算 `updateProgress` 与运行级计数（`current` 为 Claude 目标时省略），或在 36c 第 10 节写明运行级计数与进度不过滤。

### RR6-P3-04 文档的几处版本引用与措辞

1. **PRD 版本引用未随 0.10 更新**：HLD 元信息“关联 PRD v0.9”（`35`:419）、11A 条件 6 仍只写到 0.9（`35`:1223）、契约索引“PRD 引用 v0.9”（`36`:13）；PRD 头部“最后更新”仍为 2026-10-08（`34`:7）。`37`:3 已改为 0.10。
2. **v1.30 表的“位置”指向未改的正文**：DG-R24-1 一行写“第 10 节；3.6”，P3-06 一行写“3.8；36c 第 6 节”，P3-03 一行写“3.3A；36c 第 6 节”，但 3.6、3.8、3.3A 的正文都没有相应改动（3.6、3.8 也不与新规则矛盾）。有了“修订表优先”的规则不会误导实现，但按“位置”去找会找不到；建议改为实际位置，或在 3.6 补一句一键更新的例外、在 3.8 补一句绑定位置引用 36c 第 6 节。
3. **DG-R24-1 只写在 HLD 与 `56`**：PRD 把 DG-R24-2 登记为 Q11，却没有在 REQ-SDX-001 / AC-001 旁注明 DG-R24-1 的例外；读 PRD 的人看不到。可选：PRD 下次修订时加一条 Q 或在 5.1.1 注明。
4. **PRD Q11、HLD DG-R24-2 的找回途径**：写作“声明了版本的插件，旧版本目录由 Claude 保留 14 天；版本为 `unknown` 的，SkillDock 先复制一份”。没有声明版本、按提交或压缩包摘要算出版本的 Git、archive 插件同样新建版本目录、旧目录保留 14 天（3.3A），不在两句的任何一句中；建议改为“版本不为 `unknown` 的插件”。
5. **`56` 的已知测试缺口漏两项**：`37`:237 阶段 4 进度行与 47 都记为“未补用例”的 B37（45 M37：共用技能的 Claude 一侧不在技能根中时不可移除）、B39（45 M39：Claude 一侧更新时同步 Codex 记录）没有登记。

### RR6-P3-05 本提交仍是“契约与代码同提交、后复核”

- **位置**：`258fd24`（契约索引 0.31、36c 0.30 与 `service.mjs`、`claude-plugin-updates.mjs`、`contracts.ts` 同一提交）；`37`:211。
- **问题**：HLDR24-P2-04 的建议是“0.11.0 合并发布前若再改契约，先复核再编码”，`37` 也照此记录；本提交的契约修订仍与代码同时落地，再交本轮复核。
- **影响**：这些契约改动都是两份报告点名要求的，本轮逐条核对后没有需要回改实现的条文，风险已消化；只是流程上又一次事后复核。
- **建议**：合并前若还有契约改动（例如按 RR6-P3-03 修订 36c 第 10 节），先提交契约改动并做增量复核，再改代码；或在 `37` 中写明“按评审意见做的契约同步可与代码同提交，随下一轮复核”，把例外说清楚。

P2 及以上：无。P3 共 5 项。

## 7. 运行与实验

全部在 scratchpad 的 `rereview-6d/` 下进行，经 `sandbox-exec -f …/hermetic.sb` 与 `env -i`（`HOME`、`TMPDIR` 指向 scratchpad，`npm_config_offline=true`），测试进程加载连接守卫；守卫日志始终为空（没有任何被拦截的连接）。以下通过数都是**本机沙箱内的定向运行，非 CI 等价全量**。

| 编号 | 内容 | 结果 |
|------|------|------|
| T1 | 导出副本：`agents`、`claude-plugin-updates`、`launcher`、`toolchain`、`agent-ui`、`claude-updates`、`direct-plugins`、`background-updates`、`multi-agent`、`i18n`（`--test-concurrency=1`） | 146/146 通过，约 66 秒 |
| T2 | 导出副本：兼容矩阵 `--test-name-pattern='^(N-12\|N-14\|R-03\|V18)'`（经 alternates 只读取 `ab6856f`、`337547a`） | 10/10 通过，约 29 秒 |
| T3 | 导出副本：`npm run typecheck` | 通过 |
| T4 | 变异拷贝基线：12 个单元测试文件 194/194；矩阵 8/8 | 通过 |
| T5 | 变异 M01～M24（第 4.5 节） | 被发现 15 项；存活 9 项（M07～M11、M18～M21） |
| T6 | 探针 PROBE-6D-1（1 版快照不含 Claude 目标的计划记录与运行项、迁移记录带 Agent）、PROBE-6D-2（服务端绑定 marketplace 来源：ref 不进绑定、换路径要求重选） | 原实现 2/2 通过；M07、M08、M09、M10 各自使探针失败 |
| T7 | 探针 PROBE-6D-3（1 版快照的运行进度） | `items` 0、`total` 1、`updateProgress` `total 1/completed 1/current 1`（RR6-P3-03） |
| T8 | 渲染探针：按 `App.tsx:1427` 的传参渲染 `InstallDialog`，快照只有 Claude 环境（`Modal`、`ProviderIcon` 以桩代替） | 仍含“Codex 官方目录”；补传 `agents: ['claude']` 后不含（RR6-P3-01） |
| T9 | 变异拷贝中 `node scripts/native-bundle.mjs` | `assets/native/` 与提交逐字节相同 |
| T10 | `trace_lint.py --strict`：HLD、PRD | 均 PASS（HLD Infos 49） |
| T11 | `shasum -a 256`（导出目录，评审开始与结束各一次）并与 `git show 258fd24:`、原工作树对照 | 三方一致，开始与结束相同 |
| T12 | 临时 HOME 的 `~/.npm/_logs` | 11 份日志全部来自 T1 中 `launcher` 用例（工作目录 `skilldock launcher …`）；T2 矩阵运行没有在 HOME 写日志 |

探针要点（供补入仓库时参考）：PROBE-6D-1 沿用 `claude-updates` 中“a Claude skill that becomes shared keeps its place in the plan”的布置，到期运行后分别取多 Agent 与 1 版快照断言；PROBE-6D-2 沿用 `claude-plugin-updates` 的 `world()`，计划保存后改写 `<config>/plugins/known_marketplaces.json` 中 `m.source`（先加 `ref`、再改 `path`），每次 `advance(61)` 并 `tickScheduler()` 后取 `updateRuns[0].items[0]`。

未运行：全量 `npm test`（提交说明称 606/606，本轮未复核）、浏览器端到端测试（称 86/86，未复核）、兼容矩阵其余用例、真实 Claude 或 Codex 命令行（沙箱禁止）。

## 8. 证书绑定

P0、P1 均为零，本轮建议重新绑定以下版本（sha256 均在导出目录中以 `shasum -a 256` 计算，评审开始与结束各一次，两次相同，也与 `git show 258fd24:` 与原工作树中的文件相同）：

| 对象 | 版本 | sha256 |
|------|------|--------|
| HLD `35-cross-agent-hld.md` | HLD-SDX-001 v1.30 | **`e2c1d7f74bb5253f4eaf6d6d13662108efe084c96622633768aae3694fcc108c`** |
| 契约索引 `36-cross-agent-api-contract.md` | API-SDX-001 0.31 | **`8392cc6604803957dd84b423829c745fcae96084de80859ec56aee338af9bcac`** |
| `36c-http-api-delta.md` | 0.30 | **`c90973f07b772de4eb8a7e6230edada3442fe7067e45ed32cddeb055ca78666c`** |
| PRD `34-cross-agent-prd.md` | PRD-SKILLDOCK-002 0.10 | **`1fbe5bc89ec5c91a8eff986634a638c00697371ee42877a016be8d383ab60936`** |
| `36a-cross-version-file-formats.md`（未改） | 0.2 | `a4dd81b456443c8472244ee0a4a0b006e95de147233c9e88e8ca3f2d9c278ed4` |
| `36b-launcher-handover-protocol.md`（未改） | 0.14 | `b5e9644ce711a4f2228488d43353520a828dc9159a3b82fc9b5d2df56fcf989b` |

- **取代**：第 25 轮（r24）绑定的 HLD v1.29 `5b5de515…fe13`、索引 0.30 `16d8ea77…93a3`、36c 0.29 `18642a12…d913`；PRD 由 0.9 `e061ec25…1631` 改为 0.10。
- **technical_verdict / scope_status**：APPROVED（带 P3）/ WITHIN_APPROVED_SCOPE（两项语义取舍已由 Owner 决定：DG-R24-1、DG-R24-2）。
- **条件的有效状态**：
  - 1a：满足（维持）；本轮 1a 段落、36a、36b、36c 第 4～5 节都未改。
  - 1b：满足（以本轮绑定的 0.31 / 36c 0.30 为准）；0.31 仍属事后复核（RR6-P3-05）。
  - 2（V20 与 0.10.3 关口留证）：与此前各轮相同，本轮不判断。
  - 3：矩阵真实 0.11.0 重跑与 V18 已完成（本轮复现了改动部分）；V17 待 Owner（6e）。
  - 4：维持“已满足”（作者 2026-10-09 实测记录）。
  - 5：改为绑定 HLD v1.30（上表 sha256）。此后任何修订（含按 RR6-P3-04 修改元信息、版本引用或 v1.30 表）都须对修订部分做增量复审。
  - 6：PRD 按本轮核对的 0.10（上表 sha256）提交，满足。
  - 7（r24 新增，DG-R24-1、2）：Owner 已决定，满足。
  - 契约：只对上表四个契约文件的 sha256 有效；1a 部分只允许与已发布 0.10.3 一致的措辞修正；合并前若再改契约，宜先复核再编码。
- **发布前仍待**：6e 中的 V17、从真实 Claude 桌面应用添加 marketplace / 安装 / 刷新后更新（含核实 README 所写“Update marketplace 会更新已安装插件”）、只装 Claude 环境的 AC-013 复核（含 RR6-P3-01）。

## 9. 约束遵守与披露

- 除本报告外没有写入原工作树任何文件；没有修改 HLD、PRD、契约、实施计划或代码；没有 commit、push、切换分支。原工作树 HEAD 开始与结束都是 `258fd24`，`git status` 干净（本报告除外）。
- 实验只在 scratchpad 的 `rereview-6d/` 下进行（导出副本、变异拷贝、临时 HOME 与 TMPDIR、日志、探针脚本）；变异拷贝结束时与导出副本逐文件相同。导出副本与拷贝中的 `.git` 以 alternates 只读引用原仓库对象，只执行了 `cat-file`、`rev-parse`、`archive` 类只读命令。一次追溯工具结果的临时转存误用了系统 `/tmp`，用后即删，内容只有工具输出。
- 没有访问 `127.0.0.1:4771`（守卫无记录；本机 4771 上的进程是此前已在运行的用户实例，未触碰）；没有读取或改动真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；没有执行 `launchctl`；没有联网下载任何东西；没有打印任何配置文件全文（沙箱规则文件只按行检索了 allow/deny 条目）。
- 结束时没有本轮留下的测试进程或监听端口。
- 本报告不含凭证或令牌；引用的绝对路径都在 scratchpad 或仓库内。
