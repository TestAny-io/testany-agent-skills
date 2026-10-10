# 阶段 6d 增量复核报告（第 2 次）：HLD 第 27 轮 / 契约第 17 轮（`258fd24..122ef9f`）

> 本报告是独立评审意见，不构成提交、推送、合并或发布的授权。源码结论与环境状态分开写。HLD、PRD、契约的批准和 Owner 决定都由产品 Owner 作出。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 被评审提交 | `122ef9f`（tree `3595c42fe7a1…`），分支 `feature/skilldock-0.11-cross-agent`；基线 `258fd24` |
| 范围 | `git diff 258fd24 122ef9f`：15 个文件，增 394 行、删 54 行（diff sha256 前缀 `5e933396e076`），全部位于 `plugins/skilldock/skills/skill-manager/` 下。共两个提交：`8810bbc` 只把 [58](58-cross-agent-6d-rereview.md) 入库（本轮只读引用，`122ef9f` 没有改它）；`122ef9f` 处理 58 的 RR6-P3-01～05 |
| 改动内容 | 界面：`src/App.tsx`（打开插件安装窗口时传入已启用管理的 Agent）、`src/agent-requests.ts`（新增 `pluginMarketIntro`）、`src/InstallDialog.tsx`；原生产物 `assets/native/ui.html`、`build.json`；用例：`agent-ui`、`claude-updates`、`claude-plugin-updates`；文档：HLD v1.31、契约索引 0.32、36c 0.31、PRD 0.11、`37`、`56`。任务说明里提到的 `55`，本提交没有改 |
| 本轮文档改动量 | HLD 7 处（增 23、删 10）；索引 3 处（增 5、删 4）；36c 2 处（增 3、删 3：第 12 行状态行、第 343 行第 10 节）；PRD 3 处（增 6、删 4）；`37` 增 2、删 1；`56` 增 4、删 2；36a、36b 没有改动 |
| 上一轮绑定（`git show 258fd24:`） | HLD v1.30 `e2c1d7f7…108c`；索引 0.31 `8392cc66…bcac`；36c 0.30 `c90973f0…666c`；PRD 0.10 `1fbe5bc8…0936`，均与 58 第 8 节一致 |
| 轮次说明 | HLD v1.31 把 58 记为第 26 轮，按同一记法，本轮建议记为 **HLD 第 27 轮、契约第 17 轮** |
| 评审者 | 独立的 Claude 评审会话（委托子任务）。只做评审，不修改被评审的文件；不是人类评审，也不代表任何 Owner |
| 日期 | 2026-10-10 |
| 工作方式 | 用 `git archive 122ef9f` 导出到 scratchpad 的 `rereview-6d2/`，`node_modules` 软链接到原工作树。变异实验在 `rereview-6d2/_mut/` 的完整拷贝中进行，每次只改一处，跑完立即还原。所有命令都经 `sandbox-exec -f …/verify/phase2-review/hermetic.sb` 和 `env -i` 运行，`HOME`、`TMPDIR` 指向 scratchpad，使用 Node v22.14.0，并加载连接守卫（遇到连向 4771 或非回环地址的连接即拒绝并记录） |

## 2. 结论

**APPROVED（带 P3）**

- P0：0
- P1：0
- P2：0
- P3：3（RR7-P3-01～03）

要点：

