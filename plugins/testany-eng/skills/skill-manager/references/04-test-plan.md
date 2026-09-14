# SkillDock 初版测试计划

> 第三轮 UAT 已移除产品 Sandbox。本文保留对应阶段历史；涉及演练入口的步骤不再适用。当前产品、工程边界和验收步骤以 [第三轮整改交付](14-uat-round3-delivery.md) 为准。


状态：**测试设计基线；本文件不是执行报告。** 下文保留执行前的范围与初始状态，最终命令、对象、结果及覆盖边界见 [开发验证记录](05-verification.md) 与 [独立源码审查](05-source-review.md)；用户 UAT 待验收。编写日期：2026-09-14。

## 基线与范围

- 产品：`01-product-requirements.md`，`PRD-SKILLDOCK-001` v0.1，REQ-SD-001–010。
- 界面：`02-interface-design.md` v0.1；工程：`03-engineering-design.md` v0.1；接口：`../assets/app/shared/contracts.ts`。
- 能力依据：`00-local-capabilities.md`；设计审查：`03-design-review.md`。API/HLD 采用当前文件事实源，未为其补造独立 artifact ID。
- 适用规则：根 AGENTS、仓库发现规则与本 app 的隔离/本地数据约束。没有多用户、云部署、真实发布或跨组织权限场景。
- 源码目录：`../assets/app/`。Node 22；launcher 预定为 `../scripts/launch.mjs`，支持 `start/status/stop` 并输出实际 URL，初版默认 `http://127.0.0.1:4771`。

目标是证明核心生命周期真实操作了隔离文件与配置，前后端反馈符合持久结果，且错误不会损坏用户技能或误报成功。开发写操作只在临时 fixture/演练数据根进行。本机配置、现有 skills、plugin cache 与 marketplace 状态仅读取核验；开发自动化不刷新真实市场或安装、启禁、移除真实对象。

## 风险与不可退化行为

| 风险 | 关联需求 | 影响 / 概率 | 主要验证 |
|---|---|---|---|
| RISK-SD-001 误识别路径/所有者导致删改其他技能 | 001、003、005、009 | 高 / 中 | 多根、同名/别名、symlink、系统/cache保护、服务端越权负例 |
| RISK-SD-002 更新或配置冲突造成内容丢失 | 004、005、007、008 | 高 / 中 | 指纹冲突、更新失败恢复、恢复占用、无关配置保留 |
| RISK-SD-003 来源/宿主失败被误报为成功 | 006、007、008 | 高 / 中 | CLI错码/超时/读回失败、离线来源、未知安装证据 |
| RISK-SD-004 跨站请求或环境串用引发非预期写入 | 008、009 | 高 / 中 | Host/Origin/token/body、mode绑定、旧响应丢弃 |
| RISK-SD-005 GUI流程不完整或无法在侧面板使用 | 002、010 | 中 / 中 | 独立浏览器E2E、响应式、键盘、错误与空态 |

MR-SD-001：系统/托管/未知对象不会因前端控件或伪造请求获得写权限。MR-SD-002：本机和演练数据、活动与预览不混用。MR-SD-003：没有用户现有配置/技能的静默覆盖；未验证会话加载时不宣称已生效。

## 阶段、责任与执行边界

| 阶段 | 承担者与必须完成内容 | 当前不执行 | 初始状态 |
|---|---|---|---|
| 开发内建验证 | 开发者运行类型检查、构建、文件/配置/CLI adapter 单元与集成回归 | 真实用户数据写操作 | NOT_RUN |
| 独立黑盒与浏览器验证 | 独立审查者按 HTTP/GUI 验证契约、完整旅程及错误；复核开发证据 | 不以白盒suite替代独立结论 | NOT_RUN |
| 本机只读 smoke | 核对真实清单/正文/能力标记，记录已扫描根、CLI版本、受限项 | 不切换真实开关、不刷新远程源、不安装/卸载 | NOT_RUN |
| UAT交接 | 开发者提供运行入口、演练fixture、已知限制与开发验证报告 | 不预填用户评价 | NOT_RUN |
| 用户 UAT | 用户执行 `06-uat-guide.md`，主要操作均在演练环境 | 不自动扩大为真实环境破坏性验收 | PENDING |

环境提供能力，不代替阶段结论。临时目录测试通过只能证明对应 fixture；真实只读检查通过不能证明真实写操作成功。未提供能力的必测项写 `BLOCKED` 并说明原因，不能伪写 `PASS` 或因暂缺 fixture 自动写 `N/A`。

## 需求与测试映射

