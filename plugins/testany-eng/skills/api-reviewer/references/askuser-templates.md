# AskUserQuestion 模板

以下模板仅用于读取相关材料后仍存在的真实缺口。已明确的基线、模式、格式或范围直接复用；问题须引用具体冲突，不要求先确认后读取。工具名称为示例，无对应工具可用普通文本。

本文档定义 api-reviewer 审查过程中需要向用户确认的问题模板。

---

## 基线文档确认

**触发时机**：Phase 0 - 读取 PRD/Contract/Index

```yaml
question: "请提供 Contract 的上游基线与文档路径"
header: "基线文档"
multiSelect: false
options:
  - label: "从 Contract 中读取引用路径"
    description: "Contract 已标注 PRD/边界确认/Index 路径，直接读取"
  - label: "手动提供路径"
    description: "请提供 PRD 路径、Contract 路径、Index 路径（如有）"
  - label: "部分文档缺失"
    description: "说明缺失项与准出影响（不自动定产品 P0）"
```

**处理路径**：
| 情况 | 严重度 | 处理 |
|------|--------|------|
| PRD 与 Contract 可访问 | — | 继续审查 |
| Contract 未标注引用但用户可提供 | P1 | 继续审查，记录文档缺陷 |
| 当前模式所需的批准基线缺失/未批准 | evidence_gap / scope_decision | 不批准，独立检查继续；有限增量可使用既有契约与有效 Owner 批准，不因缺少完整历史 PRD 单独阻断 |

---

## 契约类型确认

**触发时机**：Phase 0 - 确认协议类型

```yaml
question: "请选择本次审查的契约类型"
header: "Contract 类型"
multiSelect: true
options:
  - label: "HTTP/REST API"
  - label: "GraphQL API"
  - label: "gRPC API"
  - label: "事件/消息协议"
  - label: "WebSocket/SSE 实时协议"
  - label: "Webhook"
  - label: "SDK/Library 公共接口"
  - label: "文件格式/数据交换格式"
  - label: "IPC/CLI/插件接口"
```

---

## 多协议确认

**触发时机**：Phase 0 - 识别多协议场景

```yaml
question: "是否为多协议 Contract（需要 Contract Index）？"
header: "多协议"
multiSelect: false
options:
  - label: "是，多协议"
    description: "必须提供 Contract Index"
  - label: "否，单一协议"
    description: "无需 Index"
  - label: "不确定"
    description: "请补充协议列表"
```

---

## Guardrails Trigger 澄清

**触发时机**：Phase 0 - 无法判断本次 Contract 是否在改变项目级默认规则

```yaml
question: "这次 Contract 变更是否会改变项目里多个模块都要遵守的默认规则？"
header: "Guardrails Trigger"
multiSelect: false
options:
  - label: "是，会改变项目默认规则"
    description: "应优先判断是否需要更新 Guardrails"
  - label: "否，只影响当前 Contract"
    description: "通常无需触发 Guardrails"
  - label: "不确定，需要结合现有 Guardrails 一起判断"
    description: "先读取现有 Guardrails 与批准基线再决定"
```

---

## 既有契约与复用确认

**触发时机**：Phase 3 - 冲突与重复造轮子检查

```yaml
question: "是否已有可复用的接口/事件/SDK 或历史版本？"
header: "既有契约"
multiSelect: false
options:
  - label: "有，提供路径/链接"
    description: "提供现有 Contract 或 API 文档"
  - label: "没有"
    description: "确认无可复用项"
  - label: "不确定"
    description: "需要补充系统范围或服务清单"
```

---

## Lint/自动化检查

**触发时机**：Phase 0 - 本地工具可用时

```yaml
question: "是否需要执行本地 lint/自动化检查？"
header: "自动化检查"
multiSelect: false
options:
  - label: "是，已有本地工具"
    description: "允许执行现有 CLI（不安装新工具）"
  - label: "否"
    description: "跳过自动化检查"
```
