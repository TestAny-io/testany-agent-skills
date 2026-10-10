# 代码复审报告（第 2 轮）：阶段 5 三份代码评审意见的处理（`6663b90`、`1a95372`、`cd94b88`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 上一轮 | 5a、5b：[48-cross-agent-phase5ab-code-review.md](48-cross-agent-phase5ab-code-review.md)（对 `f2af004`：CHANGES REQUESTED，P1 2、P2 5、P3 9）；5c：[49-cross-agent-phase5c-code-review.md](49-cross-agent-phase5c-code-review.md)（对 `fb4d8e2`：CHANGES REQUESTED，P1 1、P2 1、P3 6）；5d：[50-cross-agent-phase5d-code-review.md](50-cross-agent-phase5d-code-review.md)（对 `8809862`：APPROVED 带 P2 1、P3 7） |
| 范围 | `git diff 8809862 cd94b88 -- plugins`：36 个文件，增 1624 行、删 178 行（其中 810 行是随提交入库的 48、49、50 三份报告，另含 `native/server.mjs`、`native/ui.html`、`native/build.json` 构建产物），diff sha256 前缀 `a0cefc173ee3`。`6663b90`（处理 49）15 个文件 +443/−43（`e908ed82c469`）；`1a95372`（处理 48）16 个文件 +699/−75（`7e4ad5660ae4`）；`cd94b88`（处理 50）24 个文件 +503/−81（`1dfb197bb5ee`） |
| Candidate | `cd94b88`（tree `4db283c6dd02…`）；中间提交 `6663b90`（tree `96e37e75ccd8…`）、`1a95372`（tree `78a2c19588b0…`）；基线 `8809862`；分支 `feature/skilldock-0.11-cross-agent`（本地，从未推送） |
| 事实源（均取 `cd94b88` 中的版本） | PRD `34`（sha256 `e061ec258421…`，范围内未改）；HLD `35` v1.27（`95f041ff8d72…`）末尾“阶段 5c 代码评审的处理（v1.25）”“阶段 5a、5b 代码评审的处理（v1.26）”“阶段 5d 代码评审的处理（v1.27）”三节及 3.3、3.3A、3.5、3.7、3.8 相关处；契约索引 `36` 0.28（`2b88a8f9cc5a…`）；`36a`（`a4dd81b45644…`，范围内未改）；`36b`（`b5e9644ce711…`，范围内未改）7.3、7.4、第 12 节；`36c` 0.27（`0a340acdff40…`）第 6 节、7.2、第 8、9 节；实施计划 `37`（`a0326365dd70…`）阶段 5 进度行中三段“评审处理”与阶段 6 的版本条目；三份上一轮报告 48（`c02dc11875c4…`）、49（`75521e5ce32a…`）、50（`b362bc1b35c3…`）。格式参考 `47` |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审代码；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-10 |
| 工作区绑定 | 开始与结束时主工作区 HEAD 均为 `cd94b88`，唯一的未跟踪文件是他人的 `references/51-phase45-uat-guide.md`（未查看、未依赖）。全部阅读、测试、实验与变异都在 scratchpad 中进行：`git archive cd94b88` 的导出副本（`review-5r2/`）、供兼容矩阵用的只读本地克隆（`git clone --no-local` 后检出 `cd94b88`，`review-5r2-clone/`）、完整 skill-manager 目录的变异副本（`review-5r2-mut/`）、修法试验副本（`review-5r2-fix/`）与对照用的 `git archive 8809862` 导出（`review-5r2-base/`）；`node_modules` 均为指向主工作区的软链接。对主工作区唯一的写入是本报告 |

## 2. 结论

**APPROVED（带 P2、P3）**

- P0：0
- P1：0
- P2：2（PH5R2-P2-01、P2-02）
- P3：5（PH5R2-P3-01～05）

上一轮各项的处理（第 3 节）：

- **49（5c）**：P1-01、P2-01 **已修复**，E1、E2、E2b 三个失败场景都有用例并被变异钉住；P1-01 的修法有一处余量（已在计划中、尚无记录的 0.10.x 继承目标被 2 版原样关闭时也被补成 2 版来源，本轮 PH5R2-P3-02，安全方向）。P3 六项中五项已修复或按建议澄清（P3-03 只改文档，取舍合理）；P3-05 部分修复（M14 的用例实际未钉住，M10、M23 未补）。
- **48（5a、5b）**：两项 P1 已修复（P1-01 基本修复：共用技能的链接固定已释放，但只释放与被替换目录“相同”的固定，指向被替换的技能目录插件内部子目录的 Codex 链接仍失效，本轮 PH5R2-P3-01；P1-02 已修复）。P2 五项：P2-02、P2-03、P2-04 已修复；P2-01 只修了 marketplace 路线，生成 marketplace 的路线仍按旧口径比较（本轮 PH5R2-P2-02）；**P2-05 的修法引入回退**：计划绑定中加入了条目来源的完整内容（含 Git `sha`/`ref`、npm 版本、压缩包地址），维护者以改条目的方式发布更新时计划每轮 `TARGET_BINDING_CHANGED`，而 `8809862` 中同一场景能自动更新（本轮 PH5R2-P2-01）。P3 九项中七项已修复或合理记为文档例外（P3-07 记为契约例外，取舍合理），P3-08 基本修复，P3-09 部分修复（列出的 22 项待补变异中 14 项仍未被钉住，`37` 的“补齐评审列出的用例”偏宽）。
- **50（5d）**：P2-01 基本修复：恢复旧实例时写失败记录、代号 2 下重启任务在准备工具链之前被拒绝，不再“停止—恢复”循环（E5 用真实启动器验证）；但恢复出的实例仍按退避周期发起任务，每次短暂暂停界面，并把原有的失败说明覆盖成“重启启动器退出（1）。”（本轮 PH5R2-P3-03）；写失败记录这一半没有用例（N28 在含兼容矩阵的全量下存活）。P3 七项都已处理；P3-03 的代码正确但新用例不经过转交（N34 存活）。
- **新发现**：两项 P2 都是有限修复带来的口径问题，修法都很小、已在试验副本中验证（第 6.4 节）；五项 P3 为一处释放范围、一处来源补记范围、一处体验余量、测试缺口与几处小的加固和文字。
- **未见回归（除 PH5R2-P2-01）**：导出副本全量 539 项（483 通过、56 项兼容矩阵因无 Git 历史跳过、0 失败），只读克隆 539/539 通过；类型检查通过；`native/build.json` 73 项输入与产物哈希一致；新增服务端消息的英、日整句译文齐全（启动器的快速拒绝文字只写入 `server.log`，与代号 1 的同类文字一致，未翻译）。
- **对阶段推进的影响**：按 `37`“独立代码评审没有 P0/P1”的完成标志，阶段 5a～5d 的复审要求已满足。建议在阶段 5 的 UAT 之前处理 PH5R2-P2-01（否则 UAT 中固定版本来源的 Claude 插件计划会表现为“每次发布都要重选”）与 PH5R2-P2-02，并补 PH5R2-P3-04 中标为“建议补”的用例。

本结论不授予推送、合并或发布权限。

## 3. 上一轮各项的判定

行号均指 `cd94b88` 导出副本中 `assets/app/` 下的文件（`scripts/` 指 skill-manager 根下的启动脚本）。A 组为 48 未被发现的变异按新代码重放，B 组为 49 的，C 组为 50 的，N 组为本轮针对修复新设的变异；实验编号见第 6.3 节。“被发现/存活”的判据：定向测试失败数 > 0 记为被发现；定向存活的再跑全量（除 `native-protocol`、`source-bundle`、`compat-matrix` 外的全部 `*.test.mjs`，前两者会因源码哈希变化而失败、与行为无关），仍为 0 失败才记为存活。

