---
description: Runbook, Deployment, Rollback, Monitoring, Incident Response, 运维手册、部署、回滚、监控、故障处理。撰写运维手册（Runbook）
argument-hint: <HLD 路径> [LLD 路径] [API Contract 路径] [Guardrails 路径]
---

# Runbook Writer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动 Runbook 撰写流程。基于 HLD/LLD 等上游文档，编写生产就绪的运维手册。


先区分 `formal_design` 与 `bounded_change`/`amendment`；有限增量使用既有有效基线及 Owner 批准，只处理受影响范围，不回补全生命周期文档。详见 `../references/document-amendments.md`；完整流程只适用于正式新功能/全量准出。
## 使用方式

提供上游文档路径：

$ARGUMENTS

## Runbook 在研发流程中的位置

```
PRD → API Contract → HLD → Guardrails → LLD → Runbook → 生产部署
```

Runbook 承接 LLD 的设计，输出可直接用于生产部署、故障处理的运维手册。

## Runbook 内容范围

- **部署流程**：前置检查、部署步骤、验证命令
- **回滚流程**：触发条件、回滚步骤、验证方法
- **监控与告警**：关键指标、SLO 阈值、告警配置
- **故障处理**：常见故障、排查步骤、解决方案
- **值班手册**：职责、联系方式、升级路径

## 工作流程

1. **Phase 0: 基线收集** - 读取 PRD/HLD/LLD/API Contract/Guardrails
2. **Phase 1: 上下文准备** - 提取部署、回滚、监控、故障处理约束
3. **Phase 2: 派发 Writer Subagent** - 独立写作（完整上下文传递）
4. **Phase 3: Spec Compliance Review** - 验证是否覆盖上游要求
5. **Phase 4: Quality Review** - 验证可执行性和完整性
6. **Phase 5: 输出与验证** - 按模板输出最终 Runbook

## 必需产出

- **Runbook 文档**（含部署、回滚、监控、故障处理全流程）
- **验证记录**（Spec Compliance + Quality Review 通过）

## 核心原则

- **Context 隔离**：Subagent 获得新鲜上下文，避免假设污染
- **双阶段审查**：Spec compliance 先行，quality 后续
- **证据驱动**：所有约束必须来自上游文档
- **可执行优先**：每个步骤必须有验证命令，回滚路径必须可操作

请提供 HLD 路径（必需），以及 LLD、API Contract、Guardrails 路径（可选）。

审查/自检按 `../references/review-assurance.md` 绑定对象、覆盖和稳定问题 ID；无独立能力可交未批准草稿，不能将 Critical/Important 的 conditional_pass 认作生产就绪。
