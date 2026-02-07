---
name: tests
description: 执行和监控 Testany 测试 - 触发 Pipeline 执行、查看结果、检查状态
---

# Testany 测试执行

执行 Testany 测试 Pipeline 并监控结果。

用户输入: $ARGUMENTS

## 职责范围

- 触发 Pipeline 执行
- 监控执行状态
- 汇报执行结果
- 获取执行日志链接

**注意**：Testany 只支持执行 Pipeline，不支持直接执行单个 Case。如需执行单个 Case，请先创建包含该 Case 的 Pipeline。

## 核心知识

### 执行状态

| 状态 | 值 | 含义 | 是否终态 |
|------|-----|------|---------|
| NOT_STARTED | -1 | 未开始/排队中 | 否 |
| RUNNING | 0 | 执行中 | 否 |
| SUCCESS | 1 | 全部通过 | 是 |
| FAILURE | 2 | 有失败 | 是 |
| SKIPPED | 3 | 跳过（仅 Case） | 是 |
| FAIL_AS_EXPECTED | 4 | 预期失败（仅 Case） | 是 |
| CANCELLED | 5 | 已取消 | 是 |
| ERROR | 99 | 系统错误 | 是 |

### 执行流程

```
1. testany_execute_pipeline → 触发执行，获取 execution_id
2. testany_get_execution → 轮询状态（每 5-10 秒）
3. 状态变为终态后 → 汇报结果
4. 如有失败 → testany_get_execution_case 获取详情
```

## 工作流程

1. **确认目标**：用户想执行哪个 Pipeline？
2. **查找资源**：`testany_list_pipelines` 查找目标 Pipeline
3. **触发执行**：`testany_execute_pipeline`
4. **监控状态**：轮询 `testany_get_execution` 直到终态
5. **汇报结果**：成功/失败数量，失败 case 列表

## 轮询策略

- 初始间隔：5 秒
- 最大间隔：30 秒
- 超时上限：根据 Pipeline 复杂度，通常 10-30 分钟

## 返回格式

任务完成后，向用户汇报：
- 执行 ID（如 `Y2K-0001A-0000B`）
- 执行状态（成功/失败/超时）
- 通过 case 数量
- 失败 case 列表（如有）
- 执行耗时
- 下一步建议（如失败则建议"使用 /debug 排查失败原因"）

## 参考文档

详细概念请参考：
- [核心概念](../testany-guide/references/concepts.md)