### 3.1 阶段 5c（49）

| 上一轮编号 | 判定 | 依据 |
|-----------|------|------|
| PH5C-P1-01 关闭状态下保存的跨侧技能被记为 1 版来源 | **已修复**（余量见 PH5R2-P3-02） | `service.mjs:2215-2216`：关闭请求写 `disabled.json` 时带请求版本 `origin`；`scheduler.mjs:43-47` `adoptDisabled` 在 `persist`、`reload`、`run` 三处并入关闭记录时，为没有记录的目标补上该来源（`run` 中保留 `nextRunAt`）。关闭保存不被确认拦住（`starts` 只在 `input.enabled` 时为真），新增的跨侧目标记为 `pending`；之后启用自动应用或改为自动应用时返回 `CONFIRMATION_REQUIRED`；确认前到期运行只检查。用例“a cross-side skill added while the plan is off …”覆盖 49 E1 的全部步骤；N01、N02、B-M7 被发现。有操作进行时提前返回的分支（`:2218`）同样先写带来源的记录，由下一次 `reload` 或进行中批次的 `adoptDisabled` 并入，按代码推断一致（未单独构造） |
| PH5C-P2-01 “原样重新提交”按绑定身份判定 | **已修复** | `scheduler.mjs:140` `resubmitted = key => priorKeys.has(key)`，`sameIdentity` 已删除；用例“"as it was" is the target's identity …”覆盖 49 E2（1 版原样保存后仍 `pending`，运行只检查）与 E2b（重新关联来源后 2 版原样保存不再要求确认）；N03 被发现 |
| PH5C-P3-01 副本替换的还原失败被吞掉 | **已修复**（小余量见 PH5R2-P3-05 第 2 条） | `service.mjs:864-871`：候选改为 `move` 到副本位置；还原失败时 `keep = true`，结果追加备份位置（英、日整句译文齐全）。用例覆盖命令行失败（非超时）还原、超时不还原、还原失败保留备份；B-M2、N04 被发现 |
| PH5C-P3-02 Git `ls-remote` 取第一行 | **已修复** | `claude-plugin-updates.mjs:84-91`：按 `refs/tags/<ref>^{}`、`refs/tags/<ref>`、`refs/heads/<ref>` 精确匹配，顺序与 `checkoutGit`（`cli.mjs:65` `rev-parse <ref>^{commit}`，标签先于分支）一致，40 位十六进制直接返回；用例覆盖附注标签、`feature/main`、完整引用名与缺失引用；N05 被发现。标签与分支同名时的先后（N06）未被钉住，可补 |
| PH5C-P3-03 Claude 只读时批量与计划仍应用冲突技能 | **按建议只改文档，合理** | 36c 第 6 节补“Claude 已启用管理时；未启用时批量与计划使用 1 版快照，保持 0.10.2 行为，MR-SDX-001”。49 已判定此时更新的是 Codex 一侧来源的内容、可恢复；与计划快照的 MR-SDX-001 一致，零代码，取舍合理 |
| PH5C-P3-04 `crossHold` 先取跨侧信息 | **已修复** | `scheduler.mjs:227-235`：非本机模式、非技能目标、1 版手动批量、已确认或非 2 版来源的计划目标都在取多 Agent 快照之前返回；`configureTransaction` 的跨侧判断限 `local` 模式（`:143`）。剩下的唯一多取快照的情形是“2 版来源、未确认、另一侧未启用”的计划目标，量级可忽略。属优化，无行为可测 |
| PH5C-P3-05 测试缺口 | **部分修复** | 49 优先的三项中 M7、M9 被钉住；M14 的用例名标注“(M14)”，但 B-M14 在全量下存活：用例中 1 版保存的计划本已启用自动应用，2 版原样再存时 `starts` 为假，变异只多记一个不显示的 `confirmation`，结果不变。M2、M8 被钉住；M10、M23 未补（B-M10、B-M23 存活）。见 PH5R2-P3-04 |
| PH5C-P3-06 文案与文档小处 | **已修复** | 第 1 条：确认条目改为 `inner (sd)`（`scheduler.mjs:151`），与语言无关；第 2 条：HLD v1.25 表第一行与 36c 第 6 节改写版本取值说法；第 3 条：`UpdatesWorkspace.tsx` 三种语言的帮助文字补“下次运行时间从现在重新计算”；第 4 条：残留译文已删，`NOT_YET_AVAILABLE` 在服务端与界面中已无引用 |

### 3.2 阶段 5a、5b（48）

