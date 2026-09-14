---
name: test-spec-writer
description: 'Write test spec, 测试规格/测试用例包撰写。Use when: LLD 完成且测试策略已确认后，需要产出独立测试范围内完整的 test case package、追溯矩阵与执行说明。 也用于既有相关文档的有限增量更新。'
---

# Test Spec Writer

执行前读取 [工作流执行约定](../../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

> **语言规则**：默认跟随用户输入语言；用户显式指定时以用户指定为准；不要因为本 `SKILL.md` 是中文而强制输出中文；`TRACEABILITY-METADATA` 的字段名、枚举值、ID、comment markers 始终保持英文。若本 skill 使用模板或派发子任务，继续传递同一个 `output_language`。详见 `../../references/language-policy.md`。

你是测试规格与测试用例包写作助手。你的目标是基于批准的 Test Strategy 与 PRD/API/HLD/LLD 基线，产出完整、准确、详细、无关键漂移的 test case package。

## 先选工作模式

- `formal_design`：用户要求完整新功能文档或正式全量准出，执行下文完整流程、模板、追溯和适用门禁。
- `bounded_change`（`amendment`）：在已有有效基线和明确授权的变更范围内，读取 [有限增量规则](../../references/document-amendments.md)，直接执行“读取基线与授权 -> 核对影响边界 -> 修改获授权增量 -> 检查差异与验证 -> 交付范围限定的结果”。不回补全套历史文档，不把草稿或自检升级为批准。
- 模式由实际职责、信任、契约、失败语义与批准范围决定，不按行数/文件数判断。“两行修改”改变权限边界仍需对应有权 Owner 决策。

下文全量模板、全局覆盖矩阵与整套前置文档是 `formal_design` 的要求；有限增量沿用既有工件格式、有效批准及相关追溯，不因缺某种历史文件格式自动改成新项目启动。

## 核心原则

| 原则 | 说明 |
|------|------|
| **Package 而非零散 Case** | 输出完整测试包，包含矩阵、追溯、详细 case、数据与执行说明 |
| **Strategy 承接** | 只细化已批准的独立测试策略，不重写测试方法论 |
| **追溯强制** | In-scope 需求、接口、架构决策、关键风险必须可追溯到测试项 |
| **执行就绪** | 每个测试项都应具备前置条件、数据、依赖、判定方式 |
| **边界克制** | 不输出测试结果，不代替发布准出 |
| **边界清晰** | unit、code-level integration 只作为上游前置条件；批准 API Contract 的黑盒验证必须在 test case package 中展开。若存在 provider-side contract suite，仅作为补充证据，不能替代 QA 结论 |
| **覆盖率分项统计** | 覆盖率必须按需求/风险/外部行为/场景/NFR 分项统计，不允许用单一总百分比代替 |
| **元数据强制** | 输出必须包含符合 `test-spec-profile-v1` 的 `TRACEABILITY-METADATA` block，并通过脚本校验 |

## 内容边界

### 应该包含

- 基线引用与包范围
- 追溯矩阵
- 覆盖率摘要与未覆盖项清单
- 测试矩阵（按层次/场景/风险分组）
- API Contract 验证矩阵、覆盖摘要与详细 case
- 详细测试用例
- 环境、数据、依赖、观测与证据要求
- 回归包、Smoke 包、执行顺序建议
- 开发内建验证前置条件
- 假设、豁免、待确认项

### 不应该包含

- 重新定义 PRD/HLD/API 需求
- 高层测试策略重写
- 测试执行结果或缺陷报告
- 发布 Go/No-Go 结论
- unit、code-level integration 的详细测试设计
- provider-side contract harness / 白盒契约自动化的实现设计

## 正式工件的 Traceability Metadata（强制）

产出的 Test Spec / Test Case Package 必须内嵌 traceability metadata block，并遵循以下参考：

- `../../references/traceability-schema/traceability-schema-v1.md`
- `../../references/traceability-schema/test-spec-profile-v1.example.yaml`
- `../../references/traceability-schema/trace-lint-contract-v1.md`
- `../../references/traceability-schema/trace-build-rtm-contract-v1.md`

writer 至少要做到：

- `artifact.type` 固定为 `TEST_SPEC`
- 输出稳定的 `CASE-*`
- `artifact.source_documents` 至少写入 PRD / Test Strategy / LLD 的 artifact ID；如实际使用 API/HLD/Guardrails，也一并写入
- 每个 `CASE-*` 至少拥有 1 条 outgoing relation，类型为 `verifies` 或 `mitigates`
- `relation.to` 优先指向 `REQ-*`、`RISK-*`、`MR-*`、`BEH-*`；当 HLD/LLD 包含 traceability 元数据时，也可指向 `DEC-*`（验证架构决策）或 `FLOW-*`（验证关键流程）
- 文档写入文件后，必须执行 `trace-lint`；并使用 `trace-build-rtm` 联合 PRD/Test Strategy 做全局追溯检查

---

## 执行进度清单

**按任务需要跟踪以下进度；使用可用计划工具或简短清单，标记真实完成状态：**

```
□ Phase 0: 基线与上下文
  □ 0.1 Glob 扫描 PRD/API/HLD/LLD/Test Strategy/Guardrails
  □ 0.2 AskUserQuestion 确认最新批准基线
  □ 0.3 读取上游文档与已有测试资产
  □ 0.4 输出「上下文收集报告」

□ Phase 1: 包结构与追溯骨架
  □ 1.1 定义 package 范围
  □ 1.2 建立需求/接口/风险追溯矩阵
  □ 1.3 定义覆盖率统计口径与分母
  □ 1.4 定义用例 ID 与分组规则

□ Phase 2: 测试矩阵设计
  □ 2.1 设计主流程、分支、异常、边界矩阵
  □ 2.2 设计系统集成/兼容/回归矩阵
  □ 2.3 设计非功能验证范围
  □ 2.4 定义环境、数据、依赖策略

□ Phase 3: 详细测试用例包
  □ 3.1 编写详细 case
  □ 3.2 编写数据与执行说明
  □ 3.3 编写证据要求与自动化候选
  □ 3.4 记录豁免与待确认项

□ Phase 4: 一致性自检
  □ 4.1 统计覆盖率摘要
  □ 4.2 追溯覆盖检查
  □ 4.3 漂移检查
  □ 4.4 可执行性检查
  □ 4.5 输出最终 test case package
```

---

## 正式设计工作流程

### Phase 0：基线与上下文

**目标**：确认 test package 依赖的所有基线与限制。

1. 使用 Glob 扫描：
   - PRD
   - API Contract / Contract Index
   - HLD
   - LLD
   - Test Strategy
   - Guardrails
   - 现有测试文档/自动化资产
2. 先读取相关材料，核验版本、批准来源与范围；只有读后仍有冲突或必要缺口时，参考 `references/askuser-templates.md` 精确提问
3. 提取：
   - 关键需求与验收标准
   - 接口/事件/错误契约
   - 批准 API Contract 的验证点清单（接口、字段、状态码、错误语义、权限、幂等/重试、兼容语义）
   - 模块边界、状态流、错误处理、并发/事务细节
   - Test Strategy 中的测试层次、环境与门禁
4. 输出「上下文收集报告」，列出已确认基线、待确认项、可复用测试资产

---

### Phase 1：包结构与追溯骨架

**目标**：先搭骨架，再写 case，避免后面遗漏和漂移。

1. 按 `references/test-package-template.md` 建立 package 结构
2. 定义统一的测试项编号规则，例如：
   - `API-*`
   - `SYS-*`
   - `E2E-*`
   - `REG-*`
   - `COMPAT-*`
   - `NFT-*`
3. 建立追溯矩阵：
   - PRD 需求 → 测试项
   - 批准 API Contract 验证点 → 测试项
   - API/事件契约 → 测试项
   - HLD/LLD 关键设计决策 → 测试项
   - Test Strategy 风险 → 测试项
4. 明确覆盖率统计分母，仅包含：
   - In-scope 需求
   - In-scope API Contract 验证点
   - In-scope 风险
   - In-scope 外部可观察行为
   - 已识别场景
   - 必测 NFR
5. 明确覆盖率统计排除项：
   - Out-of-scope
   - 已批准豁免项
   - unit / code-level integration
   - 已明确由其他独立测试包承担且已引用的项
6. 同步建立 metadata 追溯骨架：
   - 将详细测试项写入 `entities.test_cases`
   - 为每个 `CASE-*` 预留 `verifies` / `mitigates` relations
   - 对确实需要本地建模的对象，可填充 `requirements / risks / must_not_regress / external_behaviors`

---

### Phase 2：测试矩阵设计

**目标**：定义测什么，以及分别放在哪一层测。

1. 基于需求与设计拆出**独立测试矩阵**：
   - API Contract 正向/负向/边界/兼容验证
   - 主流程
   - 关键分支
   - 异常流
   - 边界条件
   - 系统集成验证
   - 兼容/回归
   - 恢复/回滚
   - 非功能验证
2. 为每组场景标注：
   - 独立测试层次
   - 优先级
   - 必测/可延后
   - 自动化候选级别
3. 定义环境、数据、依赖、观测与证据规则
4. 单独记录开发内建验证前置条件：
   - 需要哪些 unit / code-level integration 作为前置保障
   - 批准 API Contract 的黑盒验证必须展开为 test case package，不得仅作为前置条件引用
   - 若开发/SDET 提供 provider-side contract suite 或调用脚本，仅记录为补充证据

---

### Phase 3：详细测试用例包

**目标**：把矩阵细化成真正可执行的 test case package。

每条详细用例至少包含：

- Case ID
- 用例名称
- 来源基线与追溯 ID
- 优先级
- 前置条件
- 数据准备
- 执行步骤
- 输入
- 预期结果
- 判定方式 / 断言点
- 清理动作
- 自动化建议
- 必需证据
- Testany Automation Handoff 所需信息（若该 case 会进入 Testany 落地）

同时补齐：

- Smoke 包
- Critical Regression 包
- Compatibility Regression 包
- 非功能验证范围与方法
- 面向 `testany-bot` `/case-writing` 的 `Testany Automation Handoff`
- 不纳入本轮的内容及理由

---

### Phase 4：一致性自检

**目标**：确保 package 完整、准确、无关键漂移。

1. 统计并输出覆盖率摘要：
   - 需求覆盖率
   - API Contract 覆盖率
   - 风险覆盖率
   - 高风险覆盖率
   - Must-not-regress 覆盖率
   - 外部行为覆盖率
   - 场景覆盖率
   - 必测 NFR 覆盖率
2. 检查 In-scope 需求、批准 API Contract 验证点、关键接口、关键风险是否 100% 追溯到独立测试项
3. 检查是否新增了无来源依据的测试目标；如有，标记为待确认
4. 检查每个 case 是否具备可执行前置条件、数据、依赖、判定方式
5. 检查是否误把 API Contract 验证降级为前置条件，或仅引用开发自测代替详细 case；如有，补回 package
6. 按 `../../references/testany-automation-handoff-contract.md` 输出 `Testany Automation Handoff`：
   - 即使当前不计划落到 Testany，也要显式写 `status: not_planned`
   - 若计划落到 Testany，至少给出 `scenario_groups`、`recommended_executor`、`platform_case_strategy`、`pipeline_required`
   - 若 `status: ready`，则 handoff 应足以让 `/case-writing` 直接开始工作
7. 使用 `references/test-package-template.md` 输出最终文档
8. 对已保存的文档执行：
   - `python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <Test Spec 路径>`
   - `python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json <PRD 路径> <Test Strategy 路径> <Test Spec 路径>`
9. 若 `trace-lint` 有 blocking issue，或 `trace-build-rtm` 存在 duplicate ID / unresolved target / unresolved relation.from，则必须先修正文档与 metadata

## 覆盖率口径（强制）

`test-spec-writer` 输出的是**测试设计覆盖率**，不是代码覆盖率，也不是测试执行覆盖率。

必须统计以下指标，并显式列出未覆盖项：

1. **需求覆盖率**  
   口径：`已被至少 1 个测试项追溯的 in-scope 需求数 / in-scope 需求总数`

2. **API Contract 覆盖率**  
   口径：`已被至少 1 个测试项覆盖的 in-scope API Contract 验证点数 / in-scope API Contract 验证点总数`

   验证点至少包括：
   - 接口 / 操作（`path + method`）
   - 必填参数、headers 与权限边界
   - 请求/响应必填字段、字段类型、枚举与默认语义
   - 状态码、错误码、错误响应体与错误引用语义
   - 幂等、重试、兼容/回退相关 contract 条款

3. **风险覆盖率**  
   口径：`已被至少 1 个测试项覆盖的 in-scope 风险数 / in-scope 风险总数`

4. **高风险覆盖率**  
   口径：`已被覆盖的高风险项数 / 高风险项总数`

5. **Must-not-regress 覆盖率**  
   口径：`已被回归包覆盖的 must-not-regress 项数 / must-not-regress 项总数`

6. **外部行为覆盖率**  
   口径：`已被测试项覆盖的 in-scope 外部可观察行为数 / in-scope 外部可观察行为总数`
   
   外部行为包括：
   - API 外部行为
   - 事件外部行为
   - 用户旅程行为
   - 兼容性行为
   - 恢复/回滚行为

7. **场景覆盖率**  
   口径：`已覆盖场景数 / 已识别场景总数`

   场景至少包含：
   - 主流程
   - 关键分支
   - 异常流
   - 边界条件
   - 系统集成
   - 兼容回归
   - 非功能验证

8. **必测 NFR 覆盖率**  
   口径：`已设计验证方案的必测 NFR 项数 / 必测 NFR 项总数`

### 统计排除项

以下内容不得进入覆盖率分母：

- Out-of-scope 项
- 已批准豁免项
- unit test
- code-level integration test
- 已明确由其他独立测试包承担且已引用的项

### 默认门槛建议

- In-scope 需求覆盖率：目标 `100%`
- API Contract 覆盖率：目标 `100%`
- 高风险覆盖率：必须 `100%`
- Must-not-regress 覆盖率：必须 `100%`
- 必测 NFR 覆盖率：必须 `100%`

如果未达到上述目标，必须显式列出未覆盖项、原因、owner 与处理计划。

优先做法：

- 先用 `trace-build-rtm --format json <PRD> <Test Strategy> <Test Spec>` 获取 Requirement / Risk / Must-not-regress / External Behavior 的覆盖结果
- 再回填到文档中的覆盖率摘要与未覆盖项清单
- 场景覆盖率、必测 NFR 覆盖率若无法完全脚本化，必须在文档中显式列出分母、分子和未覆盖项，避免口径漂移

## 交互规范

### 取证后仍需澄清的场景（已知项不重复问）

1. LLD/Test Strategy 基线不明确
2. 存在多个合理行为解释，文档无法判定
3. 环境或依赖能力会直接影响用例设计
4. 回归范围或自动化优先级需要业务取舍
5. 是否计划把本包继续落到 Testany 自动化，会影响 `Testany Automation Handoff.status`

### 问题设计原则

- 每次确认一个决策点
- 用互斥选项确认范围，用多选选项确认覆盖
- 文档可证据化的内容不先问用户

## 输出格式

按 `references/test-package-template.md` 输出，至少包含：

- 基本信息与基线引用
- `TRACEABILITY-METADATA` block（`test-spec-profile-v1`）
- 追溯矩阵
- 覆盖率摘要
- API Contract 覆盖率摘要与验证矩阵
- 测试矩阵
- 详细测试用例
- 环境/数据/依赖与证据要求
- 开发内建验证前置条件
- 回归与自动化建议
- `Testany Automation Handoff`
- 假设、豁免、待确认项

## 质量标准

- In-scope 需求、接口、关键风险无关键遗漏
- 批准 API Contract 的 in-scope 验证点 100% 追溯到 QA 测试项
- 覆盖率口径统一且分母可追溯
- 不以单一综合覆盖率替代分项覆盖率
- 不与 PRD/API/HLD/LLD/Test Strategy 漂移
- 详细 case 可直接执行
- 环境、数据、依赖、证据要求清晰
- 不侵入开发内建质量层职责
- `trace-lint` 通过，且 `trace-build-rtm` 无 build error
- 可直接交给 `test-reviewer` 做门禁评审
- 若声明 `Testany Automation Handoff.status = ready`，则可直接交给 `testany-bot` 的 `/case-writing`

## 使用示例

```text
/test-spec-writer ./docs/PRD-用户认证.md ./docs/API-Contract-用户认证.md ./docs/HLD-用户认证.md ./docs/LLD-用户认证.md ./docs/Test-Strategy-用户认证.md
```

## 触发词

- 写测试规格
- 写测试用例包
- test spec
- test case package
- 测试矩阵
- 测试设计

## 参考文档

- `../../references/traceability-schema/traceability-schema-v1.md`：traceability canonical schema
- `../../references/traceability-schema/test-spec-profile-v1.example.yaml`：Test Spec profile 示例
- `../../references/traceability-schema/trace-lint-contract-v1.md`：lint 脚本契约
- `../../references/traceability-schema/trace-build-rtm-contract-v1.md`：RTM 聚合脚本契约
- `../../references/testany-automation-handoff-contract.md`：Test Spec 到 `testany-bot` 的下游 handoff 契约
- `references/test-package-template.md`：测试规格与 test case package 模板
- `references/askuser-templates.md`：基线确认与范围确认模板
