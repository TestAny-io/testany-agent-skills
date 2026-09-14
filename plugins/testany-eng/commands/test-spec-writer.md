---
description: Test spec, 测试规格/测试用例包。产出独立测试范围内完整的 test case package、追溯矩阵、执行说明与 Testany automation handoff
argument-hint: <PRD 路径> <API Contract 路径> <HLD 路径> <LLD 路径> <Test Strategy 路径> [Guardrails 路径]
---

# Test Spec Writer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动测试规格与测试用例包撰写流程。基于批准的 Test Strategy 与 LLD 等基线，输出独立测试范围内完整、详细、可执行的 test case package。


先区分 `formal_design` 与 `bounded_change`/`amendment`；有限增量使用既有有效基线及 Owner 批准，只处理受影响范围，不回补全生命周期文档。详见 `../references/document-amendments.md`；完整流程只适用于正式新功能/全量准出。
## 使用方式

提供上游文档路径：

$ARGUMENTS

## 在研发流程中的位置

```text
LLD → [Test Spec Writer] → Test Case Package → Test Reviewer
```

## 输出范围

- `test-spec-profile-v1` 的 `TRACEABILITY-METADATA` block
- 追溯矩阵
- 覆盖率摘要
- 测试矩阵
- 详细测试用例
- 环境、数据、依赖与证据要求
- 开发内建验证前置条件
- 回归包、Smoke 包、自动化建议
- `Testany Automation Handoff`（供 `testany-bot` `/case-writing` 消费）

## 核心原则

- **Package 优先**：输出完整测试包，而非零散 case
- **Strategy 承接**：只细化批准策略，不重写方法论
- **追溯强制**：需求、接口、风险必须能映射到测试项
- **执行就绪**：每个 case 都要可执行、可判定
- **边界清晰**：不展开 unit、code-level integration、provider-side contract 的详细 case
- **覆盖率分项统计**：按需求/风险/外部行为/场景/NFR 分项输出
- **脚本自检**：写完后先跑 `trace-lint`，再用 `trace-build-rtm` 联合 PRD/Test Strategy 检查全局 RTM

请提供 PRD、API Contract、HLD、LLD、Test Strategy 路径开始撰写。
