# AskUserQuestion 模板

以下模板仅用于读取相关材料后仍存在的真实缺口。已明确的基线、模式、格式或范围直接复用；问题须引用具体冲突，不要求先确认后读取。工具名称为示例，无对应工具可用普通文本。

本文档定义 `guardrails-writer` 在“是否该更新、为何更新、影响哪些下游文档”三个关键问题上的提问模板。

---

## 1. 触发类型确认

**触发时机**：Phase 0，证据不足以判断是否需要创建/更新时

```yaml
question: "本次更像哪种 Guardrails 动作？"
header: "触发类型"
multiSelect: false
options:
  - label: "创建项目基线"
    description: "仓库还没有统一 Guardrails，需要先建 v0/v1 基线"
  - label: "更新受影响领域"
    description: "已有 Guardrails，但架构/平台/合规/事故导致部分规则需要更新"
  - label: "不确定，先帮我判断"
    description: "请先扫描现有规范与变更背景，再决定是否需要改"
```

---

## 2. 首次生成模式确认

**触发时机**：Phase 0，结论为 `create_baseline` 时

```yaml
question: "首次生成 Guardrails 时，你希望我优先采用哪种方式？"
header: "生成模式"
multiSelect: false
options:
  - label: "访谈式"
    description: "适合新项目或仓库信号较弱，先基于角色访谈建立 v0 基线"
  - label: "仓库分析式"
    description: "适合已有代码、配置、CI/IaC、Runbook 的存量仓库"
  - label: "你先判断"
    description: "我会先看仓库事实密度，再决定采用哪种模式"
```

---

## 3. 更新原因确认

**触发时机**：Phase 0，已知需要更新，但原因不清

```yaml
question: "这次为什么要改 Guardrails？"
header: "更新原因"
multiSelect: true
options:
  - label: "架构或平台变化"
    description: "例如运行环境、部署模式、认证方式、数据存储变化"
  - label: "安全/合规/SRE 新要求"
    description: "需要把新的强制约束固化进项目基线"
  - label: "事故复盘"
    description: "要把长期规则沉淀下来，避免同类问题复发"
  - label: "重复评审问题"
    description: "同类争议在 API/HLD/LLD/Runbook 中反复出现"
```

---

## 4. 适用范围与输出模式

**触发时机**：Phase 2，范围或文档拓扑不明确时

```yaml
question: "本次 Guardrails 应该怎么组织？"
header: "输出模式"
multiSelect: false
options:
  - label: "单文档基线"
    description: "适合新项目、单团队、先建立最小可用基线"
  - label: "Index + 分域文档"
    description: "适合多团队或不同领域更新频率差异很大"
  - label: "只更新现有文档的局部领域"
    description: "已有基线，只修订受影响章节"
```

---

## 5. 受影响领域确认

**触发时机**：Phase 2，需要缩小更新范围时

```yaml
question: "本次变化影响哪些 Guardrails 领域？"
header: "影响领域"
multiSelect: true
options:
  - label: "API / Contract"
    description: "认证、版本、兼容性、错误语义、限流等"
  - label: "数据与迁移"
    description: "存储、Schema、迁移、保留策略等"
  - label: "安全与合规"
    description: "访问控制、审计、隐私、合规基线等"
  - label: "发布 / 回滚 / 可观测性"
    description: "部署、回滚、告警、SLO、日志/metrics/traces"
  - label: "前端 / 基础设施 / 外部集成"
    description: "UI 一致性、IaC、外部依赖治理等"
```

---

## 6. 事实冲突处理

**触发时机**：Phase 1/2，`repository_scan_first` 下事实与文档/口头约定冲突时

```yaml
question: "仓库事实与现有文档/口头约定冲突时，哪种情况更接近你们的目标状态？"
header: "事实冲突"
multiSelect: false
options:
  - label: "以仓库事实为准"
    description: "当前实现更接近真实基线，文档需要追认或补齐"
  - label: "以文档/决策为准"
    description: "当前实现是漂移，Guardrails 应保持目标标准并要求下游纠偏"
  - label: "先记录冲突，不立即固化"
    description: "需要后续决策，当前先保留为待确认项"
```

---

## 7. 下游阻塞级别确认

**触发时机**：Phase 2，需判断是否阻塞当前主流程时

```yaml
question: "Guardrails 更新后，下游工作流应该怎么处理？"
header: "下游钩子"
multiSelect: false
options:
  - label: "先更新 Guardrails，再继续设计"
    description: "适用于认证、数据、发布、安全等默认边界已变化的场景"
  - label: "允许继续，但必须在合并前重审"
    description: "适用于已有设计基本可用，但需要补做一致性检查"
  - label: "先记录建议，下个迭代再对齐"
    description: "适用于低风险、非阻塞的增量规范补齐"
```
