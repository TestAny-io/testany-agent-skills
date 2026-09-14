# 审查报告模板

每份报告和准出证书必须绑定对象/版本、范围、标准、模式（initial/delta/closeout）、已审/未审覆盖及真实证据。沿用稳定问题 ID，分列 kind（defect/evidence_gap/scope_decision/optional）、严重级别和准出影响。通过须无未关闭 P0/P1 且必要证据充分，P2 不按数量阻断。详见 [评审规则](../../../references/review-assurance.md)。

## 基线收集报告

- Contract/Index：
- PRD 基线：
- 边界/所有权确认：
- 协议类型：
- Lint/自动化检查：执行/未执行（原因）
- 结论：通过 Gate 0 / P0 阻断

---

## 审查报告（未通过）

- 结论：不通过（P0: x, P1: y, P2: z）
- Contract 版本：
- PRD 基线：
- Gate 结果：Gate1/2/3/4

| 严重度 | 问题 | 证据位置 | 影响 | 建议修复 |
|--------|------|----------|------|----------|
| P0 |  |  |  |  |

---

## 准出证书（通过）

- 结论：通过（P0:0, P1:0, 必要证据充分；P2 不按数量阻断）
- Contract 版本：
- PRD 基线：
- Gate 结果：Gate1/2/3/4
- 残留 P2：
- Reviewer：