- **RR6-P3-01～05 全部关闭**：其中 01、02、03 各有一处残余或文字偏差，已另列为本轮的 P3。
- **代码改动正确。** 插件安装窗口现在按技能安装窗口、Marketplace 窗口同样的表达式取得已启用管理的 Agent。渲染探针（4.1）证实：只装 Claude 时，说明里不再出现“Codex 官方目录”。同一改动还让插件窗口里“从本地目录或 Git 安装时选择 Agent”的功能**第一次真正生效**。这与 HLD 3.3（DEC-SDX-025）和 36c 7.1、7.3 一致，不影响只用 Codex 的用户和 1 版快照。原生产物在拷贝中重建后与提交逐字节相同，`tsc --noEmit` 通过。
- **新用例有效**：针对本轮改动的 13 项变异中，8 项被发现，包括 58 中存活的 M07～M10、M20、M21 的对应项。存活的 5 项（N2、N3、N5、N7、N13）见 RR7-P3-01。
- **文档与实现一致。** HLD v1.31、索引 0.32、36c 0.31、PRD 0.11 的改动都与实现相符；36a、36b 没有改（sha256 与上一轮相同）；36c 第 4、5 节和 HLD 11A 条件 1a 段落也没有改。`trace_lint.py --strict` 对 HLD、PRD 均为 PASS。本轮代码改动只涉及 0.11 的界面，**不改变 0.10.3、0.10.2 的可观察行为**。
- 三项 P3：
  - RR7-P3-01：界面接线的用例仍有缺口，第 26 轮存活的三项变异也没有登记。
  - RR7-P3-02：插件来源安装选择 Agent 的功能是“第一次接通”，文档却写成“恢复”；这条界面路径还没有经过 UAT。
  - RR7-P3-03：36c 第 10 节新加的那句话不完整。

  三项都不阻断证书重新绑定。

## 3. 逐条关闭情况

行号都指 `122ef9f` 导出副本。`assets/app/` 下的文件省略这一前缀；`references/` 下的文件只写文件名。变异编号见 4.2。

| 编号 | 状态 | 依据 |
|------|------|------|
| RR6-P3-01 安装窗口的说明没有生效 | **已关闭** | `src/App.tsx:1427-1428` 给插件安装窗口传入 `agents`，表达式与技能窗口（`:1458`）、Marketplace 窗口（`:1470`）相同。`src/InstallDialog.tsx:115` 改用 `pluginMarketIntro(agents)`（`src/agent-requests.ts:47`）。渲染探针 P1 显示：只装 Claude 时说明不提 Codex，两侧都启用、只启用 Codex 或 1 版快照时照旧。`56`:106 的结论现在属实。用例 `tests/agent-ui.test.mjs:309`（N4 被发现）和 `:316` 的源码断言（N1 被发现）。没有采纳原建议中的“渲染用例”，窗口内部是否真的使用 `agents` 没有用例钉住（N3、N5 存活，见 RR7-P3-01）。附带影响见 4.1 与 RR7-P3-02 |
| RR6-P3-02 新代码的用例缺口 | **已关闭**（有残余） | PROBE-6D-2 已作为 `tests/claude-plugin-updates.test.mjs:519` 入库（服务端从 `known_marketplaces.json` 带入来源：加 `ref` 仍为同一对象，换 `path` 要求重新选择），N9（即 M07）被发现。PROBE-6D-1 已并入 `tests/claude-updates.test.mjs:117` 用例的第 131～135 行（迁移记录带 `agent: 'claude'`；1 版快照没有 `schedule.migrate`、运行项和计划目标都是 0），N10、N11、N12（即 M08、M09、M10）都被发现。菜单“管理更新”只对未安装的插件禁用、停用确认框的例外文字由 `agent-ui:316` 钉住，N6、N8（即 M20、M21）被发现。残余：N13（即 M11，`schedule.reconcile` 带 Agent）、M18、M19（只影响显示）仍存活，也没有登记到 `56` 的“已知测试缺口”；插件详情里的“管理更新”按钮没有用例（N7）。见 RR7-P3-01 |
| RR6-P3-03 1 版快照的运行进度计入 Claude 项 | **已关闭**（按原建议的第二种做法：写明不过滤） | `36c`:343 写明运行级的 `total`、`status` 与 `updateProgress` 不按 Agent 过滤；索引 0.32 变更记录（`36`:160）；HLD v1.31 表。实现没有改，与这句话相符。但这句话说“只影响 0.10.x 界面显示的数字”，漏了运行中的 `current`（目标名）和 `/api/updates/progress` 接口，见 RR7-P3-03 |
| RR6-P3-04 文档的版本引用与措辞 | **已关闭** | ① HLD 元信息“关联 PRD v0.11”（`35`:419），11A 条件 6 写到 0.10、0.11（`35`:1224），索引“PRD 引用 v0.11”（`36`:13），PRD“最后更新 2026-10-10”（`34`:7），`37`:3 上游同步。② v1.30 表中 P3-03 一行的位置改为“36c 第 6 节”（`35`:1709）；3.6 补“只读一侧的例外”（`35`:676），3.8 补绑定位置的出处（`35`:746），DG-R24-1、P3-06 两行的“位置”现在都有对应正文。v1.30 表是事后改的，已在 v1.31 表中注明。③ PRD 新增 Q12（`34`:1389）和 0.11 修订记录（`34`:691）。④ Q11 改为“版本不为 `unknown` 的插件（含按提交或压缩包摘要算出版本的）”（`34`:1388），HLD DG-R24-2 同步修改（`35`:1210）。⑤ `56`:176-177 补登 B37、B39 |
| RR6-P3-05 契约与代码同提交 | **已关闭** | `37`:212 写明：“按评审意见做的契约同步可与代码同提交，随下一轮增量复核；其余契约改动先复核再编码”，采纳的是原建议的第二种做法。本提交的 36c 0.31 只改文字，没有伴随实现改动，符合这条规则 |

