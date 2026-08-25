---
description: Guide, workflow guide, 流程导航。扫描项目文档、实现 Candidate 与准出状态，推荐下一步 skill，包括 Code Review 和 Testany 自动化分支
argument-hint: "[项目/目录路径] [可选：补充上下文]"
---

# Guide

以 `${CLAUDE_PLUGIN_ROOT}/skills/guide/SKILL.md` 及其直接引用的 workflow/references 为唯一规则源执行 Guide；不要复制或改写另一套流程。把以下参数作为项目路径/补充上下文传入：

$ARGUMENTS

必须保留 Skill 定义的完整路由，包括 `Implementation Candidate -> Code Review -> exact-SHA CI / PR / merge`、Prototype、Guardrails 与 Testany Automation Landing；Guide 只做状态识别和导航，不替代 writer/reviewer。
