---
description: Test review, 测试评审。审查独立测试包的覆盖、追溯、执行证据与遗留风险
argument-hint: <Test Spec 路径> <Test Strategy 路径> [执行摘要/缺陷清单]
---

# Test Reviewer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动测试门禁评审流程。检查独立测试包是否完整、可执行、与上游基线一致；在发布前模式下，同时检查执行证据与残余风险，并在通过时给出文档下游与 Testany 自动化下游建议。
评审先读取 [证据、准出与复审规则](../references/review-assurance.md)。P2 不按数量阻断；缺证据不等于产品缺陷；提前门禁失败不取消独立安全检查；完成本轮评审不等于批准工件。



先区分 `formal_design` 与 `bounded_change`/`amendment`；有限增量使用既有有效基线及 Owner 批准，只处理受影响范围，不回补全生命周期文档。详见 `../references/document-amendments.md`；完整流程只适用于正式新功能/全量准出。
## 使用方式

提供测试规格、测试策略，以及可选的执行摘要/缺陷清单：

$ARGUMENTS

## 在研发流程中的位置

```text
Test Spec → [Test Reviewer] → 测试准出 → Runbook / Testany automation landing
```

## 审查框架

采用四道门审查：

1. **Gate 1 - 基线与追溯**：版本、范围、覆盖映射
2. **Gate 2 - 覆盖与漂移**：覆盖率口径、主流程、异常、边界、系统集成/兼容、非功能
3. **Gate 3 - 可执行性与证据设计**：数据、环境、依赖、断言、分组
4. **Gate 4 - 执行证据与残余风险**：执行结果、缺陷、豁免、发布前证据

## 准出门槛

- **P0 = 0**
- **P1 = 0**
- **必要证据充分；P2 不按数量阻断**

## 必需产出

- 审查报告
- 准出证书（通过时）
- 下游 handoff 建议（通过时）

## 强制脚本校验

优先实际执行必要脚本；不可用时记 evidence_gap，不得冒充通过，独立人工检查继续：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <Test Spec 路径>
python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json <PRD 路径> <Test Strategy 路径> <Test Spec 路径>
```

`trace-build-rtm` 的 Requirement / Risk / Must-not-regress / External Behavior 矩阵，是 Gate 1 / Gate 2 的主证据来源。

请提供 Test Spec 路径开始评审。若是发布前门禁，务必同时提供执行摘要或缺陷清单。
