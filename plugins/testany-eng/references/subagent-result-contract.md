# Subagent Result Contract v1

testany-eng 中使用 subagent 编排的 skill（Code Reviewer、Runbook Writer 等）统一遵循本契约。

## 目的

消除 orchestrator 对自由文本的猜测性解析。每个 subagent 的输出末尾必须包含机器可读的 `AGENT-RESULT` 块，orchestrator 只需解析该块来决定下一步动作。

## 输出格式

所有 subagent 的输出末尾**必须**包含以下块（位于输出的最后）：

```yaml
<!-- AGENT-RESULT:BEGIN -->
role: writer          # subagent 角色标识（writer / reviewer / fixer / spec-reviewer / quality-reviewer）
status: success       # success | failed | needs_input | partial
output_files:         # 产出的文件路径列表（无文件输出时为空数组）
  - workflow/prd.md
blocking_issues: []   # 阻塞性问题列表（status=failed 时必须非空）
warnings: []          # 非阻塞性警告
needs_retry: false    # orchestrator 是否应重试本 subagent
needs_user_input: false  # 是否需要用户介入
summary: "PRD 初版已生成，覆盖 5 个功能需求和 2 个非功能需求。"
<!-- AGENT-RESULT:END -->
```

## 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `role` | string | 是 | subagent 角色标识，与 orchestrator 调度逻辑对应 |
| `status` | enum | 是 | 执行结果。见下方状态定义 |
| `output_files` | string[] | 是 | 产出文件路径列表。reviewer 类可能无文件产出，填 `[]` |
| `blocking_issues` | string[] | 是 | 阻塞性问题描述。`status=success` 时必须为 `[]` |
| `warnings` | string[] | 是 | 非阻塞警告。不影响 orchestrator 流转判定 |
| `needs_retry` | boolean | 是 | 建议 orchestrator 重试。通常在 partial 或 transient failure 时为 true |
| `needs_user_input` | boolean | 是 | 需要用户介入。orchestrator 应暂停并转达问题 |
| `summary` | string | 是 | 一句话摘要，用于 orchestrator 的进度输出 |

## Status 状态定义

| Status | 含义 | Orchestrator 行为 |
|--------|------|------------------|
| `success` | 任务完成，产出符合预期 | 进入下一阶段 |
| `failed` | 任务失败，`blocking_issues` 描述原因 | 检查 `needs_retry`：true → 重试（有次数上限）；false → 报告用户 |
| `needs_input` | 需要用户提供信息才能继续 | 暂停流程，向用户转达 `blocking_issues` 中的问题 |
| `partial` | 部分完成，可能因 context 限制或不确定性 | 检查 `needs_retry`：true → 重试；false → 以当前产出继续，在 `warnings` 中记录不完整部分 |

## Reviewer 角色扩展字段

Reviewer 类 subagent（PRD Reviewer、Spec Reviewer、Quality Reviewer）的 `AGENT-RESULT` 块额外包含审查判定：

```yaml
<!-- AGENT-RESULT:BEGIN -->
role: reviewer
status: success
output_files:
  - workflow/review-report.md
verdict: fail              # pass | conditional_pass | fail
p0_count: 1
p1_count: 3
p2_count: 2
blocking_issues: []
warnings: []
needs_retry: false
needs_user_input: false
summary: "审查完成：P0=1, P1=3, P2=2，结论为不通过。"
<!-- AGENT-RESULT:END -->
```

| 扩展字段 | 类型 | 说明 |
|---------|------|------|
| `verdict` | enum | `pass` / `conditional_pass` / `fail` |
| `p0_count` | int | P0 阻塞问题数 |
| `p1_count` | int | P1 严重问题数 |
| `p2_count` | int | P2 建议问题数 |

Orchestrator 基于 `verdict` 做流转判定，不再从报告自由文本中提取 P0/P1 数量。

## Orchestrator 解析规则

1. **提取**：在 subagent 输出中搜索 `<!-- AGENT-RESULT:BEGIN -->` 和 `<!-- AGENT-RESULT:END -->` 之间的 YAML 内容
2. **缺失处理**：如果输出中不包含 `AGENT-RESULT` 块：
   - 记录为 `status: failed`，`blocking_issues: ["AGENT-RESULT block missing from subagent output"]`
   - 设 `needs_retry: true`
   - 重试一次（在重试 prompt 中强调必须输出 AGENT-RESULT 块）
   - 二次缺失 → 标记为不可恢复失败，报告用户
3. **YAML 解析失败**：同上处理，视为格式异常
4. **字段缺失**：任何必填字段缺失 → 视为格式异常，按上述流程处理

## 兼容性

本契约是 testany-eng 内部协议，不依赖任何特定 AI 平台。它的作用范围：

- **是**：orchestrator（SKILL.md 中的主 agent）与 subagent 之间的结果传递协议
- **不是**：平台原生 agent 文件格式（那属于 `.codex/agents/*.toml`、`.claude/agents/*.md`、`.github/agents/*.agent.md`）
- **不是**：skill UI 元数据（那属于 `agents/openai.yaml`）

## 版本

- v1: 2026-03-26 初始版本
