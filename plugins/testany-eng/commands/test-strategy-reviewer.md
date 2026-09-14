---
description: Test strategy review, 测试策略评审。检查风险覆盖、独立测试分层、环境策略与门禁标准
argument-hint: <Test Strategy 路径> <PRD 路径> <API Contract 路径> <HLD 路径> [Guardrails 路径]
---

# Test Strategy Reviewer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动测试策略评审流程。作为进入 LLD 和详细测试规格前的门禁，检查测试策略是否完整、可执行、无关键遗漏。
评审先读取 [证据、准出与复审规则](../references/review-assurance.md)。P2 不按数量阻断；缺证据不等于产品缺陷；提前门禁失败不取消独立安全检查；完成本轮评审不等于批准工件。



先区分 `formal_design` 与 `bounded_change`/`amendment`；有限增量使用既有有效基线及 Owner 批准，只处理受影响范围，不回补全生命周期文档。详见 `../references/document-amendments.md`；完整流程只适用于正式新功能/全量准出。
## 使用方式

提供测试策略和上游基线路径：

$ARGUMENTS

## 在研发流程中的位置

```text
Test Strategy → [Test Strategy Reviewer] → Test Strategy（准出）→ LLD → Test Spec
```

## 审查框架

采用四道门审查：

1. **Gate 1 - 基线与范围**：版本、范围、must-not-regress、豁免
2. **Gate 2 - 风险覆盖与测试分层**：高风险能力与分层合理性
3. **Gate 3 - 环境/数据/依赖**：执行可行性
4. **Gate 4 - 门禁与自动化**：入口/出口、回归与自动化策略

## 准出门槛

- **P0 = 0**
- **P1 = 0**
- **必要证据充分；P2 不按数量阻断**

## 必需产出

- 审查报告
- 准出证书（通过时）

## 强制脚本校验

优先实际执行必要脚本；不可用时记 evidence_gap，不得冒充通过，独立人工检查继续：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <Test Strategy 路径>
python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json <PRD 路径> <Test Strategy 路径>
```

lint/RTM 阻断项须定位为具体工件缺陷或 evidence_gap，必要追溯未满足仍不得准出；不机械映射为产品 P0。

请提供 Test Strategy 路径开始评审。建议同时提供 PRD、API Contract、HLD 与 Guardrails。
