---
description: Testany trigger 与单次触发，为 pipeline 配置 Plan、Manual Trigger、Gatekeeper，或立即执行一次
argument-hint: <操作> <描述>，如：立即执行 Y2K-0601、创建手动触发、设置定时执行、创建 Gatekeeper
---

# Testany Trigger

为已有 pipeline 配置执行入口，或立即发起一次执行。Trigger 是执行入口，不是编排层。

## 使用方式

$ARGUMENTS

按 [整体目标交接](../skills/testany-guide/references/task-handoff.md)：仅启动返回真实 key 即止；要求等终态则继续 execution 工作流，沿用等待预算，不重试或取消。

## 支持的操作

- **立即执行一次**：Run Now，直接发起一次 pipeline execution
- **定时计划**：创建 Plan，配置 cron 表达式
- **手动触发**：配置 Manual Trigger（当前若 MCP 未提供 tools，则走 UI fallback）
- **事件触发**：创建 Gatekeeper，接入 Jenkins/GitHub Actions 等外部系统
- **管理配置**：更新或删除已有 trigger

## 示例

```
/trigger 立即执行 Y2K-0601
/trigger 给 Y2K-0601 创建 Gatekeeper
/trigger 每天凌晨 2 点执行回归测试
/trigger 给验收流水线创建一个 Manual Trigger
/trigger 接入 GitHub Actions
```

## 重要边界

- 如果你要“现在立刻跑一次”，用 `/trigger`
- 如果执行已经发起，后续看进度、查历史、取消、失败交接，请用 `/execution`
- 配置入口不自动授权执行；Manual Trigger 的 UI 指导要标明尚未配置，不替换其他类型
- 返回执行 key 只证明已发起，不证明成功；配置创建/更新后核对状态，读回失败标为部分完成/核验受阻
