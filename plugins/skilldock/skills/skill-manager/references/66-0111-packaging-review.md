# 0.11.1 打包与标识改动的独立评审（`838b619..832cc72`）

> 日期：2026-10-12
> 评审对象：分支 `feature/skilldock-0.11.1`（未推送）上 `838b619..832cc72` 的 4 个提交：`290c59c`（删除命令文件）、`a85351e`（`65` 收尾记录）、`eeba6d0`（marketplace 条目声明版本，0.11.0 → 0.11.1）、`832cc72`（官方标志）。25 个文件，增 325 行、删 161 行。
> 评审者：独立的 Claude 评审会话（委托子任务）。只做评审，没有修改被评审的文件，没有 `git add`、提交、推送或切换分支；本报告是唯一新建的仓库内文件。不是人类评审，不代表 Owner。
> 工作方式：`git archive 832cc72` 导出到会话 scratchpad，`node_modules` 软链接到主工作树同一路径；Node 测试与构建都经 `sandbox-exec -f skilldock-handover/hermetic.sb` 运行，Node 为 `skilldock-handover/node/bin/node`（v24.21.0）。没有另设 `HOME`、`TMPDIR`。
>
> **实际运行的检查（沙箱内，除注明者外）**
> - 定向测试基线：`marketplace-compatibility` 8/8、`release-version` 2/2、`agent-ui` 18/18、`i18n` 18/18、`source-bundle` 4/4、`native-protocol` 2/2，共 52 项全部通过。
> - `/usr/bin/python3 -m unittest plugins/testany-eng/scripts/tests/test_validate_codex_compat.py`：39/39 通过（沙箱内、沙箱外各跑一次，结果相同）。`validate_codex_compat.py --repo-root .` 对导出目录退出码 0（沙箱外）。
> - `npm run build:native` 在导出副本中重建后，副本的 `git status` 干净；`npm run build`（含类型检查与 vite 构建）退出码 0，副本仍干净。另用脚本逐项核对 `assets/native/build.json`：69 个输入、4 个产物的 sha256 与实际文件全部一致。
> - 标志路径：用脚本把 `AgentUI.tsx` 中两个常量与本机官方文件的 `d` 属性逐字符比较（只读）。
> - 校验脚本与 `cli.mjs` 的边界探测（临时目录中的合成 marketplace，共 29 种组合）；`release-version` 在 5 种仓库外布局中的表现。
> - 变异实验 28 个（含 1 个探针、1 个对照），每个在导出目录的一份完整拷贝中只改一处（第 3 节）。
>
> **没有运行的**
> - 全量套件、`compat-matrix`、Playwright（按委托只跑定向测试）。
> - `claude-distribution-smoke.mjs` 及其他 `*-smoke.mjs`（需要真实 Claude 命令行，委托明确不运行）。两处断言改动只做了阅读。
> - 没有在浏览器中查看渲染结果；标志的尺寸、留白、对比度都按代码中的数值计算。
> - 没有联网，没有查阅 OpenAI 与 Anthropic 品牌页面的条款原文；本机的官方套件中没有使用规范文件。凡涉及条款的判断都标为“未核实”。
> - `65` 中的事实（UAT 电脑上的读回）无法核实，只查了自相矛盾与本机路径。
>
> 评审期间实现者在同一分支上继续工作，分支前进到 `2fdfc84`（界面修复，9 个文件，其中重建了 `assets/native/build.json` 与 `ui.html`）。那个提交不是本评审所为，也不在评审范围内。评审对象一律取自 `832cc72` 的导出；文中的行号、哈希核对与重建结果都针对 `832cc72`。

## 1. 结论

**APPROVED**

- P0：0
- P1：0
- P2：1（PK-P2-01，第三方声明中关于留白的一句话说过了）
- P3：8（PK-P3-01～08）

要点：

