# AskUserQuestion 模板

以下模板仅用于读取相关材料后仍存在的真实缺口。已明确的基线、模式、格式或范围直接复用；问题须引用具体冲突，不要求先确认后读取。工具名称为示例，无对应工具可用普通文本。

## 1. 基线确认

```yaml
question: "请确认测试策略所依据的最新批准基线："
header: "测试基线"
multiSelect: false
options:
  - label: "当前提供的 PRD/API/HLD 就是最新基线"
    description: "可直接按当前文档编写测试策略"
  - label: "还需补充 Guardrails / ADR"
    description: "存在额外约束文档，补齐后再定策略"
  - label: "基线未冻结"
    description: "先记录草案，暂不形成正式测试策略"
```

## 2. 风险容忍度确认

```yaml
question: "本次变更最不能接受哪类失败？"
header: "风险优先级"
multiSelect: true
options:
  - label: "核心业务流程失败"
    description: "如注册、下单、支付、登录等核心路径"
  - label: "数据错误或不一致"
    description: "写错、漏写、重复写、脏数据"
  - label: "兼容性回归"
    description: "老客户端、老集成方、旧数据受影响"
  - label: "性能或稳定性下降"
    description: "响应时间、吞吐、错误率、恢复能力恶化"
```

## 3. 依赖策略确认

```yaml
question: "外部依赖在测试中优先采用哪种策略？"
header: "依赖策略"
multiSelect: false
options:
  - label: "真实依赖优先"
    description: "更接近生产，但成本更高、稳定性更受限"
  - label: "Sandbox / 测试实例优先"
    description: "兼顾真实度与可控性"
  - label: "Mock / Stub 优先"
    description: "便于覆盖异常与边界，但需补真实联调"
```

## 4. 阶段边界确认

```yaml
question: "当前这轮测试策略，主要要为哪个测试阶段建立门禁？"
header: "测试阶段"
multiSelect: false
options:
  - label: "当前节点只定义本地/聚合验证阶段"
    description: "先收口当前阶段必须做的测试，后续环境级门禁单独列为下一阶段"
  - label: "当前节点覆盖到 Shared Test / SIT 阶段"
    description: "需要把共享测试环境下的门禁也一并纳入当前策略"
  - label: "当前节点直接覆盖到 Pre-prod / 发布门禁阶段"
    description: "当前策略需要明确发布前必须完成的环境级验证"
```

## 5. 环境弹性确认

```yaml
question: "同一测试阶段是否允许多个环境作为等价执行面？"
header: "环境弹性"
multiSelect: false
options:
  - label: "允许，只要满足该阶段能力要求"
    description: "环境是能力载体，不和阶段强绑定"
  - label: "不允许，必须固定在指定环境"
    description: "该阶段只接受唯一环境，便于统一证据和门禁"
  - label: "部分允许，关键门禁仍需固定环境"
    description: "基础验证可灵活，发布前关键门禁要求指定环境"
```
