# 代码评审报告：阶段 4c（`da8fc3c`、`c1da688`、`7700683`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 上一轮 | 4a、4b 合并复审：[44-cross-agent-phase4ab-review-r2.md](44-cross-agent-phase4ab-review-r2.md)（对 `5cb3c9b`：APPROVED 带 P3 6 项；其 3.3 条件 1～3 要求 4c 第一个提交完成两侧事务合并） |
| 范围 | `git diff 9a727bf 7700683 -- plugins`：12 个文件，增 635 行、删 235 行，diff sha256 前缀 `5358a94c7e39`。`da8fc3c`（4c0）3 个文件 +173/−191；`c1da688`（4c1）10 个文件 +320/−28；`7700683`（4c2、4c3）8 个文件 +148/−22（两者都含 `native/build.json`、`native/ui.html` 的产物更新）。之后的 `c6293c1`（4d）不在范围 |
| Candidate | `7700683`（tree `c680a94a0749…`）；中间提交 `da8fc3c`（tree `c9a30ecac787…`）、`c1da688`（tree `e4b8af9073ab…`）；基线 `9a727bf`；分支 `feature/skilldock-0.11-cross-agent`（本地） |
| 事实源（均取 `7700683` 中的版本） | PRD `34`（sha256 `e061ec25…`，未改）：AC-003、5.1 状态表；HLD `35` v1.17（`4b9bb53f…`）：3.3～3.6、3.8 与末尾“有限修订”表；契约索引 `36` 0.15（`9889e369…`）；`36c` 0.14（`dc95ad98…`）：第 5、6 节（共用对象、批量移除、跨侧影响提示）、7.1、7.3、第 8 节；实施计划 `37`（`771397e6…`）：4c 拆分行与阶段 4 进度行；`41`（`456c7e31…`，新增 UI-09） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-09 |
| 工作区绑定 | 开始时主工作区 HEAD 为 `c6293c1`；评审期间 HEAD 前进到 `259694c`（他人提交的 4d 冒烟测试），另出现他人未跟踪的 `46-cross-agent-phase4d-code-review.md`。本评审全部测试与实验都在 `git archive 7700683`（及对照用的 `git archive 9a727bf`）导出副本中进行，不依赖工作区 |

## 2. 结论

**APPROVED（带 P2/P3）**

- P0：0
- P1：0
- P2：5（PH4C-P2-01～05，见第 4 节）
- P3：7（PH4C-P3-01～07）
- 4c0（两侧事务合并）：**Codex 一侧逐项一致**。同一组 1 版请求在 `9a727bf` 与 `7700683` 上各跑一遍（E-PAR，28 个请求、7 次注册表与文件树快照，覆盖成功路径与 `BACKUP_CHANGED`、`INVALID_NAME`、`LOCAL_CHANGES`×3、`NOT_FOUND`、`PREVIEW_MISMATCH`×2、`PROTECTED_SKILL`、`RESTORE_MISSING`×2、`STALE_PREVIEW`×2、`TARGET_EXISTS`×2），归一化随机 ID、时间、路径与 inode 后输出**完全相同**。Claude 一侧没有功能回退，只有两处错误先后顺序变化（P3-04）。44 第 3.3 节的三个条件基本满足：合并在 4c 的第一个提交；B32 有了 Claude 一侧用例（来源键按真实目录，项目路径为链接时也是），B24 的用例钉住的是快照标记（事务内的拒绝属纵深防御）；HLD 修订表已改写。
- 4c1（共用技能）：修订号覆盖两侧、移走共用真实目录前确认、Claude 一侧按自己的发现路径操作、启停翻译为 Claude 自己的条目、更新同步与恢复还原、1 版保持 0.10.2，都与契约一致（E-S1、E-S2、E-S6、E-S7 与新用例）。问题集中在“更新”：更新页一条路径完全绕过这些规则，技能卡片路径的说明界面不显示（P2-01）；来源冲突时“两侧都不能更新”只体现在快照上，服务端仍允许 Codex 一侧更新（P2-02）。
- 4c2（批量移除）：锁顺序“实例锁 → Codex 锁 → Claude 锁”、取锁不创建根目录、按侧写来源分区与操作记录、按侧恢复、整批原子回滚都已核实（E-B3、E-B4、E-B6）。两处与契约不符：环境检查按整批的 Codex 状态（P2-03）；执行时不核对预览后变化的共用状态（P2-04）。
- 4c3（Codex“无法确认”与暂停）：服务端只显示、不拒绝写入；暂停只在 Claude 已启用管理时生效，Codex 未安装时全部暂停、命令行不可用时只暂停插件目标，只管理 Codex 时保持 0.10.2（E-P 与新用例）。但界面把“无法确认”的 Codex 当作未启用（P2-05）。
- 翻译：23 条新增或新组合的服务端提示（含带路径、URL、Agent 名的组合）经生产翻译器，英、日全部有完整译文（E-i18n）；`native/build.json` 52 个输入、4 个产物哈希一致，`ui.html` 含新译文。
- 是否需要 Owner 决定：P2-05 与 P3-06 第 2 条涉及 PRD 5.1“无法确认 → 禁用写操作”与本次“Codex 无法确认只显示”的取舍。HLD v1.17 修订表已写明后者并以 MR-SDX-001 为依据，本轮认为方向可接受，但需要在 PRD 或契约中补一句，或改用不与 PRD 冲突的显示方式（见 P2-05 建议）。
- 不阻断 4d。建议 P2 在阶段 4 的 UAT 之前处理；若 P2-01 的更新页部分决定留到阶段 5，应在 `37`、`41` 中写明 AC-003 在更新页暂未达成，并在此之前让更新页对共用技能与跨侧技能不提供“应用”。

本结论不授予推送、合并或发布权限。

## 3. 各项判定

变异编号见第 6.2 节（M 前缀，共 61 项，其中 M00 为不改动的基线）。实验编号见第 6.3 节。行号均指 `7700683` 导出副本。

### 3.1 合并后的 Codex 一侧（4c0）