- **校验规则等于 Owner 的方案 A**。只带 Codex manifest 时条目可以镜像、不相等报错；带 `.claude-plugin/plugin.json` 仍报“one authority”；两种 manifest 并存仍在更早处被拒；`manifest_path` 是符号链接时判断不受影响。唯一多放行的是非字符串版本的跨类型“相等”（PK-P3-01）。三份规则文档对规则本身的说法与实现一致、彼此一致；相邻一段关于 SkillDock 提示的文字没有跟上（PK-P3-03）。
- **`codexManifest` 没有泄漏**。`readPluginDefinition` 的返回值只有 `hasManifest`、`manifest`、`version`、`warnings`；`readPluginManifest` 只返回 manifest；`plugin-contents.mjs`、`service.mjs`、`direct-plugins.mjs` 的调用方都不受影响。
- **版本递增完整，没有多改**。该改的 9 处都改了；`server/generation.mjs` 的 `0.11.0`、中英文根 README 的“自 0.11.0 起”都没动。原生产物与输入一致，可重建。
- **两个标志的路径与官方文件逐字符一致**，Blossom 只呈现 `#000000` 或 `#ffffff`，Spark 固定 `#D97757`，没有透明度或滤镜作用在它们上面。
- **`release-version` 在导出的插件目录与安装副本布局中正确跳过第二个用例**；另有两种布局会报错（PK-P3-04）。
- 4 个提交的 diff 中没有本机路径、凭证或其他不该入库的内容。

## 2. 发现

### P0

无。

### P1

无。

### P2

#### PK-P2-01 第三方声明称底块提供了套件所画的留白，按代码数值不成立

- 位置：`THIRD_PARTY_NOTICES.md:23`（“the chip around it supplies the clear space the kit draws around the artwork”）；`assets/app/src/AgentUI.tsx:21` 的注释同义。相关样式：`assets/app/src/AgentUI.css:9`、`:15`。
- 现象：这句话把底块的内边距等同于官方套件画布上的留白。Blossom 用在三处：徽标与分项计数两处有底块，但留白小于套件画布按比例换算的值；筛选按钮没有底块，这句话对它不适用。
- 依据（按代码数值计算，未在浏览器中量取）：
  - 官方文件画布 716，路径控制点的外接框为 174.96～540.72，即图形宽约 366、四周留白约 175，留白约为图形宽度的 48%。控制点外接框不小于真实图形，所以真实比例只会更大。
  - 实现把 `viewBox` 裁成 `166 166 384 384`，图形四周只剩约 9 个单位。12px 时图形约 11.4px，按套件比例应有约 5.5px 留白。
  - 徽标（`.agent-badge`，20×20，图标 12px）：四周约 4.3px，约为换算值的八成。
  - 标题旁的分项计数（`.agent-split-item`，图标 11px，上下内边距 1px、`gap` 4px）：上下约 4.0px，右侧数字距图形约 4.3px；换算值约 5.0px。
  - 筛选按钮（`.agent-filter button`）：没有底块，图标与文字“Codex”相距约 6.3px，高于换算值。
- 未核实：OpenAI 对最小留白的正式要求。本机套件只有 4 个 SVG 与 4 个 PNG，没有规范文件；也没有查阅品牌页面。因此不能判断现有留白是否违反条款，只能判断声明中的这句话与实现不符。
- 建议（二选一，由 Owner 定）：① 改写这句话与注释，只陈述事实，例如“图形裁到自身范围，徽标底块在四周留约 4px”，不再说等同于套件的留白；② 让它成立，例如徽标内图标改为 10px、分项计数加大上下内边距与间距。两种做法都不涉及显示名称。
- 同一段的其他说法与实现相符：`AgentUI.tsx` 中是两家的原图且路径未改（见第 4.6 节）；“black or white only and never recolored”与 `AgentUI.css:12` 一致；“smaller than SkillDock's own mark”成立（标志 11～12px，SkillDock 自己的标志 `desktop.css:29` 为 28px）；Spark 的颜色与官方文件的 `fill` 相同。“meant to follow the Marks usage terms”带了限定，条款本身未核实。