| 上一轮编号 | 判定 | 依据 |
|-----------|------|------|
| PH5AB-P1-01 Claude 主导的共用技能更新后 Codex 一侧链接固定失效 | **基本修复**（余量见 PH5R2-P3-01） | `service.mjs:523-526` `releaseCodexPins`：Claude 一侧文件事务替换目录（`afterReplace`，`:557`）与恢复（`afterRestore`）后，释放 Codex 中真实路径**等于**该目录的链接固定；`scheduler.mjs:208-213` `afterOwnUpdate` 在签名一时取不到时保留原绑定、不让已落地的更新报失败；`migrateTarget`（`:1858`）补“共用 → 只属于 Claude”方向。用例：计划中更新后本轮 `updated`、下一轮 `current`，Codex 一侧与 1 版快照仍列出它、ID 不变；Codex 链接被删后计划目标迁移。N07、N09 被发现；N08（`afterOwnUpdate` 的兜底）存活。余量：Codex 链接指向被替换的 Claude **技能目录插件内部**的子目录时固定不释放（E1） |
| PH5AB-P1-02 `unknown` 版本的本地修改基线没有出路 | **已修复** | `service.mjs:790-815`：检查时先暂存再判本地修改，安装内容等于候选时基线改为当前内容并清除读回暂停（`:809-813`），否则才按基线判 `LOCAL_CHANGES`；应用时仍先过基线闸门（`:794`）；`unknown` 的提示说明可能是 Claude 自己更新过并给出“卸载后重新安装”（`:791-793`）；读回不一致时以实际装入的内容为基线（`:884`）。用例覆盖 48 E3（Claude 原地更新后 `current`、手改后 `LOCAL_CHANGES` 带出路、重新装入后恢复、读回暂停解除）；N10、N12 被发现；N11（读回不一致时改基线）存活，见 PH5R2-P3-04。顺序调整的代价：真有本地修改的版本化插件，检查也要先联网暂存才报 `LOCAL_CHANGES`，暂存失败时报的是网络错误；可接受 |
| PH5AB-P2-01 `node_modules` 指纹口径不一 | **基本修复**（生成 marketplace 路线见 PH5R2-P2-02） | `claude-plugin-updates.mjs:146-171` 四类来源暂存都带 `skip: INSTALL_SKIP`；`files.mjs:93-104` `copySkill` 的复制与两次指纹都按 `skip` 排除顶层条目；应用前本地来源再核对也带 `skip`（`service.mjs:844`）。用例“a source with node_modules … unchanged is current”；N13、A-M24 被发现；N14（应用前再核对的 `skip`）、N15（复制时的排除）存活——回退任一项，带 `node_modules` 的本地来源都会在应用时 `STAGED_CHANGED`/`SOURCE_CHANGED`，而用例只检查不应用。`stageSource`（`:1239`）未改，生成 marketplace 的插件仍按旧口径比较（E3） |
| PH5AB-P2-02 附注标签永远 `SOURCE_CHANGED` | **已修复** | 随 49 P3-02 的 `resolve` 修复（见 3.1） |
| PH5AB-P2-03 更新页看不了 Claude 插件差异 | **已修复** | `service.mjs:2127-2135`：`preview.diff` 接受 `claude-plugin-update`，变化前一侧取安装目录（排除 `INSTALL_SKIP`）并核对仍等于预览基线；用例；N16 被发现 |
| PH5AB-P2-04 不代为更新的插件在列表中可检查 | **已修复** | `service.mjs:436-446` 生成更新项时读 `known_marketplaces.json` 与各 marketplace 本机副本，`command`、`helper`、无法识别的来源标 `OWNER_MANAGED`，`readOnlyReason`（只在项目目录不存在时设置，`claude-catalog.mjs:256`）标 `PROJECT_PATH_MISSING`，都 `canCheck: false`；`claude-updates.mjs:40-41` 使用；计划中项目缺失的目标暂停（`service.mjs:1946`）。用例；N17、N18、N19 被发现。开销：每次多 Agent 快照读一次 `known_marketplaces.json` 与每个有 Claude 插件的 marketplace 副本各一次（同一次快照内有缓存），解析量为本地 JSON，可接受；未按 mtime 缓存，取舍合理。正确性余量：判断依据是本机副本，远端条目已从 `command` 改为可更新来源而副本未刷新时，该项不可检查、SkillDock 也不会去刷新它，只能等 Claude 刷新 marketplace（第 7 节） |
| PH5AB-P2-05 计划绑定落在版本目录上 | **修复引入新问题**（PH5R2-P2-01） | `service.mjs:1796` 从 marketplace 安装的插件绑定插件的缓存目录（`cache/<market>/<plugin>/`），Claude 自己更新不再改变绑定目录（用例；N20 被发现）。但 `:1809-1812` 把 `claudeEntrySource` 的结果整体放进 `sourceIdentity.entry`，其中含 Git `ref`/`sha`、npm `spec`（含版本）、压缩包 `url`/`sha256`；这些正是维护者发布更新时改的字段。N21（去掉 `entry`）存活，“换来源仍须重新选择”也没有用例 |
| PH5AB-P3-01 读回错误码；`NOT_YET_AVAILABLE` | **已修复** | 读回不一致改用 36c 第 8 节登记的 `READBACK_CONTENT_CHANGED`（`service.mjs:887`，用例，N22 被发现），`errors.json` 补兜底译文；`NOT_YET_AVAILABLE` 已在 5c 中去掉；“更新目标无效。”“更新目标不存在。”两条有整句译文 |
| PH5AB-P3-02 读回暂停在最新后不解除 | **已修复** | 随 P1-02：内容等于来源时清除暂停（`service.mjs:811`）；用例；N10 被发现 |
| PH5AB-P3-03 缺“共用 → 只属于 Claude”迁移 | **已修复** | `service.mjs:1860-1864`；用例；N09 被发现。迁移消息改为“技能的共用状态已变化……”，有译文 |
| PH5AB-P3-04 `claude-plugin` 不核对修订号；预览先被消耗 | **已修复 / 文档澄清，合理** | 归属核对移到删除预览之前（`:835-836`，用例，A-M04 被发现）；修订号在 36c 第 6 节写明“这条路线以预览绑定的安装目录、版本、指纹与条目代替修订号核对”，预览本身已绑定这四项，取舍合理 |
| PH5AB-P3-05 组织强制启用的个人安装；按名称前缀判生成 marketplace | **已修复** | `claude-updates.mjs:38` 只看 `installation.scope === 'managed'`；生成 marketplace 已在 5c 改用 `direct` 判定。前者无用例（N23 存活），可补 |
| PH5AB-P3-06 加固 | **已修复**（余量见 PH5R2-P3-05 第 1、3 条） | 第 1 条：`relativeDirectory` 与 git-subdir 同时按真实路径判断边界（`claude-plugin-updates.mjs:63-70`、`:153`），用例（marketplace 中指向外部的链接 → `SOURCE_BOUNDARY`）；字面判断（A-M26）在真实路径判断之后成为纵深防御。第 2 条：以 `-` 开头的包名视为无法识别（用例），没有改为加 `--`，效果相同；版本范围取 `npm view` 数组的最后一项（`:102`，N24 存活，离线不可测）。第 3 条：压缩包手动跟随重定向（最多 5 次）、每一跳只接受 https 且拒绝本机名、边读边计数（`:107-121`），用例覆盖重定向成功、改道 http、改道本机、超限；N25、N26 被发现 |
| PH5AB-P3-07 1 版“检查全部”与计划校验看到 Claude 对象 | **记为契约例外，合理** | 36c 第 6 节写明例外及理由（不另设视图，以免同一目标在两种视图间绑定不一致）。0.10.2 冻结界面的“检查全部”发送的是 `updates.run` + `autoApply: false`（`ab6856f` 的 `UpdatesWorkspace.tsx:775`），实际影响只是多检查 Claude 对象（远端 Claude marketplace 会被刷新），且只在 Claude 已启用管理、与 0.10.x 界面共存时出现；为它另建一套 1 版视图的复杂度不值得 |
| PH5AB-P3-08 文档与实现的出入 | **基本修复** | 第 1 条：HLD v1.26 记明 3.3 的“以安装记录中的来源提交取基线”没有实现及对 MR-SDX-003 的残余影响；第 2 条：检查结果在应用前说明原地覆盖（`service.mjs:828`，用例，N27 被发现），“加入计划时说明”未单独做（更新列表中的检查结果即带此说明，可接受，建议界面重做时并入 UI 待办）；第 3 条：HLD 注明读回以指纹为准；第 4 条：6.2 时序图与 `37` 已改；第 5 条：`37` 已更正说法 |
| PH5AB-P3-09 测试缺口 | **部分修复** | A 组 21 项重放：6 项被发现（M02、M04、M24、M30、M31、M35）；15 项全量下仍存活（M05、M08、M09、M11、M15、M16、M17、M19、M20、M26、M27、M37、M38、M39、M42），其中 M26 已成纵深防御、M17 被列表层的 `PROJECT_PATH_MISSING` 遮住，其余 13 项是 48 列为“建议补”的。`37` 的“补齐评审列出的用例”偏宽。见 PH5R2-P3-04 |

### 3.3 阶段 5d（50）

