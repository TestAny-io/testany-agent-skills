---
name: tests
description: 执行和监控 Testany 测试 - 触发 Pipeline 执行、查看结果、检查状态
context: fork
agent: test-runner
argument-hint: "[Pipeline 标识] 或 [操作]，如：Y2K-0601、查看最近执行"
---

执行 Pipeline 并监控结果。

用户输入: $ARGUMENTS

## 支持的操作

- **触发执行**：执行 Pipeline（Testany 只支持执行 Pipeline，不支持直接执行单个 Case）
- **查看状态**：检查执行进度和结果
- **查看结果**：获取执行详情、通过/失败统计
- **列出执行**：查看历史执行记录

## 工作流程

1. 确认要执行或查看的目标 Pipeline
2. 触发执行或获取状态
3. 轮询直到完成（如需要）
4. 汇报结果，如有失败建议使用 debug 排查
