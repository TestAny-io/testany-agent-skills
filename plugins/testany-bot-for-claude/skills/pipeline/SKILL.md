---
name: pipeline
description: 管理 Testany 流水线 - 创建、编排用例、配置依赖和变量传递
context: fork
agent: pipeline-builder
disable-model-invocation: true
argument-hint: "[操作] [描述]，如：创建流水线、配置 relay、添加用例"
---

根据用户需求管理测试流水线。

用户输入: $ARGUMENTS

## 支持的操作

- **创建流水线**：组合多个 case 创建 pipeline
- **配置依赖**：设置 whenPassed/whenFailed 执行条件
- **配置 Relay**：设置用例间的变量传递
- **更新流水线**：添加/移除 case，修改执行顺序

## 工作流程

1. 理解用户的编排需求
2. 获取相关 case 信息，验证 relay 约束
3. 构建 pipeline YAML
4. 创建或更新 pipeline
5. 返回结果和下一步建议
