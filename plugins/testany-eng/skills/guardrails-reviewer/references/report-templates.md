# 审查报告模板

每份报告和准出证书必须绑定对象/版本、范围、标准、模式（initial/delta/closeout）、已审/未审覆盖及真实证据。沿用稳定问题 ID，分列 kind（defect/evidence_gap/scope_decision/optional）、严重级别和准出影响。通过须无未关闭 P0/P1 且必要证据充分，P2 不按数量阻断。详见 [评审规则](../../../references/review-assurance.md)。

## 基线识别结果

- Guardrails 路径：
- 动作类型：`create_baseline` / `update_impacted_domains` / `restructure` / `no_change`
- 生成模式：`interview_first` / `repository_scan_first` / N/A
- 适用范围：
- 触发原因：
- 结论：可继续 / P0 阻断

---

## 审查报告（未通过）

- 结论：不通过（P0: x, P1: y, P2: z）
- Guardrails 版本：
- 动作类型：
- 生成模式：
- 审查 Gate：Gate1 / Gate2 / Gate3 / Gate4 / Gate5

### 事实标准与冲突摘要

- 关键事实：
- 声明性标准：
- 冲突 / drift：
- 处理是否充分：

### 下游影响摘要

- 受影响领域：
- 需要重审的下游文档 / 技能：
- 阻塞建议：

| 严重度 | Gate | 问题 | 证据位置 | 影响 | 建议修复 |
|--------|------|------|----------|------|----------|
| P0 | Gate2 |  |  |  |  |

---

## 准出证书（通过）

- 结论：通过（P0:0, P1:0, 必要证据充分；P2 不按数量阻断）
- Guardrails 版本：
- 动作类型：
- 生成模式：
- Reviewer：

### 准出确认

- 触发判定成立：是 / 否
- 事实标准充分：是 / 否 / N/A
- 规则可执行：是 / 否
- 下游工作流钩子完整：是 / 否
- 可作为项目治理基线被下游消费：是 / 否

### 下游影响摘要

- 受影响领域：
- 需要重审的下游文档 / 技能：
- 阻塞建议：
- 残留 P2：