## 4. 重点核对

### 4.1 插件安装窗口带上 Agent 之后

`InstallDialog` 的逻辑如下：`fromSource = kind === "skill" || sourceType !== "market"`；`chooseAgent = fromSource && agents.length > 1`；默认 Agent 为 Codex，没有 Codex 时取 `agents[0]`；只有选了 Claude 时，请求才带 `side = { agent: "claude" }`（`src/InstallDialog.tsx:31-34`）。

渲染探针 P1 按 `App.tsx:1428` 的表达式计算 `agents` 后渲染窗口，分别看 Marketplace 页和本地目录页（本地目录页用桩替换 `useState` 的初始来源；`Modal`、`ProviderIcon` 用桩代替）：

| 环境 | 传入的 `agents` | Marketplace 页的说明 | 本地目录 / Git 页 | 插件目录说明 |
|------|------------------|----------------------|-------------------|--------------|
| 只装 Claude（已启用） | `["claude"]` | 不提 Codex | 固定显示“将安装到 Claude。”，请求带 `agent: "claude"` | Claude 版 |
| 两侧都启用 | `["codex","claude"]` | 提“Codex 官方目录” | 两项选择，默认 Codex | Codex 版 |
| Codex 启用、Claude 只读 | `["codex"]` | 提“Codex 官方目录” | 不显示 Agent（Codex） | Codex 版 |
| Codex 只读、Claude 启用 | `["claude"]` | 不提 Codex | 固定显示“将安装到 Claude。” | Claude 版 |
| 1 版快照（没有 `agents`） | `[]` | 提“Codex 官方目录” | 不显示 Agent（Codex） | Codex 版 |

与设计的对照：

- **HLD 3.3（DEC-SDX-025）**：本地目录或 Git 来源可以装到 Claude，带 manifest 的放入技能目录，否则生成本地 marketplace。窗口的注释直接引用了 3.3，行为一致。
- **36c 7.1、7.3**：选 Claude 时，`plugin.previewInstall` 与 `plugin.installSource` 都带 `agent: "claude"`；作用域只在 Claude 预览中按 `scopes` 选择（`claudePreview`）。选 Codex 时，请求本身不带 `agent`，由 `App.tsx:539` 的 `requestAgent` 补上 `codex`，满足 36c 第 6 节“2 版写请求都带 `agent`”。
- **对既有用户**：只启用 Codex 的环境和 1 版快照，行为与 `258fd24` 相同。浏览器端到端测试的临时 HOME 里没有 Claude 配置，插件窗口拿到的是 `["codex"]` 或 `[]`，原有流程不受影响（本轮没有运行端到端测试）。
- **译文**：所用的五条文字在 `messages.json` 中都有英文和日文。
- **历史**：插件窗口的 `fromSource`/`chooseAgent` 由 `c6293c1`（阶段 4d）引入，但从 `c6293c1` 到 `258fd24`，App.tsx 打开插件窗口时从未传 `agents`（`89eab4f` 只给技能窗口传了）。所以这项功能是本提交**第一次接通**，不是“恢复”，见 RR7-P3-02。

