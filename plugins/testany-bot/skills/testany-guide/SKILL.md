---
name: testany-guide
description: Testany 平台核心概念和配置参考
---

# Testany 平台参考

本 skill 提供 Testany 平台的核心概念参考。详细内容见 references/ 目录。若上游来自 `testany-eng`，优先配合 approved Test Spec 中的 `Testany Automation Handoff` 一起使用。

## 核心实体关系

```
Traditional Test Scenario
  │
  └──► Testany Platform Case
             │
             └──► Pipeline (执行与编排单元) ──► Execution
                           │
                           ├──► Plan
                           ├──► Manual Trigger
                           └──► Gatekeeper
```

## 快速参考

- 本地包与远程变更完成标准 → [delivery-verification.md](references/delivery-verification.md)
- 跨 skill 完整目标与授权接续 → [task-handoff.md](references/task-handoff.md)
- 对象边界与职责链 → [automation-model.md](references/automation-model.md)
- 实体定义和可见性规则 → [concepts.md](references/concepts.md)
- Executor 配置详解 → [executors.md](references/executors.md)
- Pipeline YAML 语法 → [pipeline-yaml.md](references/pipeline-yaml.md)

## 宿主能力适配

`testany-bot` 通用版按**能力**而不是按**宿主品牌**分支：

- 如果宿主支持结构化提问工具（如 AskUserQuestion），优先一次性收集缺失信息。
- 如果宿主不支持该工具，则用普通文本在当前对话中提问；低风险字段可给出默认值建议，但必须明确告知用户。
- 如果宿主支持 slash command / router，可推荐相关 workflow 的命令入口。
- 如果宿主不支持 slash command，不要阻塞任务；直接在当前线程继续对应 workflow。

## 标识符格式

| 类型 | 格式 | 示例 |
|------|------|------|
| Case Key | 8 位大写十六进制 | `A1B2C3D4` |
| Pipeline Key | `{WS_KEY}-{4-5位大写十六进制}` | `Y2K-0001A` |
| Workspace Key | 3 位大写字母数字 | `Y2K` |
| Execution ID | `{pipeline_key}-{5位大写十六进制}` | `Y2K-0001A-0000B` |

## MCP Schema Resources

在组装 API payload 前，应先读取对应的 schema resource：

| Resource URI | 用途 |
|--------------|------|
| `testany://schema/case` | Case 创建/更新字段定义 |
| `testany://schema/pipeline` | Pipeline YAML 完整 schema |
| `testany://schema/import-git` | V2 Git 导入（连接 / 浏览 / 同步 / switch / relation / webhook）全量流程与类型 |
