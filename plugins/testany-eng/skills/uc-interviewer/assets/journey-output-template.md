<!-- TRACEABILITY-METADATA:BEGIN -->
```yaml
schema:
  name: testany-traceability
  version: "1.0.0"
  profile: journey-profile-v1
artifact:
  id: JOURNEY-{PROJECT_KEY}-001
  type: USER_JOURNEY
  title: User Journeys - {项目名}
  status: draft
  owners:
    - {owner.team}
  created_at: {YYYY-MM-DD}
  updated_at: {YYYY-MM-DD}
  source_documents:
    - {BRD-ARTIFACT-ID}
entities:
  requirements: []
  risks: []
  must_not_regress: []
  external_behaviors: []
  decisions: []
  flows:
    - id: FLOW-{PROJECT_KEY}-001
      title: {Journey 1 标题}
      statement: {一句话描述 Journey 1 的用户目标与完成结果}
      status: proposed
      scope: in
      kind: user_journey
      priority: P0
      source_refs:
        - artifact_id: {BRD-ARTIFACT-ID}
          section: {BRD section}
    - id: FLOW-{PROJECT_KEY}-002
      title: {Journey 2 标题}
      statement: {一句话描述 Journey 2 的用户目标与完成结果}
      status: proposed
      scope: in
      kind: user_journey
      priority: P1
      source_refs:
        - artifact_id: {BRD-ARTIFACT-ID}
          section: {BRD section}
  test_cases: []
relations:
  - id: REL-{PROJECT_KEY}-001
    type: derived_from
    from: FLOW-{PROJECT_KEY}-001
    to: {BRD-ARTIFACT-ID}
    status: active
  - id: REL-{PROJECT_KEY}-002
    type: derived_from
    from: FLOW-{PROJECT_KEY}-002
    to: {BRD-ARTIFACT-ID}
    status: active
  - id: REL-{PROJECT_KEY}-003
    type: depends_on
    from: FLOW-{PROJECT_KEY}-001
    to: FLOW-{PROJECT_KEY}-002
    status: active
waivers: []
```
<!-- TRACEABILITY-METADATA:END -->

# User Journey 文档

默认草稿，示例流程和状态不是已批准事实。已给材料可直接复用，但当前工件批准须有对应版本/范围的真实来源；按访谈、材料整理或缺口补问模式生成。

## 文档信息

| 属性 | 值 |
|------|-----|
| 文档名称 | User Journeys - {项目名} |
| 文档 ID | JOURNEY-{PROJECT_KEY}-001 |
| 版本 | v1.0 |
| 创建日期 | {YYYY-MM-DD} |
| BRD Baseline Artifact ID | {BRD-ARTIFACT-ID} |
| BRD Baseline 确认 | 已确认 / 待确认 |
| Checkpoint Status | draft / in_review / approved |
| trace-lint 结果 | not_run / pass / fail（只填真实检查结果） |
| 输入来源与整理模式 | {材料路径/版本；interview / synthesis / gap_followup} |
| Blocking Issues | 无 / {问题列表} |

---

## 概述

### 业务背景
{从 BRD 提取的业务背景摘要}

### 目标用户
{从 BRD 提取的目标用户画像}

### Journey 范围

| Journey ID | Journey | 优先级 | 状态 | BRD 来源 |
|------------|---------|--------|------|----------|
| FLOW-{PROJECT_KEY}-001 | {Journey 1} | P0 | 待定 / 已确认（需来源） | {BRD section} |
| FLOW-{PROJECT_KEY}-002 | {Journey 2} | P1 | 已确认 / 待定 | {BRD section} |

---

## Journey Graph（跨旅程跳转）

| From Journey/Step | Trigger | To Journey/Step | 类型 | 说明 |
|------------------|---------|----------------|------|------|
| {Journey 1 / S2} | {条件} | {Journey 2 / S1} | 跳转 | {数据交接} |
| {Journey 1 / S3} | {条件} | END | 结束 | {结束说明} |

---

## Journey 1: {Journey 名称}

### 基本信息

| 属性 | 描述 |
|------|------|
| Journey ID | FLOW-{PROJECT_KEY}-001 |
| 优先级 | P0 / P1 / P2 |
| 用户 | {执行此操作的用户类型} |
| 目标 | {用户想要完成的目标} |
| 原因 | {用户为什么要做这件事} |
| 入口条件/来源 | {来自哪个 Journey / 入口条件} |
| 结束状态 | {流程完成后的状态} |
| 主要出口/跳转点 | {跳转目标或结束条件} |

### 步骤节点（默认路径）