| 上一轮编号 | 判定 | 依据 |
|-----------|------|------|
| PH5D-P2-01 代号 2 下切换失败后“停止—恢复”无上限循环 | **基本修复**（余量见 PH5R2-P3-03） | `scripts/launch.mjs:372-376`：恢复旧实例后不再只在回滚到 0.10.x 记录时写失败记录；`launch-plan.mjs:176-177`：代号 2 下对同一目标（应用目录 + 版本）的重启任务在转交判定之后、门槛与工具链之前以 `SWITCH_FAILED_BEFORE`（退出 1）拒绝；任何成功启动后 `clearMigrationFailure`（`launch.mjs:326`、`:396`），目标版本变化即不匹配。E5：恢复出的进程配真实 worker（目标的 `launch.sh` → `bootstrap.mjs` → `planLaunch`），两轮都被快速拒绝，运行实例与 pid 不变，没有停止—恢复。用例覆盖拒绝、交互启动不受限、目标变化后解除（N29 被发现）；但“恢复时写失败记录”这一半没有用例（N28 在导出副本全量与克隆中的兼容矩阵、`launcher`、`migration` 用例下都存活）。36 索引 0.28 写明不改 36b 的理由（0.10.x 不读这个文件，属第 12 节允许的 0.11.x 自身行为），成立 |
| PH5D-P3-01 一键更新不处理项目目录不存在的安装 | **已修复** | `skilldock-update.mjs:37-39` 跳过 `missing` 的安装、全部如此时 `PROJECT_PATH_MISSING`，成功信息注明；服务（`service.mjs:2015-2016`）与门槛（`gate-cli.mjs:108-109`）两处 `list()` 计算 `missing`。用例以预先给定 `missing` 的列表驱动（N30 被发现）；两处 `missing` 的计算本身没有用例（N32、N33 存活） |
| PH5D-P3-02 读回以最高版本判定；超时当失败 | **已修复** | `skilldock-update.mjs:55-62` 按 `id + scope + cwd` 逐项比对，至少一项升高即成功、未升高的注明；`CLI_TIMEOUT` 原样抛出（`:48-50`）。用例覆盖 50 E3 第 1 种与 E4；N31、N38 被发现。服务路径“部分升高”时在成功信息中注明，门槛路径仍由重判兜住 |
| PH5D-P3-03 原生入口重算门槛时先转交 | **已修复（代码）；用例未钉住** | `native-backend.mjs:118-120` 重算时带 `SKILLDOCK_DELEGATED: '1'`（`delegationTarget` 据此返回空），并传 `home`。新用例“without a stand-in, the native entry reads the gate again itself, with no handover …”的夹具中原生入口不在任何插件缓存中（开发副本、无家族），本来就不会转交；去掉 `SKILLDOCK_DELEGATED`（N34）用例照常通过 |
| PH5D-P3-04 `SKILLDOCK_UPDATE_AGENT` 进入长期进程 | **已修复** | `process-env.mjs:13-15` 列入 `LAUNCH_ONLY`；原生普通启动显式置空（`native-backend.mjs:128`）。转交仍保留该变量：`delegate` 用原始环境加 `SKILLDOCK_DELEGATED`（`launch-plan.mjs:269-272`），不经 `childEnvironment`，Claude 技能路径的转交情形不受影响。用例；N35、N36 被发现 |
| PH5D-P3-05 认不出家族时来源目录被清理即判卸载 | **已修复** | `background-worker.mjs:66-70`：无记录、来源不是 Codex 插件形态、目录已不存在且位于已知插件缓存下时，抛“无法确认”（计划暂停、不注销）；用例覆盖缓存内与开发副本两种；N37 被发现。取舍（真卸载且记录也丢失时任务停在暂停、不自动注销）已写入 HLD v1.27 |
| PH5D-P3-06 新保护没有被钉住 | **基本修复** | C 组 9 项重放：M1、M8、M9、M14、M17、M18、M19、M20 被发现（“版本相同不切换”的用例已改为目录版本与记录一致的情形，并补“不降级”）；M25 存活——`gateAgents` 的 `update` 本来就是抛错替身，清空该变量只是不调用替身，近似等价变异，可不补 |
| PH5D-P3-07 发布约束与文档 | **已处理** | 第 1 条：`37` 阶段 6 写明“必须在任何真实数据上的 UAT 与发布之前”把 `package.json` 与插件 manifest 升到 0.11.0 及原因；选择清单而非启动器保险，取舍可接受（保险需要额外的拒绝路径与用例），但它仍只靠人工，建议在 UAT 准备清单中同样列出。第 2 条：36c 7.2 改为“执行更新命令之后的成功与失败都写……此前的拒绝不写”。第 3 条：HLD v1.27 表更正 5d2b 的串行机制说法（v1.24 正文未改、在修订表中更正，符合“不悄悄改动”）。第 4 条：`SKILL.md` 退出码 4 一段补“两侧都被拦下时每次只指名一侧”。第 5 条：`errors.json` 补 `SKILLDOCK_UPDATE_FAILED`、`READBACK_CONTENT_CHANGED`、`SOURCE_CONFLICT` 三条兜底译文 |

## 4. 新发现

### PH5R2-P2-01 Claude 插件的计划绑定含条目的版本固定字段：维护者以改条目发布更新时，计划每轮 `TARGET_BINDING_CHANGED`（相对 `8809862` 的回退）

- **位置**：
  - `server/service.mjs:1809-1812`：`claude-plugin` 路线的绑定 `sourceIdentity.entry = await claudeEntrySource(...)`，即 `pluginSource(entry)` 的完整结果；
  - `server/claude-plugin-updates.mjs:42-49`：其中 Git 来源含 `ref`（取自条目的 `sha` 或 `ref`），npm 含 `spec`（`包名@版本`），压缩包含 `url` 与 `sha256`；
  - `server/scheduler.mjs:283`：计划运行先比对绑定，不同即交给 `reconcileBinding`；`:184-191` 只协调带内容指纹的 Codex 插件，Claude 插件绑定没有指纹，直接 `TARGET_BINDING_CHANGED`；`:295-299` 检查后、应用前再比一次。
- **问题**：DEC-SDX-023 的安装身份是“Agent + 插件@marketplace + 作用域 + 项目路径”；48 P2-05 要防的是“换来源、换所有者”。条目中的 `sha`/`ref`、npm 版本、压缩包地址与摘要是**版本**而不是来源身份：固定版本的 marketplace（Claude 文档鼓励对 `github`/`url` 来源写 `sha`；npm 条目常写 `version`；压缩包常按版本换地址）正是靠改这些字段发布更新。本地 marketplace 中改条目，或远端 marketplace 被刷新（Claude 自己刷新，或计划本轮检查时 `plugin marketplace update`）后，绑定即与保存时不同。
- **失败场景**（E2a、E2b，导出副本；对照在 `8809862` 导出中运行同一脚本）：
  - E2a：本地目录 marketplace 中的 npm 插件 `delta`，条目 `{ source: 'npm', package: '@t/delta', version: '1.0.0' }`，已装 1.0.0，计划自动应用。维护者把条目改为 `1.1.0` 并发布 1.1.0。`cd94b88`：连续两轮 `skipped / TARGET_BINDING_CHANGED`（“来源、所有者、安装目录或内容已变化；旧计划不接管新对象，请重新选择。”），已装仍是 1.0.0；更新页手动检查为 `available 1.1.0`。`8809862`：第一轮 `updated`，第二轮 `current`，已装 1.1.0。
  - E2b：压缩包条目的 `url` 改为新版本地址（与现有用例“npm and archive sources …”中的发布方式相同）。`cd94b88`：`skipped / TARGET_BINDING_CHANGED`；`8809862`：`updated`。
  - E2c（对照）：相对路径条目（`./plugins/alpha`）不受影响，`updated`。
  - 远端 marketplace 的变体（按代码推断）：本轮检查先刷新 marketplace，条目随之变化，`scheduler.mjs:296-300` 以“检查期间来源或安装身份发生变化”跳过；此后每轮都在开头被拦下（`scheduler.mjs:295-299`、`:283`）。
- **影响**：对固定版本来源的 Claude 插件，计划的自动更新在每次发布时都停下，必须重新保存计划；与 48 P2-05 要解决的“Claude 自己更新一次后每轮都被跳过”是同一类体验问题，只是触发条件从“Claude 更新”换成了“维护者发布”。不越权、不丢数据，方向保守，列 P2。另：`claudeEntrySource` 读不到时返回 `null` 并照样写进绑定；保存计划时恰好读不到（Claude 正在改写 `known_marketplaces.json`）会让该目标此后每轮都 `TARGET_BINDING_CHANGED`。
- **建议修法与取舍**：
  1. （建议）绑定只取来源的“位置”而不取“版本”：Git 取 `kind`、`url`、`subpath`；npm 取 `kind`、包名（去掉 `@版本`）、`registry`；压缩包取 `kind` 与 `url` 的 origin（协议 + 主机）；相对路径取 `kind`、`relative`。约 5 行，集中在 `service.mjs:1811`。试验 F2（第 6.4 节）：E2a 变为 `updated` → `current`、E2b `updated`，相关 6 个测试文件 83/83 通过。取舍：同一 marketplace 条目把分支从 `main` 改成 `dev` 不再被当作新对象——它仍是同一维护者、同一仓库，内容在应用前照常暂存核对；换仓库、换包、换下载主机仍要求重新选择。
  2. `entry` 读不到时不写入绑定（或比较时把 `null` 视为未知、本轮跳过但不判为变化），避免一次读失败让目标永久失效。
  3. 补用例：固定版本条目改版本后计划照常更新；条目改为另一个仓库或包时 `TARGET_BINDING_CHANGED`（同时钉住 N21）。
  4. 不建议回到绑定版本目录：那会重新引入 48 P2-05。

