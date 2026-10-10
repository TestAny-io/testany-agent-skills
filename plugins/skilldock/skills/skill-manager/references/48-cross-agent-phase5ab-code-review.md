# 代码评审报告：阶段 5a、5b（Claude 一侧的更新项与计划目标、从 marketplace 安装的 Claude 插件的检查与更新；`7a96bee`、`f2af004`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 范围 | `git diff 549511a f2af004 -- plugins`：22 个文件，增 1210 行、删 67 行，diff sha256 前缀 `f462a586d7e2`。`7a96bee`（5a）15 个文件 +445/−45；`f2af004`（5b）16 个文件 +781/−38。含 `native/ui.html`、`native/build.json` 构建产物与 `35`、`36`、`36c`、`37` 四份文档 |
| Candidate | `f2af004`（tree `3ce8a4f3615a…`）；中间提交 `7a96bee`（tree `fccfd1dbb314…`）；基线 `549511a`（tree `f0686c9483d0…`）；分支 `feature/skilldock-0.11-cross-agent`（本地，未推送） |
| 事实源（均取 `f2af004` 中的版本） | PRD `34`（sha256 `e061ec258421…`，范围内未改）；HLD `35` v1.20（`0efa3b478891…`）3.3、3.3A、3.6、3.8、6.2、9.3 与末尾“阶段 5 编码前实测”“阶段 5b 实现中的有限修订”；契约索引 `36` 0.21（`44b3bf490412…`）；`36c` 0.20（`d41677881d03…`）第 6 节、7.1、7.3、第 8 节；实施计划 `37`（`78f38ee7ad4d…`）阶段 5 拆分表与进度行中 5a、5b 两段；`41`（`a2843cc0153f…`，范围内未改）。格式参考 `47` |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-10 |
| 工作区绑定 | 开始时主工作区 HEAD 为 `d027352`（5c1，不在本轮范围），另有另一会话未提交的 5c2 改动；本轮不依赖主工作区。全部测试、实验与变异都在 `git archive f2af004` 的导出副本中进行（评审目录 `…/scratchpad/review-5ab/`）；兼容矩阵用例需要 Git 历史，另在同一评审目录中从本地仓库克隆并检出 `f2af004` 跑过一次完整套件（只读主仓库对象，未联网）。对主工作区的唯一写入是本报告 |

## 2. 结论

**CHANGES REQUESTED**

- P0：0
- P1：2（PH5AB-P1-01、P1-02）
- P2：5（PH5AB-P2-01～05）
- P3：9（PH5AB-P3-01～09）

要点：

- **分工与契约主体一致**：Claude 更新项与 Codex 项的分工与 36c 第 6 节相符——只属于 Claude 的技能与技能目录插件经文件事务（`skill-source`、`plugin-files`），从 marketplace 安装的插件经命令行（`claude-plugin`），SkillDock 生成的 marketplace 留给 5c；Claude 主导的共用技能只以 Claude 一侧列出、Codex 一侧让位；`update.check`、`update.apply` 的侧别取自 `target.agent`；Claude 只读或无法确认时更新项不可检查、请求返回 `AGENT_READ_ONLY`/`AGENT_UNCONFIRMED`；Codex 目标的键与持久化形状保持 0.10.2（`agent: "codex"` 被去掉）。5b 的 Claude 锁、版本预测与 `VERSION_UNCHANGED`、应用前的五类核对、`unknown` 版本的两份副本、读回与暂停自动应用、project/local 的工作目录、带作用域的 `plugin update` 白名单都已实现；翻译完整（第 4 节）。
- **两项 P1**：
  - 5a 让“由 Claude 主导的共用技能”可以从更新页与计划更新。这类技能（Codex 经链接看到 Claude 的真实目录）一经 SkillDock 更新，Codex 扫描器在进程内固定的链接身份即失效：技能在 Codex 一侧消失、对象 ID 改变；计划绑定它时，更新已经落地，请求却返回 `NOT_FOUND`（“更新目标不存在。”），计划记失败并退避，下一轮 `TARGET_MISSING`；重启服务后也因绑定未刷新而 `TARGET_BINDING_CHANGED`，只能重新保存计划（P1-01）；
  - 版本为 `unknown` 的插件（HLD v1.20 已扩展到本地目录 marketplace 中没有声明版本的插件），本地修改基线只在版本变化时重置：Claude 自己原地更新一次，或 SkillDock 的一次 `READBACK_FAILED` 之后，每次检查都是 `LOCAL_CHANGES`，即使安装内容已与来源完全一致；卸载重装也清不掉，界面没有出路（P1-02）。
- **P2**：来源中带 `node_modules` 时候选与安装的指纹口径不一（P2-01）；Git 来源 ref 为附注标签时永远 `SOURCE_CHANGED`（P2-02）；更新页查看 Claude 插件预览的逐文件差异返回“预览已过期”，PRD REQ-SDX-004 的验收未满足（P2-03）；command 来源、`headersHelper` 条目与项目路径缺失的安装在列表中仍可检查、可加入计划（PRD 验收与 `37` 5a 明列，P2-04）；计划中版本化 Claude 插件的绑定落在版本目录上，Claude 自己更新一次后该目标每轮都被跳过（P2-05）。
- **测试**：定向用例覆盖了主路径，但第 5.2 节 44 项去保护变异中有 26 项未被完整套件发现（其中 4 项属纵深防御或校验小项），包括应用前核对中的四项、`unknown` 基准副本的轮换、复制失败即中止、项目目录缺失、Claude 未安装或无法确认时的计划暂停等（P3-09）。`37` 中“10 项变异 9 项被发现”的说法偏宽。
- **未见回归**：导出副本完整套件 494 项（439 通过、55 项兼容矩阵因无 Git 历史跳过、0 失败），检出 `f2af004` 的本地克隆中 494/494 通过；类型检查通过；`native/build.json` 53 个输入、4 个产物哈希一致。

对阶段推进的影响：按 `37`“独立代码评审没有 P0/P1”的完成标志，5a、5b 目前不满足。建议先处理两项 P1 与 P2-01～P2-04（都是局部修改）；P2-05 可与 5c 的计划工作一起做；P3 在阶段 5 的 UAT 之前择要处理。