### P3

#### PK-P3-01 校验脚本的镜像分支用 `!=` 比较，没有限定为字符串

- 位置：`plugins/testany-eng/scripts/validate_codex_compat.py:454`。
- 现象：条目与 Codex manifest 的版本只要按 Python 的 `==` 相等就放行。探测结果：`1` 对 `1.0`、`true` 对 `1`、`null` 对 `null`、`["1"]` 对 `["1"]` 都没有报错；`"1.0.0"` 对 `" 1.0.0"` 报错。本批之前，两处同时出现一律报错。
- 依据：临时目录中的合成 marketplace 探测。校验脚本在只有一处声明时本来就不检查版本类型（Codex manifest 写整数 `7` 也通过，早于本批），所以新增的只是跨类型相等这一小块。`docs/plugin-development.md:32` 写的是“两处必须完全相等”。
- 建议：镜像分支要求两个值都是非空字符串且相等，并在 `test_codex_local_descriptor_and_manifest_discover_independent_plugin` 中加一个非字符串的断言。

#### PK-P3-02 两种 manifest 并存时，`mirrored` 仍然成立

- 位置：`assets/app/server/cli.mjs:289`（判断）、`:273`（`codexManifest` 的来源）。
- 现象：插件同时带 `.codex-plugin/plugin.json` 与 `.claude-plugin/plugin.json`、条目版本等于 Codex manifest 的版本时，不再给出“两处版本声明”。此时 Claude 读的是自己的 manifest，条目并不是“给 Claude 的镜像”，注释中的理由不适用。
- 依据：沙箱内探测。Codex 2.0.0 + Claude 2.0.0 + 条目 2.0.0、Codex 2.0.0 + Claude 3.0.0 + 条目 2.0.0 两种组合都是 0 条提示；本批之前都是 1 条。其余组合符合预期：只有 Codex manifest 且相等为 0 条、不等为 1 条；只有根目录 `plugin.json` 或只有 Claude manifest 且相等为 1 条；任一处缺版本为 0 条；非字符串版本仍报 `INVALID_VERSION`。
- 影响：只涉及第三方 marketplace 的一条非致命提示，版本解析结果不变。本仓库的校验脚本对两种 manifest 并存直接拒绝，所以仓库内的插件不会走到这里。
- 建议：`mirrored` 再加一个条件“没有 `.claude-plugin/plugin.json`”，与校验脚本的“只带 Codex manifest”一致，并补一个用例；或者登记为已知取舍。

#### PK-P3-03 规则文档中关于 SkillDock 提示的句子没有跟上

- 位置：`docs/plugin-development.md:34`（“两处同时提供安全版本字符串时以 `plugin.json.version` 为准并提示；SkillDock 的添加、预览、扫描和更新遵循该规则”）；`CLAUDE.md:32`、`AGENTS.md:46`（“解析重复版本并提示”）。
- 现象：`cli.mjs` 现在对“Codex manifest + 条目值相等”不再提示，这三处仍写成一律提示。同一文件第 32 行的规则本身已经改对，三份文档对规则的说法彼此一致，也与校验脚本一致。
- 建议：在 `docs/plugin-development.md:34` 补一句例外；`CLAUDE.md`、`AGENTS.md` 的那半句可以不动，或加“镜像 Codex manifest 的除外”。

#### PK-P3-04 `release-version` 在两种仓库外布局中报错而不是跳过

- 位置：`assets/app/tests/release-version.test.mjs:10`、`:14`、`:16`、`:29`。
- 现象与依据（沙箱内）：
  - 只导出 `plugins/skilldock`、以及 `cache/<marketplace>/skilldock/<version>/` 这两种布局：第一个用例通过，第二个用例显示为跳过（“不在仓库中”）。符合预期。
  - 插件位于另一个 marketplace 的 `plugins/skilldock` 下、而那份 `marketplace.json` 中没有 `skilldock` 条目：第二个用例以 `TypeError: Cannot read properties of undefined (reading 'version')` 失败。`inRepository` 只看文件是否存在。
  - 只有 `skill-manager` 目录的布局（“外观与语言”中下载的源码包按 `scripts/source-bundle.mjs` 的允许列表就是这种布局，其中包含 `tests/`）：第一个用例以 `ENOENT` 失败，因为上四级没有 `.codex-plugin/plugin.json`。在这种布局中 `native-protocol.test.mjs` 本来也失败（没有 `assets/native`，早于本批），所以这不是新出现的一类问题，只是多了一项。
