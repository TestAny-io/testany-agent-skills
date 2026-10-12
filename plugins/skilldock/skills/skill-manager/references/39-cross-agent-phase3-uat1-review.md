# 代码复核报告：阶段 3 首次 UAT 反馈的修正（`3546331`）

> 本报告是独立代码评审意见，不是批准提交、推送、合并或发布的授权。源码结论与环境状态分开报告。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 上一轮 | [39-cross-agent-phase3-code-review-r3.md](39-cross-agent-phase3-code-review-r3.md)（APPROVED，带 P2） |
| 范围 | 只看 `3546331` 的改动及其直接影响。`git diff 6ec3525..3546331 -- plugins`：16 个文件，增 200 行、删 20 行，diff sha256 前缀 `0ac9ac7d8ff9` |
| Candidate | `3546331`（tree `d6dc513b…`），分支 `feature/skilldock-0.11-cross-agent`（本地） |
| 事实源 | PRD `34`（sha256 `e061ec25…`，未改）、HLD `35` v1.16（`2bd0c5b9…`，未改）、契约 `36c`（`a8cfe6b4…`，本提交改第 6 节）、实施计划 `37`（`55f7443a…`，本提交改）、UAT 说明 `40`（`055ac136…`，本提交改）、`24-background-updates.md` 第 7 条（后台卸载判断的既有约束） |
| 评审者 | 独立的 Claude 评审会话（委托子任务），只评审、不修改被审文件；不是人类评审，不代表任何 Owner |
| 日期 | 2026-10-09 |
| 工作区绑定 | 开始时 HEAD 为 `3546331`、工作区干净；结束时 HEAD 不变，工作区只多本报告（未提交） |

## 2. 结论

**APPROVED**（带 P2）

- P0：0
- P1：0
- P2：2（PH3U1-P2-01、PH3U1-P2-02，见第 4 节），不阻断 UAT 继续，但 PH3U1-P2-01 建议在本轮 UAT 结束前修复（改动小）
- P3：5（PH3U1-P3-01～05）
- UAT 反馈的三项修正：（1）Codex 读回只核实目标——对 Owner 报告的情形（其他插件来源失效、另一条记录被忽略）已修正，实验与测试都证实；但“目标自己的记录被忽略”只在记录带有与目标完全相同的 `pluginId` 时才能识别，见 PH3U1-P2-01。（2）Claude 未安装插件——去重、作用域、只读、修订号、规模都符合预期，只有 P3。（3）桌面应用插件附注——正确，英、日翻译齐全
- 后台任务：SkillDock 仍安装时，只有在它自己的记录被忽略且无法按 `pluginId` 归属时才会被误判为已卸载（停用计划并删除后台注册），见 PH3U1-P2-01；其余情形与改动前一样保守或更准确
- 是否需要 Owner 决定：不需要

本结论不授予推送、合并或发布权限。

## 3. 本提交各项修正的判定

| 项 | 判定 | 依据 |
|----|------|------|
| Codex 插件安装、卸载，marketplace 刷新、移除后只核实目标（`service.mjs:858`、`:900`、`:940`，`cli.mjs:194-197`） | **基本成立，有缺口** | Owner 报告的两类无关诊断（“插件 X：…”、另一条“无法安全使用”的记录）不再让操作报 `READBACK_FAILED`（`readback-scope` 第 2 个测试；实验 E2）。清单没读到（命令行不可用、命令失败、形状不受支持）时仍判为无法确认。缺口：被忽略的记录只在带字符串 `pluginId`（市场为字符串 `name`）时才记入 `dropped`，目标记录缺少这些字段或写法不同时，被当作“已不在”（PH3U1-P2-01） |
| 后台判断 SkillDock 是否已卸载用同一规则（`background-worker.mjs:37-41`） | **基本成立，有同一缺口** | 只改了“没找到 SkillDock”这一分支；找到时与改动前相同。没找到时，清单没读到或 SkillDock 的记录（按 `pluginId`）被忽略仍抛错、不删任务（`background-updates` 用例）。同一缺口下会误判为已卸载（实验 E1） |
| 没有 `listed` 的旧替身适配器保持旧规则 | 成立 | `listCovers` 在没有 `listed` 时退回“有诊断即无法确认”（`readback-scope` 第 1 个测试，变异 X17 被发现） |
| Claude 插件页列出未安装的插件（`claude-catalog.mjs:269-303`） | 成立 | 只读本机 marketplace 副本，不运行命令；`canInstall: false` 并给出原因；已在任何作用域安装（user/project/local，含其他项目路径）的不列；没有任何安装证据时一条不列；市场修订号不受影响；275 条约 5 ms（实验 E3）。名称校验与“其他项目的安装”见 P3-02、P3-03 |
| Claude 卡片附注桌面应用自带的插件（`agents.mjs:121`） | 成立 | 附注出现在 Claude 环境的 `notes` 中（`agents` 测试，变异 X16 被发现）；英、日翻译齐全（`agent-ui` 测试）；`native/build.json` 中 51 个输入与 4 个产物的哈希与 HEAD 文件一致，`ui.html` 含新英文文案 |