本结论不授予推送、合并或发布权限。

## 3. 发现

行号均指 `f2af004` 导出副本中 `plugins/skilldock/skills/skill-manager/assets/app/` 下的文件。实验编号见第 5.3 节，变异编号见第 5.2 节。

### PH5AB-P1-01 Claude 主导的共用技能经更新页或计划更新后，Codex 一侧的链接固定失效：技能“变成”只属于 Claude；计划绑定着它时更新已落地却报 `NOT_FOUND`，之后丢失目标

- **位置**：
  - `server/claude-updates.mjs:54`：Claude 一侧 `canUpdate` 为真的共用技能列为 Claude 更新项，`server/service.mjs:284-285` 让 Codex 项让位（5a 新增）；
  - `server/paths.mjs:58-60`：Codex 扫描器把经链接发现的技能目录的身份（真实路径、dev/ino）固定在进程内的 `env.skillLinks`，之后不一致即 `SKILL_LINK_CHANGED`，扫描时跳过该技能（0.10.2 的防护）；
  - `server/service.mjs:514`：Claude 一侧文件事务的 `afterRestore: () => {}`，更新与恢复都不释放 Codex 的固定（Codex 一侧在 `:479` 恢复后会 `env.skillLinks.delete(...)`）；
  - `server/scheduler.mjs:167-168`：`afterOwnUpdate` 在绑定存在时重算签名，签名找不到目标就抛 `NOT_FOUND`；`server/service.mjs:1992` 没有兜住，整个 `update.apply` 以失败返回；
  - `server/service.mjs:1733-1741`：`migrateTarget` 只处理“只属于 Claude → 共用”，不处理反方向（另见 P3-03）。
- **问题**：文件事务替换目录后真实路径不变，inode 变了。Codex 经链接看到的这一项随即被判为“运行中发生变化”而不再列出，共用技能在快照中只剩 Claude 一侧，对象 ID 从 Codex 的 ID 变为 `claude:skill:…`。5a 之前这条路径只能经接口触发（技能卡片的 Claude 一侧更新，界面未开放，见 UI-09）；5a 把它放进更新页（这类技能唯一的界面入口）与后台计划，并让计划绑定在更新后重算签名，问题因此变为“已写入却报失败”。
- **失败场景**：Claude 个人技能 `notes` 关联了本地来源，`~/.codex/skills/notes` 是指向它的链接（两侧共用、Claude 主导）；计划含该目标且自动应用；来源出现新内容。
  1. 后台第一轮：文件已更新为新版，运行记录却是 `error / NOT_FOUND / 更新目标不存在。`，`failureCount` 记 1，5 分钟后按退避重跑；
  2. 第二轮：`skipped / TARGET_MISSING`；快照中 `notes` 只属于 Claude；Codex 诊断为“技能链接或其目标在运行中发生变化，请重新打开 SkillDock 后核实。”；
  3. 重启服务后：共用状态与原 ID 恢复，但绑定停留在更新前的指纹，下一轮 `TARGET_BINDING_CHANGED`，直到用户重新保存计划；
  4. 计划绑定着它时从更新页手动应用：返回 `NOT_FOUND`，而操作记录是 `skill.update` 成功、文件已是新版。没有计划时应用成功，但 Codex 一侧同样消失到重启为止。
- **证据**：E13b、E13c（更新后 Codex 的 1 版快照里没有 `notes`，链接仍在且解析正常，诊断如上）；E17（计划两轮的结果）；E17b（更新页）；E20（重启后）；E19（在 `549511a` 上经卡片接口做同样的 Claude 一侧更新，Codex 一侧同样消失——根因早于 5a，5a 使其可达并产生错误结果）。现有用例 `claude-updates.test.mjs` 第 4 项只验证了迁移后的一次 `current`，没有在共用之后再更新。
- **建议修法与取舍**：
  1. Claude 一侧的文件事务（更新与恢复）替换目录后，释放或改记 Codex 中指向该目录的链接固定（按真实路径匹配 `env.skillLinks` 中的项）。替换是 SkillDock 自己做的，改记为新身份不削弱 0.10.2 对外部换链接的防护；复用 Codex 一侧已有的做法，代码量很小。
  2. `afterOwnUpdate` 不应在写入完成后让请求失败：签名取不到时先按真实路径迁移（同 P3-03），仍取不到就保留原绑定并在结果中说明。
  3. 补用例：Claude 主导的共用技能在自动应用计划中更新后，本轮 `updated`、下一轮 `current`，Codex 一侧仍列出它，ID 不变。
  取舍：第 1 条是根治，第 2 条是兜底，都很局部；不建议用“更新这类技能后提示重启”之类的体验退让代替。

### PH5AB-P1-02 版本为 `unknown` 的插件：本地修改基线一旦与安装内容不一致，之后每次检查都是 `LOCAL_CHANGES`，没有出路

- **位置**：`server/service.mjs:741`（检查与应用都先过基线闸门，在暂存与比较候选之前）、`:750`（基线只在“没有基线或版本变了”时重写）、`:786-791`（`READBACK_FAILED` 时基线仍是更新前的指纹）；除成功应用（`:793`）外，没有任何代码更新或删除 `claudePluginBaselines`。
- **问题**：36c 的判定是“同一版本下安装内容变了即本地修改”。对 `unknown` 版本，版本号不携带信息：Claude 原地覆盖后版本仍是 `unknown`。HLD v1.20 把原地覆盖的范围扩大到本地目录 marketplace 中没有声明版本的插件，但基线规则没有随之调整。
- **失败场景**：
  1. 本地目录 marketplace 中有插件 `beta`（未声明版本）。SkillDock 检查一次（记下基线）；之后用户在 Claude 中执行 `/plugin update`（或由 Claude 自动更新），Claude 原地装入新内容 → SkillDock 此后每次检查都报“已安装的插件内容相对上次记录有本地修改，不能自动覆盖；请先核对。”，即使安装内容与来源完全相同；经 Claude 卸载并重装同一插件（ID、版本都不变）后仍是 `LOCAL_CHANGES`；
  2. SkillDock 自己的一次应用读回不一致（`READBACK_FAILED`，提示“请重新检查”）→ 用户清理后安装内容等于来源 → 重新检查仍是 `LOCAL_CHANGES`。“读回不一致后暂停自动应用，直到手动应用一次”的出路也走不通，因为检查本身就失败。
  这类插件在 SkillDock 中永久不可更新，提示与事实不符，唯一出路是手改数据目录中的注册表。