### PH5R2-P2-02 生成 marketplace 的插件仍按旧口径比较：来源带 `node_modules` 时安装后即报“版本未变”或“可更新”，应用必然读回不一致

- **位置**：`server/service.mjs:801`（生成 marketplace 的检查用 `stageSource`）、`:1239`（`stageSource` 中 `copySkill(directory, candidate)` 不带 `skip`）、`:809`、`:816`、`:830`（与排除了 `INSTALL_SKIP` 的安装指纹 `installed` 比较、计算差异）、`:878`（读回比较）、`:842`（应用前再核对原始来源也不带 `skip`，与候选一致）。
- **问题**：48 P2-01 的修复只改了 `stageCandidate`（marketplace 路线）。生成 marketplace 的路线（5c1）从记录的原始来源重新暂存，候选与 `preview.tree` 仍计入 `node_modules`，安装一侧排除它。HLD v1.26 与 36c 0.26 写的是一般规则“候选与安装两侧都排除顶层的 `node_modules`、`.in_use/`、`.orphaned_at`”，这条路线没有落实。从本地目录安装的插件带 `node_modules`（含 MCP 服务的 JS 插件在开发中很常见）恰是 4d“从来源安装”的典型对象。
- **失败场景**（E3、E3b，`claude-plugin-sources` 的测试世界；Claude 替身按 HLD 9.3 V8 复制整个目录）：
  - E3：来源 `codex-only`（Codex manifest 版本 2.0.0）带 `node_modules/dep/index.js`，经 SkillDock 安装（安装目录里有 `node_modules`）。随即检查：`blocked / VERSION_UNCHANGED`，“来源内容有变化，但版本仍是 2.0.0；Claude 只在版本变化时更新，请维护者递增版本。”，差异只有 `node_modules/dep/index.js`；
  - E3b：没有 manifest 的来源 `bare-tools`（版本 `unknown`）带 `node_modules`：安装后检查即 `available`，应用 → `READBACK_CONTENT_CHANGED`，再检查仍 `available` 且 `canAutoApply: false`，循环；
  - 来源 `node_modules` 超过 3000 个文件时，4d 安装本身就会 `SOURCE_LIMIT`（既有限制，不在本轮范围）。
- **建议修法与取舍**：这条路线的候选会被移进 marketplace 副本、再由 Claude 复制，**不能**像 `stageCandidate` 那样不复制 `node_modules`（否则更新后插件缺依赖）。建议保留完整候选，另算一份排除 `INSTALL_SKIP` 的比较树：检查结果、差异列表、`preview.diff`、读回与成功后的基线都用比较树，`assertPreview` 与原始来源再核对仍用完整树。约 8 处小改动（试验 F3：E3、E3b 安装后即 `current`；`claude-plugin-updates`、`claude-plugin-sources`、`claude-updates` 49/49 通过）。补用例：生成 marketplace 的来源带 `node_modules` 时安装后为 `current`，更新后读回一致且副本中仍有依赖。

### PH5R2-P3-01 `releaseCodexPins` 只释放与被替换目录相同的固定：指向 Claude 技能目录插件内部的 Codex 链接在插件更新后失效

- **位置**：`server/service.mjs:523-526`（`pin.real === real`）；`server/paths.mjs:47-59`（Codex 扫描对经链接的技能目录按其真实路径与 inode 固定，不一致即 `SKILL_LINK_CHANGED`）。
- **问题与场景**（E1，`claude-updates` 的测试世界）：Claude 技能目录插件 `tidy`（已记来源）含 `skills/tidy-up`；Codex 的 `~/.codex/skills/tidy-up` 链接到它（跨侧技能，5c2 的对象）。从更新页更新 `tidy` 后：Codex 的 1 版与多 Agent 快照都不再列出 `tidy-up`，诊断为“技能链接或其目标在运行中发生变化，请重新打开 SkillDock 后核实。”；从操作记录恢复 `tidy` 后又出现（旧目录移回、inode 相同）。被替换的是插件目录，固定的真实路径是其子目录，相等比较匹配不到。
- **影响**：只影响显示与诊断，重启服务后恢复；若 `tidy-up` 是 Codex 计划目标，按代码推断到重启前为 `TARGET_MISSING`（其绑定的 inode 已变，重启后同样需要重新保存，这一点与是否释放固定无关）。条件较窄，列 P3。
- **建议**：按包含关系释放：`inside(real, pin.real)`（1 行；`inside` 已含相等）。试验 F1：E1 中更新后仍列出、无诊断，相关测试 83/83 通过。补用例：Codex 链接到 Claude 技能目录插件内部，插件更新后 Codex 一侧仍列出。

### PH5R2-P3-02 `adoptDisabled` 也为已在计划中、尚无记录的目标补来源：0.10.x 继承的跨侧目标被 2 版“原样关闭”后变成待确认

- **位置**：`server/scheduler.mjs:43-47`。补来源的范围是关闭记录中的全部目标，而不只是本次请求**新增**的目标。从 0.10.x 迁移来的计划没有 `targetMeta`（36a 第 8 节“其余内容 0.11 自定”），0.11 第一次保存之前这些目标都没有记录。
- **场景**（E4，`shared-skills` 的跨侧世界；以 1 版保存后删除 `targetMeta` 模拟迁移来的计划）：
  - 对照：2 版原样保存（启用）→ 不问、不显示确认状态（`configureTransaction` 把无记录的原样目标视为 1 版，符合 36c）；
  - 2 版原样**关闭** → 确认状态变为 `pending`；之后 2 版原样启用 → `CONFIRMATION_REQUIRED`；1 版启用 → 仍 `pending`，到期运行 `available / CONFIRMATION_REQUIRED`，不再自动应用。
- **依据**：36c 第 6 节“从 0.10.x 继承未改的目标保持 0.10.2 行为”“原样重新提交的目标保持原状态”；同一份计划“原样启用”与“原样关闭”得到不同的来源。
- **严重度**：方向保守（多问一次确认、0.10.x 界面下改为只检查），且要同时满足“迁移来的计划、跨侧目标、Claude 已启用管理、0.11 的第一个计划操作是关闭”，列 P3。
- **建议**：只给关闭记录中**原计划没有**的目标补来源（并入前取原目标集合，约 2 行）。试验 F4：E4 各步与对照一致（不显示确认、照常更新），`shared-skills`、`background-updates`、`backend-updates`、`state-model` 60/60 通过（含 49 P1-01 的用例）。补用例即 E4。

### PH5R2-P3-03 代号 2 的快速拒绝之后，恢复出的实例仍按退避周期发起任务：每次短暂暂停写操作，并把失败说明覆盖成“重启启动器退出（1）。”