## 4. 问题

### PH3U1-P2-01 被忽略的记录只按 `pluginId`（市场按 `name`）归属；归属不上时，读回与后台把“仍在”当成“已不在”

- **位置**：
  - `cli.mjs:119`：记录校验失败时，只有 `typeof p?.pluginId === 'string'` 才记入 `dropped.plugins`，且只记 `pluginId` 原值；`:136` 市场记录同理，只记字符串 `name`。
  - `cli.mjs:194-197`：`listCovers` 只检查目标 ID 是否在 `dropped` 中。
  - 使用方：`background-worker.mjs:37-41`（判断 SkillDock 已卸载）；`service.mjs:900`（卸载读回）、`:940`（市场移除读回）。
  - 后果：`resolveBackgroundSource` 返回 `null` 后，`runBackground` 写入停用标记、把计划的 `schedule.enabled` 置为假、删除后台注册（`background-worker.mjs:132-136`，第二次判断见 `:151`），状态记为 `uninstalled`。
- **依据**：`24-background-updates.md` 第 7 条“无法可靠判断已卸载时保留并报告错误”；本提交说明“a list that was not read, or SkillDock's own record dropped, does not [prove SkillDock is gone]”；`37` 进度表“目标记录未被忽略”。
- **复现**（导出副本，沙箱；Codex 命令行为替身脚本）：
  - 实验 E1，SkillDock 的记录仍在 `installed` 中，只是被适配器忽略：

    | 情形 | `dropped.plugins` | `3546331` | `6ec3525`（改动前） |
    |------|------------------|-----------|--------------------|
    | A 记录缺少 `pluginId`（例如字段改名） | `[]` | 返回 `null`：判为已卸载 | 抛错，不删任务 |
    | B `pluginId` 换了写法（`test-market/skilldock`） | `["test-market/skilldock"]` | 返回 `null`：判为已卸载 | 抛错，不删任务 |
    | C 对照：`pluginId` 正常、版本不安全 | `["skilldock@test-market"]` | 抛错，不删任务 | 抛错，不删任务 |

  - 实验 E2，服务层读回：
    - a）`plugin.remove`：替身命令行没有真正卸载，变更后的记录缺少 `pluginId` → `3546331` 返回“已卸载插件 demo”；改动前 `READBACK_FAILED`。
    - c）`marketplace.remove`：替身没有真正移除，变更后的市场记录缺少 `name` → `3546331` 返回“已移除市场来源 market”；改动前 `READBACK_FAILED`。
    - b）对照：变更后 marketplace list 失败 → 两版都是 `READBACK_FAILED`（`listed` 起作用）。