- **证据**：E3（Claude 原地更新后 `LOCAL_CHANGES`；卸载重装后仍是）；E2（读回不一致 → 清理到与来源一致 → `LOCAL_CHANGES`；副本目录中只剩 `baseline`）。M01 被用例发现，但用例只覆盖“版本化插件上真有本地修改”，没有覆盖误报。
- **建议修法与取舍**：
  1. 先暂存候选、再判本地修改：安装内容与候选一致时直接判 `current`，并把基线改为当前内容（内容等于来源，不存在要被覆盖的本地修改）；
  2. 读回不一致时，把基线记为 Claude 实际装入的内容（这是 SkillDock 自己触发、已如实报告的写入），而不是留在更新前；
  3. 对 `unknown` 版本，内容变化又不等于任何已知来源状态时才判本地修改，提示说明“可能是 Claude 自己更新过”，并给出出路（例如更新页的一次性“以当前内容为准”，或插件卸载时清掉基线）。
  取舍：1、2 两条代码量小，能消掉绝大多数误报；剩下的“Claude 更新后又被手改”与“只是 Claude 更新”无法区分，可以接受——Claude 自己的更新同样会覆盖它，`unknown` 插件更新前也已有副本。不建议简单去掉基线闸门，那会丢掉版本化插件上 MR-SDX-003 的保护。

### PH5AB-P2-01 来源中带 `node_modules`：候选指纹计入、安装指纹排除，内容相同也报“可更新”或“版本未变”，应用必然读回失败；文件多时检查直接失败

- **位置**：`server/claude-plugin-updates.mjs:14`（`INSTALL_SKIP` 只用于安装一侧）、`:123`、`:138`（候选用 `copySkill`，不排除任何顶层条目）；`server/service.mjs:738`（安装指纹排除 `node_modules`）、`:748`（比较）、`:783`（读回比较）；`server/files.mjs:93-103`（`copySkill` 先 `inspectTree`，超过 3000 个文件或 32 MB 即 `SOURCE_LIMIT`）。
- **问题**：HLD 9.3 V8：本地目录 marketplace 中的插件，Claude 复制整个目录（含被忽略与未跟踪文件），来源里的 `node_modules` 会进入安装目录；npm 包若捆绑依赖（`bundleDependencies`）同理。候选一侧计入、安装一侧不计入，二者永不相等。
- **失败场景**：
  - 未声明版本的本地插件 `beta`，来源目录里有 `node_modules/dep/index.js`，安装后没有任何改动 → 检查为 `available`（差异只有 `node_modules/dep/index.js` “新增”）→ 应用 → `READBACK_FAILED`，自动应用被暂停 → 再检查仍是 `available`，循环；
  - 声明了版本 `1.0.0` 的同类插件 → 检查为 `blocked / VERSION_UNCHANGED`，提示“请维护者递增版本”，误导维护者；
  - 来源的 `node_modules` 有 3001 个文件（真实项目很常见）→ 检查失败“技能内容超过 3000 个文件或链接。”。
- **证据**：E1a、E1b、E1c。M24（安装一侧也不排除）未被发现，说明用例没有任何一处让两侧的排除口径起作用。
- **建议修法与取舍**：候选的比较指纹（含预览中记下的 `tree`）用与安装一侧相同的排除集计算；暂存时跳过来源顶层的 `node_modules`（避开 3000 文件上限，也省空间）。取舍：来源 `node_modules` 内的变化不再被看作“有更新”——Claude 有锁文件时会自行装依赖，HLD 3.3A 本来就把它排除在指纹之外，可以接受；差异列表也不再被依赖文件淹没。

### PH5AB-P2-02 Git 来源的 ref 为附注标签时，应用前解析到的是标签对象而不是提交，每次应用都 `SOURCE_CHANGED`

- **位置**：`server/claude-plugin-updates.mjs:77-83`（`resolve`：`git ls-remote -- <url> <ref>` 取第一行第一个字段）；对照 `server/cli.mjs` 中 `checkoutGit` 用 `rev-parse <ref>^{commit}` 得到提交。
- **问题**：附注标签在 `ls-remote` 中返回标签对象的哈希（剥离后的 `refs/tags/<ref>^{}` 不匹配模式 `<ref>`）；预览记下的是提交哈希，二者永不相等。`ls-remote` 的模式按尾部匹配，同名分支与标签、`feature/<ref>` 之类也可能排在目标之前。
- **失败场景**：marketplace 条目 `{"source":"url","url":"…","ref":"v2"}`，`v2` 由 `git tag -a` 创建 → 检查为 `available`（带可预测版本）→ 应用返回“来源仓库在预览后有新的提交，请重新检查。”→ 重新检查、再应用，结果相同。
- **证据**：E4（两轮都是 `available` → `SOURCE_CHANGED`；`ls-remote` 只返回 `338d30… refs/tags/v2`，即标签对象）。
- **建议修法与取舍**：同时查询 `<ref>` 与 `<ref>^{}` 并优先取剥离后的提交，按 `refs/heads/<ref>`、`refs/tags/<ref>` 精确匹配；或在应用前对暂存区仓库 `fetch` 后用与预览相同的 `rev-parse` 规则解析。前者改动最小。

### PH5AB-P2-03 更新页查看 Claude 插件预览的逐文件差异返回“预览已过期”，PRD REQ-SDX-004 的验收未满足

- **位置**：`server/service.mjs:1936`（`preview.diff` 只接受 `update`、`source-link`、`plugin-update` 三种预览）；`src/UpdatesWorkspace.tsx:1225`（只要有 `previewId` 与 `changes` 就显示差异浏览器）。
- **问题**：5b 新增的预览种类是 `claude-plugin-update`，`preview.diff` 不认它，返回 `STALE_PREVIEW`；预览本身仍有效（随后应用成功）。PRD REQ-SDX-004 验收第 2 条：“应用前可查看逐文件差异”；`37` 5b 也写明“预览与差异”。
- **失败场景**：Claude 插件 `alpha` 检查为 `available`，更新页列出两个变化的文件；用户点开任一文件 → “预览已过期，请重新检查更新。”；重新检查后仍然如此。
- **证据**：E6。
- **建议修法与取舍**：`preview.diff` 支持 `claude-plugin-update`：变化前一侧取 `inspectTree(installPath, { skip: INSTALL_SKIP })`，边界取安装目录，并核对安装指纹仍等于预览基线（与应用前核对一致），约十几行。只在该路线下隐藏差异浏览器更省事，但仍不满足 PRD 验收，不推荐。