| 检查项 | 判定 | 依据 |
|--------|------|------|
| 取值、顺序、错误码与消息 | **一致** | E-PAR：同一脚本分别载入 `9a727bf` 与 `7700683` 的 `service.mjs`，在只有 Codex 的临时世界中依次执行来源预览与关联（含预览不属于该技能、预览已用过）、安装预览（含名称不合规、目标已存在）与安装（含重复使用预览）、检查更新（无变化、有变化、本地修改、无来源）、更新（含预览不匹配、本地修改）、恢复更新（含新修改、成功、重复）、移除与恢复（含原位置被占用、备份被改、记录不存在）。28 个请求的结果与 7 次注册表（`sources`、`claudeSources`、`activity`）和技能目录快照，归一化后逐字相同 |
| 逐项对照旧分支 | **一致** | `codexSkillSide`（`service.mjs:397-419`）：记录查找仍为 `assertWritableSkill`、来源键 `record.id`、安装根 `env.skills`、安装前 `assertTargetRoot`、移动不加额外边界（`move` 的 `extraBoundaries` 缺省即 `[]`，`:784`）、恢复边界只在 `remove` 时按发现根核对、恢复后清 `skillLinks`、暂存删除用 `fs.rm`、五条文字原样。`assertPreview` 缺省一侧本就是 `codex`（`:774`），显式传入不改变结果。恢复新增的“记录一侧须为本侧”核对（`:534`）对 Codex 记录恒成立（Claude 记录在分发时已经走 Claude 路径，`:1469`），M02 未被发现属预期 |
| 1 版请求 | **未见回归** | 共用规则只对带 `agent` 的请求生效（`:571`）；`executeRequest` 只在有说明时才改写结果（`:1451`）；1 版批量移除仍读 1 版快照、无规则（E-B5）。定向测试 156/156 |
| Claude 一侧有无回退 | **无功能回退，顺序有两处变化** | E-PAR-C：同一组 2 版请求在新旧两版上的结果除两处外相同：`skill.previewInstall` 带 `scope: "local"` 且名称不合规时，旧版 400 `INVALID_ACTION`，新版 422 `INVALID_NAME`（新版先暂存来源再校验作用域）；恢复记录中 `skillId` 键的位置不同（无语义差别）。另由阅读确认：恢复移除时旧版先查 `RESTORE_BOUNDARY` 再查 `TARGET_EXISTS`，新版相反。见 P3-04 |
| 37 中“去掉本地修改核对，两侧用例同时失败” | **本轮未能复现** | 逐一去掉四处本地修改核对：M01（更新）、M01b（检查更新）、M01d（关联来源）只有 Codex 用例失败，M01c（恢复更新）只有 Claude 用例失败；没有一处同时被两侧用例钉住（P3-07） |

### 3.2 共用技能（4c1）

| 检查项 | 判定 | 依据 |
|--------|------|------|
| 修订号覆盖两侧 | **一致** | 顶层 `revision` 由两侧的 `revision` 合成（`multi-agent.mjs:37`）；Codex 一侧含启用与能力标记，Claude 一侧含真实路径、可见性与决定层。E-S1：经 1 版切换 Codex 一侧、改 Claude 用户设置，修订号都变化；旧修订号做 Codex 一侧移除、Claude 一侧切换都返回 `SNAPSHOT_STALE`；`skill.connectSource` 不带修订号同样返回 `SNAPSHOT_STALE`（核对在 `:577`，`checkUpdate`、`previewSource` 不是写操作，免带） |
| 移走共用真实目录前确认 | **一致（单个）；批量有缺口** | `:580-581`：请求一侧的 `removeKind` 为 `directory` 时加一条 `kind: "scope"`，未带 `confirm` 返回 `CONFIRMATION_REQUIRED`；移除链接不需要确认。用例覆盖 Codex 拥有目录、Claude 拥有目录两种布局；E-S2b、E-S6 复核。批量见 3.3 与 P2-04 |
| 另一侧插件目录内容受影响时确认 | **技能卡片路径一致；更新页绕过** | `:584-588`：独立技能真实路径位于另一侧已安装插件目录内时，移除目录或更新前确认并列出插件名；只移除链接不需要。E-A：Codex 技能根链接进 Claude 技能目录插件 `sd`，`skill.update` 返回 `CONFIRMATION_REQUIRED`（`affected-plugins: sd`）；同一更新经更新页 `update.check`、`update.apply` 不经确认完成，插件内容被改写。见 P2-01 |
| `SOURCE_CONFLICT` 的比较 | **基本一致** | `:592-598`：2 版 `connectSource` 时取另一侧分区（Codex 用 Codex ID，Claude 用真实目录）的记录，与预览比较 `source`、`subpath`（缺省 `.`）、`ref`（缺省空）。E-S3：相同路径通过；显式写 `subpath: "."` 通过；经指向同一目录的链接路径判为冲突；1 版关联不查冲突（E-S4，契约允许）。只在关联时检查、预览时不查。见 P3-01 |
| 来源冲突时两侧都不能更新 | **快照一致；服务端不拒绝** | `decorateSharedSkill`（`:343-345`）在 2 版快照中把两侧与顶层 `canUpdate` 都置假并说明原因（E-S4）。但 Codex 一侧的更新查找读 1 版快照（`:647-648`），2 版 `skill.checkUpdate`、`skill.update` 照常成功，更新页也给出“可应用”。见 P2-02 |
| Claude 一侧的启停翻译为 Claude 自己的条目 | **一致** | `:600-605`：核对共用修订号后，换成 Claude 对象的 ID 与修订号，由 `claudeAction` 按 Claude 规则写可见性。E-S2：共用技能 Claude 一侧为 `name-only` 时先要求确认（`visibility`、`reload`），确认后只写 Claude 用户设置的 `shared: "on"`，Codex 一侧保持停用。两次读取之间的窗口见 P3-02 |
| 更新时同步另一侧同源记录、恢复时还原 | **一致** | `:514-519`：只在另一侧记录与更新前的来源相同（`sameSource`）时同步指纹与文件列表，并把旧值记入恢复数据的 `sync`；恢复时写回（`:553`）。用例覆盖 Codex 更新 → Claude 记录同步 → 恢复还原；E-S7：更新后 Claude 一侧以相同来源重新关联，再恢复更新，Claude 记录被写回更新前的值，指纹与恢复后的内容一致（可接受，见观察 5）。Claude 一侧更新同步 Codex 记录（`:446`）没有用例（M39） |
| 1 版请求保持 0.10.2 | **一致** | 用例：1 版移除共用目录不确认；1 版移除位于 Claude 插件目录中的 Codex 技能不确认；1 版批量 `ids` 不接受 Claude ID。E-B5：1 版批量移除共用技能不确认 |
| 界面带修订号 | **一致** | `agent-requests.ts:30`：对象的 `agents` 含 Claude 时带顶层 `revision`（共用技能即覆盖两侧的修订号）；Codex 独有对象不带。用例覆盖 |

### 3.3 批量移除（4c2）

