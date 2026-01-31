---
name: trigger
description: 配置 Testany 测试触发器 - 创建质量门禁、设置定时计划
context: fork
agent: test-trigger
disable-model-invocation: true
argument-hint: "[操作] [描述]，如：创建门禁、设置定时执行、接入 Jenkins"
---

配置测试触发器和自动化。

用户输入: $ARGUMENTS

## 支持的操作

- **质量门禁**：创建 Gatekeeper，配置通过率阈值
- **定时计划**：创建 Plan，配置 cron 表达式
- **CI/CD 接入**：提供 Jenkins/GitHub Actions 集成代码
- **管理配置**：启用/禁用门禁和计划

## 工作流程

1. 理解集成需求
2. 找到或创建相关 pipeline
3. 创建 Gatekeeper 或 Plan
4. 返回配置结果和集成代码示例