- 建议：第二个用例的条件改为“marketplace 中有 `skilldock` 条目且其 `source` 指向本插件目录”；第一个用例在找不到 Codex manifest 时跳过与它比较的部分，只核对 `package.json`、锁文件与应用 README 三者一致。

#### PK-P3-05 根 `README.en.md` 的正则没有限定是 SkillDock 的版本

- 位置：`assets/app/tests/release-version.test.mjs:34`。
- 现象：`/Current version: \*\*(\d+\.\d+\.\d+)\*\*/` 取文件中的第一处匹配。目前 `README.en.md` 只有第 80 行一处，结果正确；中文根 README 的正则带“SkillDock”，插件目录下两份 README 只讲 SkillDock，都没有这个问题。
- 依据：探针 R12，在 `README.en.md` 开头插入另一个插件的 `Current version: **9.9.9**` 后，用例失败（误报）。
- 建议：给这条正则加上能定位到 SkillDock 段落的上下文，例如连同后面的“One local instance manages”一起匹配。

#### PK-P3-06 没有用例钉住标志的路径、颜色与取景框

- 位置：`assets/app/src/AgentUI.tsx:16`、`:17`、`:22`、`:23`；`assets/app/src/AgentUI.css:12`；`assets/app/tests/agent-ui.test.mjs:117`（只数 `<svg` 的个数并核对可访问名称）。
- 依据：变异 U1、U2、U3、U5、U6 在重建原生产物后全部存活（第 3 节）。在 `tests/` 中搜索 `BLOSSOM`、`SPARK`、`D97757`、`agent-mark`，没有任何用例引用它们。
- 影响：第三方声明承诺“path data unchanged”“never recolored”。以后有人格式化、压缩路径或调整主题色，不会有用例提醒。
- 建议：在 `agent-ui.test.mjs` 中记录两个路径字符串的 sha256（取自官方文件），并断言渲染结果含 `fill="#D97757"`、Codex 一侧为 `fill="currentColor"` 加 `agent-mark-codex`；再读 `AgentUI.css` 断言该类的颜色是 `light-dark(#000000, #ffffff)`。

#### PK-P3-07 没有用例钉住“根目录 `plugin.json` 不算 Codex manifest”

- 位置：`assets/app/server/cli.mjs:273`；`assets/app/tests/marketplace-compatibility.test.mjs:54`。
- 依据：变异 C4（把根目录 `plugin.json` 也当作 Codex manifest）8/8 通过，存活。实际行为是对的：只有根目录 `plugin.json` 且与条目相等时仍给 1 条提示。
- 建议：在新用例中加一组根目录 `plugin.json` 的断言；若采纳 PK-P3-02，一并加两种 manifest 并存的断言。

#### PK-P3-08 `65` 中有两处推断没有按文首的约定标明

- 位置：`references/65-post-release-wrapup.md:44`、`:49`；约定在 `:6`（“推断的写明‘推断’”）。
- 现象：
  - 第 44 行“不带分支、带 `#main`、写成 https 地址都一样”。文中实测的是不带分支的添加（界面两次、终端一次，桌面应用实际传的是 https 地址）；带 `#main` 的情形文中没有实测记录，属于从报错文字推出的结论。
  - 第 49 行“那次界面显示失败的添加改写过这个文件”，依据只是文件修改时间与那次操作的时间一致。