```mermaid
flowchart LR
    S0[开始] --> S1[Step 1]
    S1 --> S2[Step 2]
    S2 --> S3[Step 3]
    S3 --> E[结束]
```

| Step ID | 用户操作 | 用户看到的响应 | 相关 Edge Cases | 备注 |
|------|----------|----------------|----------------|------|
| S1 | {用户做什么} | {用户看到什么} | {EC-001 / -} | {补充说明} |
| S2 | {用户做什么} | {用户看到什么} | {EC-001, EC-002} | {补充说明} |
| S3 | {用户做什么} | {用户看到什么} | {EC-003 / -} | {补充说明} |

### 跳转/分支（Journey Graph 边）

| From Step | Trigger | To Journey/Step | 类型 | 说明 |
|-----------|---------|----------------|------|------|
| {S1} | {条件} | {Journey 2 / S1} | 跳转 | {数据交接} |
| {S3} | {条件} | END | 结束 | {结束说明} |

### 异常处理

| 异常情况 | 触发条件 | 处理方式 | 用户看到什么 |
|----------|----------|----------|--------------|
| {异常 1} | {条件} | 阻止 / 警告 / 降级 | {提示信息} |
| {异常 2} | {条件} | 阻止 / 警告 / 降级 | {提示信息} |

### Edge Case Matrix

| Edge Case ID | 类别 | 适用 Step | 触发条件 | 用户看到什么 | 处理结果/流向 | 数据保留/恢复 | 优先级 | 状态 |
|--------------|------|-----------|----------|--------------|---------------|---------------|--------|------|
| EC-001 | 数据可用性 / 数据形态 | S2 | {条件} | {空态/提示} | {停留当前步/跳转} | {保留/清空/恢复策略} | MVP / 后续 | 已确认 / 待定 |
| EC-002 | 重复 / 高频操作 | S3 | {条件} | {按钮状态/提示} | {停留当前步/结束} | {保留/恢复策略} | MVP / 后续 | 已确认 / 待定 |

### 待定项

- [ ] {待确认的问题 1}
- [ ] {待确认的问题 2}

---

## Journey 2: {Journey 名称}

{使用与 Journey 1 相同的结构}

---

## 跨 Journey 一致性

### 共享步骤

| 共享步骤 | 出现在 | 统一行为 |
|----------|--------|----------|
| {步骤名称} | Journey 1, Journey 2 | {一致的行为描述} |

### 统一异常 / Edge Case 处理

| 类型 | 统一处理方式 | 数据保留/恢复 | 备注 |
|------|--------------|---------------|------|
| 网络错误 | {处理} | {恢复} | {说明} |
| 权限不足 | {处理} | {恢复} | {说明} |
| 会话过期 | {处理} | {恢复} | {说明} |

---

## 追溯映射

### BRD → Journey 映射

| BRD 需求项 | 对应 Journey | 覆盖状态 | 备注 |
|------------|--------------|----------|------|
| {BRD-001} | FLOW-{PROJECT_KEY}-001 | 已覆盖 | |
| {BRD-002} | FLOW-{PROJECT_KEY}-001, FLOW-{PROJECT_KEY}-002 | 已覆盖 | |
| {BRD-003} | - | 待后续 | P2 优先级 |

### Journey → PRD 占位

| Journey ID | Journey | PRD 需求 ID | 状态 |
|------------|---------|-------------|------|
| FLOW-{PROJECT_KEY}-001 | {Journey 1} | 待分配 | - |
| FLOW-{PROJECT_KEY}-002 | {Journey 2} | 待分配 | - |

---

## Checkpoint Decision

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 最新批准 BRD baseline 已确认 | Yes / No | {说明} |
| BRD in-scope 项已完成映射 | Yes / No | {说明} |
| 所有 P0 Journey 已确认 | Yes / No | {说明} |
| 无悬挂跳转 / 未定义入口 | Yes / No | {说明} |
| 无待定 MVP edge case | Yes / No | {说明} |
| trace-lint 通过 | Yes / No | {说明} |
| Final Status | draft / in_review / approved | {最终判定依据} |

### Review Record

| 角色 / 人员 | 结论 | 日期 | 备注 |
|-------------|------|------|------|
| {PM / Stakeholder} | Approve / Needs changes | {YYYY-MM-DD} | {说明} |
| {Design / Product} | Approve / Needs changes | {YYYY-MM-DD} | {说明} |

---

## 变更记录

| 版本 | 日期 | 变更内容 | 变更人 |
|------|------|----------|--------|
| v1.0 | {日期} | 初始版本 | {人员} |