### PH5AB-P2-04 不代为更新的 Claude 插件在列表中仍可检查、可加入计划：command 来源与 `headersHelper` 条目只在检查后才显示原因，项目路径缺失没有处理

- **位置**：`server/claude-updates.mjs:41-42`（除 `@synced`、managed、生成的 marketplace 外，Claude 插件一律 `canCheck: true`）；`server/service.mjs:744`（command、helper、无法识别的来源只在检查时返回 `blocked / OWNER_MANAGED`）；`:727`（项目目录不在时检查与应用都报 `PROJECT_PATH_MISSING`）；`:1808-1814`（Claude 目标的暂停只看 Claude 是否安装、能否确认）。
- **问题**：
  - PRD REQ-SDX-004 验收第 5 条：command 来源、带 `headersHelper` 的条目等“显示原因与手动途径，不显示为可加入计划”；`37` 5a 也把“command 来源、带 headersHelper 的条目、`@synced`、managed 范围、项目路径缺失等”列为更新项上的原因（DEC-SDX-019）。
  - HLD 3.3：“项目路径不存在时该安装只读、计划目标暂停”。Claude 的安装记录中常留有已删除项目的 project/local 安装，这类条目在列表中可检查，“检查全部”每次报错。
- **失败场景**：
  - command 来源的插件 `cmd` 在列表中是 `unchecked`、可检查，`schedule.configure` 接受它；之后每轮都是 `skipped / OWNER_MANAGED`，整轮记为 `partial`；
  - local 范围安装所在的项目被删除 → 列表中仍可检查；计划中的它每轮记 `error / PROJECT_PATH_MISSING`，`failureCount` 增加，5 分钟后按退避重跑，而不是暂停。
- **证据**：E18、E7；M17（去掉项目目录缺失检查）未被发现。
- **建议修法与取舍**：生成更新项时（`claudeUpdateMaps`）读一次各 marketplace 本机副本中的 `marketplace.json`（只读本地文件，不联网），按 `pluginSource` 判出 command、helper、无法识别的来源，标为 `blocked / OWNER_MANAGED`、`canCheck: false`；`installation.readOnlyReason` 存在时标为 `blocked / PROJECT_PATH_MISSING`；`pausedTarget` 对这类 Claude 目标返回暂停说明。取舍：快照每个 marketplace 多读一个文件（可按 mtime 缓存），换来列表与计划的诚实；检查时的判断保留为兜底。

### PH5AB-P2-05 计划中版本化 Claude 插件的绑定落在版本目录上：Claude 自己更新一次之后，该目标每轮都 `TARGET_BINDING_CHANGED`

- **位置**：`server/service.mjs:1692-1697`（Claude 插件目标的绑定目录取 `installedPath`，即 `cache/<marketplace>/<插件>/<版本>/`，签名含其 `real`、`dev`、`ino`）；`:2052`（`verifySynchronized` 对 Claude 目标一律返回假，绑定无法协调）。
- **问题**：DEC-SDX-023 的安装身份是“Agent + 插件@marketplace + 作用域 + 项目路径”，不含版本目录。HLD 9.3 记录过 Claude 桌面应用自行刷新 marketplace 并更新插件。外部更新换了版本目录后，计划把它当作“新对象”而不再接管，直到用户重新保存计划；SkillDock 自己的更新经 `afterOwnUpdate` 改写绑定，所以只有外部更新触发。
- **失败场景**：计划含 Claude 插件 `alpha@m`（1.0.0）并自动应用；Claude 自行更新到 1.1.0；来源再出 1.2.0 → 之后每一轮都是“来源、所有者、安装目录或内容已变化；旧计划不接管新对象，请重新选择。”。
- **证据**：E8（连续两轮 `skipped / TARGET_BINDING_CHANGED`）。
- **建议修法与取舍**：`claude-plugin` 路线的绑定改用安装身份加 marketplace 条目的来源身份（来源类型、地址、子路径、ref），不绑定版本目录；或在安装身份与来源身份不变时视为同一目标并协调。仍保留对“换来源、换所有者”的防护，又不随 Claude 的正常更新失效。可与 5c 的计划工作一起做。

### PH5AB-P3-01 错误码：读回不一致用了 `READBACK_FAILED`，36c 第 8 节为此登记的 `READBACK_CONTENT_CHANGED` 无人使用；5a 新增了 `NOT_YET_AVAILABLE`

- **位置**：`server/service.mjs:790`；36c 第 6 节 5b 段写“不等即 `READBACK_FAILED`”，第 8 节仍列 `READBACK_CONTENT_CHANGED`（502，“装入内容与预览不同，未自动重试”，重新预览后可）；全仓库没有代码返回后者。`server/claude-updates.mjs:39` 的 `NOT_YET_AVAILABLE` 是新的 `reasonCode`，经 `service.mjs:1960` 在应用时成为 HTTP 错误码（E16），36c 与 `errors.json` 中都没有。
- **问题**：同一份契约前后两处对同一情形给出不同错误码；5b 的“只复用已有错误码”在字面上成立，但复用的不是契约为这一情形指定的那个。`NOT_YET_AVAILABLE` 是 5c 之前的过渡值。
- **建议**：二选一并在 36c 修订表中写明：改用 `READBACK_CONTENT_CHANGED`（语义正好，界面可据此提示“重新预览”），或从第 8 节删去它。`NOT_YET_AVAILABLE` 在 5c 中去掉；若保留到发布，登记到 36c 并补 `errors.json`。另：`更新目标无效。`、`更新目标不存在。` 两条既有消息没有整句译文（界面退回错误码译文），5a 让 Claude 目标也会走到它们，可顺手补上。

