# Guardrails Trigger Check

本文档定义 `api/hld/lld/runbook` writer 与 reviewer 统一使用的 Guardrails 触发检查。

## 目的

当前仓库**没有自动 hook/router** 去实际拉起 `guardrails-writer`。因此，相关 skill 必须在 Phase 0 显式执行一次 `Guardrails trigger check`，判断这次工作是否需要先补齐或更新 Guardrails。

这个检查只做三件事：

1. 判断本次工作是否触及**项目级默认规则**
2. 判断现有 Guardrails 是否**缺失 / 缺域 / 过期 / 与事实漂移**
3. 给出统一决策：`no_trigger` / `suggest_guardrails` / `require_guardrails_before_design`

## 何时执行

- writer：在完成基线扫描、但**开始写文档前**
- reviewer：在完成基线收集、但**开始内容级审查前**
- runbook-writer：在完成上游文档读取、但**派发 writer/reviewer subagent 前**

## 证据来源

优先使用以下证据：

- 当前请求对应的批准基线：PRD / API Contract / HLD / LLD / Runbook / ADR
- 现有 Guardrails 文档
- 仓库中的事实证据：配置、部署文件、CI、监控、现有实现

注意：

- 仓库事实只能说明“当前长什么样”，**不能自动上升为项目标准**
- 如果仓库事实与现有 Guardrails 冲突，应标记为 **drift**
- 如果只有未来意图、没有批准标准，应标记为 **待决策**

当需要更细的事实/标准分层时，复用 `../skills/guardrails-writer/references/fact-standard.md` 的口径。

## 判断步骤

### Step 1：识别影响域

先判断本次工作是否影响以下任一跨模块域：

- API 认证、授权、幂等、错误码、兼容性
- 数据分级、存储、保留、迁移、审计
- 安全、合规、隐私、密钥管理
- 部署、发布、回滚、灰度、变更窗口
- 可观测性、SLO、告警、日志、追踪
- 跨团队复用约束、共享库、集成边界

如果只影响单模块内部实现细节，或在既有批准约束内更新有限契约/测试/运维说明，通常不需要新建或更新 Guardrails。仅涉及安全或多仓并不构成触发依据；需说明哪个项目默认规则真的改变或成为必要缺口。

### Step 2：判断 Guardrails 覆盖情况

检查现有 Guardrails 是否对本次影响域提供了可执行约束：

- 有基线且覆盖充分
- 有基线但缺少本次影响域
- 有相关规则，但明显落后于当前批准设计或仓库事实
- 没有 Guardrails 基线

### Step 3：输出决策

#### `no_trigger`

满足以下条件时使用：

- 本次变更是局部设计或局部评审
- 现有 Guardrails 已覆盖相关影响域
- 没有发现明显 drift / 缺域 / 缺基线

**动作**：
- writer / reviewer 正常继续
- 在上下文报告中简短记录已检查过 Guardrails 即可

#### `suggest_guardrails`

满足以下任一条件时使用：

- 发现轻度缺域，但当前文档仍可继续推进
- 发现 Guardrails 有轻度过期或 drift，但不影响当前核心结论
- reviewer 发现一个值得沉淀为项目规则的跨模块问题，但尚不足以阻塞当前轮设计/评审

**动作**：
- writer：继续当前工作，但必须显式记录“建议更新 Guardrails”的原因、影响域和推荐动作
- reviewer：记录为治理跟进项，默认按 **P2** 处理，不因此单独卡住准出

#### `require_guardrails_before_design`

满足以下任一条件时使用：

- 没有 Guardrails 基线，而本次工作正在定义项目级默认规则
- 当前请求会改变多个下游文档都要遵循的默认约束
- 当前设计/审查结论依赖某个项目级规则，但该规则缺失或明显过期
- 现有 Guardrails 与当前批准设计或仓库事实发生冲突，若不先更新就无法给出可靠设计/审查结论
- runbook 依赖的发布/回滚/监控规则缺失，继续写会导致运维手册建立在不稳定约束之上

**动作**：
- writer：暂停依赖缺失规则的设计定案，明确责任方需补齐的规则；可继续有依据的非依赖草稿，不替组织批准新标准。
- reviewer：区分 `evidence_gap`（必要规则/证据不可得）与 `scope_decision`（项目标准需有权者决策），不得给出通过结论；独立检查继续。只有已证实的实际缺陷才按影响定 P0/P1，不把治理缺口机械映射为产品 P0。

## 输出格式

所有相关 skill 在 Phase 0 都应产出一个简短的检查结果：

```markdown
## Guardrails Trigger Check

- Decision: no_trigger | suggest_guardrails | require_guardrails_before_design
- Why: [一句话说明原因]
- Impacted domains: [API / Security / Data / Release / Observability ...]
- Guardrails status: [baseline exists / missing domain / outdated / drift]
- Recommended next action: [continue / update guardrails soon / run guardrails-writer first]
```

## 不确定时的澄清问题

先读实际变更、已有规则和批准范围；仍无法判断的具体决策缺口才按需询问（已知项不重复问）：

```yaml
question: "这次变更是否会改变项目里多个模块都要遵守的默认规则？"
header: "Guardrails Trigger"
multiSelect: false
options:
  - label: "是，会改变项目默认规则"
    description: "应优先判断是否需要更新 Guardrails"
  - label: "否，只影响当前模块/文档"
    description: "通常无需触发 Guardrails"
  - label: "不确定，需要结合现有 Guardrails 一起判断"
    description: "先读取现有 Guardrails 和相关基线再决定"
```

## Reviewer 额外要求

HLD/LLD/Code 继续按 [review-boundaries.md](review-boundaries.md) 的专用边界规则；API 与其他相关文档工作流按 [document-amendments.md](document-amendments.md) 区分正式/有限增量。本检查在两种模式都识别真实规则变化，不能因缺整份历史 Guardrails 自动新建门禁。必要规则或授权缺口阻止依赖它的准出，但非依赖草稿与独立检查继续。

reviewer 不能只说“建议补 Guardrails”，必须明确：

- 如果现在不补，为什么仍可继续通过审查
- 或者为什么构成当前必要证据/授权阻断；已证实缺陷另按实际严重度记录

不要输出模糊表述，例如：

- “最好补一下 Guardrails”
- “建议后续再看”

必须明确给出：

- 这是不是**当前准出门槛**的一部分
- 如果不是，为什么只是跟进项而非阻塞项