所有条目目前是应执行范围，**不是已通过用例**。`DEV` 为开发内建，`SYS` 为独立 HTTP/系统黑盒，`UI` 为独立浏览器，`REAL` 为本机只读，`UAT` 为用户验收。

| 需求 | Backend / 系统验证 | UI / 本机核验 | 用户 UAT |
|---|---|---|---|
| 001 统一清单 | DEV-01：用户/项目/系统/cache多根、同名不同路径、latest别名、损坏/不可读来源不抹掉其他结果；SYS-01：字段与状态证据一致 | UI-01 搜索/来源筛选/详情；REAL-01 已知根抽样核对 | UAT-01、02、03、12 |
| 002 GUI | SYS-02：接口空/错误数据可区分 | UI-02 五页面与网格/列表；UI-03 1440/720/390、键盘/焦点/忙碌/空/错；UI-04 性能 | UAT-01、02、03、11 |
| 003 启禁 | DEV-02：按SKILL.md路径启禁往返、TOML注释与无关配置字节保留、插件按包；SYS-03：只读对象/无效ID拒绝且读回持久状态 | UI-05 开关反馈与重载提示；REAL-02 系统/cache状态无伪可写控件 | UAT-04、09、12 |
| 004 安装 | DEV-03：本地/本地Git、子目录/ref、已存在目标、坏frontmatter、源变化、越界链接/特殊文件、文件数/体积；SYS-04：预览mode和提交绑定 | UI-06 预览取消无变更、确认安装后刷新、冲突提示 | UAT-05、06、可选Git步骤 |
| 005 可恢复移除 | DEV-04：普通目录与链接移除/恢复、target内容不变、原路径占用、更新后新改动不被恢复覆盖；SYS-05：系统/cache/app自身拒绝写 | UI-07 对象路径/影响确认，取消及记录恢复入口 | UAT-08、09 |
| 006 市场/插件 | DEV-05：CLI argv、help探测、退出码/超时/输出上限/读回失败；市场manifest/路径/元数据保留；SYS-06：添加→发现→安装→启禁→卸载→移除市场 | UI-08 来源与插件联动，受支持与不可用动作有区别；REAL-03 CLI只读列表抽样 | UAT-09、10、12 |
| 007 更新 | DEV-06：可更新/无更新、无provenance、来源离线、源/目标变化、旧版恢复、目录替换失败；SYS-07：预览文件变化对应读回内容 | UI-09 更新页→检查→预览→更新→恢复；不把源离线显示无更新 | UAT-07 |
| 008 结果恢复 | DEV-07：互斥、重复提交、配置与provenance/journal部分失败；SYS-08：400/403/404/409/422/500及记录终态 | UI-10 成功/错误toast与活动一致，切mode丢弃旧响应，不重复提交 | UAT-06、07、08、11 |
| 009 本地边界 | DEV-08：规范化路径与父路径重查、受保护根；SYS-09：Host/Origin/token/Content-Type/畸形请求、任意文件读取、Git危险transport/凭证来源拒绝 | UI-11 SKILL.md中的HTML/脚本只显示文本；REAL-04 响应不含凭证或无关配置 | UAT-03、11、12 |
| 010 交付验证 | DEV-09：Node22启动/状态/停止、端口占用、依赖缺失/构建失败；仅停止本服务PID | UI-12 新会话打开URL完整载入、演练全旅程；REAL-05 不修改本机状态 | UAT-01、13 |

## HTTP 黑盒契约与回归

由独立验证者从实际 HTTP 入口执行，不能只调用内部函数：

- `GET /api/session`：响应token形状正确；Host与跨站限制覆盖session自身；不返回跨源授权。
- `GET /api/state`：Mode校验；Snapshot必需字段、能力原因、诊断、扫描时间；`enabled=null` 不转成false；不泄漏原始config/认证信息。
- `GET /api/skill`：只接受当前已发现对象ID；错误mode/id、任意路径和不可读来源有明确错误；正文作为数据返回。
- `POST /api/actions`：所有Action枚举有正常和缺必填字段覆盖；验证method、headers、请求字段、响应预览/错误及错误码。安装/更新previewId跨mode、过期、重复、源变化均拒绝；服务端重新判定操作能力。
- 成功不仅看200：读回state和fixture磁盘/配置；失败检查目标未改变或恢复记录明确。CLI返回0但读回对象仍不匹配时不算成功。
- 互斥/重试：同一对象快速重复操作不能生成两次安装或丢失备份；旧mode响应不能改变新mode界面。

证据记录接口、测试对象、关键输入、状态码和白名单响应，以及操作前后指纹。不得保存token、认证输出或无关用户配置作为报告附件。