### PH5AB-P3-02 “读回不一致后暂停自动应用”在插件已是最新后不解除

- **位置**：`server/service.mjs:757`、`:787`、`:794`。
- **场景**：读回不一致后，用户在 Claude 中处理好，SkillDock 检查为 `current`；之后来源出新版本，检查结果仍是 `canAutoApply: false`，提示“上次装入的内容与预览不同；自动应用已暂停”（E9）。只有一次手动应用才能解除。
- **建议**：检查为 `current`（安装内容等于来源）时一并清除暂停标记。

### PH5AB-P3-03 只缺“共用 → 只属于 Claude”方向的计划目标迁移

- **位置**：`server/service.mjs:1733-1741`。
- **场景**：Claude 主导的共用技能在计划中；用户删掉 Codex 一侧的链接 → 目录仍在，对象 ID 变回 `claude:skill:…` → 计划记 `TARGET_MISSING`（E12）。36c 第 6 节“对象 ID”的通则是“共用状态变化……按真实路径把旧 ID 解析到当前对象”，不限方向；P1-01 的兜底也需要它。
- **建议**：`migrateTarget` 同时在只属于 Claude 的技能中按真实目录查找。

### PH5AB-P3-04 `claude-plugin` 路线不核对 `expectedRevision`；`PREVIEW_MISMATCH` 先消耗了另一个插件的预览

- **位置**：`server/service.mjs:1982`（`claudePluginUpdate` 不接收修订号）、`:762-763`（先 `previews.delete` 再判归属）。
- **场景**：E11：带另一个插件的修订号应用 `alpha` 照常成功；用 `zeta` 的预览应用 `alpha` 返回 `PREVIEW_MISMATCH`，随后 `zeta` 用自己的预览应用得到 `STALE_PREVIEW`。
- **建议**：预览已绑定安装目录、版本、指纹与条目，实际风险小；要么核对修订号，要么在 36c 第 6 节写明该路线以预览绑定代替修订号（36c 5a 段“更新页与计划不带修订号时以当前快照核对”读起来适用于所有 Claude 对象）。归属核对放在删除预览之前。

### PH5AB-P3-05 两处归类：组织强制启用的个人安装被当作“组织托管安装”；按名称前缀判断生成的 marketplace

- **位置**：`server/claude-updates.mjs:37`（`protection === 'managed'` 也包括托管设置强制启用，见 `server/claude-catalog.mjs:272`）、`:39`（`startsWith('skilldock-')`）。
- **场景**：E14：user 范围安装的 `pinned@market`，只因托管设置 `enabledPlugins` 强制启用，就显示“由组织托管设置安装；SkillDock 不代为更新。”且不可检查——DEC-SDX-019 只列 managed 范围；E16：用户自建的 marketplace `skilldock-dev` 中的插件被当作 SkillDock 生成的，显示“暂不能检查”。
- **建议**：只按 `installation.scope === 'managed'` 阻止更新；生成的 marketplace 用已有的 `direct` 标记或 `^skilldock-[a-f0-9]{20}$` 判断（`server/direct-plugins.mjs:79` 已有）。后者随 5c 一并处理即可。

### PH5AB-P3-06 加固

1. 越界：`relativeDirectory`（`server/claude-plugin-updates.mjs:61-66`）与 git-subdir（`:129-130`）只做字面路径的边界判断，`copySkill` 却按真实路径复制。marketplace 中的相对路径若是指向外部的符号链接，外部目录会被复制进暂存区，文件名出现在差异列表中（E5：`private.txt`）。只在本机、只展示给同一用户，影响小；建议按真实路径判断边界，与 Codex 一侧的 `discoverSkillRoots` 一致。M26（去掉字面边界判断）未被发现。
2. npm：`npm pack`、`npm view` 的包名来自 marketplace 条目，前面没有 `--`，以 `-` 开头的值会被当作选项（`:85`、`:91`）；条目的 `version` 为范围时，`npm view <包>@<范围> … --json` 在多个版本匹配时输出数组（按 npm 的行为推断，本轮不能联网实测），`view.version` 为空，应用前核对每次都会 `SOURCE_CHANGED`。建议加 `--`，并让核对比较 `npm pack` 实际得到的版本与完整性摘要（或先把范围解析为具体版本）。
3. 压缩包：`fetch` 跟随重定向到任意主机（含回环地址；Claude 自己拒绝回环），整包读入内存后才判断 100 MB 上限（`:94-101`）。建议限制重定向的协议与主机，边读边计数。

### PH5AB-P3-07 Claude 管理启用后，1 版的“检查全部”与计划校验也看到 Claude 对象

- **位置**：`server/service.mjs:1729-1731`（`schedulerSnapshot` 只看 Claude 是否已启用管理，不区分请求版本）。
- **场景**：E15：不带 `agent`、不带 `targets` 的 `updates.run` 也检查了 Claude 技能 `notes`（若有 Claude 插件，按代码还会刷新其远端 marketplace）；1 版 `schedule.configure` 同样在多 Agent 视图上校验目标。36c 第 6 节对 1 版请求的总原则是“保持 0.10.2 行为”。实际中 1 版客户端很少，影响小。
- **建议**：1 版请求的默认目标与保存校验改用 1 版快照；或在 36c 中写明这一例外。

### PH5AB-P3-08 文档与实现之间的几处出入

1. HLD 3.3 本地修改保护：“没有历史记录的，优先以 Claude 安装记录中的来源提交（只读补充证据）取得基线”。实现与 36c 0.20 都只用检查时的指纹，首次检查前已有的本地修改会被当作基线。二者应一致：要么实现（Git 来源的安装记录有提交号），要么在 HLD 修订表中改写并说明对 MR-SDX-003 的影响。
2. HLD 3.3A：版本为 `unknown` 的插件“更新确认中说明更新后无法经 Claude 回到旧版本……后台自动应用……在把这类插件加入计划时说明”——实现只在更新完成后的消息中说明，检查结果与加入计划时都没有（界面部分可记入 `41`，但服务端检查结果的 `message` 可以先带上）。
3. HLD 3.3A Git 类“读回：列表读回的版本前缀 = 预览提交的前 12 位”没有核对；指纹核对更强，建议在 HLD 中注明以指纹为准。
4. HLD 6.2 时序图与 `37` 拆分表 5b 一行仍写“没有声明版本的 npm 插件”复制到隔离区；v1.20 已扩展为所有 `unknown`。
5. `37` 进度中“变异实验中 10 项去保护变异有 9 项使用例失败”与本轮结果不符（见 P3-09）。

