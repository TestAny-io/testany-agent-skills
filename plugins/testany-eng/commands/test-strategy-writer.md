---
description: Test strategy, 测试策略。定义独立测试范围、独立测试层次、环境策略、入口/出口标准
argument-hint: <PRD 路径> <API Contract 路径> <HLD 路径> [Guardrails 路径]
---

# Test Strategy Writer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动测试策略撰写流程。基于 PRD、API Contract、HLD 与 Guardrails，产出可审查、可执行的独立测试策略。


先区分 `formal_design` 与 `bounded_change`/`amendment`；有限增量使用既有有效基线及 Owner 批准，只处理受影响范围，不回补全生命周期文档。详见 `../references/document-amendments.md`；完整流程只适用于正式新功能/全量准出。
## 使用方式

提供上游文档路径：

$ARGUMENTS

## 在研发流程中的位置

```text
PRD → API Contract → HLD → [Test Strategy Writer] → Test Strategy → Test Strategy Reviewer → LLD
```

## 输出范围

- `test-strategy-profile-v1` 的 `TRACEABILITY-METADATA` block
- 测试目标与质量风险
- In-scope / Out-of-scope
- 独立测试层分配
- 环境、数据、依赖与观测策略
- 入口/出口标准
- 自动化与回归策略
- 开发内建验证前置条件

## 核心原则

- **只写怎么测**：不写详细 test case
- **风险驱动**：高风险能力优先建模
- **基线对齐**：承接 PRD/API/HLD/Guardrails
- **执行现实**：环境和依赖必须可落地
- **边界清晰**：不负责 unit、code-level integration、provider-side contract 的设计
- **脚本自检**：写完后先跑 `trace-lint`，再用 `trace-build-rtm` 联合 PRD 检查追溯闭环

请提供 PRD、API Contract、HLD 路径开始撰写。Guardrails 如存在请一并提供。