### 4.2 用例有效性（变异实验）

基线：导出副本中 `agent-ui`、`claude-updates`、`claude-plugin-updates` 共 53/53 通过。变异拷贝中每次只改一处，只运行相关文件。

| 编号 | 变异 | 运行的用例 | 结果 |
|------|------|------------|------|
| N1 | 插件安装窗口不传 `agents` | agent-ui | 被发现（`:316`） |
| N2 | 插件窗口的 `agents` 不按“已安装且已启用”过滤 | agent-ui | **存活** |
| N3 | `InstallDialog` 改为 `pluginMarketIntro([])` | agent-ui | **存活** |
| N4 | `pluginMarketIntro` 总是提 Codex | agent-ui | 被发现（`:309`） |
| N5 | 插件来源安装不再提供 Agent 选择（`chooseAgent` 只给技能） | agent-ui | **存活** |
| N6 | 菜单“管理更新”回到只对含 Codex 的对象启用（即 M20） | agent-ui | 被发现（`:316`） |
| N7 | 插件详情的“管理更新”回到 `!plugin.installation` 时才显示 | agent-ui | **存活** |
| N8 | 停用确认框去掉一键更新的例外（即 M21） | agent-ui | 被发现（`:316`） |
| N9 | `service.mjs:472` 不带入 `marketSource`（即 M07） | claude-plugin-updates | 被发现（`:519`） |
| N10 | 1 版不过滤运行记录中的 Claude 项（即 M08） | claude-updates | 被发现 |
| N11 | 先过滤、后合并计划记录（旧顺序，即 M09） | claude-updates | 被发现 |
| N12 | `schedule.migrate` 不带 Agent（即 M10） | claude-updates | 被发现 |
| N13 | `schedule.reconcile` 不带 Agent（即 M11） | claude-updates、claude-plugin-updates | **存活** |

被发现的变异都是断言失败，不是语法或加载错误。

### 4.3 文档与实现

| 文档 | 改动 | 判断 |
|------|------|------|
| HLD v1.31 | 元信息（版本、状态行、关联 PRD）；3.6 例外；3.8 绑定出处；第 10 节 HLD 批准行与 DG-R24-2；11A 标题、条件 5、6；v1.30 表一处位置；新增 v1.31 表（5 行） | 与实现一致。v1.31 表 RR6-P3-01 一行的“随之恢复”与历史不符（RR7-P3-02）；条件 1a、1b 段落没有改 |
| 索引 0.32 | 版本、状态行、PRD 引用、第 4 节 36c 版本、第 10 节 0.32 一行 | 一致。“HLD 引用 v1.14”是长期未更新的旧引用，不在本轮 diff 内，记为观察，不计入问题 |
| 36c 0.31 | 状态行；第 10 节一句 | 与实现一致，但措辞不完整（RR7-P3-03）。第 4、5 节（第 39～91 行）没有改动 |
| PRD 0.11 | 头部版本与日期、修订记录 0.11、Q11 措辞、新增 Q12 | 一致。需求条目、验收标准与冻结承诺都没有改。修订记录写“有限修订（Owner 批准）”；Q12 的内容是 Owner 2026-10-10 的 DG-R24-1 决定（委托转述），本报告不代表 Owner 确认这一批准 |
| `37`、`56` | 上游版本；6d 复核一行；AC-013、5.6 两行证据；B37、B39 | 基本一致。`37`:212 写“待只看文档的增量复核”，但本提交含界面代码（RR7-P3-02） |

`trace_lint.py --strict`：HLD 为 PASS（Errors 0、Warnings 0、Infos 49，与第 26 轮相同），PRD 为 PASS（0/0/0）。

### 4.4 对 0.10.3、0.10.2 冻结行为的影响

