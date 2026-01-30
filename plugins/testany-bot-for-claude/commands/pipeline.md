---
description: Testany Pipeline, 创建/编排流水线，配置依赖和变量传递
argument-hint: <操作> <描述>，如：创建流水线、配置 relay、添加用例
---

# Testany 流水线管理

管理 Testany 测试流水线：创建、编排用例、配置依赖和变量传递。

## 使用方式

$ARGUMENTS

## 支持的操作

- **创建流水线**：组合多个 case 创建 pipeline
- **配置依赖**：设置 whenPassed/whenFailed 执行条件
- **配置 Relay**：设置用例间的变量传递
- **更新流水线**：添加/移除 case，修改执行顺序

## 示例

```
/pipeline 把登录和查询用例组成流水线
/pipeline 配置 TOKEN 从 A1B2C3D4 传递到 E5F6A7B8
/pipeline 给 Y2K-0601 添加新用例
```
