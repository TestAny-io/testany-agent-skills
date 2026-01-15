# AskUserQuestion 模板

本文档定义 lld-reviewer 审查过程中需要向用户确认的问题模板。

---

## 基线文档确认

**触发时机**：Phase 0 - 读取 PRD/HLD/Contract

```yaml
question: "请提供 LLD 的上游基线文档路径"
header: "基线文档"
multiSelect: false
options:
  - label: "从 LLD 中读取引用路径"
    description: "LLD 已标注 PRD/HLD/Contract 路径，直接读取"
  - label: "手动提供路径"
    description: "请在下方提供：PRD 路径、HLD 路径、API Contract 路径"
  - label: "部分文档缺失"
    description: "说明哪些文档缺失（缺失将导致 P0）"
```

**处理路径**：
| 情况 | 严重度 | 处理 |
|------|--------|------|
| 所有文档存在且可访问 | — | 继续审查 |
| LLD 未标注路径，但用户可提供 | P1 | 继续审查，记录文档缺陷 |
| PRD/HLD/Contract 任一缺失 | P0 | 停止审查 |

---

## Guardrails 确认

**触发时机**：Phase 0 - 确认 Guardrails 是否存在

```yaml
question: "项目是否有 Guardrails（工程约束）文档？"
header: "Guardrails"
multiSelect: false
options:
  - label: "有，路径是..."
    description: "提供 Guardrails 文件路径"
  - label: "没有 Guardrails"
    description: "跳过 Guardrails 检查"
  - label: "不确定"
    description: "需要进一步确认"
```

---

## N/A 理由澄清

**触发时机**：Gate 1 - Manifest 中模块标记为 Excluded 但理由不清

```yaml
question: "请澄清以下模块标记为 N/A 的理由"
header: "N/A 理由"
multiSelect: false
options:
  - label: "补充说明理由"
    description: "在下方说明为什么不需要该模块"
  - label: "改为 Included"
    description: "该模块实际上需要，LLD 需要补充"
  - label: "确认不需要"
    description: "确实不需要，理由是..."
```

---

## 设计决策澄清

**触发时机**：Gate 2/3/4 - 发现需要用户澄清的设计决策

```yaml
question: "以下设计决策需要澄清"
header: "澄清"
multiSelect: false
options:
  - label: "这是预期设计"
    description: "设计符合预期，无需修改"
  - label: "需要修改 LLD"
    description: "LLD 需要修改以符合预期"
  - label: "需要更多讨论"
    description: "这个问题需要进一步讨论"
```
