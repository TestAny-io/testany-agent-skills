# BRD 访谈框架

本文档定义 brd-interviewer 的访谈结构、问题设计原则和分支逻辑。

---

## 1. 选择题设计原则

### 1.1 为什么用选择题？

| 问答题的问题 | 选择题的优势 |
|--------------|--------------|
| 需要 stakeholder 有表达能力 | 只需要判断和选择能力 |
| 容易跑题、发散 | 结构化、聚焦 |
| 容易遗漏关键维度 | MECE 覆盖所有选项 |
| 难以比较和量化 | 标准化、可比较 |

### 1.2 选择题设计规范

| 规范 | 说明 |
|------|------|
| 选项数量 | 3-5 个，不超过 6 个 |
| 选项互斥 | 单选题选项必须互斥 |
| MECE 原则 | 选项应覆盖所有可能 |
| 提供"其他" | 允许自定义，但鼓励先选已有选项 |
| 选项有解释 | 每个选项附带简短说明 |

### 1.3 问题类型

| 类型 | 适用场景 | 示例 |
|------|----------|------|
| **单选** | 核心决策、互斥选项 | 目标类型、风险容忍度 |
| **多选** | 并列属性、覆盖范围 | 受影响人群、约束条件 |
| **单选+追问** | 需要进一步量化 | 成功指标（选择后问具体数值） |
| **是非题** | 快速确认假设 | "你确定这个前提成立吗？" |

---

## 2. 访谈阶段详解

### Phase 0: 意图捕获

**目的**：获取原始输入，建立访谈起点

**要点**：
- 只问一个开放式问题："用一句话告诉我你想做什么？"
- 不要打断、不要追问细节
- 原封不动记录原话

**输出**：`原始意图` 字段

---

### Phase 1: 核心分类

**目的**：快速定位需求类型，为后续分支做准备

#### 问题 1.1: 目标类型

```yaml
question: "这个需求的核心目标是什么？"
type: single-select
options:
  - value: revenue
    label: "收入增长"
    description: "提高营收、转化率、客单价、复购率等"
    triggers: [revenue_branch]
  - value: cost
    label: "成本下降"
    description: "降低运营成本、人力成本、获客成本等"
    triggers: [cost_branch]
  - value: compliance
    label: "风险合规"
    description: "满足法规要求、安全合规、审计需求等"
    triggers: [compliance_branch]
  - value: experience
    label: "用户体验"
    description: "提升满意度、解决痛点、优化流程等"
    triggers: [experience_branch]
  - value: efficiency
    label: "运营效率"
    description: "提高内部效率、自动化、减少人工等"
    triggers: [efficiency_branch]
  - value: strategic
    label: "战略卡位"
    description: "竞争防御、市场占位、生态布局等"
    triggers: [strategic_branch]
```

#### 问题 1.2: 受影响人群

```yaml
question: "这个需求会直接影响哪些人群？"
type: multi-select
options:
  - value: customer
    label: "终端客户"
    description: "使用产品的最终用户"
  - value: sales
    label: "销售团队"
    description: "负责获客、成交的团队"
  - value: ops
    label: "运营团队"
    description: "负责日常运营的团队"
  - value: cs
    label: "客服团队"
    description: "处理用户问题的团队"
  - value: finance
    label: "财务团队"
    description: "负责账务、结算的团队"
  - value: legal
    label: "合规/法务"
    description: "负责合规审查的团队"
  - value: tech
    label: "技术团队"
    description: "负责开发维护的团队"
  - value: supply
    label: "供应链/仓储"
    description: "负责供应链的团队"
  - value: partner
    label: "合作伙伴"
    description: "外部合作方"
```

#### 问题 1.3: 期望变化

```yaml
question: "你期望通过这个需求实现什么类型的变化？"
type: single-select
options:
  - value: new
    label: "新增能力"
    description: "做一个现在完全没有的功能"
  - value: replace
    label: "替代现有"
    description: "用新方案替换现有流程/系统"
  - value: fix
    label: "修复痛点"
    description: "解决现有流程中的关键问题"
  - value: optimize
    label: "优化提升"
    description: "在现有基础上优化指标"
  - value: comply
    label: "合规达标"
    description: "满足外部强制要求"
```

---

### Phase 2: 成功定义

**目的**：明确可量化、可验证的成功标准

#### 问题 2.1: 成功指标（根据目标类型动态生成）

**收入增长类指标**：
- 营收增长率（目标值 + 时间窗口）
- 转化率提升（从哪到哪 + 目标值）
- 客单价提升（目标值）
- 复购率提升（目标值）
- LTV 提升（目标值）

**成本下降类指标**：
- 人力成本降低（目标比例）
- 获客成本降低（目标 CAC）
- 运营成本降低（具体项目 + 目标值）
- 技术成本降低（目标值）

