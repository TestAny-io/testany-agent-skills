---
description: Guide, workflow guide, 流程导航。按正式设计、有限修复和源码对象分层，推荐最小下一步
argument-hint: "[项目/目录路径] [可选：补充上下文]"
---

# Guide

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

以 `${CLAUDE_PLUGIN_ROOT}/skills/guide/SKILL.md` 及其直接引用的 workflow/references 为唯一规则源执行 Guide；不要复制或改写另一套流程。把以下参数作为项目路径/补充上下文传入：

$ARGUMENTS

必须先应用 Skill 的决策层级与有限变更路由，并保留正式主流程、Implementation Code Review、Prototype、Guardrails 与 Testany Automation Landing。Guide 只做状态识别和导航，不替代 writer/reviewer 或授予设计/外部执行权限。