| 检查项 | 判定 | 依据 |
|--------|------|------|
| Claude 副本的锁顺序 | **一致** | 实例锁、Codex 锁由 `withOperation` 持有（`:170-190`）；Claude 锁在整批核对之后、第一次移动之前取得（`:1125-1129`），`finally` 释放（`:1287`）。E-B4：注入的 `rename` 在每次移动时观察到实例锁、Codex 锁、Claude 锁三个文件都在；结束后三者都已删除 |
| 取锁不创建根目录 | **一致** | 只在 Claude 配置目录已是目录时取锁（`:1128`）。E-B6：删除 `~/.claude`（临时世界）后，批量移除项目中的 Claude 副本成功，配置目录未被创建 |
| 操作记录与恢复按侧 | **一致** | Claude 副本的记录带 `agent: "claude"`，恢复数据写 Claude 分区的键（真实路径）；链接只记 `link: true`，不动来源记录（`:1140-1148`）。E-B3：链接副本移除后 `claudeSources` 不变，按 Claude 一侧恢复为链接；1 版快照不含该记录。用例覆盖目录副本的按侧恢复 |
| 确认规则 | **预览时一致；执行时不重算** | 预览中有移走共用目录（按 Codex 侧，`removeKind === "directory"`）或改写另一侧插件内容的项时，预览带 `nativeRules`，执行未带 `confirm` 返回 `CONFIRMATION_REQUIRED`（`:681-692`、`:1119`；用例覆盖共用目录一条）。执行时只用预览时算出的规则，签名也不含共用状态，预览后才变成共用的目录会不经确认被移走（E-B2，P2-04） |
| 环境检查 | **与契约不符** | `skill.removeSelected` 属“多目标操作”，契约规定顶层 `agent` 不据此做环境检查、各项按对象 ID 判定一侧；实现仍按 Codex 只读整批拒绝（E-B1，P2-03）。Claude 只读时含 Claude 副本的预览返回 `PROTECTED_SKILL` 并给出只读原因（E-B1b），可接受 |
| 整批原子语义 | **一致** | 先整批核对再移动（`:1123`、`:1131`）；任一项失败按相反顺序撤回。E-B4：两项（Codex 副本、Claude 副本）中第二次移动注入失败，第一项被移回，两处来源分区不变，只多一条失败记录；之后同一批成功，记录分别为 Codex、Claude 两侧 |

### 3.4 Codex“无法确认”与计划暂停（4c3）

| 检查项 | 判定 | 依据 |
|--------|------|------|
| 只显示、不拒绝写入 | **服务端一致；界面不一致** | `:281`：只在 2 版快照中把命令行不可用的 Codex 显示为“无法确认”，`assertAgentWritable` 不变（`:1378-1380`）。用例与 E-U1：此时 Codex 技能切换照常成功；1 版快照没有 `agents`。界面的后果见 P2-05 |
| 只在契约允许的情形暂停 | **一致** | `:1391-1395`：Codex 目标只在 Claude 已启用管理时按可用性暂停——Codex 未安装时全部暂停、命令行不可用时只暂停插件目标；Claude 未启用时保持 0.10.2。用例覆盖命令行不可用的两种情形；E-P：Codex 未安装且 Claude 已启用，技能与插件目标都记为 `AGENT_PAUSED`；命令行不可用而 Claude 只读时不暂停（技能目标 `SOURCE_UNKNOWN`、插件目标 `TARGET_MISSING`，与 0.10.2 相同）。M73（未安装不暂停）未被发现 |

### 3.5 翻译（4c 全部）

| 检查项 | 判定 | 依据 |
|--------|------|------|
| 新增服务端提示的英、日译文 | **齐全** | `server-messages.json` 新增 18 条；E-i18n 用生产翻译器（`tests/i18n-helper.mjs` 的 `translator`）核对 23 条实际会出现的文字，包括带 Agent 名、路径、URL 的 `SOURCE_CONFLICT`，带两个来源的冲突原因，两侧插件提示与批量提示，英文无残留中文、日文均不同于原文。新用例的“全部提示有译文”检查也通过 |
| 原生产物 | **一致** | `native/build.json` 的 52 个输入、4 个产物哈希与导出副本一致；`ui.html` 含新译文 |

## 4. 新发现

### PH4C-P2-01 更新页绕过共用技能与跨侧影响的全部规则；技能卡片路径的“两侧都会变”说明界面不显示

- **位置**：
  - `service.mjs:566`：`SHARED_GATED` 不含 `update.check`、`update.apply`；
  - `service.mjs:1459`：闸门只作用于原始请求；
  - `service.mjs:1504`：更新页请求翻译成不带 `agent`、`expectedRevision`、`confirm` 的 `skill.checkUpdate` 或 `skill.update` 后直接交给 `executeAction`；
  - `src/App.tsx:642`：技能卡片检查更新后只把 `result.update` 放进更新对话框，结果顶层的 `nativeRules` 被丢弃。
- **证据**：
  - E-S5：两侧技能根链接到同一目录、Codex 一侧有来源记录的共用技能。2 版 `update.check` 的结果没有 `nativeRules`；随后 2 版 `update.apply` 带错误的 `expectedRevision: "ffff"`，仍然成功更新。同一技能经技能卡片的 `skill.checkUpdate` 带 `scope` 说明。
  - E-A：Codex 技能根链接进 Claude 技能目录插件 `sd`，其中的 `inner` 是 Codex 独立技能、已关联来源：
    1. `skill.update` 返回 `CONFIRMATION_REQUIRED`，`nativeRules` 为 `affected-plugins: sd`；
    2. 同一更新经更新页：`update.check` 无说明，`update.apply` 不带 `confirm` 直接成功，Claude 插件 `sd` 目录中的内容被改写。
  - E-S4：来源冲突时更新页同样可应用（见 P2-02）。
- **影响**：AC-003 要求“更新前提示同时影响两侧”，36c 第 6 节要求更新预览带 `kind: "scope"` 的说明、改写另一侧插件内容前确认、共用对象的单对象写请求核对修订号。两条界面路径都没有做到：更新页（`UpdatesWorkspace` 的检查与应用）完全不经这些规则；技能卡片路径的服务端结果带说明，但界面不显示。内容可从操作记录恢复，所以定为 P2。
- **建议**：
  1. 在 `executeRequestCore` 中，对目标为技能的 `update.check`、`update.apply`，用翻译后的请求（补上原请求的 `agent`、`expectedRevision`、`confirm`）同样经过 `sharedSkillGate`，并让说明随结果返回；
  2. 更新对话框显示结果中的 `nativeRules`；
  3. 补用例：更新页的说明、修订号、跨侧确认。
  若更新页的这部分决定留到阶段 5，请在 `37` 与 `41` 中写明 AC-003 在更新页暂未达成，并在此之前让更新页对共用技能与跨侧技能不提供“应用”。

### PH4C-P2-02 来源冲突时“两侧都不能更新”只体现在快照上，服务端仍允许 Codex 一侧更新

- **位置**：
  - `service.mjs:343-345`：`decorateSharedSkill` 只修改 2 版快照中的能力标记；
  - `service.mjs:647-648`：Codex 一侧的 `assertWritableSkill` 读 1 版快照，那里没有这层判断；
  - `service.mjs:569-607`：闸门对 `skill.checkUpdate`、`skill.update` 不检查冲突。