**用户体验类指标**：
- NPS 提升（目标值）
- 满意度提升（衡量方式 + 目标值）
- 流程时长缩短（目标时长）
- 错误率降低（目标比例）
- 投诉率降低（目标比例）

**合规类指标**：
- 合规达标时间（截止日期）
- 审计通过率（目标比例）
- 风险事件数（目标值）

#### 问题 2.2: 数据来源

```yaml
question: "这些指标的数据从哪里获取？"
type: single-select
options:
  - value: existing
    label: "现有埋点/报表"
    description: "已有数据采集，可直接使用"
  - value: new_tracking
    label: "需要新增埋点"
    description: "需要开发新的数据采集"
  - value: third_party
    label: "第三方数据"
    description: "需要从外部获取数据"
  - value: manual
    label: "人工统计"
    description: "需要人工收集和统计"
  - value: unknown
    label: "尚不清楚"
    description: "需要进一步调研"
    marks_as_assumption: true
```

---

### Phase 3: 范围与约束

**目的**：划定边界，识别硬性限制

#### 问题 3.1: 范围边界 - In-Scope

动态生成选项，基于前面的回答推断可能的范围项

#### 问题 3.2: 范围边界 - Out-of-Scope

**强制问题**：必须明确至少一项"不做"的内容

```yaml
question: "以下哪些是这个需求 **明确不做** 的？"
type: multi-select
required: true
min_selection: 1
options:
  # 根据需求类型动态生成
```

#### 问题 3.3: 约束条件

```yaml
question: "这个需求有哪些硬性约束？"
type: multi-select
options:
  - value: regulation
    label: "法规限制"
    description: "必须符合特定法规（如 GDPR、等保）"
    follow_up: "具体是什么法规？"
  - value: security
    label: "安全红线"
    description: "不能触碰的安全边界"
  - value: brand
    label: "品牌调性"
    description: "必须符合品牌形象"
  - value: budget
    label: "预算上限"
    description: "有明确的预算限制"
    follow_up: "预算上限是多少？"
  - value: deadline
    label: "时间节点"
    description: "有硬性的上线时间要求"
    follow_up: "截止日期是？"
  - value: tech
    label: "技术限制"
    description: "必须使用/不能使用特定技术"
  - value: system
    label: "现有系统"
    description: "不能改动的现有系统"
  - value: org
    label: "组织边界"
    description: "不能跨越的组织/团队边界"
```

#### 问题 3.4: 风险容忍度

```yaml
question: "如果这个需求遇到风险，你能接受的最大损失是？"
type: single-select
options:
  - value: low
    label: "低容忍"
    description: "不能有任何负面影响，宁可不做"
  - value: medium
    label: "中等容忍"
    description: "可以接受小范围试错，但要可控"
  - value: high
    label: "高容忍"
    description: "可以大胆尝试，失败了再调整"
```

---

### Phase 4: 行业深挖

**目的**：根据目标类型，深入挖掘业务细节

#### 分支: revenue（收入增长）

```yaml
question: "收入增长主要来自哪个环节？"
type: single-select
options:
  - value: acquisition
    label: "获客（新用户）"
    follow_up: ["目标渠道？", "目标人群画像？", "当前获客成本？"]
  - value: conversion
    label: "转化（付费）"
    follow_up: ["哪个转化节点？", "当前转化率？", "主要流失原因？"]
  - value: arpu
    label: "客单价（提价）"
    follow_up: ["提价策略？", "用户接受度预判？"]
  - value: retention
    label: "复购（留存）"
    follow_up: ["当前复购周期？", "主要流失时点？", "流失原因？"]
```

#### 分支: cost（成本下降）

```yaml
question: "主要想降低哪类成本？"
type: single-select
options:
  - value: labor
    label: "人力成本"
    follow_up: ["哪些人工环节可自动化？", "当前人力投入？"]
  - value: cac
    label: "获客成本"
    follow_up: ["当前 CAC？", "目标 CAC？", "主要获客渠道？"]
  - value: ops
    label: "运营成本"
    follow_up: ["具体哪项运营成本？", "当前金额？"]
  - value: tech
    label: "技术成本"
    follow_up: ["云/带宽/存储/其他？", "当前金额？"]
```

#### 分支: compliance（风险合规）

```yaml
question: "具体是什么合规要求？"
type: single-select
options:
  - value: data
    label: "数据安全（GDPR/个保法等）"
    follow_up: ["具体法规？", "截止时间？", "违规后果？"]
  - value: industry
    label: "行业监管（金融/医疗等）"
    follow_up: ["监管机构？", "检查频率？", "处罚力度？"]
  - value: audit
    label: "内部审计"
    follow_up: ["审计周期？", "主要关注点？"]
  - value: cert
    label: "资质认证"
    follow_up: ["什么资质？", "有效期？", "审核机构？"]
```