## 数据、依赖与准备

临时fixture应包括：同名不同路径、别名和悬空链接、系统/cache只读对象、含注释与无关字段的配置、合法/无效skill、本地Git源、合法/无效marketplace、HTML正文、足够100项的性能样本。Git测试使用本地仓库，CLI失败用可控fixture binary；这些证明adapter行为，不冒充远程生产依赖已测试。

演练来源以实际 `/api/state?mode=sandbox` 的 `examples` 为准：

| 数据 | 实际契约字段 / 交付要求 |
|---|---|
| 可安装独立技能 | `examples.skillSource`；目录位于演练根，目标尚不存在，GUI可复制或一键填入 |
| 本地marketplace | `examples.marketplaceSource`；至少包含一个可安装演练插件，名称与影响范围GUI可辨 |
| 本地Git技能源 | 可选 `examples.gitSource`；存在才交付Git来源UAT步骤；自动化仍需覆盖本地Git安装 |
| 更新样例 | 开发者准备“目标v1 + 来源v2 + 安装v1的provenance”；内容含可识别的v1/v2文案，改变至少一个文件，支持更新和恢复。名称和GUI定位在UAT交接前绑定实际fixture |

更新样例不能在目标装入后提前同步其安装指纹到v2；否则检查更新会被伪造为无变化。用户应能完全在GUI完成检查、预览、更新和恢复，不要求其手改用户目录。若后端提供GUI演练源推进入口，可替代预置v1/v2，但交付指南只能描述实际存在的控件。

测试前记录明确的演练state root；任何清理只针对本轮创建且核对过的临时/演练根，不递归清理用户home或plugin cache。重复UAT允许保留活动与当前状态，指南需说明冲突或恢复方式。

## 性能、界面与观察

- 在记录OS、Node版本、硬件、fixture规模与是否暖启动的情况下，测试100个技能清单初次可用目标小于3秒；本地搜索从输入到结果更新目标小于100ms。记录实际值，未达目标写明影响。
- 1440px、720px与390px检查五页面和主要浮层；至少保存技能库、详情、安装、市场、更新、记录及错误反馈的截图，确保无阻断性横向溢出。
- 键盘能搜索、切页、打开/关闭浮层和操作主要按钮；Esc关闭、焦点返回、busy防双击、aria通知；文字与主要控件实际配色满足设计可读性目标。
- 记录加载、无数据、筛选无结果、单来源失败和CLI不可用；不以人工等待结束后的截图证明加载态存在。

## 入口、出口与结果格式

开发验证入口：设计与共享契约已可用，依赖和测试脚本实际存在；独立黑盒入口：可启动的构建与隔离fixture；UAT入口：初版URL可用、演练样例完整、验证报告与已知限制已交付。本文不假设开发测试已运行。

开发/独立验证出口：10项需求有对应执行证据；阻断性P0/P1为0；重要写操作具备持久化读回和失败负例；未覆盖项明确列为BLOCKED/DEFERRED并说明对UAT的影响；安全/隔离关键缺陷未关闭时不得以“等用户测试”替代修复。真实生产写操作因本轮边界不执行，不作为已测成功。

结果表使用：`ID | 日期/执行者 | 版本/环境 | PASS/FAIL/BLOCKED/NOT_RUN | 证据 | 缺陷/限制`。初稿全部是NOT_RUN；UAT使用PENDING、通过、不通过、受阻、未测，由用户填写。开发者自检和独立验证分别注明，UAT结论不得从自动化通过率推算。

优先执行启动与清单smoke、独立skill核心生命周期、安全/冲突恢复、市场插件adapter、完整GUI和响应式。通过后只有代码变更、发现新失败或尚未解决风险才扩大/重跑相应回归。源码独立审查和UAT批准分别记录，不互相替代。

文档校验与产品测试分别记录：本稿编写时实际运行trace-lint与PRD/Test Plan的trace-build-rtm，最终均通过。首次relation ID格式错误已在本稿修正并重跑。RTM中的执行覆盖仍为0，因为此阶段没有测试执行结果或verified_by关联；正文10项需求映射仅代表计划覆盖。

