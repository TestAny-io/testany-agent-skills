---
name: testany-guide
description: Testany 平台核心概念和配置参考
---

# Testany 平台参考

本 skill 提供 Testany 平台的核心概念参考。详细内容见 references/ 目录。

## 核心实体关系

```
Case (测试用例)
  │
  ├──► Pipeline (流水线) ──► Execution (执行)
  │         │
  │         ├──► Plan (定时计划)
  │         └──► Gatekeeper (质量门禁)
  │
  └──► Workspace (工作空间) ──► 权限控制
```

## 快速参考

- 实体定义和可见性规则 → [concepts.md](references/concepts.md)
- Executor 配置详解 → [executors.md](references/executors.md)
- Pipeline YAML 语法 → [pipeline-yaml.md](references/pipeline-yaml.md)

## 标识符格式

| 类型 | 格式 | 示例 |
|------|------|------|
| Case Key | 8 位大写十六进制 | `A1B2C3D4` |
| Pipeline Key | `{WS_KEY}-{4或5位数字}` | `Y2K-0601` |
| Workspace Key | 3 位大写字母数字 | `Y2K` |
| Execution ID | `{WS_KEY}-{4或5位数字}-{序号}` | `Y2K-0601-00001` |

## MCP Schema Resources

在组装 API payload 前，应先读取对应的 schema resource：

| Resource URI | 用途 |
|--------------|------|
| `testany://schema/case` | Case 创建/更新字段定义 |
| `testany://schema/pipeline` | Pipeline YAML 完整 schema |