- **复现**（E-S4）：
  1. Claude 一侧以 2 版请求关联 `second/shared`；
  2. 以 1 版请求为 Codex 一侧关联 `first/shared`（契约允许：1 版不做冲突检查）；
  3. 2 版快照中顶层、Codex 一侧、Claude 一侧的 `canUpdate` 都为假，原因写“两侧都不能更新”；
  4. 上游 `first/shared` 出新版后，2 版 `skill.checkUpdate`（`agent: "codex"`，带修订号）返回有更新，`skill.update` 成功，共用目录被换成 `first` 的新内容；
  5. 更新页的 `update.check` 同样返回 `available`、`canApply: true`。
- **依据**：
  - 36c 第 6 节“两侧来源记录指向不同来源时，两侧都不可更新”；
  - HLD 3.5“能力标记为不可用……服务端同样拒绝对应请求”。
- **建议**：共用技能两侧记录不同源时，拒绝 2 版的 `skill.checkUpdate`、`skill.update`，以及更新页翻译后的请求：
  - 错误码用 `SOURCE_CONFLICT`，或用 `PROTECTED_SKILL` 加 `decorateSharedSkill` 的原因文字；
  - 实现上可在闸门中判断，也可以让 2 版请求的 Codex 记录查找改读已装饰的多 Agent 快照。
  1 版请求是否同样拒绝，请在契约中写明。本轮倾向 1 版保持 0.10.2：Claude 一侧的记录对 1 版客户端不可见。

### PH4C-P2-03 批量移除只含 Claude 副本时，Codex 只读会整批拒绝

- **位置**：
  - `service.mjs:1378-1380`：`skill.removeSelected` 在 `HOST_WRITES` 中，`assertAgentWritable` 按 Codex 只读整批拒绝；
  - `service.mjs:65`：它同时属于“只作 2 版标志”的多目标操作。
- **复现**（E-B1）：
  1. 设置 Codex 只读、Claude 已启用；
  2. 个人与项目中各有一份 Claude 技能 `dup`；
  3. 预览只移除项目中的一份，成功；
  4. 执行返回 `AGENT_READ_ONLY`“Codex 环境当前为只读……”；
  5. 同一份以单个 `skill.remove`（`agent: "claude"`）移除，成功。
- **依据**：36c 第 6 节“多目标操作（……`skill.removeSelected`）的顶层 `agent` 只作 2 版标志……不据此做环境检查……各目标的侧别取自……对象 ID”。
- **建议**：
  - `skill.removeSelected` 的环境检查按预览中各项所属的一侧：含 Codex 项时才查 Codex 只读；
  - Claude 项已由能力标记在逐项核对中拒绝（E-B1b：`PROTECTED_SKILL` 并给出只读原因），可沿用；
  - 补用例。

### PH4C-P2-04 批量移除执行时不核对共用状态，预览之后才变成共用的目录会不经确认被移走

- **位置**：
  - `service.mjs:664`：`removalGroupSignature` 只含 ID、名称、路径、`canRemove`、`pluginId`、别名、`isLink`，不含 `agents`、各侧的 `removeKind`；
  - `service.mjs:1119`：执行时只看预览时算出的 `rules`。
- **复现**（E-B2）：
  1. Codex 个人技能 `dup` 与另一份同名副本，预览移除 Codex 个人那份，没有 `nativeRules`；
  2. 在当前项目的 `.claude/skills` 中建一个指向它的链接，它成为共用技能，Codex 一侧为真实目录；
  3. 执行不带 `confirm`，成功，目录被移走，Claude 一侧随之失效。
- **依据**：36c 第 6 节“整组签名与任一项的核对（含 Claude 对象与共用技能的状态）失败都整批拒绝（`REMOVAL_CHANGED`），一份都不移”；AC-003。
- **影响**：需要在预览后的 30 分钟内发生外部变化，内容可恢复，所以定为 P2。
- **建议**：二选一：
  1. 签名加入 `agents` 与各侧的 `removeKind`（或真实路径）；
  2. 执行时用当前快照重算 `removalRules`，比预览时多出规则就返回 `REMOVAL_CHANGED`。
  补用例。

### PH4C-P2-05 Codex“无法确认”在服务端只显示，界面却把它当作“未启用”

- **位置**：
  - `service.mjs:281` 与 `agents.mjs:86-93`：命令行不可用时，“无法确认”覆盖存储的已启用或只读；
  - `src/App.tsx:1460`、`:1472`：技能安装与添加来源对话框只把 `management === "enabled"` 的环境当作可选目标；
  - `src/AgentEnvironments.tsx:57-58`：只读时显示“启用管理”，已启用时显示“停用管理”，无法确认时两者都不显示。
- **证据**（E-U1）：Codex 存储为已启用、命令行不可用、Claude 已启用：
  1. 2 版快照中 Codex 为 `unconfirmed`，原因写“技能照常管理”；
  2. 按界面规则算出的可选 Agent 只剩 `["claude"]`。据 `InstallDialog.tsx:28-29`、`MarketDialog` 与 `creationAgent`：安装对话框显示“将安装到 Claude。”，没有 Codex 选项，添加来源也发往 Claude；
  3. 页面上没有“停用管理”，用户无法把仍在被写入的 Codex 设为只读（只有 Codex 时也是如此）；
  4. Codex 存储为只读时同样显示“无法确认”，原因仍写“技能照常管理”，而 `skill.toggle` 返回 `AGENT_READ_ONLY`。
- **影响**：与 HLD v1.17 修订表“不拒绝 Codex 的写操作”不符，在界面上等于拒绝了 Codex 的创建类操作，还去掉了停用开关。阶段 4c3 之前，Codex 不会出现这个状态。
- **建议**：二选一：
  1. 推荐：Codex 的 `management` 保持存储值（`enabled`、`read-only`），命令行不可用写进 `reason` 或 `notes`；这样也不与 PRD 5.1“无法确认：禁用写操作”冲突（见 P3-06 第 2 条）；
  2. 界面对 Codex 的“无法确认”按存储状态处理，原因文字随存储状态区分。
  补界面接线或纯函数用例。

### PH4C-P3-01 `SOURCE_CONFLICT` 的检查时机与比较方式

1. **检查时机**：只在 `skill.connectSource` 时检查（`service.mjs:592-598`），`skill.previewSource` 不查。36c 第 6 节与 7.3 把两者并列。用户要做完预览、核对差异后才得知冲突。
2. **比较方式**：比较的是原文字符串（`:567`）：
   - E-S3：经指向同一目录的链接路径关联，被判为冲突，提示里的“不同来源”实为同一目录；
   - Git 来源不写 `ref` 与显式写出默认分支名，也会被判为不同。
   这是偏保守的误报，可解除。
- **建议**：
  - 预览时即返回冲突；
  - 本地来源按真实路径比较；
  - 补“子目录或 ref 不同即冲突”的用例：M27（只比较 `source`）未被发现。

### PH4C-P3-02 Claude 一侧切换的翻译读了两次 Claude