- **影响**：触发需要 Codex 命令行对目标记录给出归属不上的身份（字段改名、`pluginId` 换写法等）。Owner 当前环境中 SkillDock 自己的记录是正常的（插件页能显示它），所以眼下不会触发。但“无法安全使用的记录”这道校验正是为命令行输出变化准备的：改动前任何诊断都会让判断停住；改动后，后台会在无人值守时停用用户的更新计划并删除后台注册，前台会把没有发生的卸载、移除报为成功。
- **建议**：
  1. 记录被忽略时，把能取到的身份都记入 `dropped`：`pluginId`（是字符串就记）与 `${name}@${marketplaceName}`（两者都是字符串就记，不要求通过 `safeSegment`）；市场同时记 `name` 与其他可能的标识字段。
  2. 一条记录连这些身份都取不到（不是对象，或没有任何字符串身份字段）时，记为“身份不明”（例如 `dropped.unidentified.plugins` 计数）。`listCovers` 遇到该清单有身份不明的记录时返回假。后台的卸载判断是破坏性的，至少要遵守这一条；前台读回也建议遵守。
  3. 修正前先弄清 Owner 环境中那条长期存在的“无法安全使用”的记录属于哪一类（见 P3-01，诊断带上身份摘要后即可看到），确认第 2 条不会把本次 UAT 修掉的误报带回来。若它正好身份不明，前台读回可只对能归属的记录从严，后台判断仍按第 2 条。
  4. 补测试：E1 的 A、B，E2 的 a、c。

### PH3U1-P2-02 几处关键保护没有测试

变异实验（第 6 节）18 项中 8 项未被发现。其中与本提交的保护直接相关的：

| 变异 | 说明 | 为什么重要 |
|------|------|-----------|
| X01 去掉 `service.mjs:940` 的 `listCovers` | 市场移除、刷新的读回不再看清单是否读到 | 对**移除**来说，`listed.marketplaces` 是唯一防止“清单读失败 → 目标不在 → 报已移除”的条件（实验 E2b 证实当前代码正确）。现有测试只测了**刷新**：刷新时市场清单读失败，目标本来就不在，存在性检查已经让它失败，所以去掉 `listCovers` 也测不出来 |
| X07 市场清单命令失败时仍置 `listed.marketplaces` | 同上 | 同上 |
| X06 市场记录被忽略时不记入 `dropped` | 移除后市场记录仍在但被忽略 | 会报“已移除” |
| X04 插件清单形状不受支持时仍置 `listed.plugins` | 卸载读回与后台判断都依赖它 | 形状变化时会把“读不懂”当成“不在” |
| X03 去掉 `service.mjs:858` 的 `listCovers` | 官方目录插件安装的读回 | 本提交改了这一行，没有任何测试经过它（`remote-directory` 的世界中没有诊断） |
| X09 Claude 去重只看用户作用域 | 新测试的 marketplace 副本中没有只在 project 作用域安装的 `b` | 委托点名的“任意作用域”没有被钉住（实现本身正确，实验 E3a） |
| X15 Agent 卡片插件计数包含未安装插件 | `agent-ui` 的夹具中没有 `installed: false` 的插件 | Claude 一侧现在有约 275 条未安装插件，计数一旦算错会很显眼 |
| X10 不校验 marketplace 名称 | — | 次要 |

- **建议**：在 `readback-scope` 的世界中补：`marketplace.remove` 后清单读失败、市场记录被忽略（`root` 改为相对路径）→ `READBACK_FAILED`；变更后插件清单形状不受支持 → `READBACK_FAILED`；在 `remote-directory` 的世界中补“无关诊断不影响、目标被忽略则失败”；`claude-catalog` 的新用例让副本包含只在 project、local 作用域安装的插件与名称不安全的 marketplace；`agent-ui` 的夹具加一条 `installed: false` 的 Claude 插件，断言计数不变。连同 PH3U1-P2-01 的 4 种情形。

### PH3U1-P3-01 被忽略记录的诊断不指名；后台错误提示指向错误原因

- `cli.mjs:119` 的诊断对每条被忽略的记录都是同一句“CLI 返回了无法安全使用的插件身份或版本，已忽略该记录。”，不说是哪条。Owner 反馈这条诊断长期存在，本提交让它不再阻断，但 Owner 仍无从知道是哪个插件、该怎么处理。
- `background-worker.mjs:40` 的错误提示是“请恢复 Codex CLI 后重试”。本提交后，SkillDock 自己的记录被忽略也走这条提示，而此时命令行是正常的。
- **建议**：诊断带上被忽略记录的身份摘要（`pluginId` 或 `名称@市场`，去掉控制字符、截断长度后再 `redact`），相同的诊断合并；后台提示区分“清单没读到”和“SkillDock 的记录无法安全使用”。

