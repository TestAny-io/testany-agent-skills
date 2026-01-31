---
description: Testany 测试编排，创建质量门禁，设置定时计划，接入 Jenkins/GitHub Actions
argument-hint: <操作> <描述>，如：创建门禁、设置定时执行、接入 Jenkins
---

# Testany 测试编排

配置 Testany 测试编排和自动化。

## 使用方式

$ARGUMENTS

## 支持的操作

- **质量门禁**：创建 Gatekeeper，配置通过率阈值
- **定时计划**：创建 Plan，配置 cron 表达式
- **CI/CD 接入**：提供 Jenkins/GitHub Actions 集成代码
- **管理配置**：启用/禁用门禁和计划

## 示例

```
/orchestrator 给 Y2K-0601 创建质量门禁
/orchestrator 每天凌晨 2 点执行回归测试
/orchestrator 接入 GitHub Actions
```