- **位置**：`server/self-update.mjs:86-96`（代号 2 下 `newerTarget` 仍指向失败的版本，发起前不看失败记录，`pauseForRestart` 后写入新任务）、`:28`、`:126-136`（启动器以 1 退出时任务记为失败，`message` 为“重启启动器退出（1）。”）；`src/App.tsx:806-808`（`preparing` 时显示“正在准备新版 SkillDock…”并暂停界面写操作，`failed` 时显示“新版未能启动，请重新打开 SkillDock 后重试。”与该 `message`）。
- **场景**（E5，`self-update` 的夹具配真实 worker：目标的 `launch.sh` → `bootstrap.mjs` → `planLaunch`；`restart.json` 原为切换失败时写下的“……；已恢复上一运行版本。”）：第一次 `tick` 与 61 秒后的第二次 `tick` 各发起一次任务，各暂停一次（`pauseForRestart` 2 次）；启动器都被 `SWITCH_FAILED_BEFORE` 快速拒绝（文字只在 `server.log`）；`restart.json` 两次都被改写为“重启启动器退出（1）。”，原有说明与 `restored` 标记消失。此后按 1、2、4…30 分钟一直重复。
- **影响**：50 P2-01 的核心问题（反复停止—恢复）已解决；剩下的是体验：界面在每个退避点闪一次“正在准备新版”，常驻的失败提示失去真实原因。列 P3。
- **建议**：协调器在发起前读失败记录，与目标（应用目录 + 版本）相同就不发起、不计失败（约 2 行，`repeatedFailure` 已有）；启动器一侧的拒绝保留为兜底。试验 F5：E5 中两次 `tick` 都不暂停、不发起，`restart.json` 保留原说明，`self-update` 用例 12/12 通过。取舍：多一次每秒的小文件读取；逻辑在协调器与启动器各有一处判断，但都调用同一个函数。

### PH5R2-P3-04 修复项的测试缺口；`37` 中“补齐评审列出的用例”偏宽

本轮 75 项变异中 44 项被定向测试发现；其余 31 项全量下仍存活（第 6.2 节）。值得补的：

| 组 | 变异 | 缺的用例 |
|----|------|----------|
| 建议补（优先） | N28 | 代号 2 下切换失败、恢复旧实例后写下失败记录（50 P2-01 的核心一半；现有用例只手写失败记录再测拒绝） |
| 建议补（优先） | N14、N15 | 来源带 `node_modules` 的本地插件真正应用一次（现有用例只检查为 `current`；回退任一项都会让应用 `SOURCE_CHANGED`/`STAGED_CHANGED`） |
| 建议补（优先） | N21 | 随 PH5R2-P2-01：换仓库或包时 `TARGET_BINDING_CHANGED`，只改版本时照常更新 |
| 建议补 | N11 | `unknown` 版本读回不一致后，以实际装入的内容为基线、再检查不报 `LOCAL_CHANGES`（现有用例版本已变，变异无差别） |
| 建议补 | N34 | 原生入口处于插件缓存、存在更高版本时重算门槛仍给出一键更新（现有“原生真实路径”用例不经过转交） |
| 建议补 | N32、N33 | 服务与门槛两处 `list()` 对项目目录不存在的安装标 `missing`（现有用例直接给定 `missing`） |
| 建议补 | A-M05、A-M08、A-M09、A-M11、A-M15、A-M16、A-M19、A-M20、A-M27、A-M37、A-M38、A-M39、A-M42 | 48 P3-09 列出的应用前核对（条目、npm、压缩包）、`unknown` 副本的中止与轮换、远端 marketplace 刷新、按项目匹配安装、压缩包摘要、技能目录插件的修订号与两项限制、绑定含指纹 |
| 建议补 | B-M14 | 1 版来源的跨侧目标在“开始自动应用”时不要求确认（现有标注 M14 的用例中 `starts` 为假，没有走到） |
| 可补 | B-M10、B-M23、N06、N08、N23 | 1 版请求的暂停目标仍按 0.10.2 校验、1 版保存保留的目标不阻断启用、标签与分支同名、签名取不到时保留绑定、组织只强制启用的个人安装可更新 |
| 可不补 | A-M17、A-M26、C-M25、N24 | 被列表层遮住、成为纵深防御、近似等价，或离线不可测 |

`37` 进度行中 48、50 两段都写“补齐评审列出的用例”，49 段列出了具体用例（基本属实，但 M14 的标注不实）。建议改为具体列出已补的项，或补齐上表“建议补”的用例后再这样写。

### PH5R2-P3-05 几处小的加固与文字

1. **压缩包主机过滤**（`claude-plugin-updates.mjs:111`）：`/^(localhost|…)/` 只锚定开头，`localhost.example.com`、`localhostcdn.net` 这类正常主机被拒并提示“压缩包来源只接受 https 地址。”（与原因不符）；IPv4 映射的 `[::ffff:7f00:1]` 放行。影响小（marketplace 由用户自己添加，Claude 自己也会取这个地址）。建议锚定为 `localhost\.?$`、补 `::ffff:` 前缀，拒绝本机时给出单独的说明；不建议为此引入 DNS 解析检查。
2. **还原失败的说明**（`service.mjs:864-867`）：还原中只有最后一步改回 `marketplace.json` 失败时，`previous` 已移回原处，消息仍说“更新前的插件目录保留在 previous”。极少见；可按失败的步骤分别说明。
3. **npm 版本范围**（`claude-plugin-updates.mjs:102`）：取 `npm view` 数组的最后一项；`npm pack` 在 `latest` 标签满足范围时取它而不一定取最高版本，两者不同（`latest` 低于范围内最高版本）时应用前核对每次 `SOURCE_CHANGED`。离线不可测，边角；可在核对时直接比较 `npm pack` 实际得到的版本与摘要。
4. **启动器快速拒绝的记录**：`SWITCH_FAILED_BEFORE`（退出 1）与代号 1 的 `MIGRATION_FAILED_BEFORE`（退出 4）都只在 HLD 中以机制描述，未写错误码与退出码；0.11 协调器只区分 0 与非 0，不影响行为，建议在 HLD v1.27 的 P2-01 一行补一句。

## 5. 文档判定

| 文档与位置 | 判定 | 说明 |
|-----------|------|------|
| HLD 状态行与版本 | 一致 | v1.27；状态行写明 v1.25～v1.27 待增量复核 |
| HLD v1.25 表（5c） | 一致 | 版本取值的更正、副本移动与还原失败、Git 解析三行与实现一致；修订的是 v1.21 的说法，在新表中更正而非改写旧行 |
| HLD v1.26 表（5a、5b） | 基本一致 | “指纹的排除口径”写成一般规则，生成 marketplace 路线未落实（PH5R2-P2-02）；“计划绑定”一行写“绑定安装身份与条目的来源；Claude 自己更新它不算新对象，换来源仍须重新选择”，而实现把条目中的版本也算作“来源”（PH5R2-P2-01）；其余各行与实现一致。正文 3.3 的未实现句子在表中如实标注，6.2 时序图的一处改动在表中有记录 |
| HLD v1.27 表（5d） | 基本一致 | 与实现一致；P2-01 一行的“自动切换会停下”指不再停止—恢复，协调器仍按退避发起任务（PH5R2-P3-03）；5d2b 说法在表中更正 |
| 契约索引 `36` 0.26～0.28 | 一致 | 三行修订记录与 36c 的改动对应；0.28 说明不改 36b 的理由成立 |
| 36c 第 6 节（计划确认、冲突、Claude 插件路线、生成 marketplace） | 基本一致 | 关闭时保存的规则、“原样”只看目标身份、Claude 未启用时冲突不跳过、1 版例外、预览代替修订号、`READBACK_CONTENT_CHANGED` 与以实际装入内容为记录都与实现一致；“两侧都排除 `node_modules`”在生成 marketplace 路线不成立（PH5R2-P2-02）；“计划中这类目标绑定安装身份与条目的来源”同 PH5R2-P2-01；0.10.x 继承目标被原样关闭的余量见 PH5R2-P3-02 |
| 36c 7.2 | 一致 | 逐项读回、跳过项目缺失、超时原样返回、操作记录范围、错误码列表 |
| 36c 第 8、9 节 | 一致 | 只复用已登记的错误码（`READBACK_CONTENT_CHANGED`、`PROJECT_PATH_MISSING`、`CLI_TIMEOUT`）；第 9 节未变 |
| 36a、36b | 未改，一致 | 失败记录沿用 36b 7.4 的文件，0.10.x 不读；`disabled.json` 多出的 `origin` 字段只由 0.11 读取 |
| `37` 三段“评审处理”与阶段 6 | 基本一致 | 所述改动均已实现；“补齐评审列出的用例”偏宽（PH5R2-P3-04）；阶段 6 的升版本要求写得清楚 |
| `SKILL.md` | 一致 | 退出码 4 一段补逐侧处理 |
| 修订是否都有记录 | 是 | HLD 正文只有版本、状态与一处时序图改动（有记录）；48、49、50 三份报告各随一个提交入库，此后未再改动 |