| 交集 | 本轮改动 | 判断 |
|------|----------|------|
| 36a、36b、36c 第 4～5 节、HLD 11A 1a | 0 行 | 未改 |
| 服务端、启动器、门槛、转交链 | 0 行（`server/`、`scripts/`、`shared/` 都没有改） | 不变 |
| 0.11 界面与 0.11 原生产物 | 插件安装窗口带上 Agent | 只影响 0.11；原生产物重建后与提交逐字节相同 |
| 1 版客户端所见 | 没有改实现；36c 第 10 节只是写明运行级计数不过滤 | 不改变冻结语义（文字准确性见 RR7-P3-03） |

结论：**HLD v1.31、索引 0.32、36c 0.31、PRD 0.11 的改动与实现一致，不改变 0.10.3、0.10.2 的可观察行为，也不要求它们改变。**

## 5. 新发现

### RR7-P3-01 界面接线的用例仍有缺口；第 26 轮存活的变异没有登记

- **位置**：`tests/agent-ui.test.mjs:309-323`；`src/InstallDialog.tsx:31`、`:115`；`src/App.tsx:1428`、`:1594`；`server/scheduler.mjs:200`；`references/56-p0-acceptance-check.md` 的“已知测试缺口”。
- **问题**：
  - N2、N3、N5、N7 在定向用例下存活（4.2）。`:309` 只测了辅助函数；`:316` 用正则匹配 App.tsx 源码，能发现删掉 `agents` 或改回菜单条件，但发现不了过滤条件的变化，而且会因为重新排版而误报失败。
  - 本提交新接通的界面路径没有界面层用例：在只装 Claude 或两侧都启用的环境中，从本地目录或 Git 把插件装到 Claude。
  - 第 26 轮存活的 M11（即 N13）、M18、M19 没有补用例，也没有登记到 `56` 的“已知测试缺口”。
- **影响**：实现现在是正确的（渲染探针 P1 证实）；但以后若回退，现有用例发现不了。
- **建议**：
  - 把三个窗口共用的“已启用管理的 Agent”抽成一个函数并做单元测试。
  - 在 `agent-ui` 中按 4.1 探针的方式补一条渲染用例，至少断言：只装 Claude 时说明不提 Codex，本地目录页显示“将安装到 Claude”；两侧都启用时出现两项选择、默认 Codex。插件详情的按钮可以顺带断言。
  - 暂时不补的，就把 N2、N3、N5、N7、M11、M18、M19 登记到 `56`。

### RR7-P3-02 插件来源安装选择 Agent 是第一次接通，文档却写成“恢复”；只装 Claude 时这条界面路径此前不可用

- **位置**：`35`:1722（v1.31 表 RR6-P3-01 一行“随之恢复”）；提交说明“can be installed to Claude again”；`37`:212（“待只看文档的增量复核”）；`56`:121（5.6 中“提供”的能力在只启用 Claude 的环境中“满足”）。
- **问题**：
  - 4.1 的历史核对表明，从阶段 4d 到 `258fd24`，界面上按本地目录或 Git 安装插件一律走 Codex：`agent` 缺省为 `codex`，`side` 为空，再由 `requestAgent` 补上 `codex`。只装 Claude 的用户在界面上无法用这条路径装到 Claude。
  - `56`:121 把 PRD 5.6“安装插件（本地目录、Git、已添加的 marketplace）”等能力在只启用 Claude 时记为满足，证据是服务端用例（`claude-plugin-sources`）和 `claude-writes-smoke`，没有覆盖界面路径。
  - 这条路径到本提交才真正可用，说成“恢复”或“again”与历史不符。
  - `37` 说下一轮只看文档，但本提交含界面代码改动。
- **影响**：代码已经正确；只是记录把第一次接通写成了恢复，而且这条界面路径没有经过 UAT。
- **建议**：
  - HLD v1.31 表这一行改为“随之接通（阶段 4d 起插件窗口没有传入 Agent，界面上从本地目录或 Git 安装插件一直走 Codex）”。
  - `37` 这一行去掉“只看文档”。
  - 6e 最终 UAT 在只装 Claude、两侧都启用两种环境中各补一项：分别从浏览器界面和原生界面，用本地目录和 Git 两种来源、带与不带 Claude manifest 两种情形，把插件装到 Claude 并读回。
  - `56`:121 可注明界面路径在 `122ef9f` 才接通。
  - 若改 HLD，按 11A 条件 5 对修订部分做增量复审。

