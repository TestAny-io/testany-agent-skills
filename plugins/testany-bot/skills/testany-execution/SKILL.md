---
name: testany-execution
description: Testany execution 观测与管理 - 查看进度、查询历史、刷新状态、取消未开始执行、将失败执行交给 debug
argument-hint: "[execution_key / pipeline_key / 操作]，如：查看 Y2K-0601-0000B、看最近失败、取消一个 pending execution"
---

# Testany Execution Operations

管理 Testany 平台上的 **execution**，包括进度观测、历史查询、状态刷新、取消和失败交接。

用户输入: $ARGUMENTS

---

## 先统一心智模型

遵循 [整体目标与交接](../testany-guide/references/task-handoff.md)，使用上一步真实 execution key 和未重置的等待预算。只查当前状态不自动等待；失败终态不自行扩展为重试、取消或排障。

在开始之前，先按 [automation-model.md](../testany-guide/references/automation-model.md) 理解边界：

- `pipeline` 是执行与编排单元
- `trigger` 负责“怎么发起执行”，包括长期入口和即时运行
- 本 skill 负责“执行发起之后怎么管理 execution”
- 失败 execution 的根因分析属于 `testany-debug`

**重要结论**：
- 本 skill 不负责创建 Plan / Manual Trigger / Gatekeeper
- 本 skill 也不负责即时发起一次执行；这属于 `testany-trigger`
- 本 skill 关注 execution lifecycle：看、查、刷、停、交接；查询、等待与取消不互相授权

---

## 职责范围

- 查看 execution 详情与 case 级结果
- 列出/搜索 execution 历史
- 刷新 execution 状态
- 轮询等待 execution 进入终态
- 取消尚未开始的 execution
- 汇总执行结果并决定是否转给 `testany-debug`
- 在需要时获取 execution case 详情与日志签名入口

---

## 操作速查

| 用户意图 | 操作类型 | MCP 工具 |
|---------|---------|---------|
| 列出执行记录 | Read | `testany_list_executions` |
| 查看执行详情 | Read | `testany_get_execution` |
| 查看某个 case 在执行中的详情 | Read | `testany_get_execution_case` |
| 刷新执行状态 | Update | `testany_refresh_execution` |
| 取消未开始执行 | Update | `testany_cancel_execution` |
| 获取工作空间执行状态汇总 | Read | `testany_get_workspace_execution_status` |
| 获取可筛选状态值 | Read | `testany_filter_execution_status` |
| 获取有执行记录的 pipelines | Read | `testany_filter_execution_pipelines` |
| 获取日志签名 | Read | `testany_log_sign` |

---

## 核心知识

### 执行状态

| 状态 | 值 | 含义 | 是否终态 |
|------|-----|------|---------|
| NOT_STARTED | -1 | 未开始/排队中（等待并发槽位） | 否 |
| RUNNING | 0 | 执行中 | 否 |
| SUCCESS | 1 | 全部通过 | 是 |
| FAILURE | 2 | 有失败 | 是 |
| SKIPPED | 3 | 跳过（仅 Case） | 是 |
| FAIL_AS_EXPECTED | 4 | 预期失败（仅 Case） | 是 |
| CANCELLED | 5 | 已取消 | 是 |
| ERROR | 99 | 系统错误 | 是 |

### Workspace 队列状态

Testany 使用 workspace 级并发槽位（Redis semaphore）控制 execution 并行度。通过 `testany_get_workspace_execution_status` 可获取：

| 字段 | 含义 |
|------|------|
| `limit` | workspace 并发上限（Community=2, Paid=4, Enterprise=8，可调） |
| `claimed` | 正在执行的 execution key 列表（已占据槽位） |
| `pending` | 排队中的 execution key 列表（等待槽位） |

**当用户的 execution 状态为 NOT_STARTED 且长时间不变时**，应主动查询队列状态：
- `claimed` 数量 = `limit` → 槽位已满，该 execution 在 `pending` 中排队
- `claimed` 中有长时间运行的旧 execution → 旧执行占住了槽位

**当用户问"为什么我的 execution 不跑"时**，这是第一个要检查的方向，优先于检查 YAML 和 relay。

### 本 skill 的标准处理链

```text
trigger 已返回 execution_key
  -> 按用户目标查询当前状态，或有界等待终态
  -> 如失败，按需 testany_get_execution_case / testany_log_sign
  -> 必要时交给 testany-debug
```

---

## 典型工作流

### 1. 查看单次执行进度

适用输入：
- `execution_key`
- “看这次执行跑到哪了”

