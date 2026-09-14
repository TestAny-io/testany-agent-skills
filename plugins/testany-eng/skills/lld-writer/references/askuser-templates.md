# AskUserQuestion 模板

以下模板仅用于读取相关材料后仍存在的真实缺口。已明确的基线、模式、格式或范围直接复用；问题须引用具体冲突，不要求先确认后读取。工具名称为示例，无对应工具可用普通文本。

本文档定义 lld-writer 写作过程中需要向用户确认的问题模板。

---

## 基线确认

**触发时机**：Phase 0 - 确认上游文档基线

```yaml
question: "请确认以下文档为最新批准基线："
header: "基线确认"
multiSelect: true
options:
  - label: "[PRD 路径]"
    description: "PRD 版本 X.X"
  - label: "[HLD 路径]"
    description: "HLD 版本 X.X"
  - label: "[Contract 路径]"
    description: "API Contract"
  - label: "以上均为最新"
    description: "确认基线"
```

---

## Guardrails 确认

**触发时机**：Phase 0 - 确认 Guardrails 是否存在

```yaml
question: "是否有 Project Guardrails/工程约束文档需要遵循？"
header: "Guardrails"
multiSelect: false
options:
  - label: "有，请提供路径"
    description: "已有项目约束文档"
  - label: "无，需要我创建模板"
    description: "创建 guardrails-template"
  - label: "无，不需要"
    description: "确认不存在"
```

---

## Guardrails Trigger 澄清

**触发时机**：Phase 0 - 无法判断本次 LLD 是否暴露项目级默认规则缺口

```yaml
question: "这次 LLD 变更是否会改变项目里多个模块都要遵守的默认规则？"
header: "Guardrails Trigger"
multiSelect: false
options:
  - label: "是，会改变项目默认规则"
    description: "应优先判断是否需要更新 Guardrails"
  - label: "否，只影响当前模块"
    description: "通常无需触发 Guardrails"
  - label: "不确定，需要结合现有 Guardrails 一起判断"
    description: "先读取现有 Guardrails 与批准基线再决定"
```

---

## Profile 选择

**触发时机**：Phase 1 - 选择 LLD 模块组合

```yaml
question: "请选择 LLD Profile（可作为默认模块组合）："
header: "LLD Profile"
multiSelect: false
options:
  - label: "saas-serverless"
    description: "多服务/云原生/事件驱动"
  - label: "web-app"
    description: "前后端 + API + 数据"
  - label: "data-pipeline"
    description: "数据流/任务/批处理"
  - label: "desktop-app"
    description: "桌面端/本地能力"
  - label: "sdk-library"
    description: "公共库/SDK"
  - label: "custom"
    description: "手工选择模块"
```

Profile 详情见 `profiles.md`。

---

## Add-ons 选择

**触发时机**：Phase 1 - 确认需要包含的模块

```yaml
question: "以下能力模块是否需要包含？"
header: "LLD 模块"
multiSelect: true
options:
  - label: "API Contract"
    description: "有对外/跨团队接口"
  - label: "Storage & Migration"
    description: "涉及数据持久化/迁移/格式"
  - label: "Async/Event"
    description: "消息/队列/事件驱动"
  - label: "Infra/IaC"
    description: "资源变更/IaC"
  - label: "Observability"
    description: "日志/指标/告警"
  - label: "Security/Compliance"
    description: "权限/PII/合规"
  - label: "Deployment/Release"
    description: "发布/回滚/灰度"
  - label: "Frontend UX"
    description: "前端路由/状态/UI"
  - label: "External Integration"
    description: "第三方集成"
  - label: "SDK/Library"
    description: "公共库/SDK"
```

模块详情见 `modules.md`。