## 6. 已运行的命令与结果

所有测试、实验与变异都在 `sandbox-exec -f …/scratchpad/verify/phase2-review/hermetic.sb` 下运行（拒绝外网与本机 Codex/Claude 可执行文件），`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME` 指向 scratchpad 中的临时目录；E5 另设 `SKILLDOCK_NODE_BIN`（本机 nvm 的 node）、`SKILLDOCK_CODEX_APP_DIR`、`SKILLDOCK_CODEX_BIN`、`SKILLDOCK_CLAUDE_BIN`（指向不存在的路径）。下文 `$S` 指 `/private/tmp/claude-501/-Users-kailaichen-Downloads-source-code-testany-platform-backend/0607cd6e-9b0e-4e21-8549-01942a916e20/scratchpad`。

### 6.1 基线

| 命令 | 位置 | 结果 |
|------|------|------|
| `git archive cd94b88 plugins/skilldock/skills/skill-manager \| tar -x -C $S/review-5r2`，软链接 `node_modules` | 主工作区（只读）→ scratchpad | 完成 |
| `npm test` | 导出副本 | 539 项：483 通过、56 跳过（兼容矩阵无 Git 历史）、0 失败 |
| `git clone --no-local --no-checkout` 后检出 `cd94b88`（删除 remote），`npm test` | 只读克隆 | **539/539 通过**，0 跳过 |
| `tsc --noEmit` | 导出副本 | 通过 |
| `native/build.json` 哈希核对（`node -e`） | 导出副本 | 73 项输入与产物全部一致 |
| 新增服务端消息译文核对（`review-exp/i18n-new*.mjs`，生产翻译器） | 导出副本 | 本轮新增或改写的 24 条消息（含插值与多行组合）中，22 条英、日整句齐全；无译文的两条是启动器的快速拒绝文字（本轮的 `SWITCH_FAILED_BEFORE` 与代号 1 既有的 `MIGRATION_FAILED_BEFORE`），只写入 `server.log`。各用例文件自带的“every message seen above”断言也全部通过 |
| `npm test` | 变异副本（完整 skill-manager） | 483 通过、56 跳过、0 失败，与导出副本一致 |
| `git diff …\| shasum -a 256`、`git show cd94b88:<事实源> \| shasum -a 256` | 主工作区（只读） | 见第 1 节 |

### 6.2 变异

脚本 `$S/review-5r2-logs/run-mut.mjs` 与 `mutations.mjs`：每项变异要求查找串恰好出现一次，就地替换、运行定向测试文件、随即写回原文；定向存活的再跑全量（除 `native-protocol`、`source-bundle`、`compat-matrix`）。N28 另在只读克隆中连同兼容矩阵、`launcher`、`migration` 运行（96/96 通过，即存活），随后 `git checkout` 还原。结束时变异副本与 `git archive cd94b88` 逐文件一致。

| 编号 | 去掉的保护 | 结果 |
|------|-----------|------|
| A-M02 | 应用前安装目录与版本核对 | 被发现 |
| A-M04 | `PREVIEW_MISMATCH` | 被发现 |
| A-M05 | 条目比较 | **存活** |
| A-M08 | npm 再核对 | **存活** |
| A-M09 | 压缩包再核对 | **存活** |
| A-M11 | `unknown` 复制失败即中止 | **存活** |
| A-M15 | 读回不一致保留基准副本 | **存活** |
| A-M16 | 读回一致后删除基准副本 | **存活** |
| A-M17 | 应用路径的项目目录缺失检查 | 存活（被列表层遮住） |
| A-M19 | 远端 marketplace 刷新 | **存活** |
| A-M20 | 按项目匹配安装 | **存活** |
| A-M24 | 安装指纹排除 `node_modules` | 被发现 |
| A-M26 | 相对路径的字面边界 | 存活（真实路径判断之后为纵深防御） |
| A-M27 | 压缩包声明摘要核对 | **存活** |
| A-M30 | Claude 未安装时暂停 | 被发现 |
| A-M31 | Claude 无法确认时暂停 | 被发现 |
| A-M35 | 侧别取自 `target.agent` | 被发现 |
| A-M37 | 技能目录插件的修订号 | **存活** |
| A-M38 | 技能目录插件不含 Git 工作树 | **存活** |
| A-M39 | 技能目录插件限两个根 | **存活** |
| A-M42 | 技能目录插件绑定含指纹 | **存活** |
| B-M2 | 命令行失败时还原副本与条目 | 被发现 |
| B-M7 | “开始自动应用”要求确认 | 被发现 |
| B-M8 | 手动批量的扣留看请求版本 | 被发现 |
| B-M9 | 计划的扣留看另一侧是否启用 | 被发现 |
| B-M10 | 暂停豁免只给 2 版请求 | **存活** |
| B-M14 | 确认范围只算 2 版来源 | **存活** |
| B-M23 | 1 版保存保留的目标豁免检查 | **存活** |
| C-M1 | 只在版本严格更高时切换 | 被发现 |
| C-M8 | 准备重启时不补登记 | 被发现 |
| C-M9 | 服务一键更新持 Claude 锁 | 被发现 |
| C-M14 | `canUpdate` 看“无法确认” | 被发现 |
| C-M17 | 门槛更新持 Codex 锁 | 被发现 |
| C-M18 | 门槛更新持 Claude 锁 | 被发现 |
| C-M19 | 门槛更新排除托管范围 | 被发现 |
| C-M20 | 更新后重判门槛 | 被发现 |
| C-M25 | 重算门槛时清空同意标志 | 存活（近似等价） |
| N01 | `adoptDisabled` 不用记录中的来源 | 被发现 |
| N02 | 关闭记录不写 `origin` | 被发现 |
| N03 | “原样”回到绑定身份比较 | 被发现 |
| N04 | 还原失败不保留暂存区 | 被发现 |
| N05 | `resolve` 回到取第一行 | 被发现 |
| N06 | 分支先于标签 | **存活** |
| N07 | 不释放 Codex 链接固定 | 被发现 |
| N08 | `afterOwnUpdate` 不兜住签名失败 | **存活** |
| N09 | 不做“共用 → 只属于 Claude”迁移 | 被发现 |
| N10 | 内容等于来源时不更新基线 | 被发现 |
| N11 | 读回不一致时不以实际内容为基线 | **存活** |
| N12 | 检查时先判本地修改（旧顺序） | 被发现 |
| N13 | 本地来源暂存不排除 `node_modules` | 被发现 |
| N14 | 应用前再核对不排除 | **存活** |
| N15 | `copySkill` 复制时不排除 | **存活** |
| N16 | `preview.diff` 不接受 Claude 插件预览 | 被发现 |
| N17 | 列表不标项目缺失 | 被发现 |
| N18 | 列表不标 `command`/`helper`/无法识别 | 被发现 |
| N19 | 计划不暂停项目缺失的目标 | 被发现 |
| N20 | 绑定回到版本目录 | 被发现 |
| N21 | 绑定不含条目来源 | **存活** |
| N22 | 读回错误码回到 `READBACK_FAILED` | 被发现 |
| N23 | 强制启用也当托管 | **存活** |
| N24 | `npm view` 数组不取最后一项 | 存活（离线不可测） |
| N25 | 不拒绝本机主机 | 被发现 |
| N26 | 不边读边计数 | 被发现 |
| N27 | 检查结果不说明原地覆盖 | 被发现 |
| N28 | 代号 2 恢复时不写失败记录 | **存活**（含兼容矩阵） |
| N29 | 代号 2 不快速拒绝 | 被发现 |
| N30 | 一键更新不跳过 `missing` | 被发现 |
| N31 | 超时包装成失败 | 被发现 |
| N32 | 门槛 `list()` 不算 `missing` | **存活** |
| N33 | 服务 `list()` 不算 `missing` | **存活** |
| N34 | 重算门槛时不跳过转交 | **存活** |
| N35 | 同意标志不在 `LAUNCH_ONLY` | 被发现 |
| N36 | 原生普通启动不置空同意标志 | 被发现 |
| N37 | 缓存中消失的来源不报“无法确认” | 被发现 |
| N38 | 读回回到比较最高版本 | 被发现 |