### PH5AB-P3-09 测试缺口

第 5.2 节 44 项去保护变异中，26 项连完整套件也未发现。值得补的（每项一个小用例即可）：

- 应用前核对：`INSTALLATION_CHANGED`（M02）、`PREVIEW_MISMATCH`（M04）、条目比较（M05）、npm 与压缩包的再核对（M08、M09）——“预览后变化 → 拒绝且未运行命令行”；
- `unknown` 副本：复制失败即中止（M11）、读回不一致时保留基准副本与成功后删除（M15、M16）；
- 项目目录缺失（M17）；远端 marketplace 的刷新（M19）；同一插件 user 与 local 两处安装时按项目匹配（M20）；
- 计划：Claude 已启用但未安装、无法确认时暂停（M30、M31）；
- 5a：侧别取自 `target.agent` 而非请求的 `agent`（M35，用请求 `agent: "codex"`、目标 `agent: "claude"` 在 Claude 只读时验证被拒）；技能目录插件的修订号、Git 工作树与两个根的限制（M37～M39）；技能目录插件的绑定含指纹（M42）。
- 另：P1-01、P1-02、P2-01～P2-05 的场景都没有用例；测试中的 Claude 替身把“原地覆盖先删除整个目录”等写成了前提，见第 6 节。

## 4. 文档与契约判定

| 事项 | 判定 | 依据 |
|------|------|------|
| Claude 更新项与 Codex 项的分工（36c 第 6 节 5a 段） | 一致 | `server/claude-updates.mjs:50-58`；`server/service.mjs:284-285`；`targetKey` 对 Codex 目标保持 `kind:id`（`server/sources.mjs:12`），`validateTarget` 去掉 `agent: "codex"`（`server/scheduler.mjs:13`）；用例 `claude-updates.test.mjs` 第 2、4 项 |
| 侧别取自 `target.agent`；只读/无法确认时不可检查 | 一致（侧别规则无用例，M35） | `assertAgentWritable`；`server/multi-agent.mjs:61`；用例第 3 项 |
| 修订号缺省取当前快照 | 技能与技能目录插件一致；`claude-plugin` 路线不核对（P3-04） | `server/service.mjs:1968` |
| 计划目标的侧别键、暂停、迁移 | 键与暂停一致；迁移只有单方向（P3-03）；P1-01 | `server/scheduler.mjs:9-15`、`:209-224`；`server/service.mjs:1795-1816` |
| 5b：锁、来源类型与 `OWNER_MANAGED` | 检查与应用都在 Claude 锁下；`OWNER_MANAGED` 只在检查后出现（P2-04） | `server/service.mjs:711`、`:744` |
| 5b：版本预测与 `VERSION_UNCHANGED` | 规则与 HLD v1.20 一致（manifest → 条目 → 来源；`unknown` 不判版本未变）；`node_modules` 时误报（P2-01） | `server/claude-plugin-updates.mjs:159-181`；用例第 2 项 |
| 5b：本地修改基线 | 与 36c 0.20 一致，弱于 HLD 3.3（P3-08 第 1 条）；`unknown` 误报无出路（P1-02） | `server/service.mjs:741`、`:750` |
| 5b：应用前核对 | 五类核对齐全；附注标签误判（P2-02）；四项无用例（P3-09） | `server/service.mjs:762-771` |
| 5b：`unknown` 副本与恢复 | 与 HLD 3.3A 一致：新副本写完才替换、复制失败中止、读回不一致保留基准副本、读回一致后删除；只在更新后说明（P3-08 第 2 条） | `server/service.mjs:774-796`；E2 |
| 5b：`READBACK_FAILED` 与暂停自动应用 | 行为与 36c 第 6 节一致；错误码与第 8 节不一致（P3-01）；暂停在 `current` 后不解除（P3-02） | `server/service.mjs:783-794`；用例第 5 项 |
| 5b：project/local 工作目录 | 一致：以安装所在项目为工作目录；user 范围用当前项目，与 4d 安装路径（`:858`）一致 | `server/service.mjs:699`、`:726`；用例第 8 项；E10 |
| 5b：`plugin update` 白名单 | 一致：列入带作用域的命令，`--scope` 必带 | `server/claude-writer.mjs:12` |
| 错误码只复用已有的 | 5b 字面成立；5a 新增 `NOT_YET_AVAILABLE`；与第 8 节 `READBACK_CONTENT_CHANGED` 的关系见 P3-01 | 第 5.1 节 |
| 翻译 | 完整：按生产翻译器逐条检查 69 条新增或新近可达的服务端消息（含插值与多行组合），英、日均有整句译文；缺的两条是既有消息（P3-01 末尾）；更新页两种新路线的界面文案中、英、日齐全 | 第 5.1 节 |
| 文档版本 | HLD v1.20、索引 0.21、36c 0.20 的修订记录与内容一致；遗漏见 P3-08 | — |

## 5. 验证命令与结果

### 5.1 命令

均在评审目录中经 `sandbox-exec -f …/verify/phase2-review/hermetic.sb`，以临时 `HOME`、`TMPDIR`（完整套件另设临时 `CLAUDE_CONFIG_DIR`、`CODEX_HOME`）运行；未运行真实的 Claude 或 Codex 命令行，未联网。

```
git -C <仓库> archive f2af004 plugins/skilldock/skills/skill-manager | tar -x -C review-5ab/
ln -s <主工作区>/…/assets/app/node_modules review-5ab/…/assets/app/node_modules
npm test                     # 导出副本：494 项，439 通过、55 跳过（compat-matrix 需要 Git 历史）、0 失败
git clone --no-checkout <本地仓库路径> review-5ab/repo && git -C review-5ab/repo checkout f2af004
npm test                     # 本地克隆：494/494 通过
npm run typecheck            # 通过
python3（核对 native/build.json）   # 53 个输入、4 个产物的 sha256 全部一致
git diff 549511a f2af004 -- plugins | shasum -a 256   # f462a586d7e2…
git grep（各错误码在 549511a 与 f2af004 中的出处）    # 见 P3-01
node --test exp2/e5b.test.mjs exp2/e5a.test.mjs exp2/e13b.test.mjs exp2/e13c.test.mjs \
  exp2/e17.test.mjs exp2/e18.test.mjs exp2/e20.test.mjs exp2/e19-549.test.mjs   # 实验，见 5.3
node exp2/i18n-full.mjs      # 69 条消息，2 条既有消息无整句译文
python3 mut/run.py           # 变异，见 5.2
```

