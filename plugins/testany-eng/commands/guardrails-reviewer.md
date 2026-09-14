---
description: Review Guardrails, 评审项目级工程规范基线
argument-hint: <Guardrails 路径>
---

# Guardrails Reviewer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动 Guardrails 准出审查流程。除了审规则本身，还会检查这次变更的触发判定、生成模式、事实标准、下游工作流钩子与重审建议是否成立。
评审先读取 [证据、准出与复审规则](../references/review-assurance.md)。P2 不按数量阻断；缺证据不等于产品缺陷；提前门禁失败不取消独立安全检查；完成本轮评审不等于批准工件。


## 使用方式

提供 Guardrails 路径：

$ARGUMENTS

## 审查重点

- 这次是否真的该改 Guardrails（create / update / restructure / no_change）
- 规则是否有充分证据，尤其是 repository_scan_first 的事实标准
- 下游工作流钩子与阻塞建议是否完整
- 规则是否可验证、可执行、与现有规范一致

## 准出门槛

- **P0 = 0**
- **P1 = 0**
- **必要证据充分；P2 不按数量阻断**

请提供 Guardrails 文档路径开始评审。