### RR7-P3-03 36c 0.31 第 10 节“只影响 0.10.x 界面显示的数字”不完整

- **位置**：`36c`:343；`server/scheduler.mjs:87`、`:257`；`server/service.mjs:2310`；`server/index.mjs:76`；`36c`:33（`/api/updates/progress`“新增可选 `agent` 参数”）；`35`:856。
- **问题**：
  - (a) 运行中，`updateProgress.current` 是正在处理的目标及其名称（`scheduler.mjs:257`）。目标属于 Claude 时，1 版快照会带上它（`agent: 'claude'` 和名称）。0.10.3 界面会显示这个名称（`337547a` 的 `src/UpdateProgress.tsx:62`），所以影响的不只是数字。
  - (b) 0.10.x 和 0.11 界面都轮询 `/api/updates/progress?mode=…`，这个接口同样不过滤，而新句只提“1 版快照”。
  - (c) 36c 第 3 节和 HLD 4.x 表写该接口“新增可选 `agent` 参数（缺省为 Codex）”，但实现不读这个参数（`index.mjs:76` 只取 `mode`），与“运行级进度不按 Agent 过滤”放在一起含义不清。这一处出入在本提交之前就有。
- **影响**：只影响显示，而且只在运行期间出现。`current` 不是对象列表，判断与第 26 轮对计数的判断相同：不改变 36c 第 5 节的冻结语义。
- **建议**：
  - 第 10 节改为：运行级的 `total`、`status` 与 `updateProgress`（含运行中的 `current`，可能是 Claude 目标；`/api/updates/progress` 同此）不按 Agent 过滤。
  - 第 3 节把 `agent` 参数注明为“接受但不改变结果”，或者删去。
  - 也可以按 RR6-P3-03 的第一种建议，在 1 版请求中省略属于 Claude 目标的 `current`。

P2 及以上：无。P3 共 3 项。

## 6. 运行与实验

全部在 scratchpad 的 `rereview-6d2/` 下进行。运行方式：`sandbox-exec -f …/hermetic.sb` 加 `env -i`，`HOME`、`TMPDIR` 指向 `rereview-6d2/_run/`，测试进程加载连接守卫。守卫的日志文件始终没有生成，即没有任何连接被拦截。以下通过数都来自**本机沙箱内的定向运行，不等同于 CI 全量**。

| 编号 | 内容 | 结果 |
|------|------|------|
| T1 | 导出副本：`agent-ui`、`claude-updates`、`claude-plugin-updates`（`--test-concurrency=1`） | 53/53 通过，约 6 秒；新增或修改的 4 个用例都通过 |
| T2 | 导出副本：`tsc --noEmit`（覆盖 `src` 下 41 个文件） | 通过 |
| T3 | 变异 N1～N13（4.2） | 8 项被发现；存活 5 项（N2、N3、N5、N7、N13） |
| T4 | 渲染探针 P1：按 `App.tsx:1428` 计算 `agents`，在 5 种环境下渲染插件安装窗口的 Marketplace 页与本地目录页（探针经标准输入运行，没有落盘） | 见 4.1 表 |
| T5 | 变异拷贝中运行 `node scripts/native-bundle.mjs` | `assets/native/` 与提交逐字节相同 |
| T6 | 对 HLD、PRD 运行 `trace_lint.py --strict`（使用 scratchpad 中已有的虚拟环境） | 均为 PASS |
| T7 | 在导出目录中运行 `shasum -a 256`（评审开始与结束各一次），并与 `git show 122ef9f:` 和原工作树对照 | 三方一致，开始与结束相同 |

未运行：全量 `npm test`（提交说明称 609/609）、浏览器端到端测试（称 86/86）、`claude-plugin-sources` 等其余用例、兼容矩阵，以及真实的 Claude 或 Codex 命令行（沙箱禁止）。

## 7. 证书绑定

P0、P1 均为零，本轮建议重新绑定以下版本。sha256 都在导出目录中用 `shasum -a 256` 计算，评审开始与结束各算一次，两次相同，也与 `git show 122ef9f:` 和原工作树中的文件相同。

