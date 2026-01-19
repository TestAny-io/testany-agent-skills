# AskUserQuestion 模板

本文档定义 guardrails-writer 过程中需要向用户确认的问题模板。

---

## Guardrails 类型确认

**触发时机**：Phase 0

```yaml
question: "本次是新建 Guardrails 还是更新已有 Guardrails？"
header: "Guardrails 类型"
multiSelect: false
options:
  - label: "新建"
    description: "当前没有统一规范，需要建立基线"
  - label: "更新"
    description: "已有 Guardrails，需要补齐或修订"
  - label: "不确定"
    description: "需要先扫描现有规范"
```

---

## 范围与技术栈确认

**触发时机**：Phase 0

```yaml
question: "请确认 Guardrails 的适用范围与技术栈"
header: "范围与技术栈"
multiSelect: false
options:
  - label: "单一产品/单团队"
    description: "范围较小，先建立最小基线"
  - label: "多团队/多系统"
    description: "需要覆盖跨团队一致性"
  - label: "跨产品线"
    description: "需要分层 Guardrails（全局 + 领域）"
```

---

## 优先覆盖领域

**触发时机**：Phase 1

```yaml
question: "本次 Guardrails 优先覆盖哪些风险领域？"
header: "风险优先级"
multiSelect: true
options:
  - label: "安全与合规"
  - label: "API/Contract 一致性"
  - label: "数据与迁移"
  - label: "发布与回滚"
  - label: "可观测性"
  - label: "前端一致性"
  - label: "基础设施/IaC"
```
