# 合成清单修复的增量复核 r2（`4d3a858..d2034fd`）

> 本报告是独立评审意见，不构成提交、推送、合并或发布的授权。源码结论与环境状态分开写。HLD 的批准和 Owner 决定都由产品 Owner 作出。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 被评审提交 | `d2034fd`（tree `46f4bc3e1960…`），分支 `feature/skilldock-0.11-cross-agent`；基线 `4d3a858`（tree `20d1f5d3fa6f…`） |
| 范围 | `git diff 4d3a858 d2034fd`，路径前缀 `plugins/skilldock/skills/skill-manager/`：9 个文件，增 225 行、删 18 行（diff sha256 前缀 `10e1a7a942f1`）。代码：`server/claude-plugin-updates.mjs`（`writtenByOthers`、`asInstalled`）、`server/service.mjs`（`changedLocally`）、`src/i18n/server-messages.json`（一条译文）；原生产物 `assets/native/build.json`、`ui.html`；用例 `tests/claude-plugin-updates.test.mjs`（新增一个 `test`，内含两个变体；修改一个）；文档 `37`、`61`（r8）；上一轮报告 `63` 随本提交入库 |
| 要回答的问题 | ① `63` 的 SM-P2-01、SM-P2-02、SM-P3-01～04 是否关闭；② `.DS_Store` 豁免的安全边界；③ 新用例是否有效、原生产物是否只因这条译文变化；④ `61` r8 与 `37` 的记录是否准确 |
| 评审者 | 独立的 Claude 评审会话（委托子任务）。只做评审，不修改被评审的文件；不是人类评审，也不代表任何 Owner |
| 日期 | 2026-10-12 |
| 工作方式 | 用 `git archive d2034fd` 导出到 scratchpad 的 `review-synth2/src/`（四个被改的源码与用例文件与 `git show` 逐字节一致），`node_modules` 软链接到主工作树同一路径。测试、变异、实验与构建都经 `sandbox-exec -f …/verify/phase2-review/hermetic.sb` 运行（禁止外连、禁止执行本机 Agent 命令行），`HOME`、`TMPDIR` 指向 `review-synth2/home`、`tmp`，Node v22.14.0；没有用 `env -i` 清空其余环境变量。只运行定向测试 `tests/claude-plugin-updates.test.mjs`、`tests/claude-updates.test.mjs`。变异拷贝在 `review-synth2/mut/`（每份只改一处，脚本 `review-synth2/tools/`），补充场景在 `review-synth2/exp*/app/tests/zz-r2.test.mjs`（新建的临时用例文件，不在被评审的树内；`exp` 为 `d2034fd`、`exp-old` 为 `4d3a858`、`exp-fix`/`exp-fix4` 为第 4 节的建议改法），日志在 `review-synth2/logs/`。没有访问 127.0.0.1:4771，没有读取或改动真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`，没有联网 |
| 副作用（如实记录） | `npm run build` 时 Vite 在共享的 `node_modules/.vite-temp/`（主工作树的被忽略目录，9 月 23 日即存在）写入临时配置文件并在结束时删除；该目录现为空，只有修改时间变化，主工作树 `git status` 无变化 |
| 环境状态（只读核对） | 本地远端跟踪分支 `origin/feature/skilldock-0.11-cross-agent` 指向 `d2034fd`（未 fetch；reflog：10:35:51 由 `e1516d0` 推到 `4d3a858`，10:58:25 推到 `d2034fd`），即本提交已在评审前推送，测试者随时可能用它续做 `61` 第 7 节第 6 项。开发工作树 HEAD 为 `d2034fd`，除未跟踪的 `node_modules` 外无改动。主工作树在 `feature/prototype-designer-design-upgrade` 分支，未改动 |

## 2. 结论

**APPROVED（带 P2：测试者继续 `61` 第 7 节第 6 项之前，须先处理 SM2-P2-02；SM2-P2-01 须在下一个提交中修复）**

- P0：0
- P1：0
- P2：2（SM2-P2-01、SM2-P2-02）
- P3：2（SM2-P3-01、SM2-P3-02）
- 定向测试：本地沙箱 37/37 通过（非 CI 等价环境，见第 1 节工作方式）

要点：

- **`63` 的 6 项都已处理**：SM-P2-01、SM-P3-01、SM-P3-03、SM-P3-04 关闭；SM-P2-02 原问题关闭，但 r8 新写的 `.DS_Store` 预期与核对方法有偏差（SM2-P2-02）；SM-P3-02 已以计划条目形式写入 `37`，HLD 正文待下一次修订。
- **`.DS_Store` 豁免在“与基线比较”这一步对自带 Claude manifest 的插件无效（SM2-P2-01）**。`asInstalled(rawInstalled, {})` 会连来源自带的 manifest 一起去掉，指纹不可能等于基线。因此对 testany-eng 这类插件，访达留下 `.DS_Store` 后检查新版本仍报“相对上次记录有本地修改”；若是在检查之后才留下，会出现“检查显示有更新、差异能打开、应用却报本地修改”（E4、E9）。同一处改动还带来一个相对 `4d3a858` 的窄回归：来源跟踪了某个 `.DS_Store`、又没有 manifest 时，桌面应用写入合成清单后，新版本检查从“有更新”变成本地修改（E1）。失败都是安全方向（不覆盖）。修法是把 `4d3a858` 已接受的 `installed.fingerprint` 加回接受集合（只多一项），已在实验拷贝中验证（第 4 节）。SkillDock 自己的插件来源没有 Claude manifest，也不跟踪 `.DS_Store`，所以不受影响（E11），测试者的验收路径照常可用。
- **安全边界成立**：只在候选没有同一路径时去掉（来源跟踪的 `.DS_Store` 被访达改写时照常报本地修改，E3），不会掩盖真正的修改（E5、E6），只用于 Claude 插件路线，通用 `inspectTree` 没有改动。
- **新用例有效**：改回旧的 `changedLocally`、去掉“接受原样指纹”、去掉 `.DS_Store` 豁免（整体或分层级去掉）后，对应用例都失败。“候选中有 `.DS_Store` 时照常比较”这一支没有用例（N7 存活，SM2-P3-01）。
- **原生产物**：`npm run build && npm run build:native` 重建后，`assets/native/` 与提交逐字节一致。`ui.html` 相对 `4d3a858` 只多了这一条译文（插入 428 个字符），`build.json` 只有 `server-messages.json` 与 `ui.html` 两个哈希变化。

## 3. 逐条关闭情况

### 3.1 `63` 的 2 项 P2、4 项 P3

| 编号 | 结论 | 依据 |
|------|------|------|
| SM-P2-01 来源新增 manifest 时合成清单被误报 | **已关闭（原场景）；新问题另列 SM2-P2-01** | `service.mjs:811` 改为接受 `[rawInstalled, asInstalled(rawInstalled, {})]` 的指纹，与 `63` 的建议一字不差。新用例 `:204` 第一个变体就是 E1，改回旧写法（N1）时该用例失败。但 `63` 论证“`installed` 只可能是原样或全部去掉两者之一”时，豁免只有一个文件；本提交把 `.DS_Store`（任意层级、可有多个）加入后，`installed` 可以是两者之间的任意一种，这个前提不再成立。见 SM2-P2-01 |
| SM-P2-02 `61` r7 的预期依赖修复后的代码在运行 | **已关闭（原问题）；r8 新写的细节另列 SM2-P2-02** | r8 在第 7 节第 6 项第 2 小项写明检查由正在运行的实例执行、要先只读核对实例代码，并说明两侧同版本时实例不会自行换代码、Codex 原生页面会自动拉起后台；进度行改为实际情况（第 1 小项已用 `e1516d0` 做完，第 2 小项修复前失败，已更新到 `4d3a858` 并换了实例）。`37` 补测行记录了测试者的实际做法（把 `.claude-plugin` 目录移到废纸篓后旧版检查即有更新，应用后读回 `4d3a85887e23`，再换到新代码）。偏差：r8 写“`4d3a858` 起……也不把访达留下的 `.DS_Store` 算作本地修改”，而 `.DS_Store` 豁免从 `d2034fd` 才有；核对方法只认 `SYNTHESIZED_MANIFEST`；“运行目录”指向了 `running.appPath` |
| SM-P3-01 兼容旧基线的一支没有用例 | **已关闭** | 新用例第二个变体把基线改写为含合成清单的原样指纹。N2（不再接受原样指纹）使该用例与另外 16 项失败；N8（只接受原样指纹）使 2 项失败 |
| SM-P3-02 HLD 3.3A 修订文字 | **已关闭（以计划条目形式；HLD 正文待下一次修订）** | `37`“0.11.x 文档修订”已写入条件（候选中没有时不计入）、四处比较、两种基线口径、两项残留、手动恢复一段（副本带合成清单，从本地目录安装时成为技能目录插件）、9.3 的 UAT 观察（只在 Git marketplace 的已装目录上实测），并把 `.DS_Store` 一并写入。可选的收紧方案没有写，属于 Owner 取舍。修复 SM2-P2-01 后，“与基线比较”的口径要同步改写（SM2-P3-02） |
| SM-P3-03 `61` r7 与 `37` 的两处细节 | **已关闭** | ① r7 改为“（提交 `4abe81f`，与本次一起推送）”：reflog 显示远端跟踪分支由 `e1516d0` 直接到 `4d3a858`，`4abe81f` 没有单独推送过，属实。② `37` 0.11.1 ④ 已引用 reload_plugins 的观察，并指出它与“正在运行”标记失准同属“运行目录与安装记录不一致”，一并评估 |
| SM-P3-04 “本机文件在预览后发生变化”缺译文 | **已关闭** | `server-messages.json:1730` 新增英文、日文译文，键与 `service.mjs:2173` 的原文逐字一致。E7：检查后改动安装中的 `SKILL.md` 再打开差异，提示正是这一句，`assertTranslated` 通过（`4d3a858` 下缺 `en`、`ja`）。已提交的用例仍不会触发这一句（见 SM2-P3-01 的可选项） |

### 3.2 问题 2：`.DS_Store` 豁免的安全边界

| 子项 | 结论 | 依据 |
|------|------|------|
| 只在候选没有同一路径时去掉 | **成立** | `claude-plugin-updates.mjs:27`：`writtenByOthers(file) && !Object.hasOwn(candidateEntries, file)`。E3：来源跟踪了根目录的 `.DS_Store`，访达改写它之后，同版本检查与新版本检查都报 `LOCAL_CHANGES`。N6（不看候选、一律去掉）使 14 项失败。N7（只对 `.DS_Store` 不看候选）37 项全过，这一支没有用例（SM2-P3-01） |
| 匹配是否精确 | **成立** | 只匹配名为 `.DS_Store` 的条目（根目录或 `…/.DS_Store`）。E6：名为 `.DS_Store` 的**目录**中的 `run.sh`（条目为 `skills/.DS_Store/run.sh`）、`skills/s/x.DS_Store`、`.claude-plugin/hooks.json` 都照常报本地修改 |
| 会不会掩盖真正的本地修改 | **不会（只剩一项可忽略的残留）** | E5：`.DS_Store` 与对 `SKILL.md` 的真实改动同时存在，同版本与新版本检查都报 `LOCAL_CHANGES`。残留：候选中没有的 `.DS_Store` 文件（或同名链接，`inspectTree` 要求链接目标在安装目录内）本身的内容不比较。Claude 不加载它，与 `.in_use` 同类，可以接受 |
| 时机：检查之后才出现的 `.DS_Store` | **差异预览成立，应用不一定成立 → SM2-P2-01** | 应用前核对（`:864`）与差异预览（`:2172`）都按预览候选去掉，对任何插件都成立（E4 的差异预览、E11 的完整应用）。但 `:815` 的 `changedLocally()` 先于 `:864` 执行，对自带 manifest 的插件会先报本地修改（E4） |
| 与 Codex 一侧、独立技能的隔离 | **成立** | 被改的服务端文件只有 `claude-plugin-updates.mjs`、`service.mjs` 两个；`files.mjs` 中的 `inspectTree`、`copySkill` 以及 `INSTALL_SKIP` 都没有改动。`asInstalled` 只在 Claude 插件路线的四处调用（`:806`、`:832`、`:905`、`:2172`，其中 `:2172` 限 `claudePlugin`）。独立技能（`:599`、`:623`、`:636`）、Codex 插件（`:1376`、`:1388`）、计划绑定 `targetSignature`（`:1814`）仍直接用 `inspectTree`，`.DS_Store` 照旧计入。`37` 0.11.1 ⑥ 把这一点记为早于 0.11 的问题待评估，属实 |
| 未声明版本、原地覆盖的插件 | **成立** | E8：合成清单加 `.DS_Store` 时首次检查 `current`，有新内容时 `available`（差异只有 `SKILL.md`），应用成功，再检查 `current`（`4d3a858` 下第二次检查即报本地修改） |

### 3.3 问题 3：新用例是否有效；原生产物

基线：两份定向测试 37/37 通过（`review-synth2/logs/baseline.log`）。每个变异只改一处，跑同样两份文件：

| 变异 | 改动 | 结果 |
|------|------|------|
| N1 | `changedLocally` 改回 `4d3a858` 的 `[installed, rawInstalled]` | 新用例（`:204`）失败，36/37，**被发现** |
| N2 | 去掉“接受原样指纹”，只接受全部去掉后的指纹 | 17 项失败（含新用例第二个变体），**被发现** |
| N3 | 去掉 `.DS_Store` 豁免 | 修改过的用例（`:173`）失败，**被发现** |
| N4 | 只豁免根目录的 `.DS_Store` | `:173` 失败，**被发现** |
| N5 | 只豁免子目录中的 `.DS_Store` | `:173` 失败，**被发现** |
| N6 | 一律去掉，不看候选 | 14 项失败，被发现 |
| N7 | `.DS_Store` 不看候选、一律去掉（合成清单仍看候选） | 37/37 通过，**存活** → SM2-P3-01 |
| N8 | 只接受原样指纹 | 2 项失败，被发现 |

结论：**关闭**（题目要求的三种改回都被发现）。补充：新用例没有覆盖“自带 manifest 的插件 + `.DS_Store` + 新版本”，SM2-P2-01 因此没有被发现。

原生产物：在导出目录中执行 `npm run build && npm run build:native`（沙箱内，退出码 0，`review-synth2/logs/build.log`），之后 `diff -r` 与 `git archive d2034fd` 的 `assets/native/` 完全一致（`ui.html` `0cff5472…`、`server.mjs` `952873b1…` 与 `build.json` 记录相同）。`ui.html` 相对 `4d3a858`：公共前缀 1,159,738 字符、公共后缀 358,780 字符，中间只插入了这一条译文。`build.json` 的输入清单不含 `service.mjs`、`claude-plugin-updates.mjs`（原生服务端不打包它们），所以 `server.mjs` 不变也符合预期。**关闭。**

### 3.4 问题 4：`61` r8 与 `37` 的记录是否准确

| 子项 | 结论 | 依据 |
|------|------|------|
| r8 记录的上一版 sha256 | **准确** | `git show 4d3a858:…/61-final-uat-claude-desktop.md` 的 sha256 为 `06fb73d8a35f1734…`，与 r8 一致 |
| r8 列出的改动 | **准确** | 实际改动为 r7 说明的一处措辞、新增 r8 说明、进度行、第 7 节第 6 项第 2 小项，与 r8 所列一致 |
| r7 “与本次一起推送” | **准确** | 见 3.1 SM-P3-03 |
| 进度行 | **准确** | 与 `37` 补测行一致。“待开发者推送下一个提交”：`d2034fd` 已推送且改动了 `plugins/skilldock/`，可以作为这个提交 |
| 第 7 节第 6 项第 2 小项 | **有偏差 → SM2-P2-02** | “`4d3a858` 起……也不把访达留下的 `.DS_Store` 算作本地修改”不成立；只核对 `SYNTHESIZED_MANIFEST` 区分不出 `4d3a858` 与 `d2034fd`；`running.appPath` 是实例由之构建的安装目录，实际运行的是启动记录中的 `runtime`（`<数据目录>/runtimes/<digest 前 20 位>`，代码称其为“隔离运行目录”） |
| `37`“合成清单修复复核”行 | **基本准确，三处细节 → SM2-P3-02** | “补两个用例”实为一个 `test` 含两个变体；“SM-P2-01 已修”需注明 SM2-P2-01；“存活变异现在被发现”属实（N2） |
| `37` 补测行“修复后重测”与“补充修复” | **现象记录与代码一致；“`.DS_Store` 也不算本地修改”说过了 → SM2-P2-01** | 旧版移走整个 `.claude-plugin` 目录后才恢复，与旧代码相符（目录中的 `.DS_Store` 也计入）。“同为 0.11.0 时沿用运行中的实例……符合 DEC-SDX-008”：与 HLD 第 683 行“版本相同但内容不同，优先当前存活实例的来源”一致。“候选中没有、安装中有的 `.DS_Store` 也不算本地修改”目前只对没有自带 manifest 的插件完全成立 |
| `37` 0.11.1 ④、⑥ | **准确** | 见 3.1 SM-P3-03 与 3.2 隔离一行 |
| `37`“0.11.x 文档修订” | **准确，修 SM2-P2-01 后需同步** | 见 3.1 SM-P3-02 |

## 4. 新发现

### SM2-P2-01 `.DS_Store` 豁免在与基线比较时不完整，并带来一个窄回归

- 位置：`server/service.mjs:811`（`changedLocally`），调用处 `:815`（应用前）、`:839`（检查）；`server/claude-plugin-updates.mjs:24-31`。
- 原因：基线总是按“当时的候选”去掉后记下（`:836`、`:844`、读回 `:917`/`:911`），即 `strip(当时安装, 当时候选)`。`changedLocally` 只接受两种口径：原样，或去掉**全部**他人写入（合成清单路径也去掉，不管候选有没有）。当安装中有一个“候选中没有”的 `.DS_Store`，而基线里有一个“候选中有”的豁免类文件（来源自带的 manifest，或来源跟踪的 `.DS_Store`）时，两种口径都不等于基线。
- 现象（`exp` 为 `d2034fd`，`exp-old` 为 `4d3a858`）：

  | 编号 | 场景 | `d2034fd` | `4d3a858` |
  |------|------|-----------|-----------|
  | E9 | 来源自带 manifest（testany-eng 等的形态）→ 访达在安装目录留下 `.DS_Store` → 同版本检查 → 来源出新版本后检查 | 同版本 `current`；新版本 `LOCAL_CHANGES` | 同版本即 `LOCAL_CHANGES` |
  | E4 | 来源自带 manifest，检查出新版本**之后**访达留下 `.DS_Store`（例如用 Show in Finder 看一眼）→ 差异预览 → 应用 | 差异“文件差异已加载。”；应用报“已安装的插件内容相对上次记录有本地修改”，之后再检查仍是 | 差异即报“本机文件在预览后发生变化” |
  | E2′（`zz-r2` 中的 X2） | 来源自带 manifest 并跟踪根目录 `.DS_Store`，访达在 `skills/` 留下 `.DS_Store` → 新版本 | `LOCAL_CHANGES` | `LOCAL_CHANGES` |
  | E1′（X1，回归） | 来源跟踪 `skills/.DS_Store`、没有 manifest，桌面应用写入合成清单 → 新版本 | `LOCAL_CHANGES` | **`available`（1.1.0）** |

- 影响：失败方向安全，不会覆盖。但：① 本次补充修复针对的“桌面应用插件菜单有 Show in Finder”，在本 marketplace 中正好落在 testany-bot、testany-eng、testany-llm、testany-mrkt 这些自带 Claude manifest 的插件上，对它们，新版本检查与应用仍会被 `.DS_Store` 挡住；② E4 的顺序（有更新 → 差异能打开 → 应用报本地修改）比修复前更让人困惑，提示指向一个用户看不见的文件（访达默认隐藏 `.DS_Store`），界面内无法处理；③ E1′ 相对 `4d3a858` 是回归（条件窄：来源仓库误提交了 `.DS_Store` 且没有 manifest）；④ 代码注释、`37` 补测行与“0.11.x 文档修订”、`61` r8 都写的是“`.DS_Store` 不算本地修改”。SkillDock 自己的插件不受影响（来源没有 Claude manifest，仓库不跟踪 `.DS_Store`；E11：合成清单与两处 `.DS_Store` 都在时，差异、应用、读回、再检查都正常）。
- 建议（下一个提交，一处改动）：把 `4d3a858` 已接受的 `installed.fingerprint` 加回接受集合：

  ```js
  const changedLocally = () => baseline && baseline.version === install.version
    && ![rawInstalled.fingerprint, installed.fingerprint, asInstalled(rawInstalled, {}).fingerprint].includes(baseline.fingerprint);
  ```

  安全性：三种口径都只去掉“候选中没有的他人写入”，任一等于基线都说明其余内容与记录一致；`installed` 在应用前（`:815`）按预览候选、在检查时（`:839`）按本次候选去掉，`4d3a858` 已经接受过它。验证（`exp-fix`）：两份定向测试 37/37；E1′、E2′、E4、E9 改为“发现新版本 1.1.0”或应用成功、再检查 `current`；E3、E5、E6 照旧报本地修改。
  可选（取舍交开发者）：再加“只去掉 `.DS_Store`、保留合成清单”的口径 `asInstalled(rawInstalled, { [SYNTHESIZED_MANIFEST]: '' })`，可以覆盖 E10：修复前那一版记下的、含合成清单的原样基线，之后又出现 `.DS_Store`。三种口径下仍报本地修改，四种口径下 `available`；`exp-fix4` 中定向测试与实验共 48/48。代价是多算一个指纹，判断多一层；受益的只有跑过修复前开发版的机器，可以不做。
  同时补用例：把 E9（或 E4）加为用例，并确认去掉 `installed.fingerprint` 时它失败；E1′ 可并入。改动后同步 `37`“0.11.x 文档修订”的基线口径（SM2-P3-02）与 `service.mjs:803` 的注释。

### SM2-P2-02 `61` r8 第 7 节第 6 项第 2 小项：`.DS_Store` 从哪个提交起不计入，以及如何核对实例代码

- 位置：`61` 第 146 行（第 7 节第 6 项第 2 小项）。
- 现象：
  1. 文中写“修复后的 SkillDock（`4d3a858` 起）不把它、也不把访达留下的 `.DS_Store` 算作本地修改”。`.DS_Store` 豁免从 `d2034fd` 才有。测试者机器上正在运行的实例是 `4d3a858` 的代码，下一次检查（marketplace 刷新到 `d2034fd` 后）就由它执行。E11 在 `4d3a858` 下：只要安装目录里有 `.DS_Store`，差异预览就报“本机文件在预览后发生变化”，应用报本地修改。
  2. 核对方法“`server/claude-plugin-updates.mjs` 中有 `SYNTHESIZED_MANIFEST`”在 `4d3a858` 与 `d2034fd` 上都成立，区分不出有没有 `.DS_Store` 豁免。
  3. “运行目录见启动记录 `running.appPath`”：`running` 是实例由之构建的安装（`launcher-record.mjs:88`），实际运行的是启动记录中的 `runtime`（`runtime.mjs:30`，隔离运行目录，按启动时的 digest 生成）。Claude 一侧每个版本有自己的目录，两者通常一致。但 `37` 记录过实例从 Codex 副本启动，Codex 副本同为 0.11.0 时可能被原地改写，那时读 `running.appPath` 看到的不是正在运行的代码。
- 紧迫性：`d2034fd` 已推送，测试者随时可能续做。若用户此前或期间对新安装目录用过 Show in Finder，按 r8 会再报一次“本地修改”而停下，白做一轮，而核对步骤又会显示“已含修复”。
- 建议（`61` r9，交测试者之前完成）：
  1. 改为：合成清单从 `4d3a858` 起不计入，`.DS_Store` 从 `d2034fd` 起不计入（SM2-P2-01 修复之前，后者只对来源没有 Claude manifest 的插件完全成立，SkillDock 属于这一类）。
  2. 写明本轮检查由 `4d3a858` 的实例执行：检查前不要用 Show in Finder 打开这个插件的安装目录；先只读列出安装目录中是否有 `.DS_Store`（只列路径）。若有，预期会报本地修改，停下来告诉用户，不要删除文件，也不要把它当作新缺陷。
  3. 核对实例代码改为读启动记录的 `runtime`（按键读取），在该目录的 `server/claude-plugin-updates.mjs` 中核对。需要区分 `d2034fd` 时，以是否含 `.DS_Store` 匹配为准，不能只看 `SYNTHESIZED_MANIFEST`。

### SM2-P3-01 用例缺口：“候选中有 `.DS_Store` 时照常比较”没有用例

- 位置：`tests/claude-plugin-updates.test.mjs:173`、`:204`；`claude-plugin-updates.mjs:27`。
- 现象：N7（`.DS_Store` 不看候选、一律去掉）下 37 项全过。这一支是本次安全边界的一半（合成清单的同类边界由 N6 钉住）。若退化，来源跟踪了 `.DS_Store` 的插件将永远显示与来源不同。
- 建议：把 E3 加为用例（来源跟踪根目录 `.DS_Store`，安装中改写它，检查报 `LOCAL_CHANGES`）。可选：把 E7 加为用例，让“本机文件在预览后发生变化”进入翻译用例的 `seen` 集合，SM-P3-04 的译文从此有用例钉住。

### SM2-P3-02 `37` 的三处记录细节

- “合成清单修复复核”行写“补两个用例（来源新增清单、修复前记下的旧基线）”：实际是一个 `test`、两个变体，测试数由 36 变为 37。建议改为“补一个用例（两个变体）”。
- 同行“SM-P2-01 ……已修”与补测行“候选中没有、安装中有的 `.DS_Store` 也不算本地修改”：修复 SM2-P2-01 之前，后者对自带 manifest 的插件不成立。建议在修复的同一提交中注明，或修复后再写。
- “0.11.x 文档修订”中“与基线比较时原样或去掉它们后的指纹等于基线即视为未改动”：采纳 SM2-P2-01 后应写为“原样、按本次候选去掉、或去掉全部他人写入后的指纹（之一）等于基线”。另补 `.DS_Store` 自己的条件与残留：候选中有同一路径（来源跟踪了 `.DS_Store`）时照常比较，访达改写它会被判为本地修改（E3）；候选中没有的 `.DS_Store` 内容不比较。

## 5. 补充场景（实验用例，不在被评审的树内）

用例文件为 `review-synth2/exp*/app/tests/zz-r2.test.mjs`，复用 `claude-plugin-updates.test.mjs` 的测试世界（复制其前 108 行）。“本地修改”指 `LOCAL_CHANGES`“已安装的插件内容相对上次记录有本地修改……”。

| 编号 | 场景 | `d2034fd` | `4d3a858` | 建议改法（三种口径） |
|------|------|-----------|-----------|----------------------|
| E1′ | 来源跟踪 `skills/.DS_Store`、无 manifest，合成清单 → 新版本 | 本地修改 | `available` | `available` |
| E2′ | 来源自带 manifest、跟踪根目录 `.DS_Store`，访达留下 `skills/.DS_Store` → 同版本 → 新版本 | `current` → 本地修改 | 本地修改 → 本地修改 | `current` → `available` |
| E3 | 来源跟踪根目录 `.DS_Store`，访达改写它 | 本地修改（边界成立） | 本地修改 | 本地修改 |
| E4 | 来源自带 manifest，检查出新版本后访达留下两处 `.DS_Store` → 差异 → 应用 | 差异已加载；应用报本地修改 | 差异报“本机文件在预览后发生变化”；应用报本地修改 | 差异已加载；应用成功；再检查 `current` |
| E5 | `.DS_Store` 加上对 `SKILL.md` 的真实改动 | 本地修改 | 本地修改 | 本地修改 |
| E6 | 名为 `.DS_Store` 的目录内的文件、`x.DS_Store`、`.claude-plugin/hooks.json` | 都是本地修改 | 都是本地修改 | 都是本地修改 |
| E7 | 检查后改动安装中的 `SKILL.md`，再打开差异 | “本机文件在预览后发生变化，请重新检查更新。”，译文齐全 | 同一提示，缺 `en`、`ja` | 同 `d2034fd` |
| E8 | 未声明版本，合成清单 + `.DS_Store` → 新内容 → 应用 → 再检查 | `current` → `available` → 成功 → `current` | 第二次检查即报本地修改（未声明版本的措辞） | 同 `d2034fd` |
| E9 | 来源自带 manifest，访达留下 `.DS_Store` → 同版本 → 新版本 | `current` → 本地修改 | 本地修改 → 本地修改 | `current` → `available` |
| E10 | 修复前口径的基线（含合成清单的原样指纹），之后访达留下 `.DS_Store` → 新版本 | 本地修改 | 本地修改 | 本地修改（四种口径下 `available`） |
| E11 | SkillDock 的形态（来源无 Claude manifest），合成清单；检查出新版本后访达留下两处 `.DS_Store` → 差异 → 应用（新目录也写入合成清单）→ 再检查 | 差异已加载；应用成功（1.0.0 → 1.1.0）；`current` | 差异报“本机文件在预览后发生变化”；应用报本地修改 | 同 `d2034fd` |

## 6. 其他观察（不计入问题数）

- `service.mjs:803-804` 的注释仍只说“without a manifest Claude synthesized”，可在修 SM2-P2-01 时顺带补上 `.DS_Store`。`claude-plugin-updates.mjs:18-22` 的注释已更新。
- `asInstalled` 按去掉的文件数调整了 `files`，没有调整 `bytes`（`63` 已记录，本函数内不用）。
- `writtenByOthers` 也会去掉名为 `.DS_Store` 的符号链接（候选中没有时）。`inspectTree` 要求链接目标在安装目录内，Claude 也不加载它，可以忽略。
- 若以后要把 `.DS_Store` 并入 Codex 一侧与独立技能（`37` 0.11.1 ⑥），注意计划绑定 `targetSignature` 中的内容指纹，已保存的计划会因口径变化被判为“目标已变化”（`37` 已写明）。