### 5.2 变异结果

变异副本为复制的完整 `plugins/` 目录（保留目录层级与 `scripts/`）；先确认副本基线与导出副本相同（494 项：439 通过、55 跳过、0 失败）。逐项变异后先跑定向用例（`claude-plugin-updates`、`claude-updates`、`backend-updates`、`background-updates`、`plugin-reconciliation`、`agents`、`shared-skills`、`claude-skill-guards`、`claude-actions`、`multi-agent`、`migration`、`claude-skill-files`、`claude-plugin-sources`），定向未发现的再跑完整套件。每项变异后恢复原文件，结束时副本与导出副本一致。

| 编号 | 去掉的保护（`server/` 下，行号指 `service.mjs` 时省略文件名） | 结果 |
|------|------|------|
| M01 | 检查与应用前的本地修改基线闸门（`service.mjs:741`） | 发现（用例 local changes and source changes…） |
| M02 | 应用前安装目录与版本核对 `INSTALLATION_CHANGED`（`:764`） | **未发现** |
| M03 | 应用前安装指纹对预览基线的核对（`:765`） | 未发现（与 M01 的闸门重复，作者已注明属纵深防御，可不补） |
| M04 | `PREVIEW_MISMATCH`（`:763`） | **未发现** |
| M05 | marketplace 条目比较（`:767`） | **未发现** |
| M06 | 本地与 Git 托管 marketplace 来源重算（`:768`） | 发现 |
| M07 | Git 提交重新解析（`:769`） | 发现 |
| M08 | npm 版本与完整性摘要核对（`:770`） | **未发现** |
| M09 | 压缩包重新下载核对（`:771`） | **未发现** |
| M10 | 版本为 `unknown` 时不复制 | 发现 |
| M11 | 复制失败不中止（吞掉 `copyInstallation` 的错误） | **未发现** |
| M12 | 读回一律当作一致 | 发现 |
| M13 | 读回不一致后不暂停自动应用 | 发现 |
| M14 | 后台成功应用也清除暂停（去掉 `!internal`） | **未发现** |
| M15 | 读回不一致时不保留基准副本 | **未发现** |
| M16 | 读回一致后不删除基准副本 | **未发现** |
| M17 | 去掉项目目录缺失检查（`:727`） | **未发现** |
| M18 | project/local 改用当前项目作工作目录 | 发现 |
| M19 | 不刷新远端 marketplace（`:734`） | **未发现** |
| M20 | 在 Claude 清单中匹配安装时不看项目路径 | **未发现** |
| M21 | 去掉 `VERSION_UNCHANGED` 规则 | 发现 |
| M22 | `unknown` 也按“版本未变”阻止 | 发现 |
| M23 | `headersHelper` 条目不再交给 Claude | 发现 |
| M24 | 安装指纹不排除 `node_modules` 等 | **未发现**（见 P2-01） |
| M25 | 复制安装时不排除 `.in_use` | 未发现（测试中不出现该目录，影响小） |
| M26 | 相对路径的越界检查去掉 | **未发现**（见 P3-06 第 1 条） |
| M27 | 压缩包声明的 sha256 不核对 | **未发现** |
| M28 | 白名单去掉带作用域的 `plugin update` | 发现（6 项失败） |
| M29 | Claude 只读时更新项仍可检查 | 发现 |
| M30 | Claude 已启用管理但未安装时不暂停 | **未发现** |
| M31 | Claude 无法确认时不暂停 | **未发现** |
| M32 | 不迁移计划目标 | 发现 |
| M33 | 迁移时不搬绑定 | 发现 |
| M34 | Claude 主导时不去掉 Codex 一侧的项 | 发现 |
| M35 | 更新请求的侧别改取请求的 `agent`（不取 `target.agent`） | **未发现** |
| M36 | 目标可带 `agent: "claude"` + `kind: "host"` | 未发现（校验小项） |
| M37 | 技能目录插件不核对修订号 | **未发现** |
| M38 | 技能目录插件不排除 Git 工作树 | **未发现** |
| M39 | 技能目录插件不限两个技能根 | **未发现** |
| M40 | 计划快照不随 Claude 管理切换（始终 1 版） | 发现（4 项失败） |
| M41 | Claude 插件目标也走 Codex 的外部同步核实 | 未发现（该函数按 Codex 插件核实，对 Claude 目标会失败返回假，纵深防御） |
| M42 | 技能目录插件的计划绑定不含指纹 | **未发现** |
| M43 | command 来源不标为 `OWNER_MANAGED` | 发现 |
| M44 | 技能目录插件更新提示改回技能措辞 | 发现 |

合计：44 项中 18 项被发现，26 项连完整套件也未发现；其中 M03、M25、M36、M41 属纵深防御或校验小项，可不补，其余 22 项建议补用例（P3-09）。

### 5.3 实验摘要

实验在导出副本上运行。Claude 命令行、列表与联网获取都用项目测试自带的替身（`tests/claude-plugin-updates.test.mjs`、`tests/claude-updates.test.mjs` 中的 `world`，评审时原样复制，只加了时钟与重启）；Git 用本地仓库。