- 其余没有发现自相矛盾：第 1 节“运行中的实例是发布版代码”与第 4 节（先是旧代码，停止后由原生页面拉起）前后一致；`838b6191431a` 确是 `838b619` 的前 12 位；testany-eng 2.8.0 与 `838b619` 的 manifest 相符；`main` 的清单中确实没有 `testany-bot-for-claude`；第 7 节第 2 点已标“推断”。文中没有本机绝对路径，路径都以 `~` 开头。
- 建议：两处各加“（推断）”，或改成只陈述观察到的现象。

## 3. 变异实验

基线见文首。每个变异在导出目录的一份完整拷贝中只改一处（拷贝含整个仓库导出、`node_modules` 软链接、`skill-manager/scripts` 与 `plugins/testany-eng/scripts`）。U 组改完后先在沙箱内重建原生产物再测，避免只因 `build.json` 哈希不符而“看起来被发现”。

| 编号 | 改动 | 运行的测试 | 结果 |
|------|------|-----------|------|
| V1 | 校验脚本：`!= ".codex-plugin"` 改为 `==` | 校验脚本 unittest | 被发现，3 项失败 |
| V2 | 校验脚本：去掉“不相等报错”分支 | 同上 | 被发现，1 项失败 |
| V3 | 校验脚本：Claude manifest 也享受镜像例外 | 同上 | 被发现，1 项失败（`test_duplicate_plugin_version_authority_is_rejected`） |
| V4 | 校验脚本：只比较版本的前 3 个字符 | 同上 | 被发现，1 项失败 |
| C1 | `mirrored` 去掉 `codexManifest` 条件 | `marketplace-compatibility` | 被发现，3 项失败 |
| C2 | `mirrored` 去掉相等条件 | 同上 | 被发现，1 项失败（新用例） |
| C3 | `mirrored` 恒为假 | 同上 | 被发现，1 项失败（新用例） |
| C4 | 根目录 `plugin.json` 也算 Codex manifest | 同上 | **存活**（8/8）→ PK-P3-07 |
| C5 | `codexManifest` 留在 `readPluginDefinition` 的返回值中 | 同上 | **存活**（8/8）。没有调用方读取或序列化这个字段，不单列问题 |
| C6 | 没有 manifest 时 `codexManifest` 为真 | 同上 | 存活（8/8）。等价变异：此时 manifest 没有版本，不会产生提示 |
| R1 | marketplace 条目版本改回 0.11.0 | `release-version` | 被发现；校验脚本也报“must equal” |
| R2 | 锁文件顶层版本改回 0.11.0 | 同上 | 被发现 |
| R3 | 锁文件 `packages[""]` 版本改回 0.11.0 | 同上 | 被发现 |
| R4 | `package.json` 版本改回 0.11.0 | 同上 | 被发现；`native-protocol` 也有 1 项失败 |
| R5 | 应用 README 改回 0.11.0 | 同上 | 被发现 |
| R6 | 根 `README.md` 改回 0.11.0 | 同上 | 被发现 |
| R7 | 根 `README.en.md` 改回 0.11.0 | 同上 | 被发现 |
| R8 | `plugins/skilldock/README.md` 改回 0.11.0 | 同上 | 被发现 |
| R9 | `plugins/skilldock/README.en.md` 改回 0.11.0 | 同上 | 被发现 |
| R10 | Codex manifest 改为 0.11.2 | 同上 | 被发现，2 项失败 |
| R11 | 删除 marketplace 条目的 `version` | 同上 | 被发现（校验脚本不报错，符合“可以镜像”而非“必须镜像”） |
| R12 | 探针：`README.en.md` 开头加另一个插件的版本句 | 同上 | 用例失败（误报）→ PK-P3-05 |
| U1 | Blossom 路径改一位数字 | `agent-ui`、`native-protocol`、`source-bundle`、`i18n` | **存活**（18/18、2/2、4/4、18/18）→ PK-P3-06 |
| U2 | Spark 的 `fill` 改为 `currentColor` | 同上 | **存活** → PK-P3-06 |
| U3 | `.agent-mark-codex` 的颜色改为蓝灰 | 同上 | **存活** → PK-P3-06 |
| U5 | Spark 路径改一位数字 | 同上 | **存活** → PK-P3-06 |
| U6 | Blossom 的 `viewBox` 改为 `200 200 316 316`（会裁掉图形边缘） | 同上 | **存活** → PK-P3-06 |
| U4 | 同 U1，但不重建原生产物 | `agent-ui`、`native-protocol` | `native-protocol` 1 项失败（产物与输入的哈希不符）。说明过期的原生产物会被发现，发现的不是路径内容 |