| 对象 | 版本 | sha256 |
|------|------|--------|
| HLD `35-cross-agent-hld.md` | HLD-SDX-001 v1.31 | **`bd639d6f55c43fc3c0f51ccba6a7f10da7b7638b410d8806d2fa49ea2bb57e8c`** |
| 契约索引 `36-cross-agent-api-contract.md` | API-SDX-001 0.32 | **`239bec8ea5b942718b24e5917b9e98128a72ed656edef7e31c887e398691ef60`** |
| `36c-http-api-delta.md` | 0.31 | **`b8a424f366968c83baac528c24604dbd08506ca36d784238103e1b9d61810600`** |
| PRD `34-cross-agent-prd.md` | PRD-SKILLDOCK-002 0.11 | **`545873a99d8bc79dba7a5c89b28c14edf503b45b15f79b8cdf7c34556a6c7dd5`** |
| `36a-cross-version-file-formats.md`（未改） | 0.2 | `a4dd81b456443c8472244ee0a4a0b006e95de147233c9e88e8ca3f2d9c278ed4` |
| `36b-launcher-handover-protocol.md`（未改） | 0.14 | `b5e9644ce711a4f2228488d43353520a828dc9159a3b82fc9b5d2df56fcf989b` |

- **取代**：第 26 轮（58）绑定的 HLD v1.30 `e2c1d7f7…108c`、索引 0.31 `8392cc66…bcac`、36c 0.30 `c90973f0…666c`、PRD 0.10 `1fbe5bc8…0936`。
- **technical_verdict / scope_status**：APPROVED（带 P3）/ WITHIN_APPROVED_SCOPE。
- **条件的有效状态**（其余与 58 第 8 节相同）：
  - 1a：满足（维持）。本轮 1a 段落、36a、36b、36c 第 4～5 节都没有改。
  - 1b：以本轮绑定的索引 0.32 和 36c 0.31 为准。本轮 36c 的改动只是文字，按 `37`:212 的规则随本轮复核。
  - 5：改为绑定 HLD v1.31（见上表）。此后任何修订（包括按 RR7-P3-02、03 改 HLD 或 36c）都须对修订部分做增量复审。
  - 6：PRD 按本轮核对的 0.11（见上表）提交，满足。
  - 契约：只对上表四个契约文件的 sha256 有效。
- **发布前仍待**：58 列出的 6e 各项（V17、从真实 Claude 桌面应用添加 marketplace / 安装 / 刷新后更新、只装 Claude 环境的 AC-013 复核），另加 RR7-P3-02 建议的插件来源安装界面 UAT。

## 8. 约束遵守与披露

- 原工作树中只写了本报告。没有修改 HLD、PRD、契约、实施计划或代码；没有 commit、push 或切换分支。
- 评审开始时原工作树 HEAD 为 `122ef9f`。评审期间，HEAD 被其他会话推进到 `9a37b68`：该提交新增 `60`、`61`，并改动了 `37`、`56`。这个提交不在本轮范围内，本轮没有评审它；它没有改动上表中的任何文件，原工作树中这些文件的 sha256 与上表相同。
- scratchpad 中按任务要求写入的工作文件：`rereview-6d2/` 下的导出副本（含 `node_modules` 软链接）、变异拷贝 `_mut/`（结束时与导出副本逐文件相同）、临时 HOME/TMPDIR 与日志 `_run/`。没有写入 scratchpad 之外的位置。
- 没有访问 `127.0.0.1:4771`（守卫没有记录；本机 4771、4781 等端口上的 node 进程都是本会话开始前已在运行的，没有触碰）。没有读取或改动真实的 `~/.claude`、`~/.claude.json`、`~/.codex`、`~/.local/share/skilldock`、`~/Library/LaunchAgents`；没有联网下载任何东西；没有打印任何配置文件的全文（沙箱规则文件只按行检索了 allow/deny 条目）。
- 结束时，本轮没有留下测试进程或监听端口。
- 本报告不含凭证或令牌。