- **位置**：`service.mjs:601-605`。
- **问题**：闸门用快照核对共用修订号之后，又调用一次 `claudeFor` 取 Claude 对象，用新读到的 `own.revision` 交给 `claudeAction`。两次读取之间 Claude 一侧的改动会被当作已核对。
- **建议**：直接用同一快照中的 `record.perAgent.claude.revision`。`side()` 中它就是 Claude 对象自己的 `revision`，`own.id` 也可由路径求得。

### PH4C-P3-03 过时的文字

1. `claude-actions.mjs:92-93`：注释与提示仍写“两侧共用技能的 Claude 一侧随后续版本提供”。触发它的是 Codex 独有技能以 `agent: "claude"` 切换（44 P3-05 第 2 条的情形）；此时共用技能的 Claude 一侧已经支持，这句话误导。建议改为与 `claudeSkillRecord` 一致的“这个技能在 Claude 一侧没有可以修改的对象。”。
2. `36c` 7.3 `skill.toggle` 一行仍写“两侧共用技能的 Claude 一侧在阶段 4c 之前返回 `UNSUPPORTED_FOR_AGENT`”。建议改为说明共用技能按 Claude 自己的条目写入、核对两侧共同的修订号。

### PH4C-P3-04 合并后 Claude 一侧两处错误顺序的变化

1. **安装预览**：`skill.previewInstall` 带 `scope: "local"` 时，作用域校验移到了暂存来源之后（`service.mjs:476-479`）。
   - 名称不合规时，错误由 400 `INVALID_ACTION` 变为 422 `INVALID_NAME`（E-PAR-C）；
   - Git 来源会先克隆，再被拒绝。
2. **恢复移除**：Claude 一侧现在先查 `TARGET_EXISTS`、再查 `RESTORE_BOUNDARY`（`:542-543`），旧版 Claude 分支顺序相反；Codex 一侧的顺序本就如此，未变。

两处都仍然拒绝，影响小。

- **建议**：侧对象增加一个在暂存前调用的请求校验（例如 `validateInstall(request)`），Codex 一侧为空操作。

### PH4C-P3-05 共用技能的 Claude 一侧在托管可见性下仍可移除

- **位置**：`service.mjs:342`。
- **复现**（E-PROT，托管设置文件位于临时世界）：托管设置把 `solo`、`shared` 的可见性设为关：
  - 只属于 Claude 的 `solo`：`protection: "managed"`，`canRemove` 为假，移除返回 `HOST_MANAGED`；
  - 共用技能 `shared` 的 Claude 一侧：同样 `protection: "managed"`，却 `canRemove` 为真，移除链接成功。
- **原因**：`decorateClaudeSkills` 跳过有保护的技能，`decorateSharedSkill` 不看保护。
- **建议**：两处一致——有保护时不可移除、不可更新；或两处都放开，并在文档写明“托管只约束可见性”。

### PH4C-P3-06 文档

1. **HLD 修订表**：HLD 末尾表的标题与元信息状态（`35-cross-agent-hld.md:424`、`:1546`）仍为“阶段 4a、4b 实现中的有限修订（v1.17）”，而 `7700683` 在其中加了 4c 的“Codex 环境的无法确认”一行，版本未变。建议改标题与状态，或升 v1.18。
2. **“无法确认”的含义**：Codex“无法确认”只显示、不拒绝，HLD 修订表已写明；但以下各处未同步：
   - PRD 5.1 状态表（`34:959`）写“无法确认：显示原因，禁用写操作”；
   - 36c 第 8 节 `AGENT_UNCONFIRMED` 写“写操作全部禁用”；
   - 36c 第 5 节（冻结）写“处于无法确认……1 版客户端的 Codex 写请求会收到 `AGENT_UNCONFIRMED`”；
   - 36c 第 6 节的“暂停”定义包括“处于无法确认”，未写命令行不可用时只暂停插件目标。
   建议在 36c 第 6、8 节写明 Codex 的这一例外，或按 P2-05 的推荐做法不再把它显示为“无法确认”。
3. **37 进度行**：
   - “来源不同则两侧都不能更新”只在快照中成立（P2-02）；
   - “共用技能的检查更新与更新结果带说明”只限技能卡片路径，且界面不显示（P2-01）；
   - 4c0 段“去掉共用实现中的本地修改核对，Codex 与 Claude 两侧的用例同时失败”本轮无法复现（P3-07）。
4. **41**：UI-09 之外，以下两项未记：
   - 更新对话框不显示 `nativeRules`；
   - 批量移除预览不显示 `nativeRules`（执行时才由通用确认框补上）。

### PH4C-P3-07 测试缺口

本轮 60 项变异（另有基线 M00）中 20 项未被发现（第 6.2 节）。按价值分两组：

| 组 | 变异 | 缺的用例 |
|----|------|----------|
| 建议补 | M21 | 共用技能的 `skill.connectSource` 不带修订号返回 `SNAPSHOT_STALE`（E-S1 的做法） |
| | M25 | 移除指向另一侧插件目录的**链接**不需要确认（只有目录需要） |
| | M27 | 子目录或 `ref` 不同即 `SOURCE_CONFLICT` |
| | M33、M39 | 另一侧记录来源不同时不同步；Claude 一侧更新时同步 Codex 记录（可用注册表直接构造） |
| | M37 | 共用技能的 Claude 一侧不在 Claude 技能根中时不可移除 |
| | M52 | 批量移除中有改写另一侧插件内容的项时，预览带 `affected-plugins` 并要求确认 |
| | M54、M55 | 批量含 Claude 副本时持有 Claude 锁、Claude 根不存在时不创建（E-B4、E-B6 的做法） |
| | M56、M58、M59 | 批量移除 Claude 链接副本不动来源记录；目录副本删除以真实路径为键的 Claude 记录，恢复时还原（项目路径为链接时做一次） |
| | M61 | 1 版批量移除共用技能不读多 Agent 快照、不要求确认（E-B5 的做法） |
| | M73 | Claude 已启用、Codex 未安装时 Codex 目标全部暂停（E-P 的做法） |
| | M01、M01b、M01c、M01d | 四处本地修改核对各只有一侧的用例钉住：M01、M01b、M01d 只有 Codex 用例失败，M01c 只有 Claude 用例失败。`37` 中“去掉共用实现中的本地修改核对，两侧用例同时失败”本轮无法复现；合并后的事务若要由两侧用例共同守住，需为每处核对补另一侧的用例 |
| 可不补 | M02、M41 | 纵深防御：恢复与 Claude 一侧的分发已先按记录与对象类型挡住 |
| | M40 | 等价变异（见观察 8） |
| | M04、M06、M11 | 0.10.2 原有的缺口：Codex 一侧链接没有来源记录、恢复边界、安装时目标已存在（`move` 本身也不覆盖）；不是 4c 引入的 |

## 5. 文档判定