存活的变异：C4、C5、C6（等价）、U1、U2、U3、U5、U6。

## 4. 逐项核对记录

### 4.1 校验脚本的新规则

| 组合 | 结果 |
|------|------|
| 只有 Codex manifest，条目版本相同 | 无错误 |
| 只有 Codex manifest，条目版本不同 | “marketplace version must equal the Codex manifest version it mirrors” |
| 只有 Claude manifest，条目版本相同 | “version must have one authority” |
| 两种 manifest 并存 | “multiple plugin manifests”，在版本检查之前就拒绝 |
| 只有根目录 `plugin.json` | 校验脚本不读这个位置，不比较（早于本批） |
| `.codex-plugin/plugin.json` 是指向别处文件的符号链接（包括指向另一目录的 Claude manifest） | 按 Codex manifest 处理。判断用的是未解析的路径，即“选中了两个候选位置中的哪一个”，对这个插件而言 Claude 确实读不到它 |
| `.claude-plugin/plugin.json` 是指向别处 Codex manifest 的符号链接 | “one authority” |
| `.codex-plugin` 目录是指向 `.claude-plugin` 的符号链接 | “multiple plugin manifests” |
| 插件目录本身名为 `.codex-plugin`、内含 Claude manifest | “one authority” |
| 插件来源是指向插件目录的符号链接（Codex manifest） | 无错误 |
| 非字符串版本 | 见 PK-P3-01 |

测试：相等、不等两种情形在 `test_codex_local_descriptor_and_manifest_discover_independent_plugin` 中，Claude manifest 的原规则在 `test_duplicate_plugin_version_authority_is_rejected` 中，另有一项读取仓库自身 marketplace 的用例会在规则改坏时失败（V1）。

### 4.2 `cli.mjs`

见 PK-P3-02 的依据。`readPluginDefinition` 的返回键经探测为 `hasManifest, manifest, version, warnings`。调用方：`cli.mjs:182`、`:232`、`:301`，`service.mjs:1362`、`:1433`，`plugin-contents.mjs:15`（把整个返回值交给 `componentValues`，后者只读 `manifest` 与 `hasManifest`）；`readPluginManifest` 的调用方为 `direct-plugins.mjs:13`、`service.mjs:1389`。原生的 `server.mjs` 不包含 `cli.mjs`，它的产物哈希在本批中没有变化，重建结果一致。

### 4.3 版本递增

- 已改：`plugins/skilldock/.codex-plugin/plugin.json`、`app/package.json`、`app/package-lock.json`（顶层与 `packages[""]`）、根 `README.md:73`、`README.en.md:80`、`plugins/skilldock/README.md:218`、`README.en.md:218`、`app/README.md:5`、`.claude-plugin/marketplace.json:40`、`assets/native/ui.html`（内嵌的 `package.json` 版本）与 `build.json`。
- 未改且不应改：`app/server/generation.mjs:10` 的 `0.11.0`；`README.md:154`、`README.en.md:86` 的“自 0.11.0 起”；`app/README.md:129` 的小节标题“跨 Agent（0.11.0）”；测试夹具中的 `0.11.0`。
- 仓库中只有一份 marketplace 文件（`.claude-plugin/marketplace.json`），其中只有 `skilldock` 条目带 `version`。
- 在非测试、非参考文档的文件中搜索 `0.11.0`，剩下的都是历史说法或上面列出的常量。

