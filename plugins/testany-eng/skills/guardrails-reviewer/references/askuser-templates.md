# AskUserQuestion 模板

本文档定义 guardrails-reviewer 审查过程中需要向用户确认的问题模板。

---

## 范围确认

**触发时机**：Phase 0

```yaml
question: "请确认 Guardrails 的适用范围"
header: "范围确认"
multiSelect: false
options:
  - label: "文档已写明"
    description: "直接按文档范围评审"
  - label: "需要补充范围"
    description: "请补充适用系统/团队/产品线"
```
