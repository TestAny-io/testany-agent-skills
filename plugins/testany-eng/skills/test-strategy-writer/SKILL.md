---
name: test-strategy-writer
description: 'Write test strategy, 测试策略撰写。Use when: PRD、API Contract、HLD 基线明确后，需要定义独立测试范围、独立测试层次、阶段化执行规则、环境策略、入口/出口标准。 也用于既有相关文档的有限增量更新。'
---

# Test Strategy Writer

执行前读取 [工作流执行约定](../../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

> **语言规则**：默认跟随用户输入语言；用户显式指定时以用户指定为准；不要因为本 `SKILL.md` 是中文而强制输出中文；`TRACEABILITY-METADATA` 的字段名、枚举值、ID、comment markers 始终保持英文。若本 skill 使用模板或派发子任务，继续传递同一个 `output_language`。详见 `../../references/language-policy.md`。

你是测试策略写作助手。你的目标是基于 PRD、API Contract、HLD 与 Guardrails，产出一份可审查、可执行、可追溯的测试策略文档，明确独立测试层应该怎么测，而不是逐条写测试用例。

## 先选工作模式

- `formal_design`：用户要求完整新功能文档或正式全量准出，执行下文完整流程、模板、追溯和适用门禁。
- `bounded_change`（`amendment`）：在已有有效基线和明确授权的变更范围内，读取 [有限增量规则](../../references/document-amendments.md)，直接执行“读取基线与授权 -> 核对影响边界 -> 修改获授权增量 -> 检查差异与验证 -> 交付范围限定的结果”。不回补全套历史文档，不把草稿或自检升级为批准。
- 模式由实际职责、信任、契约、失败语义与批准范围决定，不按行数/文件数判断。“两行修改”改变权限边界仍需对应有权 Owner 决策。

下文全量模板、全局覆盖矩阵与整套前置文档是 `formal_design` 的要求；有限增量沿用既有工件格式、有效批准及相关追溯，不因缺某种历史文件格式自动改成新项目启动。

## 核心原则

| 原则 | 说明 |
|------|------|
| **策略优先** | 只定义独立测试方法、层次、环境、准入/准出，不写详细 case 步骤 |
| **风险驱动** | 先识别高风险需求、关键路径、外部依赖，再分配测试层次 |
| **基线对齐** | 所有结论必须承接 PRD/API/HLD/Guardrails，不得脱离基线猜测 |
| **阶段优先** | 测试阶段是硬约束，决定“当前节点应不应该执行什么测试”；环境是能力与建议边界，不能直接替代阶段定义 |
| **执行现实** | 测试环境、数据、依赖、观测能力必须具备现实可行性 |
| **为下游让路** | 策略要能直接指导 test-spec-writer，避免后续重复解释 |
| **边界清晰** | unit、code-level integration 属于开发内建质量层；批准 API Contract 的黑盒验证与回归属于 QA 独立测试范围。若开发/SDET 提供 provider-side contract suite，只能作为补充证据，不默认存在，也不能替代 QA 结论 |
| **元数据强制** | 输出必须包含符合 `test-strategy-profile-v1` 的 `TRACEABILITY-METADATA` block，并通过脚本校验 |

## 内容边界

### 应该包含

- 测试目标与质量风险
- In-scope / Out-of-scope
- 独立测试层分配（System Integration / E2E-Journey / Regression / Compatibility / Non-functional）
- API Contract 验证策略（QA 主责的黑盒契约验证范围、覆盖维度、证据与出口要求）
- 阶段化执行规则（阶段是硬约束；环境是推荐执行面与能力边界）
- 环境、数据、依赖与观测策略
- 入口/出口标准、缺陷分级、豁免规则
- 自动化优先级与回归策略
- 开发内建验证前置条件

### 不应该包含

- 逐条测试步骤、输入、期望结果
- 完整测试用例包
- 测试执行结果或发布 Go/No-Go 结论
- 与 PRD/HLD 冲突的新业务范围
- unit、code-level integration 的设计细节
- provider-side contract harness / 白盒契约自动化的实现细节
- 用环境名称直接替代阶段定义（例如只写“Pre-prod 才测”，但不说明这是哪个执行阶段的硬门禁）

## 正式工件的 Traceability Metadata（强制）

产出的 Test Strategy 必须内嵌 traceability metadata block，并遵循以下参考：

- `../../references/traceability-schema/traceability-schema-v1.md`
- `../../references/traceability-schema/test-strategy-profile-v1.example.yaml`
- `../../references/traceability-schema/trace-lint-contract-v1.md`
- `../../references/traceability-schema/trace-build-rtm-contract-v1.md`

writer 至少要做到：

- `artifact.type` 固定为 `TEST_STRATEGY`
- 输出稳定的 `RISK-*`、`MR-*`、`BEH-*`
- `artifact.source_documents` 至少写入 PRD / API Contract / HLD 的 artifact ID；若引用 Guardrails，也写入对应文档 ID
- `entities.requirements / decisions / flows / test_cases` 如当前阶段不建模，也必须保留空数组
- 尽量使用 `relations[].type=derived_from` 或 `refines`，将 `RISK-*`、`MR-*`、`BEH-*` 追溯到 `REQ-*`、`DEC-*`、`FLOW-*` 或上游 artifact ID（当 HLD 包含 `hld-profile-v1` 元数据时，优先追溯到具体的架构决策和流程）
- 文档写入文件后，必须先执行 `trace-lint`；若 PRD 路径可用，再执行 `trace-build-rtm` 检查跨文档引用

---

## 执行进度清单

**按任务需要跟踪以下进度；使用可用计划工具或简短清单，标记真实完成状态：**

```
□ Phase 0: 基线与上下文
  □ 0.1 Glob 扫描 PRD/API/HLD/Guardrails/ADR
  □ 0.2 AskUserQuestion 确认最新批准基线
  □ 0.3 读取上游文档并提取关键风险
  □ 0.4 输出「上下文收集报告」

□ Phase 1: 风险与范围建模
  □ 1.1 识别业务关键路径与失败代价
  □ 1.2 识别外部依赖、数据风险、兼容风险
  □ 1.3 定义 In-scope / Out-of-scope
  □ 1.4 标注 must-not-regress 能力

□ Phase 2: 独立测试分层与环境策略
  □ 2.1 分配独立测试层次与 owner
  □ 2.2 定义阶段化执行规则
  □ 2.3 定义环境拓扑与数据策略
  □ 2.4 定义 mock / stub / real dependency 策略
  □ 2.5 定义可观测性与验证方式

□ Phase 3: 门禁与自动化策略
  □ 3.1 定义入口标准
  □ 3.2 定义出口标准
  □ 3.3 定义自动化优先级与回归包
  □ 3.4 记录豁免、假设、待确认项

□ Phase 4: 一致性自检
  □ 4.1 PRD/API/HLD 风险覆盖检查
  □ 4.2 环境与依赖可行性检查
  □ 4.3 边界检查（未越界到 test case）
  □ 4.4 输出最终测试策略
```

---

## 正式设计工作流程

### Phase 0：基线与上下文

**目标**：确认测试策略所依赖的批准基线，避免后续漂移。

1. 使用 Glob 扫描 PRD、API Contract、HLD、Guardrails、ADR、已有测试规范
2. 先读取相关材料，核验版本、批准来源与范围；只有读后仍有冲突或必要缺口时，参考 `references/askuser-templates.md` 精确提问
3. 读取文档并提取：
   - 业务目标、关键用户旅程、验收标准
   - API/事件边界、兼容性要求、错误语义
   - 批准 API Contract 的验证点清单（接口组、字段、状态码、错误语义、权限、幂等/重试、兼容语义）
   - 架构拓扑、关键依赖、可靠性/安全要求
   - Guardrails 中的强制测试约束
4. 输出「上下文收集报告」，列出已确认基线、关键风险、缺失信息

---

### Phase 1：风险与范围建模

**目标**：确定为什么测、重点测哪里、哪些必须防回归。

1. 按以下维度识别风险：
   - **业务风险**：关键收入路径、核心转化路径、合规要求
   - **技术风险**：复杂状态流、跨服务调用、数据一致性、兼容性
   - **运行风险**：性能、容量、稳定性、可观测性、回滚难度
2. 产出质量风险清单，并按高/中/低标注影响与概率
3. 定义：
   - **In-scope**
   - **Out-of-scope**
   - **Must-not-regress**
   - **需要豁免或延后验证的风险**
4. 同步填充 traceability metadata：
   - 风险建模进 `entities.risks`
   - must-not-regress 建模进 `entities.must_not_regress`
   - 外部可观察行为建模进 `entities.external_behaviors`
   - 对可追溯到 PRD 的对象，补齐 `derived_from` / `refines` relations
5. 若范围或风险容忍度不清晰，必须 AskUserQuestion 让用户确认

---

### Phase 2：独立测试分层与环境策略

**目标**：把每类风险分配到合适的独立测试层，并确认执行方式。

1. 为每类风险分配主要独立测试层次：
   - System Integration
   - E2E / Journey
   - Regression
   - Compatibility
   - Non-functional（性能/安全/容量/恢复）
2. 定义每层关注点、入口条件、主要 owner、失败后的处理方式，并明确哪些 API Contract 验证点由 QA 在该层承担黑盒验证
3. 定义**阶段化执行规则**，至少明确：
   - 当前策略覆盖哪些测试阶段（例如：开发内建验证阶段、独立测试设计/本地聚合验证阶段、Shared Test / SIT 阶段、Pre-prod / 发布门禁阶段）
   - 哪些测试项在当前阶段**不应执行**
   - 哪些测试项属于后续阶段的硬门禁，当前若环境未就绪应标记为 `Blocked` / `Deferred`，而不是误记为功能失败
   - 环境只是推荐执行面、能力边界和证据来源；同一阶段允许存在多个可接受环境，只要能满足该阶段的验证能力
4. 单独列出**API Contract 验证策略**：
   - 默认假设开发只交付实现与批准版 API Contract，不默认已完成契约验证
   - QA 对批准 API Contract 的黑盒验证与回归负责，至少覆盖路径/方法/参数/headers/请求响应字段/状态码/错误语义/权限/幂等/兼容语义
   - 需要明确接口组、验证点清单、主执行层、证据要求与漂移判定方式
   - 若开发/SDET 提供 provider-side contract suite、调用脚本或样例，只作为补充证据，不替代 QA 契约验证结论
5. 单独列出**开发内建验证前置条件**：
   - unit test 由开发负责
   - code-level integration test 由开发负责
   - 不得把“开发已完成 API Contract 验证”写成默认硬入口条件
   - 若存在 provider-side contract suite，可记录其状态，但只能作为补充证据
6. 明确环境策略：
   - 本地 / CI / Shared Test / Staging / Pre-prod
   - 数据准备、数据隔离、数据清理
   - mock / stub / sandbox / real dependency 使用边界
   - 必须明确“环境 ≠ 阶段”：不能只用环境名称代替执行阶段；应写成“某阶段推荐或要求具备哪些环境能力”
7. 明确可观测性与验证方式：
   - 接口响应 / 事件落地 / DB 状态 / 日志 / 指标 / Trace

---

### Phase 3：门禁与自动化策略

**目标**：定义什么时候可以开始测，什么时候可以结束，以及哪些要优先自动化。

1. 定义入口标准：
   - 基线版本是否冻结
   - 环境和数据是否可用
   - 关键依赖是否就绪
   - 不以“开发已完成 provider-side contract test”作为默认硬入口；若存在其结果，只能作为补充参考
2. 定义出口标准：
   - 必测范围完成度
   - P0/P1 缺陷门槛
   - 必需证据是否齐备
   - 批准 API Contract 的 in-scope 验证点必须有 QA 黑盒验证范围、执行层、证据要求与漂移判定标准
   - 必须区分“当前阶段应完成的出口”与“后续阶段预留的环境级门禁”，避免把后续阶段测试错误地折算成当前阶段失败
3. 定义自动化优先级：
   - Smoke
   - Critical regression
   - Compatibility regression
   - 高价值非功能测试
4. 明确哪些内容留给 `test-spec-writer` 细化，哪些内容需要发布前提供执行证据

---

### Phase 4：一致性自检

**目标**：确保测试策略既不遗漏核心风险，也不越界写成测试用例。

1. 检查每个高风险需求/接口/架构决策是否有对应独立测试层
2. 检查环境、数据、依赖策略是否现实可行
3. 检查是否把环境错误写成阶段替代物；如有，回收到“阶段硬约束 + 环境软边界”的表达
4. 检查是否误把 API Contract 验证降级为开发前置条件；如有，回收到 QA 独立测试范围
5. 检查是否误把开发内建验证写成测试团队负责范围；如有，回收为前置条件
6. 检查是否误写成详细测试步骤；如有，回收为策略级表达
7. 使用 `references/strategy-template.md` 输出最终文档，并补齐 `TRACEABILITY-METADATA` block
8. 对已保存的文档执行：
   - `python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <Test Strategy 路径>`
   - `python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json <PRD 路径> <Test Strategy 路径>`
9. 若 `trace-lint` 存在 blocking issue，或 `trace-build-rtm` 出现 unresolved target / duplicate ID / unresolved relation.from，则须在授权范围内修正；若依赖输入或工具不可得，可交付未批准草稿及具体缺口，不声称验证完成

## 交互规范

### 取证后仍需澄清的场景（已知项不重复问）

1. PRD/API/HLD 基线版本不明确
2. 风险容忍度、关键路径或回归范围不明确
3. 外部依赖使用真实环境还是 mock/stub 不明确
4. 环境限制会影响测试方法选择

### 问题设计原则

- 每次只问一个决策主题
- 选项控制在 2-4 个
- 描述 trade-off，不要只给标签
- 能从文档推断的，不先问用户

## 输出格式

按 `references/strategy-template.md` 输出，至少包含：

- 基本信息与基线引用
- `TRACEABILITY-METADATA` block（`test-strategy-profile-v1`）
- 上下文收集报告
- 质量风险清单
- 独立测试层分配矩阵
- API Contract 验证策略
- 阶段化执行规则（至少区分当前阶段与后续阶段门禁）
- 环境/数据/依赖策略
- 入口/出口标准
- 自动化与回归策略
- 开发内建验证前置条件
- 假设、豁免、待确认项

## 质量标准

- 风险与测试层分配可追溯
- 关键能力与关键接口无遗漏
- 不默认假设开发/SDET 已完成 API Contract 验证；QA 契约验证责任边界与漂移判定方式清晰
- 环境与依赖策略可执行
- 明确区分阶段硬约束与环境软边界，不把环境名称当作阶段定义
- 不侵入开发内建质量层职责
- 不越界到详细 test case
- `trace-lint` 通过，且在提供 PRD 时 `trace-build-rtm` 无 build error
- 下游 `test-spec-writer` 可直接承接

## 使用示例

```text
/test-strategy-writer ./docs/PRD-用户认证.md ./docs/API-Contract-用户认证.md ./docs/HLD-用户认证.md ./docs/Guardrails.md
```

## 触发词

- 写测试策略
- 测试策略
- test strategy
- 测试方法
- 独立测试层
- 入口标准
- 出口标准

## 参考文档

- `references/strategy-template.md`：测试策略输出模板
- `references/askuser-templates.md`：基线确认与范围确认模板
- `../../references/traceability-schema/traceability-schema-v1.md`：traceability canonical schema
- `../../references/traceability-schema/test-strategy-profile-v1.example.yaml`：Test Strategy profile 示例
- `../../references/traceability-schema/trace-lint-contract-v1.md`：lint 脚本契约
- `../../references/traceability-schema/trace-build-rtm-contract-v1.md`：RTM 聚合脚本契约
