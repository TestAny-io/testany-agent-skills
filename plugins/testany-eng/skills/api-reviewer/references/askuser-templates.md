# AskUserQuestion 模板

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
    description: "说明缺失项（缺失将导致 P0）"
```

**处理路径**：
| 情况 | 严重度 | 处理 |
|------|--------|------|
| PRD 与 Contract 可访问 | — | 继续审查 |
| Contract 未标注引用但用户可提供 | P1 | 继续审查，记录文档缺陷 |
| PRD 缺失/未批准 | P0 | 停止审查 |

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
