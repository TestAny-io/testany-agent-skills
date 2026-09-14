# AskUserQuestion 模板

以下模板仅用于读取相关材料后仍存在的真实缺口。已明确的基线、模式、格式或范围直接复用；问题须引用具体冲突，不要求先确认后读取。工具名称为示例，无对应工具可用普通文本。

## 1. 基线确认

```yaml
question: "请确认本次 test case package 采用的基线："
header: "测试基线"
multiSelect: false
options:
  - label: "当前 PRD/API/HLD/LLD/Test Strategy 都已批准"
    description: "可直接产出正式 test package"
  - label: "LLD 或 Strategy 仍在调整"
    description: "先产出草案，待基线冻结后复核"
  - label: "还缺少关键基线文档"
    description: "先补齐文档，再继续细化测试规格"
```

## 2. 回归范围确认

```yaml
question: "本轮回归更偏向哪种策略？"
header: "回归范围"
multiSelect: false
options:
  - label: "核心路径优先"
    description: "优先覆盖 must-not-regress 和关键链路"
  - label: "核心路径 + 关键分支"
    description: "兼顾高风险异常与边界"
  - label: "尽量全覆盖"
    description: "范围更广，但时间与成本更高"
```

## 3. 自动化优先级确认

```yaml
question: "自动化优先级更偏向哪一类？"
header: "自动化优先级"
multiSelect: true
options:
  - label: "Smoke 冒烟"
    description: "快速发现主路径故障"
  - label: "关键回归"
    description: "优先保护高价值、易回归能力"
  - label: "兼容性 / 接口行为回归"
    description: "优先保护外部可观察行为与向后兼容性"
  - label: "高价值非功能"
    description: "优先保护性能、安全、恢复能力"
```

## 4. Testany 落地确认

```yaml
question: "这份 test package 评审通过后，是否计划继续落到 Testany 自动化？"
header: "Testany 落地"
multiSelect: false
options:
  - label: "是，评审后立即落到 Testany"
    description: "输出 `Testany Automation Handoff.status = ready`，为 `/case-writing` 准备下游输入"
  - label: "可能后续要落到 Testany"
    description: "输出 `status = partial`，显式列出缺失信息与 open questions"
  - label: "暂不计划落到 Testany"
    description: "仍保留 handoff section，但写 `status = not_planned`"
```