#### 分支: experience（用户体验）

```yaml
question: "用户体验问题出现在哪个环节？"
type: single-select
options:
  - value: discovery
    label: "发现阶段"
    follow_up: ["用户如何找到功能？", "当前发现路径？"]
  - value: usage
    label: "使用阶段"
    follow_up: ["操作流程痛点？", "当前完成率？"]
  - value: support
    label: "售后阶段"
    follow_up: ["问题解决效率？", "当前响应时间？"]
  - value: referral
    label: "传播阶段"
    follow_up: ["用户推荐意愿？", "当前 NPS？"]
```

---

### Phase 5: 依赖与假设

**目的**：识别风险点，确保可执行性

#### 问题 5.1: 依赖条件

```yaml
question: "这个需求依赖哪些前提条件？"
type: multi-select
options:
  - value: data
    label: "数据可得性"
    description: "需要特定数据才能实现"
  - value: system
    label: "系统权限"
    description: "需要访问/修改其他系统"
  - value: team
    label: "其他团队配合"
    description: "需要其他团队支持"
  - value: vendor
    label: "外部供应商"
    description: "需要外部合作方配合"
  - value: budget
    label: "预算审批"
    description: "需要额外预算批准"
  - value: exec
    label: "高层决策"
    description: "需要高层拍板"
  - value: legal
    label: "法务审批"
    description: "需要法务评估通过"
  - value: research
    label: "技术调研"
    description: "需要先做技术可行性验证"
```

#### 问题 5.2: 假设确认

汇总前面所有标记为假设的项目，逐一确认状态

#### 问题 5.3: 终止条件

```yaml
question: "什么情况下你会选择放弃这个需求？"
type: single-select
options:
  - value: budget
    label: "成本超预算 X%"
    follow_up: "超多少比例？"
  - value: time
    label: "时间超期 X 周"
    follow_up: "超多少周？"
  - value: metric
    label: "指标无法达成"
    description: "明确无法达成目标就放弃"
  - value: compliance
    label: "合规无法满足"
    description: "合规要求无法满足就放弃"
  - value: none
    label: "暂无终止条件"
    description: "无论如何都要做"
    marks_as_risk: high
```

---

## 3. 分支逻辑总结

```
Phase 0 (意图)
    ↓
Phase 1 (分类) → 确定目标类型
    ↓
Phase 2 (成功定义) → 根据目标类型选择指标
    ↓
Phase 3 (范围约束) → 通用问题
    ↓
Phase 4 (深挖) → 根据目标类型进入对应分支
    │
    ├─ revenue → 获客/转化/客单价/复购
    ├─ cost → 人力/获客/运营/技术
    ├─ compliance → 数据安全/行业监管/审计/认证
    ├─ experience → 发现/使用/售后/传播
    ├─ efficiency → 流程/工具/自动化
    └─ strategic → 竞争/市场/生态
    │
    ↓
Phase 5 (依赖假设) → 通用问题
    ↓
Phase 6 (准出检查) → 生成 BRD
```

---

## 4. 访谈节奏控制

### 每轮问题数量

| 阶段 | 问题数 | 说明 |
|------|--------|------|
| Phase 0 | 1 | 只问意图 |
| Phase 1 | 2-3 | 核心分类 |
| Phase 2 | 2 | 成功定义 |
| Phase 3 | 3-4 | 范围约束 |
| Phase 4 | 3-5 | 深挖（根据分支） |
| Phase 5 | 2-3 | 依赖假设 |

### 总问题数

- **最少**：12 个问题（简单需求）
- **典型**：15-18 个问题
- **最多**：25 个问题（复杂需求）

### 总时长预估

- **快速模式**：10-15 分钟
- **标准模式**：20-30 分钟
- **深度模式**：40-60 分钟

---

## 5. 假设处理规则

### 假设来源

1. 用户选择"尚不清楚"
2. 用户选择"其他"但未提供详情
3. 用户对追问回答"不确定"
4. 访谈者推断但未经确认的信息

### 假设记录格式

```markdown
| # | 假设内容 | 来源 | 置信度 | 验证方式 |
|---|----------|------|--------|----------|
| A1 | 数据可从现有系统获取 | Phase 2 问题 2.2 | 中 | 需与数据团队确认 |
```

### 假设门禁规则

| 假设数量 | 处理方式 |
|----------|----------|
| 0-2 | 正常输出 BRD |
| 3 | 警告，建议验证后再进入 PRD |
| 4+ | 阻塞，必须补充访谈或调研 |