| 文档与位置 | 判定 | 说明 |
|-----------|------|------|
| HLD 3.4“完全复用现有文件事务” | 一致 | 4c0 合并后成立；44 第 3.3 条件 3 已满足 |
| HLD 末尾修订表“技能文件事务的复用方式”一行 | 一致 | 与 `skillOperation` 和两个侧对象相符 |
| HLD 末尾修订表“Codex 环境的无法确认”一行 | 服务端一致，界面不一致 | 服务端只显示不拒绝、暂停条件与实现一致（E-U1、E-P）；界面的后果见 P2-05；表标题与状态仍只写 4a、4b（P3-06 第 1 条） |
| HLD 3.5“服务端同样拒绝” | 部分一致 | 来源冲突的“两侧都不能更新”服务端未拒绝（P2-02） |
| HLD 3.6、6.4 与 PRD 5.1 的“无法确认” | 不一致（已由 HLD 修订表声明例外，PRD 未同步） | P3-06 第 2 条 |
| HLD 3.7 DEC-SDX-010 锁顺序 | 一致 | 批量移除中的 Claude 副本按“实例锁 → Codex 锁 → Claude 锁”取锁，不创建根目录（E-B4、E-B6） |
| HLD 3.8 暂停 | 一致 | 只在 Claude 已启用管理时暂停 Codex 目标，与修订表一致 |
| 36c 第 6 节“共用对象”：启禁、移除、恢复 | 一致 | E-S1、E-S2、E-S6 与新用例 |
| 36c 第 6 节“更新” | 部分一致 | 技能卡片路径的服务端一致；更新页绕过、界面不显示说明（P2-01）；冲突时服务端不拒绝（P2-02） |
| 36c 第 6 节“关联来源”与 `SOURCE_CONFLICT` | 基本一致 | 只在关联时检查，比较原文字符串（P3-01）；同步与恢复还原一致 |
| 36c 第 6 节“跨侧影响提示” | 部分一致 | 单个移除、技能卡片更新一致；更新页绕过（P2-01）；后台计划中的确认随阶段 5，`37` 已写明 |
| 36c 第 6 节“批量移除” | 部分一致 | `ids` 可含 Claude 对象 ID、预览带规则、执行须确认、整批原子都一致；环境检查与执行时的共用状态核对不一致（P2-03、P2-04） |
| 36c 第 6 节“2 版请求的判定” | 部分一致 | 多目标操作的环境检查见 P2-03 |
| 36c 7.1 `expectedRevision` | 部分一致 | 技能卡片路径一致；更新页 `update.apply` 不核对（P2-01） |
| 36c 7.3 `skill.toggle` 一行 | 过时 | P3-03 第 2 条 |
| 36c 7.3 批量移除、关联来源两行 | 基本一致 | 同上两条 |
| 36c 第 8 节 `SOURCE_CONFLICT`、`AGENT_UNCONFIRMED` | 部分一致 | 前者一致；后者对 Codex 的例外未写（P3-06 第 2 条） |
| 37 4c 拆分行 | 一致 | 四项内容都已实现 |
| 37 阶段 4 进度行（4c0、4c1、4c2/4c3 段） | 基本一致 | 三处说法偏宽或无法复现（P3-06 第 3 条；3.1、6.2） |
| 41 UI-09 | 一致 | 共用技能 Claude 一侧在界面上没有入口，与实现一致；另有两项未记（P3-06 第 4 条） |
| PRD AC-003 | 部分达成 | “只出现一次”“移除前提示”已达成；“更新前提示”在界面上未达成（P2-01） |

## 6. 验证命令与结果

### 6.1 命令

所有测试与实验都在导出副本中运行，经 `run.sh` 进入沙箱 `…/verify/phase2-review/hermetic.sb`：
- 拒绝向外网连接，拒绝执行本机的 Codex、Claude 命令行；
- `env -i` 清空环境，`HOME`、`TMPDIR` 指向 `…/review-4c/` 下的临时目录，`PATH` 只保留最小集合；
- 经 `NODE_OPTIONS=--import` 加载连接守卫：拒绝连接 4771、4781 与非本机地址，并记录。

下表 `$R` 指 `…/scratchpad/review-4c`，应用目录指 `plugins/skilldock/skills/skill-manager/assets/app`。

| 命令 | 位置 | 结果 |
|------|------|------|
| `git archive 7700683 \| tar -x -C $R/export`；`git archive 9a727bf \| tar -x -C $R/parent`；两处应用目录各建立指向主工作区 `node_modules` 的符号链接 | 主工作区（只读）→ scratchpad | 完成 |
| `node --test` 12 个文件：`shared-skills`、`claude-skill-files`、`claude-skill-guards`、`agents`、`backend-lifecycle`、`backend-security`、`backend-updates`、`duplicate-selection`、`source-links-diff`、`custom-paths`、`agent-ui`、`multi-agent` | 导出副本 | **129/129 通过**，约 9 秒 |
| `node --test` 14 个文件（上面 12 个加 `claude-skill-visibility`、`claude-actions`），即变异所用的集合 | 导出副本 | **156/156 通过**，约 10 秒 |
| `./node_modules/.bin/tsc --noEmit`（TypeScript 7.0.2，核对了 39 个 `src` 文件） | 导出副本 | 通过 |
| `native/build.json` 哈希核对（`node -e`，只读） | 导出副本 | 52 个输入、4 个产物全部一致；`ui.html` 含新译文 |
| 变异 61 项（`$R/mut/run.mjs`）：每项在与导出副本同构的目录 `$R/mut/tree/skill-manager/assets/app` 中重建应用目录，改一处，运行上面 14 个文件，结束删除；调度本身也在沙箱内；M00 为不改动的基线 | `$R/mut/tree` | 见 6.2 |
| 实验（脚本在 `$R/exp/`，共用世界见 `world.mjs`） | 临时目录 | 见 6.3 |
| 守卫记录 `$R/guard.log` | — | 文件不存在：没有任何连接被拦截 |

说明：
- 完整套件与兼容矩阵按委托未运行。
- 第一次变异运行把应用目录复制到了另一层级，`SkillDock itself…`（取 `../../../` 作为 SkillDock 技能目录）与 `headless scheduled update…` 两个用例在所有变异下都失败，该次结果作废。改为同构目录后，基线 M00 为 0 失败，再整体重跑。

### 6.2 变异结果

