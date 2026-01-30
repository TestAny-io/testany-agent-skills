---
description: Testany Tests, 执行测试，查看结果和状态
argument-hint: <pipeline/case 标识> 或 <操作>，如：Y2K-0601、查看最近执行
---

# Testany 测试执行

执行 Testany 测试并监控结果。

## 使用方式

$ARGUMENTS

## 支持的操作

- **触发执行**：执行 pipeline 或单个 case
- **查看状态**：检查执行进度和结果
- **查看结果**：获取执行详情、通过/失败统计
- **列出执行**：查看历史执行记录

## 示例

```
/tests Y2K-0601
/tests 执行回归测试
/tests 查看最近的执行结果
```