### 4.4 `release-version.test.mjs`

见 PK-P3-04、PK-P3-05 与变异 R1～R12。

### 4.5 `claude-distribution-smoke.mjs`（只阅读，未运行）

- 版本断言从“提交摘要以安装版本开头”改为“安装版本等于条目声明的版本”，声明值从克隆出的 marketplace 中读取，以后升版不用再改；`commit` 仍写入结果，没有成为无用变量。合理。
- 技能断言改为 `Skills \(1\)\s+skill-manager\b(?!,)`，数量与“后面没有第二个名字”都钉住了。合理。
- 两处断言是否与真实 Claude 的输出相符，要等运行这个冒烟才知道（见第 5 节）。

### 4.6 标志

- `OPENAI_BLOSSOM`：2282 个字符，与 `OpenAI-logos/SVGs/OAI_OpenAI-Blossom_Black.svg` 唯一一条路径的 `d` 逐字符相同。白色版文件的路径与黑色版相同，只有 `fill` 不同，所以用 `currentColor` 切换黑白没有改动图形。
- `CLAUDE_SPARK`：2449 个字符，与 `Claude logos/3 Claude Spark/SVG/Claude Spark - Clay.svg` 的 `d` 逐字符相同；官方文件的 `fill` 是 `#D97757`，`viewBox` 是 `0 0 94 94`，实现相同。
- `viewBox="166 166 384 384"` 包住了 Blossom 路径的全部控制点（174.96～540.72），没有裁到图形。
- 颜色：`.agent-mark-codex` 为 `light-dark(#000000, #ffffff)`，`tokens.css` 在根上设了 `color-scheme`（浅色、深色各一处），所以只会是纯黑或纯白。Spark 的填充写死，不随 `currentColor` 变化。原先 `.agent-filter button:not(.active) svg { opacity: 0.8 }` 已删除；全部样式中其余的 `opacity`、`filter` 规则（`button:disabled`、`.toggle:disabled`、`.skill-disabled .skill-icon` 等）都不作用在这些标志上：徽标在 `div.agent-line` 中，不在按钮内，筛选按钮没有禁用状态。
- `assets/native/ui.html` 中两条路径各出现一次，旧的 Simple Icons 路径已不存在。
- 对比度（计算值）：分项计数的数字在新底块上浅色 16.07:1、深色 12.76:1，`41` 中 UI-03 的对比度一项已解决；UI-03 的另外两点（没有说明数的是什么、放在 `<h1>` 内）本批没有动。

### 4.7 命令文件的残留说法

- `references/` 以外：没有指向 `commands/skill-manager.md` 或“命令文件”的说法。唯一的出现是 `claude-distribution-smoke.mjs:42` 的注释，说的是已删除。根 README 的仓库结构图中 `skilldock/` 下本来就只列了 `skills/skill-manager/`。
- `CLAUDE.md:8`、`AGENTS.md:22`、`docs/plugin-development.md:8` 的通用句“slash 入口位于对应 `commands/`”对 skilldock 不再适用，是否加一句由作者定。
- marketplace 条目描述中的“命令：/skilldock:skill-manager”与各 README 中的同名调用方式：删除命令文件后是否仍然可用，未核实，要靠冒烟或 UAT 确认（提交说明的理由是 Claude 本来就跳过了这个命令文件，用的是同名技能）。
- `references/` 中的位置（供后续修订，不算本批问题）：`35-cross-agent-hld.md:761`；`35-cross-agent-hld-review.md:183`；`38-cross-agent-phase2-code-review.md:96`、`:175`；`56-p0-acceptance-check.md:87`（冒烟记录）；`62-cross-agent-uat-fix-review-r3.md:154`、`:201`；`37-cross-agent-implementation-plan.md:234`（0.11.1 范围本身）。

### 4.8 不该入库的内容

4 个提交新增的行中没有用户主目录或临时目录下的绝对路径，没有会话临时目录名、用户名、邮箱或凭证。`ui.html` 中有两处以 `you` 为用户名的示例路径，是界面输入框的占位文字，早于本批。

