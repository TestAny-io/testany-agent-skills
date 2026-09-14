---
description: Testany execution 观测与管理，查看进度、查历史、刷新状态、取消未开始执行
argument-hint: <execution_key / pipeline_key / 操作>，如：查看 Y2K-0601-0000B、看最近失败、取消 pending execution
---

# Testany Execution

管理已经发起的 Testany execution：查看进度、查询历史、刷新状态、取消未开始执行，并在失败时交给 debug。

## 使用方式

$ARGUMENTS

按 [整体目标交接](../skills/testany-guide/references/task-handoff.md) 复用真实 execution key 与已有等待期限；只查询不自动等待，终态失败不扩大为重新执行。

## 核心动作

- **查看进度**：查看单次 execution 当前状态和 case 结果
- **查询历史**：按 workspace / pipeline / status 检索执行记录
- **刷新状态**：主动刷新 execution 状态
- **取消执行**：取消尚未开始的 execution
- **失败交接**：将失败 execution 转给 `testany-debug`

## 重要边界

- 本命令**不负责发起新的执行**
- 如果你要“现在立刻执行一次”，请先用 `/trigger`
- 本命令只处理 execution 发起之后的观测与管理
- 只查当前状态就查询后交付，不自动长轮询或 refresh；等待、取消和重试分别核对当前授权
- 明确等待时遵守 [有界等待合同](../skills/testany-guide/references/execution-boundaries.md)，默认 10 分钟，用户更短预算优先；到期保留最后状态，不宣称远程已取消/失败

## 示例

```
/execution 查看 Y2K-0601-0000B
/execution 看 Y2K-0601 最近的失败执行
/execution 刷新 Y2K-0601-0000B
/execution 取消 Y2K-0601-0000B
```
