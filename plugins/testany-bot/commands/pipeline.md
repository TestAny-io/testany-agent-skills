---
description: Testany Pipeline，基于 decomposition 或现有 case keys 创建执行与编排单元；推荐消费 case-writing 基于 approved Test Spec handoff 产出的结果
argument-hint: <操作> <描述>，如：根据 decomposition 创建流水线、配置 relay、更新执行顺序
---

# Testany 流水线管理

管理 Testany 测试流水线：创建执行与编排单元，组织 cases 的依赖、relay 和分支逻辑。

## 使用方式

$ARGUMENTS

按 [交付验证](../skills/testany-guide/references/delivery-verification.md) 检查实际编排并在创建/更新后读回相关配置；请求受理不等于配置生效，不自动执行或重试。

按 [整体目标交接](../skills/testany-guide/references/task-handoff.md) 接续已授权的注册、编排和运行目标；仅配置则不运行，已有 case 不重复创建。

## 支持的操作

- **创建流水线**：优先根据上游 decomposition 组合多个 case 创建 pipeline
- **配置依赖**：设置 whenPassed/whenFailed 执行条件
- **配置 Relay**：设置用例间的变量传递
- **更新流水线**：添加/移除 case，修改执行顺序
- **单 case 可执行化**：即使只有一个 case，也创建一条 pipeline 作为执行入口

## 示例

```
/pipeline 把登录和查询用例组成流水线
/pipeline 配置 TOKEN 从 A1B2C3D4 传递到 E5F6A7B8
/pipeline 给 Y2K-0601 添加新用例
/pipeline 根据 case-writing 产出的 decomposition 创建订阅流程 pipeline
```