处理方式：
1. `testany_get_execution`
2. 仅用户要求刷新，或有具体陈旧证据且刷新在许可内时，`testany_refresh_execution`；RUNNING 本身不是陈旧证据
3. 汇报当前状态、开始时间、通过/失败数量

只查状态到此完成，不因尚在运行自动长轮询、取消、重试或启动新执行。

### 2. 轮询等待执行完成

适用输入：
- “帮我盯着这次执行直到结束”
- 已知 `execution_key`

处理方式：
遵守 [执行许可与等待合同](../testany-guide/references/execution-boundaries.md)：
1. 首次查询前从实际时钟保存开始时间和截止时间，再调用 `testany_get_execution`；口头承诺预算不代替计时值。
2. 仅已知非终态 -1/0 且仍有预算时等待并 `testany_refresh_execution`；间隔从 5 秒退避至最多 30 秒，每次调用前检查截止时间。
3. 默认总等待 10 分钟，用户更短预算优先，工具耗时计入预算；不自行延长。
4. 终态、未知状态、工具错误、预算耗尽或用户中断时停止新调用；报告最后状态及限制。等待超时不是远程失败/取消，不自动调用 cancel、retry 或新执行。
get 或 refresh 已给出终态时直接结案，不再追加同对象查询；等待间隔使用 sleep，不做空循环忙等。

### 3. 查看历史执行

适用输入：
- “看最近失败的执行”
- “列出某个 pipeline 的最近执行”
- “看某个 workspace 的执行情况”

处理方式：
1. 视条件调用 `testany_filter_execution_status` / `testany_filter_execution_pipelines`
2. `testany_list_executions`
3. 必要时再 `testany_get_execution`

常用过滤维度：
- `workspace`
- `pipeline_key`
- `status`
- `triggered_by`
- `env`
- `exe_start_time_from` / `exe_start_time_to`

### 4. 取消 execution

适用输入：
- “取消这次还没开始的执行”

处理方式：
1. `testany_get_execution`
2. 仅当用户已授权取消该对象且状态仍是未开始 / pending 时，调用 `testany_cancel_execution`
3. 如果已经开始运行，明确告知不能取消
4. 读回取消状态；请求已受理但没有取消终态时，不能说已取消。权限不足或竞态失败照实报告

### 5. 查看队列状态 / 诊断 execution 排队

适用输入：
- "为什么我的 execution 不跑"
- "YAML 是并行的但执行串行了"
- "看一下队列状态"
- "execution 一直 NOT_STARTED"

处理方式：
1. `testany_get_workspace_execution_status` → 获取 limit / claimed / pending
2. 判断并报告：
   - claimed 数量是否 = limit（槽位满）
   - 用户关注的 execution 是否在 pending 列表中
   - claimed 中是否有长时间运行的旧 execution 占住槽位
3. 如果槽位未满但 case 仍串行执行：
   - 提示用户检查 pipeline YAML 版本（rule/v1.2 不支持 case 级并行）
   - 建议查看 case 的 start_time/finish_time 确认是否被串行调度
   - 如需深入分析，切到 `testany-debug`（调度/队列诊断分支）

### 6. 将失败执行交给 debug

适用输入：
- “这个执行为什么失败”
- “帮我定位失败 case”

处理方式：
1. `testany_get_execution`
2. 找出失败 case
3. 如只需要定位，先 `testany_get_execution_case`
4. 如需要根因分析与日志解读，切到 `testany-debug`

---

## 边界澄清

### 什么时候去 `testany-trigger`

以下场景不属于本 skill：
- 现在立刻执行一次 pipeline
- 给 pipeline 配 Plan
- 创建 Manual Trigger
- 创建 Gatekeeper

这些都应切到 `testany-trigger`。

### 什么时候去 `testany-debug`

以下场景应转给 `testany-debug`：
- 用户要看失败根因
- 用户要读取与分析日志
- 用户要判断是断言失败、超时、依赖错误还是基础设施问题

---

## 返回格式

任务完成后，向用户汇报：
- Execution Key（如 `Y2K-0601-0000B`）
- 所属 Pipeline
- 当前状态或终态结果
- 通过/失败/跳过数量
- 失败 case 列表（如有）
- 是否实际请求取消、是否有已取消证据；不把等待结束当作取消
- 若未取得终态，说明最后观察状态、预算/工具限制和未完成项
- 下一步建议：
  - 需要继续触发执行 → 去 `testany-trigger`
  - 需要分析失败原因 → 去 `testany-debug`

---

## 参考文档

- [Testany 自动化对象模型](../testany-guide/references/automation-model.md)
- [核心概念](../testany-guide/references/concepts.md)