### PH3U1-P3-02 Claude 名称校验偏宽

- `claude-catalog.mjs:28` 的 `plainName` 只排除 `@`、空白、`/`、`\`、`.`、`..`，允许 `:`、NUL 等控制字符和 U+202E 等方向控制字符。
- 实验 E3b：名为 `m:user` 的 marketplace 中的插件 `a` 得到 ID `claude:plugin:a@m:user`，与在用户作用域安装的 `a@m` 的 ID 完全相同；名称 `ev‮il`、`nul\u0000x` 都通过校验并进入快照。
- 影响很小：需要 Claude 自己允许这类名称（大概率不允许），对象只读，界面由 React 转义。
- **建议**：名称与 marketplace 名称都按 Claude 的命名规则校验（例如小写字母、数字、`-`、`.`、`_`），至少排除 `:` 与 `\p{C}`。

### PH3U1-P3-03 “任意作用域已安装”依赖命令行清单覆盖所有项目

- `claude-catalog.mjs:270`：命令行清单读取成功时，去重只用命令行清单（以所选项目为工作目录运行），不读 `installed_plugins.json`。
- 实验 E3a 证实：命令行清单中带其他项目路径的 project、local 安装都会被排除。但 `claude plugin list --json` 是否返回**其他项目**的 project、local 安装没有核实（HLD 9.3 V10 只核实了同一项目的 user 与 project 两条记录）。如果它只返回当前项目的，只装在其他项目中的插件会被列为“未安装”。
- **建议**：`installed_plugins.json` 可读时，把其中的 ID 一并并入去重集合（本机文件，不联网）；或在隔离环境中核实命令行的行为，并记入 HLD 9.3。

### PH3U1-P3-04 插件页的计数与说明没有跟随 Agent

- `App.tsx:1115-1118` 左侧筛选的计数（全部、已启用、已安装、未安装）不按 Agent 筛选；`App.tsx:695` 的 Agent 计数包含未安装的插件。Claude 一侧多出约 275 条未安装插件后：选 Claude、切到“未安装”时，左侧“未安装”的数字是 Codex 与 Claude 之和，标题旁的数字只算 Claude；停在“已安装”时，Claude 的 Agent 计数显示约 280。这是既有语义，但现在差得很明显，而 UAT 说明正好请 Owner 这样操作。
- `App.tsx:1120` 的说明“也可直接从 Git 或本地目录安装单个插件”只适用于 Codex。
- **建议**：计数跟随当前 Agent 筛选；说明按 Agent 区分。

### PH3U1-P3-05 文档小处

- 契约 `36c` 第 10 节写“‘可安装插件’在用户打开时单独请求”。现在快照中已带有来自本机副本的 Claude 未安装插件，建议补一句：首屏快照中的未安装插件取自本机 marketplace 副本；联网的 `--available` 清单仍在用户打开时单独请求（阶段 4）。
- HLD 3.2 表中“可安装插件”的主证据（命令行 `available`）在阶段 3 完全不用，`37` 只写了“在 SkillDock 中刷新 Claude marketplace 随阶段 4”，建议写明主证据何时开始使用。
- marketplace 副本不可读或格式不对时，`claude-catalog.mjs:296` 静默跳过（插件数为 0、不列未安装插件、没有诊断）。这是插件数沿用的既有做法，但现在会让 Owner 看到某个 marketplace 下“未安装”为空却不知原因，可考虑加一条诊断。

## 5. 按委托重点的核查

### 5.1 只核实目标：会不会把“未完成”判成“已完成”

| 情形 | `3546331` 的行为 | 判定 |
|------|------------------|------|
| 命令行不可用（探测失败） | `listed` 全为假 → `READBACK_FAILED`；后台抛错 | 正确 |
| 变更后插件清单命令失败 | `listed.plugins` 为假 → `READBACK_FAILED` | 正确（`backend-security` 既有用例覆盖，X05 被发现） |
| 变更后插件清单形状不受支持 | `listed.plugins` 为假 | 正确，无测试（X04） |
| 目标记录被忽略，`pluginId` 与目标相同 | 记入 `dropped` → `READBACK_FAILED`；后台抛错 | 正确（`readback-scope`，X18 被发现） |
| 目标记录被忽略，缺少 `pluginId` 或写法不同 | 未记入 → 当作“不在” | **误判**（PH3U1-P2-01，E1 A/B、E2a） |
| 目标在 `installed` 中正常，`available` 中另有同 ID 的被忽略记录 | `READBACK_FAILED` | 偏保守：可能把成功的安装报为无法确认，不会误报成功 |
| 目标自己的“插件 X：组件范围无法确认”诊断 | 不再使安装读回失败；插件照常标为不可卸载并显示诊断 | 可以接受：安装终态确实已确认（观察 2） |
| 变更后市场清单失败（移除） | `READBACK_FAILED` | 正确（E2b），无测试（X01、X07） |
| 市场记录被忽略，`name` 为字符串 | 记入 `dropped` → `READBACK_FAILED` | 正确，无测试（X06） |
| 市场记录缺少 `name` | 当作“不在” → 报已移除 | **误判**（PH3U1-P2-01，E2c） |
| 没有 `listed` 的旧替身适配器 | 任何诊断即无法确认 | 正确（单元测试，X17 被发现） |

`listed` 的置位时机：插件清单在 `installed`、`available` 都是数组后、逐条校验前置真；逐条校验中途抛错时 `list()` 整体失败，调用方按失败处理，不会返回“已置真但清单不完整”的结果。市场清单在 `marketplaces` 是数组时置真，命令失败或形状不对时保持为假。置位时机正确。

插件操作的读回不再要求市场清单完整：安装、卸载的终态只由插件清单决定，合理。快照的 HTTP 响应由 `scanner.mjs:158` 逐项构造，`listed`、`dropped` 不会透给客户端，不涉及契约。

### 5.2 后台任务会不会在 SkillDock 仍安装时误判为已卸载

- 本提交只改了“清单中没找到已安装的 SkillDock”这一分支（`background-worker.mjs:39-41`）。找到时与改动前相同：改动前诊断本来就不影响这一分支。
- 没找到时：命令行不可用、插件清单没读到、SkillDock 的记录按 `pluginId` 被忽略，都抛错且不删任务（测试与 E1 C）。只有 SkillDock 的记录被忽略且归属不上时会误判（E1 A、B）。后果与依据见 PH3U1-P2-01。
- 改进的一面：Owner 环境中长期存在的无关诊断，改动前会让“真的卸载了 SkillDock”也永远判不出来（任务一直报错重试）；现在能正常清理。

### 5.3 Claude 未安装插件

- **名称校验**：插件名与 marketplace 名都要求是能写成 `名称@marketplace` 的单段名称；`../e`、`f@g`、`null` 被排除（测试）。偏宽之处见 P3-02。
- **去重**：同一副本中重复的名称只列一次；已在任何作用域安装的（user、project、local，含其他项目路径）都不列（E3a）；去重集合排除了 `@skills-dir`。技能目录插件 `sd@skills-dir` 与 marketplace 中的 `sd@m` 是两个身份，后者照常列为未安装，这与 Claude 的身份规则一致。
- **安装证据**：命令行清单为空数组时全部列出（确有证据表明都没装）；命令行失败且没有 `installed_plugins.json` 时一条不列（E3d1、d2，测试覆盖，X13 被发现）。
- **只读**：`canInstall`、`canRemove`、`canToggle` 都为假（X14 被发现），原因为“可以在 Claude Code 中用 /plugin 安装”。`markReadOnly` 只作用于 Codex，不会覆盖这条原因。服务端对带 `agent: 'claude'` 的写请求返回 `UNSUPPORTED_FOR_AGENT`；不带 `agent` 的请求按 1 版处理，快照中没有 Claude 对象，返回 `NOT_FOUND`。
- **合并与 ID**：`mergeClaude` 直接追加；Codex 插件 ID 没有前缀，Claude 未安装插件为 `claude:plugin:<名称>@<marketplace>`，两侧不会冲突（Claude 内部的冲突见 P3-02）。ID 写法与契约 `36c` 第 6 节新增的一句一致。
- **界面**：卡片显示“未安装”与禁用的“安装插件”按钮（卡片上不显示原因，与 Codex 中不可安装插件的做法相同）；详情显示原因；`ClaudePluginFacts` 对没有 `installation` 的对象不渲染；“Agent 环境”页的插件数只算已安装的（`AgentEnvironments.tsx:27`，正确但无测试，X15）。计数问题见 P3-04。
- **市场修订号**：计算时只包含已安装插件，与契约“覆盖其自动更新设置与从它安装的插件集合”一致（测试，X12 被发现）。
- **规模**（E3c，合成数据，每条描述 200 字符）：275 条未安装插件时 `claudeCatalog` 中位数约 4.7 ms，插件部分 JSON 约 150 KB；4999 条时约 28.5 ms、约 2.8 MB。快照另有 15 秒缓存；界面列表按 48 条分页。没有性能问题。
- **不联网**：只读取 `<installLocation>/.claude-plugin/marketplace.json`，不新增任何命令调用。

### 5.4 测试是否覆盖

- `readback-scope.test.mjs`：`listCovers` 单元测试；无关问题不阻断卸载、安装、刷新；目标记录（按 `pluginId`）被忽略、市场清单读失败（刷新）时失败。缺口见 PH3U1-P2-02 与 P2-01。
- `claude-catalog.test.mjs`：未安装插件的列出、排除、只读、原因、修订号、安装证据。缺口：其他作用域（X09）、marketplace 名称（X10）。
- `background-updates.test.mjs`：用手工构造的 `listed`、`dropped` 覆盖三种分支（X08、X17 被发现）；没有经过真实适配器的端到端用例，所以 P2-01 的情形测不到。
- `agents.test.mjs`：新附注（X16 被发现）。`agent-ui.test.mjs`：两条新文案的英、日翻译。
- 变异实验：18 项中被发现 10 项，未被发现 8 项（第 6 节）。

### 5.5 文档与实现是否一致

- `40` UAT 说明的三条修正、`restart` 命令（`launch.sh` 支持 `start|restart`）、核对要点与已知限制都与实现一致。“只核实这次操作的对象”在 PH3U1-P2-01 修复前并不完全成立，但对 Owner 实际会遇到的情形成立。
- `37` 进度表：“沙箱中完整套件 389 项通过”与本轮结果一致；“目标记录未被忽略”同上。
- `36c` 第 6 节的新 ID 写法与实现一致；第 10 节见 P3-05。

## 6. 测试与实验

全部测试与实验都在沙箱 `phase2-review/hermetic.sb` 中运行（禁止执行本机 Codex、Claude 命令行，禁止非本机外连）。环境为 `env -i`，`HOME`、`TMPDIR` 指向 `scratchpad/verify/phase3-uat1-review/`，并通过 `NODE_OPTIONS=--import` 加载连接守卫，拒绝连接 4771、4781 端口与非本机地址。

| 运行 | 位置 | 结果 |
|------|------|------|
| 委托指定的定向测试：`readback-scope`、`claude-catalog`、`background-updates`、`agents`、`agent-ui` | 工作区 `assets/app` | 48/48 通过 |
| 完整套件 `npm test` | 工作区 | 389/389 通过，约 79 秒 |
| 涉及 npm 的 7 个测试文件逐个重跑（定位守卫记录，见第 8 节） | 工作区 | 130/130 通过，守卫无记录 |
| 变异基线：上述 5 个文件加 `multi-agent`、`remote-directory`、`backend-lifecycle`、`backend-security`、`backend-updates`、`direct-plugins`、`plugin-reconciliation` | `git archive 3546331` 的导出副本 | 127/127 通过 |
| `tsc --noEmit` | 导出副本 | 通过 |
| 实验 E1（后台卸载判断，A～D 四种记录，新旧两版对比） | `3546331` 与 `6ec3525` 的导出副本 | 见 PH3U1-P2-01 |
| 实验 E2（服务层读回：卸载、市场移除的三种情形，新旧两版对比） | 同上 | 见 PH3U1-P2-01 |
| 实验 E3（Claude 未安装插件：作用域去重、名称、规模、安装证据） | 工作区源码（只读导入） | 见 5.3 与 P3-02 |
| 变异实验 18 项（每项改动后运行变异基线的 12 个文件，然后恢复） | 导出副本 | 被发现 10 项：X02、X05、X08、X11、X12、X13、X14、X16、X17、X18。**未被发现 8 项**：X01、X03、X04、X06、X07、X09、X10、X15（见 PH3U1-P2-02） |
| `native/build.json` 哈希核对 | 工作区 | 51 个输入、4 个产物全部一致；`ui.html` 含新增英文文案 |

## 7. 观察（不计入问题）

1. Claude 卡片的新附注对所有 Claude 环境都显示，包括只用终端版 Claude Code 的机器；文字在这种情况下仍然成立。桌面应用自带功能的实际承载方式（是否以插件形式出现在桌面应用的插件界面中）本轮无法核实，措辞沿用 Owner 的反馈。
2. 目标插件自己的“插件 X：组件范围无法确认”诊断，改动前会让它的安装报 `READBACK_FAILED`，现在报成功，同时插件标为不可卸载并显示诊断。安装终态确实已确认，可以接受；如希望更醒目，可把这条诊断附在操作结果中。
3. Claude 的“未安装”清单只与本机 marketplace 副本一样新（UAT 说明已写明）。

## 8. 操作披露与结束状态

- 没有向 `127.0.0.1:4771` 或 `127.0.0.1:4781` 发请求；没有读写或列出真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock*`、`~/Library/LaunchAgents`、`/Library/Application Support/ClaudeCode`；没有用真实 HOME 运行测试或实验；没有运行 `launchctl`；没有下载；没有执行真实的 Claude 或 Codex 命令行。实验中的 Codex 命令行与 Claude 清单都是替身。
- 守卫记录：完整套件运行期间，一个 npm 进程 3 次尝试连接 `registry.npmjs.org:443`（14:07:00～14:08:10），均被守卫拦截（沙箱同样禁止外连），测试照常通过，没有下载。逐个重跑 7 个涉及 npm 的测试文件时没有复现，沙箱 HOME 中的 npm 日志只显示启动器测试运行的 `npm ci --ignore-scripts` 与 `npm run build`，发起连接的具体测试未能确定。与本提交无关。
- 在沙箱外、以默认环境运行的辅助操作（均未访问上述位置）：
  - 常规 git 命令：`rev-parse`、`status`、`log`、`show`、`diff`、`archive`；在 scratchpad 的导出副本中执行 `git init`、`add`、`commit`、`status`，并为副本建立指向工作区 `node_modules` 的符号链接（只读使用）；
  - 用 `node -e` 核对 `build.json` 的哈希与 `ui.html` 的文案；用 `grep`、`sed`、`awk` 读取仓库文件与测试输出；用 `shasum` 计算事实源与 diff 的哈希；
  - 变异实验的调度脚本：只改导出副本，测试本身在沙箱中运行；结束时副本已恢复干净；
  - `ls` 查看 nvm 的 `bin` 目录；`ps` 查看进程命令行。
- 进程：本轮启动的测试与实验进程都已结束，没有遗留。以下 SkillDock 相关进程不是本轮启动的，未做任何处理：pid 83574（`~/.local/share/skilldock/runtimes/…/server/index.mjs`）、85534 与 85547（Codex 缓存中 0.10.3 的原生入口，父进程为 pid 2850）、87059（`~/.local/share/skilldock-uat/runtimes/…/server/index.mjs`，即 UAT 实例）。
- 实验材料在 `scratchpad/verify/phase3-uat1-review/`（导出副本 `export/`、`export-parent/`，`exp/` 下的脚本、变异清单与输出，`run-*.out`，守卫日志）。
- 结束时 HEAD 为 `3546331`，工作区只多本报告（未提交）。