| 编号 | 内容 | 结果 |
|------|------|------|
| E1a | 未声明版本的本地插件，来源带 `node_modules`，安装后未改动 | 检查 `available`（差异只有 `node_modules/dep/index.js`）→ 应用 `READBACK_FAILED` → 再检查仍 `available`、`canAutoApply: false` |
| E1b | 同上但声明版本 1.0.0 | `blocked / VERSION_UNCHANGED`，“请维护者递增版本” |
| E1c | 来源 `node_modules` 有 3001 个文件 | 检查失败 `SOURCE_LIMIT`，“技能内容超过 3000 个文件或链接。” |
| E2 | `unknown` 版本读回不一致后清理到与来源一致 | `READBACK_FAILED`，副本目录只剩 `baseline`；再检查 `LOCAL_CHANGES` |
| E3 | `unknown` 版本由 Claude 原地更新；再卸载重装 | 两次检查都是 `LOCAL_CHANGES` |
| E4 | Git 来源 `ref` 为附注标签 `v2` | 两轮都是 `available` → `SOURCE_CHANGED`；`ls-remote` 只返回标签对象 |
| E5 | marketplace 相对路径改为指向外部目录的符号链接 | 外部目录被暂存，差异列出 `private.txt` |
| E6 | 更新页查看 Claude 插件预览的文件差异 | `STALE_PREVIEW`，“预览已过期，请重新检查更新。”；同一预览随后应用成功 |
| E7 | local 安装所在项目被删除，计划含它 | 更新项 `canCheck: true`；运行 `error / PROJECT_PATH_MISSING`，`failureCount` 1，5 分钟后重跑 |
| E8 | 计划中的 `alpha@m` 被 Claude 自行更新到 1.1.0，来源再出 1.2.0 | 连续两轮 `skipped / TARGET_BINDING_CHANGED` |
| E9 | 读回不一致后插件变为最新，来源再出新版本 | `current` 之后的新版本仍 `canAutoApply: false` |
| E10 | 远端 marketplace（`github`）中 user 范围插件的检查与应用 | 检查、应用前各刷新一次 marketplace；`plugin update alpha@m --scope user --json`，工作目录为当前项目 |
| E11 | 用别的插件的修订号应用；用另一个插件的预览应用 | 前者照常成功；后者 `PREVIEW_MISMATCH`，另一个插件随后 `STALE_PREVIEW` |
| E12 | Claude 主导的共用技能在计划中，删掉 Codex 一侧链接 | `skipped / TARGET_MISSING`，目录仍在 |
| E13 | 同类技能在更新页带页面修订号检查与应用 | `available`，返回“两侧都会改变”的说明，应用成功 |
| E13b、E13c | 上述应用之后 | 技能只属于 Claude、ID 改变；Codex 的 1 版快照不再列出它，诊断“技能链接或其目标在运行中发生变化……” |
| E14 | user 范围安装被托管设置强制启用 | `canCheck: false`、`HOST_MANAGED`，“由组织托管设置安装” |
| E15 | Claude 已启用管理，1 版 `updates.run` 不带目标 | 运行项包含 Claude 技能 `notes` |
| E16 | `skilldock-0123…`（生成）与 `skilldock-dev`（用户自建）中的插件；应用前者 | 两者都是 `NOT_YET_AVAILABLE`；应用返回错误码 `NOT_YET_AVAILABLE` |
| E17 | Claude 主导的共用技能在自动应用计划中，来源更新 | 第 1 轮文件已更新，却记 `error / NOT_FOUND / 更新目标不存在。`，`failureCount` 1；第 2 轮 `TARGET_MISSING` |
| E17b | 同上，从更新页手动应用（计划绑定着它） | 返回 `NOT_FOUND`；文件已更新，操作记录 `success` |
| E18 | command 来源的插件 | 列表中可检查；计划保存成功；每轮 `skipped / OWNER_MANAGED`，整轮 `partial` |
| E19 | 在 `549511a` 上经卡片接口更新同类共用技能 | 更新成功，之后同样只属于 Claude（根因早于 5a） |
| E20 | E17 之后重启服务 | 恢复共用与原 ID；下一轮 `TARGET_BINDING_CHANGED`（绑定未刷新） |

## 6. 未覆盖的范围与剩余风险

- **真实命令行**：按委托未运行真实 Claude。测试替身把若干行为写成前提：`unknown` 原地覆盖时先删除整个目录再复制（若真实 Claude 是覆盖式复制、不删除上游已删的文件，读回会不一致，并落入 P1-02）；`plugin list --json` 在当前项目下也列出其他项目的安装；`plugin marketplace update` 不顺带更新插件；`plugin update --scope` 在 user 与 local 两处安装同版本时只动其中一处（两处共用同一缓存目录时，原地覆盖会同时改变另一处，另一处随即落入 P1-02）。HLD v1.20 的离线核实覆盖了其中一部分，建议在 5b 的真实命令行冒烟中补上“上游删除文件后的原地覆盖”与“两处安装同版本时更新其中一处”。
- **联网来源**：npm 与压缩包的获取在用例与实验中都被替身取代，`npm view` 的输出形状、重定向与大包未实测（P3-06）。
- **界面**：没有在浏览器中渲染；更新页的判断来自源码阅读（P2-03 的差异浏览器、`claude-plugin` 不可检查时的提示）。
- **后台工作进程**：LaunchAgent 唤起的工作进程（HLD 3.8 的保存根目录与命令行路径）没有单独运行，计划只经服务内的 `tickScheduler` 验证。
- **性能**：Git 类来源每次检查都完整克隆（`checkoutGit` 不带 `--depth`/`--filter`），与 Codex 一侧现状一致；大仓库的计划检查会慢，本轮未测。
- **范围外**：5c1（`d027352`）与主工作区未提交的 5c2 改动未看，它们可能已处理 `NOT_YET_AVAILABLE` 与部分计划问题。

## 7. 操作披露与结束状态

- 评审目录 `…/scratchpad/review-5ab/` 中已有更早会话留下的文件（`exp/`、`export/`、`export-549511a/`、`i18n-check*` 等，时间为 10-09 23 时）；本报告的结论只依据本会话新建并运行的 `exp2/`、`mut/`、`base549/`、`repo/` 与重新导出的副本，未采用旧文件中的结论。
- 本会话新建了 `f2af004`、`549511a` 的导出副本，`f2af004` 的本地克隆（`git clone` 自本地路径），以及变异副本；`node_modules` 均为指向主工作区的软链接。全部测试在沙箱中以临时目录运行；未读写真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；未运行真实 Claude 或 Codex 命令行；未联网、未下载；未向 4771、4781 端口发请求；未打印配置文件。
- 对主工作区的唯一写入是本报告；未 `git add`、未提交、未推送。
