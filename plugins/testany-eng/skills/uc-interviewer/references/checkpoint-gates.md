# Checkpoint Gates

本文件定义 `uc-interviewer` 产出的 `USER_JOURNEY` 工件如何判定 `draft / in_review / approved`。

按 [访谈模式与事实标准](../../../references/interview-modes.md) 区分内容确认与工件批准。已给出的可信事实可直接复用，不需要为了这些条件再次逐条访谈；仅要求草稿时保持 `draft`。

## 状态语义

| 状态 | 含义 | 是否可直接作为 PRD 锁定基线 |
|------|------|------------------------------|
| `draft` | 用户要求的草稿，或 baseline/内容/检查证据尚未齐全 | 否 |
| `in_review` | blocking issue 已清空，等待 stakeholder / 团队确认 | 有条件，必须先确认是否接受 |
| `approved` | 最新 BRD baseline 已确认，且 Journey checkpoint 已明确通过 | 是 |

## Blocking 条件

出现以下任一情况时，`artifact.status` 不得设为 `approved`：
- 当前 BRD 缺少适用范围/版本的有效批准依据，或不同来源的基线冲突尚未解决
- BRD in-scope 项未完成 `BRD → Journey` 映射
- 任一 `P0` Journey 未完成确认
- 存在悬挂跳转、未定义入口、或无法解释的跨 Journey 循环
- 存在 `MVP` 级 edge case 仍为 `待定`
- trace-lint 未通过或未运行；工具缺失是证据缺口，不伪造产品缺陷或检查成功

## 通过条件

满足以下条件时，可将 `artifact.status` 设为 `in_review`：
- 最新 BRD baseline 已确认
- BRD in-scope 项都已映射到至少一个 Journey
- `P0` Journey 全部确认
- 无悬挂跳转
- `MVP` edge case 已写清用户可见结果和恢复方式
- trace-lint 通过

满足 `in_review` 条件，且用户/团队明确说“这版可以作为后续 PRD 基线”时，才可设为 `approved`。

批准人必须是该范围有权限的 Owner/stakeholder，记录本版工件、范围、决定和真实来源；仅“材料已给全”“不用访谈”或上游已批准均不等于当前 Journey 批准。内容生成、自动检查、当前工件批准三者不得互代。未达正式条件仍交付透明草稿，列出待决项、证据缺口和风险。
