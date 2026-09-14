---
name: uc-interviewer
description: 'User journey interview, use case interview, 用户旅程访谈。Use when: 基于 BRD 访谈、整理或补全 User Journey，"对齐 use case"、"确认用户操作流程"。'
---

# UC Interviewer - 用户旅程梳理

先读取 [工作流执行约定](../../references/workflow-execution.md) 和 [访谈模式与事实标准](../../references/interview-modes.md)：先取证、按真实能力工作，从当前安装位置定位资源。

> 默认跟随用户输入语言；显式指定优先。metadata 字段、枚举、ID 和 comment markers 保持英文，模板与子任务继承同一 output_language，见 [语言规则](../../references/language-policy.md)。

## 触发与边界

用于基于 BRD 澄清或整理用户操作流程、跨 Journey 跳转和异常/边界行为。不替代技术设计、PRD 批准或实施。仅编辑已有 Journey 片段时只检查受影响范围，不重新启动完整访谈。

## 模式选择

| 模式 | 行为 |
|---|---|
| interview | 模糊目标或明确要求访谈：开放发现，必要时提供可信选项，每轮 2-3 个关键缺口；尊重逐条确认要求 |
| synthesis | 材料足够且要求整理：批量复用已知旅程、步骤、优先级及跳转，直接交付草稿，不强制逐条再确认 |
| gap_followup | 材料基本齐全：只问未决分支、来源冲突或缺失决定，不重问有效基线和已有事实 |

已确认事实与本次工件的正式批准分开；用户只要求草稿就保持 draft。没有批准 BRD 仍可产出带来源状态的探索性草稿，不自行升级为正式基线。

## 工作流

### 1. 读取 BRD 与旅程材料

读取用户指定 BRD、相关批准依据和已有流程。提取目标用户、业务目标、in/out-scope、成功定义、版本及来源。
多份来源冲突时引用具体差异，集中询问真实缺口；文件名、“approved”标签或修改时间不单独证明批准。

### 2. 建立范围与稳定 ID

复用已明确的 Journey 范围和优先级，为缺失而确有必要的项目询问，不重新确认所有已给内容。
维护稳定 JOURNEY 工件 ID、FLOW-* Journey ID 和每条 Journey 的 S1/S2/... Step ID；更新已有材料不随意重编号。
建立 BRD → Journey 映射及 Journey Graph。新发现超出当前范围的旅程先作为待决项，不擅自扩大范围。

### 3. 细化步骤、跳转与边界

对每条在范围内的 Journey 整理：
- 谁、目标、前置/入口、终点与用户得到的结果。
- Happy Path 步骤；每条流向记录 from/to、触发条件、跨 Journey 目标入口和数据交接；结束用 END。
- 异常、回退、重试、中断、权限、状态变化、部分成功等相关分支。已给决定直接复用，未给的关键行为保持待定。
- 按 [步骤级边界框架](references/edge-case-framework.md) 检查适用类别，不能只列空泛名词。

每个选入范围的 edge case 记录 EC ID、类别、适用 Sx、触发条件、用户可见结果、处理流向、数据保留/恢复、MVP/后续及已确认/待定。
P0 Journey 不得把所有边界一概跳过；确无额外适用项时说明理由。MVP 边界缺失阻止锁定基线，但不阻止透明草稿。
这些是内容覆盖要求，不是每个字段都必须再次向用户提问。

### 4. 跨 Journey 一致性与 Checkpoint

检查共享步骤/异常策略、优先级依赖、悬挂跳转、未定义入口及跨 Journey 循环的退出路径。已有一致决定直接保留，仅对实质冲突补问。
按 [checkpoint-gates.md](references/checkpoint-gates.md) 分别记录内容覆盖、证据和批准条件；不得因资料充分或 lint 成功自称 approved。

### 5. 交付与验证

按语言读取 [中文模板](assets/journey-output-template.md) 或 [英文模板](assets/journey-output-template.en.md)，包含：
- [journey-profile-v1 示例](../../references/traceability-schema/journey-profile-v1.example.yaml) 中的 TRACEABILITY-METADATA、稳定 ID、source_documents、relations；使用该实际路径，不猜同名 schema 文件。
- Journey Graph、步骤/跳转表、步骤级 Edge Case Matrix。
- BRD → Journey 与 Journey → PRD 映射、Checkpoint Decision、待定项及真实 review record。

使用用户指定路径；未指定时选项目内合理默认并说明，不为路径重复提问。生成后先从当前 SKILL.md 的位置解析 TESTANY_ENG_ROOT（plugin 根目录），不要假定该环境变量预先存在。执行实际可用的检查：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json --profile journey-profile-v1 "[Journey路径]"
```

lint 未运行/失败需如实记录，必要依赖缺失不自动安装，也不阻止草稿交付；不得声称 lint 已通过。只有满足 checkpoint 条件且有当前版本/范围的真实批准，才可锁定基线。
用户指定 draft 不因检查通过自动提升；改 metadata 状态后需重新校验最终版本。

返回实际文档、当前状态、检查结果及剩余决定。推荐下游需说明是否可作锁定基线，不因完成草稿自动启动 PRD 或让用户重复上游已知信息。

## 输出规范

流程图使用 Mermaid；如用户要求的交付格式不能承载 Mermaid，保留可审查的节点/边表并说明限制，不用装饰性图代替流向证据。
具体结构以模板和 journey-profile-v1 为准；模板中的示例状态不是批准事实，应按本次证据填写。

## 使用示例

- “先访谈报销主流程，每条确认后再继续”：按该检查点访谈并等待。
- “把完整流程笔记整理为 User Journey 草稿”：直接生成，不逐步重复确认。
- “只有失败后是否重试、取消后是否保留草稿两点未定”：只补问两点，其余复用，未答前保留待定。
- “只修改 S2 的按钮文案”：局部修改并检查相关步骤/跳转一致性，不重开完整准出。