## 5. 待办是否遗漏

以下各项不算本批缺陷，后续提交需要补齐：

1. **testany-eng 版本递增**。本批改了 `plugins/testany-eng/scripts/validate_codex_compat.py` 及其测试，`plugins/testany-eng/.claude-plugin/plugin.json` 仍是 2.8.0（与 `838b619` 相同）。按 `AGENTS.md:29`、`CLAUDE.md:15`，合并 `main` 前要高于基线。
2. **CHANGELOG**。本批没有改 `CHANGELOG.md`。0.11.1 需要写：marketplace 条目声明版本及其前提（Claude 一侧刷新 marketplace 后才看得到）、校验规则的方案 A、SkillDock 对镜像不再提示、删除命令文件、官方标志与中性底块、版本一致性用例；testany-eng 另记一条。`CHANGELOG.md:223` 是 0.11.0 的已知限制，属历史文字，保留。
3. **HLD 修订并经增量评审**（`37:234` 与 `62 r3` UF3-P3-06 已列）：`35-cross-agent-hld.md` 中“不新增 Claude manifest，Claude 以提交摘要计算版本并据此判断更新”、`:761` 的斜杠命令、3.3A 按内容判定更新的理由、声明版本后的行为（内容变而版本不变时 SkillDock 显示 `VERSION_UNCHANGED`、Claude 不更新，开发分支测试要递增条目版本）、9.3 V6 的冒烟记录（`Skills (2)`、版本为提交摘要）。
4. **README**。五处仍写“0.11.0 中桌面应用的 Update 不识别 SkillDock 的新版本”：根 `README.md:173`、`README.en.md:105`、`plugins/skilldock/README.md:61`、`README.en.md:61`、`app/README.md:69`。需要补 0.11.1 起的行为与桌面应用的 Update 入口。`65` 第 7 节列的 5 点（61 第 8 节就地切回不成立等）也在这次文档修订中处理。
5. **真实环境的验证**。本批的目的（Claude 桌面应用识别更新、两侧显示同一版本）还没有实测证据：`claude-distribution-smoke.mjs` 在断言改动后需要运行一次；桌面应用的 Update 需要 UAT。
6. **`41-ui-redesign-backlog.md`**：UI-03 标注对比度一项已解决、另两点仍在；第 2 节“发布前须由 Owner 确认”的两条（Codex 图标、Claude 标志）已由 Owner 于 2026-10-12 决定，需要更新。
7. **`37-cross-agent-implementation-plan.md`**：0.11.1 行登记 ①② 已完成与本评审的结论；④⑤⑥ 不在本批。
8. **过期注释**：`assets/app/server/skilldock-update.mjs:18-19` 写“the plugin version of a Git-sourced plugin is a commit digest”，自 0.11.1 起对 SkillDock 不再成立。代码取的是 `package.json` 的版本，行为不受影响。
9. **本报告的 9 条发现**：PK-P2-01 原则上修；P3 各条修或登记。
10. 第 4.7 节列出的参考文档位置，以及 `plugins/skilldock/assets/readme/` 下的截图是否还显示旧的 Agent 图标（未核实）。

## 6. 其他观察（不计入问题数）

- Spark 在白色底块上的对比度约 3.12:1，高于图形对象的 3:1；在筛选按钮的选中底色上约 2.72:1，但那里旁边有文字名称，图标是装饰。
- 系统强制颜色模式（高对比度主题）会把 `currentColor` 换成系统颜色，那时 Blossom 不一定是黑或白。SkillDock 目前面向 macOS，影响很小，记录备查。
- `claude-distribution-smoke.mjs` 文件头第 4 行说“没有 Git 历史时 Claude 把版本记为 unknown”。条目声明版本之后这条理由可能不再成立（推断），用本地克隆的另一条理由（目录来源会连同未跟踪文件一起复制）仍然成立。