<!-- TRACEABILITY-METADATA:BEGIN -->
```yaml
schema:
  name: testany-traceability
  version: "1.0.0"
  profile: test-strategy-profile-v1
artifact:
  id: TSTRAT-SKILLDOCK-001
  type: TEST_STRATEGY
  title: SkillDock 初版测试计划
  status: draft
  owners: [engineering.codex, product.user]
  created_at: "2026-09-14"
  updated_at: "2026-09-14"
  source_documents: [PRD-SKILLDOCK-001]
entities:
  requirements: []
  risks:
    - id: RISK-SD-001
      title: 路径与所有者误识别
      statement: 同名、别名或托管路径误识别可能导致非目标对象被改写。
      status: proposed
      scope: in
      level: high
      likelihood: medium
      impact: 用户技能或宿主内容损坏
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-001}]
    - id: RISK-SD-002
      title: 更新与配置冲突
      statement: 外部变化或部分事务失败可能丢失内容与配置。
      status: proposed
      scope: in
      level: high
      likelihood: medium
      impact: 用户改动被覆盖且无法恢复
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-008}]
    - id: RISK-SD-003
      title: 依赖失败误报成功
      statement: CLI或来源失败可能被界面错误显示为成功或无更新。
      status: proposed
      scope: in
      level: high
      likelihood: medium
      impact: 用户误判实际安装更新状态
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-006}]
    - id: RISK-SD-004
      title: 跨站和跨环境写入
      statement: 跨源请求或错误mode绑定可能触发未经选择的本机写操作。
      status: proposed
      scope: in
      level: high
      likelihood: medium
      impact: 本机数据发生非预期变更
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-009}]
    - id: RISK-SD-005
      title: GUI旅程无法完成
      statement: 面板尺寸、状态或交互缺失使常用管理操作无法完成。
      status: proposed
      scope: in
      level: medium
      likelihood: medium
      impact: 无法作为日常GUI管理工具
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-002}]
  must_not_regress:
    - id: MR-SD-001
      title: 保护系统和托管资源
      statement: 前端或伪造请求不能获得受保护对象写权限。
      status: proposed
      scope: in
      priority: P0
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-009}]
    - id: MR-SD-002
      title: 本机演练隔离
      statement: 演练和本机的数据、记录和预览不能串用。
      status: proposed
      scope: in
      priority: P0
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-010}]
    - id: MR-SD-003
      title: 保留外部变化并如实标识状态
      statement: 用户内容不可静默覆盖且持久化与会话加载不得混淆。
      status: proposed
      scope: in
      priority: P0
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-008}]
  external_behaviors:
    - id: BEH-SD-001
      title: 完成可恢复技能生命周期
      statement: GUI支持预览安装、更新与移除恢复并呈现真实结果。
      status: proposed
      scope: in
      actor: user
      trigger: 在演练环境执行管理操作
      observable_outcome: 清单正文与活动随持久结果变化，恢复后回到相应版本
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: J2-J4}]
    - id: BEH-SD-002
      title: 明确插件与市场状态
      statement: GUI根据实际adapter能力展示来源与管理操作。
      status: proposed
      scope: in
      actor: user
      trigger: 查看插件与市场页面
      observable_outcome: 已安装与未知证据可区分，不支持动作显示原因
      source_refs: [{artifact_id: PRD-SKILLDOCK-001, section: REQ-SD-006}]
  decisions: []
  flows: []
  test_cases: []
relations:
  - {id: REL-SDTEST-001, type: derived_from, from: RISK-SD-001, to: REQ-SD-001, status: active}
  - {id: REL-SDTEST-002, type: derived_from, from: RISK-SD-002, to: REQ-SD-008, status: active}
  - {id: REL-SDTEST-003, type: derived_from, from: RISK-SD-003, to: REQ-SD-006, status: active}
  - {id: REL-SDTEST-004, type: derived_from, from: RISK-SD-004, to: REQ-SD-009, status: active}
  - {id: REL-SDTEST-005, type: derived_from, from: RISK-SD-005, to: REQ-SD-002, status: active}
  - {id: REL-SDTEST-006, type: derived_from, from: MR-SD-001, to: REQ-SD-009, status: active}
  - {id: REL-SDTEST-007, type: derived_from, from: MR-SD-002, to: REQ-SD-010, status: active}
  - {id: REL-SDTEST-008, type: derived_from, from: MR-SD-003, to: REQ-SD-008, status: active}
  - {id: REL-SDTEST-009, type: derived_from, from: BEH-SD-001, to: REQ-SD-004, status: active}
  - {id: REL-SDTEST-010, type: derived_from, from: BEH-SD-001, to: REQ-SD-005, status: active}
  - {id: REL-SDTEST-011, type: derived_from, from: BEH-SD-001, to: REQ-SD-007, status: active}
  - {id: REL-SDTEST-012, type: derived_from, from: BEH-SD-002, to: REQ-SD-006, status: active}
  - {id: REL-SDTEST-013, type: derived_from, from: RISK-SD-001, to: REQ-SD-003, status: active}
waivers: []
```
<!-- TRACEABILITY-METADATA:END -->
