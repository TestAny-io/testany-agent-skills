# AskUserQuestion 模板

以下模板仅用于读取相关材料后仍存在的真实缺口。已明确的基线、模式、格式或范围直接复用；问题须引用具体冲突，不要求先确认后读取。工具名称为示例，无对应工具可用普通文本。

本文档定义 guardrails-reviewer 审查过程中需要向用户确认的问题模板。

---

## 适用范围确认

**触发时机**：Phase 0 - 无法确定 Guardrails 适用于哪个系统/团队/仓库

```yaml
question: "请确认这份 Guardrails 的适用范围"
header: "适用范围"
multiSelect: false
options:
  - label: "文档已写明"
    description: "直接按文档范围评审"
  - label: "需要补充范围"
    description: "请补充适用系统/团队/仓库/运行环境"
  - label: "其实只适用于当前功能"
    description: "这说明它可能不该写成 Guardrails"
```

---

## 动作类型确认

**触发时机**：Phase 0 - 无法确定本次是 create/update/restructure/no_change

```yaml
question: "请确认这次 Guardrails 变更的动作类型"
header: "动作类型"
multiSelect: false
options:
  - label: "首次建立基线"
    description: "对应 create_baseline"
  - label: "只更新受影响领域"
    description: "对应 update_impacted_domains"
  - label: "重构治理结构"
    description: "对应 restructure"
  - label: "其实不该改 Guardrails"
    description: "对应 no_change，应回到 HLD/LLD/ADR"
```

---

## 事实冲突裁决

**触发时机**：Gate 2 - 仓库事实与声明性标准冲突，无法判断目标状态

```yaml
question: "检测到仓库事实与现有标准冲突，应按哪种方式评审？"
header: "事实冲突"
multiSelect: false
options:
  - label: "按当前批准标准"
    description: "实现现状属于漂移，Guardrails 应维持目标状态"
  - label: "按仓库稳定事实"
    description: "现有标准已过期，Guardrails 应更新为现状"
  - label: "记录为待决策"
    description: "目前无法判断，先要求显式决策"
```

---

## 下游阻塞级别确认

**触发时机**：Gate 4 - 无法确定 Guardrails 更新是否应阻塞下游设计/发布

```yaml
question: "这次 Guardrails 变更对下游的默认阻塞级别应是什么？"
header: "阻塞级别"
multiSelect: false
options:
  - label: "先更新再继续设计"
    description: "对应 block_before_design"
  - label: "合并前重审即可"
    description: "对应 review_before_merge"
  - label: "下个周期对齐"
    description: "对应 sync_next_cycle"
```
