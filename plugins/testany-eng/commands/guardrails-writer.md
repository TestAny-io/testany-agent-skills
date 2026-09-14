---
description: Write Guardrails, 创建或更新项目级工程规范
argument-hint: <项目/文档路径> [补充说明]
---

# Guardrails Writer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动项目级 Guardrails 维护流程。这个命令不是给每个功能都跑一遍的，而是在项目启动、重大变更、事故复盘、重复评审问题沉淀时创建或更新治理基线。首次生成支持“访谈式”和“仓库分析式”两种方法。

## 使用方式

提供项目或文档路径：

$ARGUMENTS

## 适用场景

- 新项目或新平台启动，需要建立 Guardrails 基线
- 架构、平台、认证、数据、部署、合规边界发生变化
- 事故复盘后，需要把长期规则固化
- API/HLD/LLD/Runbook 评审反复出现同类问题，需要上升为项目规则
- 需要明确“改完 Guardrails 后哪些下游文档要重审”
- 需要基于角色访谈或仓库事实快速生成第一版 Guardrails

## 输出内容

- Guardrails 文档，或 index + 分域文档
- 更新触发原因、复审周期、例外流程
- 下游工作流钩子与重审建议
- LLD 模块要求表

请提供路径开始编写。