| 编号 | 变异 | 结果 |
|------|------|------|
| M00 | 基线（不改动） | 0 失败 |
| M01 | 更新前不核对本地修改 | 被发现（失败 1 项） |
| M01b | 检查更新不核对本地修改 | 被发现（失败 1 项） |
| M01c | 恢复更新不核对新修改 | 被发现（失败 1 项） |
| M01d | 关联来源不核对预览后修改 | 被发现（失败 1 项） |
| M02 | 恢复不核对记录的一侧 | 未被发现 |
| M03 | Codex 来源键改为目录 | 被发现（失败 16 项） |
| M04 | Codex 移除链接也保留来源（偏离 0.10.2） | 未被发现 |
| M05 | Claude 移除链接删掉来源 | 被发现（失败 1 项） |
| M06 | Codex 恢复不核对边界 | 未被发现 |
| M07 | Claude 恢复不核对技能根 | 被发现（失败 1 项） |
| M08 | Codex 安装不核对安装根 | 被发现（失败 1 项） |
| M09 | Claude 安装不核对受保护根 | 被发现（失败 1 项） |
| M10 | 更新不核对来源是否重新关联 | 被发现（失败 2 项） |
| M11 | 安装不核对目标已存在 | 未被发现 |
| M12 | 来源预览不拒绝链接与 Git 仓库 | 被发现（失败 1 项） |
| M13 | 恢复不还原来源记录 | 被发现（失败 2 项） |
| M14 | Codex 恢复后不清链接缓存 | 被发现（失败 2 项） |
| M20 | 共用技能不核对修订号 | 被发现（失败 1 项） |
| M21 | 关联来源不核对修订号 | 未被发现 |
| M22 | 移除共用链接也要求确认 | 被发现（失败 1 项） |
| M23 | 移走共用目录不确认 | 被发现（失败 1 项） |
| M24 | 另一侧插件内容不确认 | 被发现（失败 1 项） |
| M25 | 移除指向插件目录的链接也确认 | 未被发现 |
| M26 | 不检查 SOURCE_CONFLICT | 被发现（失败 1 项） |
| M27 | 同源比较忽略子目录与 ref | 未被发现 |
| M28 | Claude 一侧切换不翻译为自己的条目 | 被发现（失败 1 项） |
| M29 | 翻译时沿用共用修订号 | 被发现（失败 1 项） |
| M30 | 更新不带两侧都变的说明 | 被发现（失败 1 项） |
| M31 | 更新结果不带说明 | 被发现（失败 1 项） |
| M32 | 更新不同步另一侧记录 | 被发现（失败 1 项） |
| M33 | 另一侧来源不同也同步 | 未被发现 |
| M34 | 恢复不还原另一侧记录 | 被发现（失败 1 项） |
| M35 | 来源不同不标为两侧都不可更新 | 被发现（失败 1 项） |
| M36 | 两侧都可更新时不以 Codex 为准 | 被发现（失败 1 项） |
| M37 | Claude 一侧总可移除 | 未被发现 |
| M38 | Claude 记录不取 Claude 一侧 | 被发现（失败 3 项） |
| M39 | Claude 一侧更新不同步 Codex 记录 | 未被发现 |
| M40 | 1 版请求也走 2 版规则 | 未被发现 |
| M41 | Codex 独有技能也按 Claude 处理 | 未被发现 |
| M42 | 界面不为共用技能带修订号 | 被发现（失败 1 项） |
| M50 | 批量不识别 Claude 副本 | 被发现（失败 2 项） |
| M51 | 批量不提示共用目录 | 被发现（失败 1 项） |
| M52 | 批量不提示另一侧插件 | 未被发现 |
| M53 | 批量执行不要求确认 | 被发现（失败 1 项） |
| M54 | 批量不取 Claude 锁 | 未被发现 |
| M55 | 批量取锁时可能创建 Claude 根 | 未被发现 |
| M56 | 批量移除 Claude 链接时删掉目标的来源记录 | 未被发现 |
| M57 | Claude 副本的记录不带侧别 | 被发现（失败 1 项） |
| M58 | 批量移除 Claude 副本不删来源记录 | 未被发现 |
| M59 | Claude 副本来源键不用真实路径 | 未被发现 |
| M60 | 1 版也接受 Claude ID | 被发现（失败 2 项） |
| M61 | 1 版预览也读多 Agent 快照 | 未被发现 |
| M62 | 执行时按 Codex 核对 Claude 副本 | 被发现（失败 2 项） |
| M63 | Claude 副本移动不带 Claude 根边界 | 被发现（失败 2 项） |
| M64 | 批量执行不核对身份 | 被发现（失败 2 项） |
| M70 | 不显示 Codex 无法确认 | 被发现（失败 1 项） |
| M71 | 只管理 Codex 时也暂停 | 被发现（失败 1 项） |
| M72 | 技能目标也因命令行暂停 | 被发现（失败 1 项） |
| M73 | Codex 未安装不暂停 | 未被发现 |
| M74 | Codex 无法确认时拒绝写入 | 被发现（失败 2 项） |

合计 60 项变异（另有基线 M00），被发现 40 项，未被发现 20 项：M02、M04、M06、M11、M21、M25、M27、M33、M37、M39、M40、M41、M52、M54、M55、M56、M58、M59、M61、M73。

清单与逐项结果在 `$R/mut/mutations.mjs`、`$R/mut/results.tsv`（M01b～M01d 在 `results-M01b-M01c-M01d.tsv`）。

### 6.3 实验摘要

| 编号 | 内容 | 结果 |
|------|------|------|
| E-PAR | Codex 一侧，28 个 1 版请求，新旧两版对照 | 归一化后逐字相同 |
| E-PAR-C | Claude 一侧，24 个 2 版请求，新旧两版对照 | 只有 `scope: "local"` 加不合规名称时错误码不同；恢复数据键顺序不同（P3-04） |
| E-S1 | 修订号覆盖两侧；旧修订号与缺修订号 | 两侧任一变化都改变修订号；Codex 移除、Claude 切换、关联来源都返回 `SNAPSHOT_STALE` |
| E-S2 | 共用技能 Claude 一侧从 `name-only` 切换 | 先确认（`visibility`、`reload`），确认后只写 Claude 用户设置；Codex 一侧不变 |
| E-S2b | Codex 一侧移除共用的真实目录 | `CONFIRMATION_REQUIRED`，`scope` |
| E-S3 | 关联来源的比较 | 同路径、显式 `subpath: "."` 通过；经链接路径判为冲突（P3-01） |
| E-S4 | 1 版造成来源冲突后，2 版与更新页的更新 | 快照三处 `canUpdate` 为假；2 版 `skill.update` 成功；更新页可应用（P2-02） |
| E-S5 | 更新页更新共用技能 | 无说明；错误修订号也成功（P2-01） |
| E-S6 | Claude 拥有目录、Codex 链接：Codex 一侧移除 | 只移除链接，不确认；Claude 目录保留 |
| E-S7 | 同步后 Claude 以相同来源重新关联，再恢复更新 | Claude 记录写回更新前的值，与内容一致（观察 5） |
| E-A | Codex 技能位于 Claude 技能目录插件中 | 卡片更新先确认；更新页不确认、插件内容被改写（P2-01） |
| E-B1、E-B1b | Codex 只读时批量移除两份 Claude 副本；Claude 只读时含 Claude 副本的预览 | `AGENT_READ_ONLY`（P2-03）；`PROTECTED_SKILL` 并给出原因 |
| E-B2 | 预览后副本变成共用 | 不确认即移走（P2-04） |
| E-B3 | 批量移除 Claude 链接副本 | 来源记录不变；按 Claude 一侧恢复为链接；1 版快照不含记录 |
| E-B4 | 两份副本，第二次移动失败；三把锁 | 全部回滚、两分区不变、一条失败记录；移动时三把锁都在、之后都释放 |
| E-B5 | 1 版批量移除共用技能 | 不确认（0.10.2） |
| E-B6 | Claude 根不存在时批量移除项目副本 | 成功，未创建根目录 |
| E-U1 | Codex 命令行不可用，存储为已启用、只读 | 都显示“无法确认”和“技能照常管理”；已启用时切换成功、界面可选 Agent 只剩 Claude；只读时切换被拒（P2-05） |
| E-P | Codex 未安装且 Claude 已启用；命令行不可用而 Claude 只读 | 全部 `AGENT_PAUSED`；不暂停 |
| E-PROT | 托管可见性下的 Claude 独有技能与共用技能 Claude 一侧 | 前者 `HOST_MANAGED`，后者可移除（P3-05） |
| E-i18n | 23 条新提示（含组合）用生产翻译器 | 英、日全部有译文 |