合计：75 项中 44 项被发现，31 项存活；其中 A-M17、A-M26、C-M25、N24 可不补，其余见 PH5R2-P3-04。

### 6.3 实验

实验脚本在导出副本的 `review-exp/`（不匹配 `npm test` 的 glob），测试世界取自对应用例文件的世界部分，命令行、Claude 清单与联网获取都是替身；Git 用临时目录中的本地仓库。

| 编号 | 内容 | 结果 |
|------|------|------|
| E1 | Codex 链接到 Claude 技能目录插件 `tidy` 内部的 `skills/tidy-up`，从更新页更新 `tidy`，再恢复 | 更新后 Codex 两种快照都不再列出、诊断 `SKILL_LINK_CHANGED`；恢复后重新出现（PH5R2-P3-01） |
| E2a | npm 条目固定版本，计划自动应用，维护者把条目改到 1.1.0 | `cd94b88`：两轮 `TARGET_BINDING_CHANGED`，仍为 1.0.0，手动检查 `available`；`8809862`：`updated` → `current`（PH5R2-P2-01） |
| E2b | 压缩包条目换为新版本地址 | `cd94b88`：`TARGET_BINDING_CHANGED`；`8809862`：`updated` |
| E2c | 相对路径条目（对照） | 两版都 `updated` |
| E3 | 生成 marketplace，来源（版本 2.0.0）带 `node_modules`，安装后检查 | `blocked / VERSION_UNCHANGED`，差异只有 `node_modules/dep/index.js`（PH5R2-P2-02） |
| E3b | 同上，来源无版本 | 安装后即 `available`；应用 `READBACK_CONTENT_CHANGED`；再检查 `available`、`canAutoApply: false` |
| E4 | 0.10.x 继承的跨侧目标（无 `targetMeta`）：2 版原样启用 / 原样关闭，再启用，再运行 | 原样启用不显示确认；原样关闭后 `pending`，2 版启用 `CONFIRMATION_REQUIRED`，1 版启用后运行只检查（PH5R2-P3-02） |
| E5 | 代号 2，切换到 2.5.0 失败已恢复（失败记录与 `restart.json` 已写），恢复出的进程配真实 worker 两次 `tick` | 两次都被 `SWITCH_FAILED_BEFORE` 快速拒绝、实例不变；两次 `pauseForRestart`；`restart.json` 两次被改写为“重启启动器退出（1）。”（PH5R2-P3-03） |

### 6.4 修法试验（另一副本 `review-5r2-fix/`，不是对被审代码的修改）

| 试验 | 改动 | 结果 |
|------|------|------|
| F1（PH5R2-P3-01） | `releaseCodexPins` 改为 `inside(real, pin.real)` | E1：更新后仍列出、无诊断 |
| F2（PH5R2-P2-01） | 绑定中的 `entry` 去掉 `ref`/`sha`、npm 版本与压缩包摘要，压缩包地址只取 origin | E2a：`updated` → `current`；E2b：`updated`；E2c 不变 |
| F1+F2 回归 | `claude-plugin-updates`、`claude-updates`、`shared-skills`、`background-updates`、`backend-updates`、`claude-skill-files` | 83/83 通过 |
| F3（PH5R2-P2-02） | 生成 marketplace 路线另算排除 `INSTALL_SKIP` 的比较树，用于检查、差异、读回与基线 | E3、E3b：安装后即 `current`；`claude-plugin-updates`、`claude-plugin-sources`、`claude-updates` 49/49 通过 |
| F4（PH5R2-P3-02） | `adoptDisabled` 只给原计划没有的目标补来源 | E4 各步与“原样启用”一致；`shared-skills`、`background-updates`、`backend-updates`、`state-model` 60/60 通过（含 49 P1-01 用例） |
| F5（PH5R2-P3-03） | 协调器发起前用 `repeatedFailure` 核对目标 | E5：不暂停、不发起，`restart.json` 保留原说明；`self-update` 12/12 通过 |

试验改动只为验证思路，不是可直接采用的补丁。

## 7. 未覆盖的范围与剩余风险

- **真实命令行**：按委托未运行真实 Claude、Codex 命令行与 `launchctl`，未联网。远端 marketplace 刷新后条目变化导致的“检查期间身份变化”（PH5R2-P2-01 的远端变体）只按代码推断；npm `view` 与 `pack` 在版本范围下的选择（PH5R2-P3-05 第 3 条）、压缩包重定向在真实网络中的表现未实测。建议阶段 5 的 UAT 中补一次固定 `sha` 的 Git 来源插件在计划中的发布与自动更新。
- **列表依据本机 marketplace 副本**：远端条目已从不代为更新的来源改为可更新来源、而副本未刷新时，该插件在列表中不可检查，SkillDock 也不会去刷新它，要等 Claude 自己刷新 marketplace。影响小，未列为发现。
- **有操作进行时关闭计划的分支**（`service.mjs:2218`）：按代码推断与主路径一致，未单独构造。
- **代号 2 的完整切换链路**：E5 用真实启动器验证了快速拒绝，但“新版在停止旧实例之后才失败、恢复旧实例”的前半段只由代码阅读与 50 的 E1 支撑，N28 也说明没有用例。
- **0.10.x 界面与原生界面**：只按服务端行为核对，未运行 0.10.x 冻结界面，未在原生宿主中查看门槛按钮与运行状态提示。
- **发布前事项**：`package.json` 仍为 0.10.3，`CURRENT_GENERATION_MINIMUM` 为 0.11.0；`37` 阶段 6 已写明须在真实数据 UAT 之前升版本，仍只靠人工。

## 8. 操作披露与结束状态

- **没有做的事**：没有向 `127.0.0.1:4771`、`127.0.0.1:4781` 发请求（E5 夹具的启动记录中写有 `http://127.0.0.1:4771`，只作为 `PORT` 环境变量传给目标启动器；启动器在 `planLaunch` 中只读文件即被拒绝，没有进入探测或启动）；没有运行真实的 `codex`、`claude` 命令行或 `launchctl`；没有联网或下载；没有读写真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`；没有打印整个配置文件；报告中没有密钥。
- **主工作区**：只运行了只读 git 命令（`log`、`show`、`diff`、`status`、`rev-parse`、`ls-tree`、`archive`）与一次 `git clone --no-local`（从主仓库读）；唯一的写入是本报告（未 `git add`、未提交、未推送）。
- **scratchpad 中**：导出副本、只读克隆（已删除 remote，N28 试验后 `git checkout` 还原，结束时只有 `node_modules` 软链接未跟踪）、变异副本（结束时与 `cd94b88` 一致）、修法试验副本、`8809862` 导出、实验脚本与日志（`review-5r2-logs/`）。