## 7. 观察（不计入问题）

1. **守卫与网络**：守卫没有任何记录。定向测试、变异与实验期间都没有外连，也没有连接 4771、4781 的尝试。
2. **性能**：
   - 每个 2 版技能请求（`SHARED_GATED` 中的六种操作）在闸门里多做一次强制的完整多 Agent 快照，包括只属于一侧的技能；
   - 批量移除中，每份 Claude 副本在预览与执行时各触发一到两次强制快照（`claudeSkillRecord` 内部）。
   同名副本通常很少，可接受；以后若批量规模变大，可改为每批只读一次。
3. **计划保存时的暂停豁免**：36c 第 6 节的保存校验规定，2 版请求中所属 Agent 已暂停的目标不阻断保存。`scheduler.mjs:105` 仍对每个目标要求 `canCheck`，不看暂停。这从阶段 3 起对只读的 Agent 就是如此，4c3 新增的 Codex 暂停沿用同一状况。属于计划部分，建议在阶段 5 跟踪。
4. **界面提示**：以下两种情形，成功提示仍追加“新的 Codex 会话或重载后生效”（`App.tsx:579` 只看 `result.agent`）：
   - 批量移除只含 Claude 副本；
   - Codex 一侧移走共用目录。
   界面问题按 Owner 决定留到重新设计。
5. **恢复时还原另一侧记录**：恢复一次更新时，另一侧的同源记录无条件写回更新前的值（`service.mjs:553`）。E-S7 中，之后以相同来源重新关联的记录因此被替换，但写回的值与恢复后的内容一致，可接受。若要更稳妥，可只在当前值仍等于当时同步的值时写回。
6. **多出一次无用的确认**：Claude 独有技能位于 Codex 插件目录中时：
   - 闸门先要求确认（`affected-plugins`）；
   - 确认后被 `claudeSkillRecord` 以 `TARGET_BOUNDARY` 拒绝（Codex 插件缓存属于受保护根）。
   结果不变，只是多一次确认。
7. **Codex 一侧的共用目录写入不取 Claude 锁**：Codex 一侧移走或更新共用目录时不取 Claude 锁。这把锁只在 SkillDock 实例之间起作用，对 Claude 本身没有约束；单实例下影响很小。
8. **等价变异**：
   - M40（1 版请求也进入闸门）未被发现，因为 1 版请求的 `perAgent[undefined]` 为空，后续判断自然失效；
   - M02、M41 为纵深防御，现有分发已先挡住。

## 8. 操作披露与结束状态

- **禁止事项**：本轮没有做以下任何一项：
  - 向 `127.0.0.1:4771` 或 `127.0.0.1:4781` 发请求；
  - 运行真实的 `codex`、`claude` 命令行（实验中的 Codex 适配器、Claude 命令行、清单、写入器与 git 都是替身）；
  - 下载或联网；
  - 运行 `launchctl`；
  - 读写或列出真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock*`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`（托管设置用的是临时世界中的 `no-managed` 目录）；
  - 打印任何配置文件全文。

  报告中没有密钥。
- **测试世界**：用 `createService` 搭的世界都写入代号 2、关闭后台计划（`background: false`），并注入以下替身：
  - `claudeCli`；
  - `claudeCatalog`（`managedDir`、`listPlugins`、`listMarketplaces`）；
  - `claudeWriter`；
  - `claudeGit`；
  - Codex `adapter`。
- **主工作区**：
  - 只运行了只读 git 命令：`log`、`show`、`diff`、`rev-parse`、`status`、`archive`、`branch --show-current`；
  - 唯一的写入是本报告（未提交）；
  - 没有提交、推送、切换分支或修改其他文件。
  - 评审期间 HEAD 由 `c6293c1` 变为 `259694c`，并出现未跟踪的 `46-cross-agent-phase4d-code-review.md` 与他人的未提交改动（见“结束状态”），都不是本评审所为。
- **沙箱内**：定向测试、类型检查、全部变异与实验。
- **沙箱外、默认环境下的辅助操作**（都只涉及 scratchpad 或只读）：
  - `git archive` 解包；
  - 建立 `node_modules` 符号链接；
  - 复制变异用的同构目录；
  - 用 `python3` 修改 scratchpad 中的实验与变异脚本；
  - 用 `node -e` 只读核对 `native/build.json` 哈希、归一化实验输出；
  - `grep`、`sed`、`cat`、`cut`、`shasum`、`du`、`ls`、`ps`、`pgrep`、`rm`（只删 scratchpad 中的临时文件）；
  - `pkill`、`kill`：只用于本会话自己启动的进程（作废的第一次变异运行、误阻塞的 `cat`）。
- **一次误操作**：一条命令里多写了一个读标准输入的 `cat >`，在 scratchpad 中建了一个空文件并阻塞；已结束该 `cat` 进程（本会话自己启动的）并删除空文件。
- **进程**：本轮启动的测试、实验与变异进程都已结束，没有遗留。
- **实验材料**：都在 `scratchpad/review-4c/` 中：
  - 导出副本 `export/`、`parent/`；
  - `exp/`：实验脚本与输出；
  - `mut/`：变异清单、调度脚本、结果与同构目录；
  - `run-targeted.out`、`run-targeted2.out`、`run-tsc.out`。
- **结束状态**：主工作区 HEAD 为 `259694c`（他人提交）。结束时工作区另有他人正在进行的改动：17 个已跟踪文件被修改（含 `service.mjs`、`App.tsx`、`35`、`36`、`36c`、`37`、`41`），新增 `src/ConfirmDialog.tsx` 与 `46` 号报告，均非本评审所为，本评审的结论只针对 `7700683`。本评审只新增本报告，未提交。

