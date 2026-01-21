---
description: LLD review, 评审详细设计文档
argument-hint: <LLD 路径> [PRD 路径] [HLD 路径] [API Contract 路径] [Guardrails 路径]
---

# LLD Reviewer

启动 LLD 评审流程。作为实现阶段前的最后一道门禁，检测 HLD→LLD 漂移，验证设计可实现性。

## 使用方式

提供文档路径：

$ARGUMENTS

## LLD 审查在研发流程中的位置

```
PRD → API Contract → HLD → Guardrails → LLD → [LLD Reviewer] → 代码实现
```

LLD Reviewer 是进入代码实现阶段的最后门禁。

## 审查框架

采用四道门审查：

1. **Gate 1 - 基线与 Manifest**：确认上游文档、验证 LLD Manifest
2. **Gate 2 - 一致性与漂移**：检测 HLD→LLD 漂移、Contract 一致性
3. **Gate 3 - 模块完整性**：按 Manifest 检查各模块必填项
4. **Gate 4 - 可实现性与风险**：验证伪代码、测试策略、观测设计

## 准出门槛

- **P0 = 0**（任一 P0 即阻断）
- **P1 = 0**（任一 P1 即不通过）
- **P2 ≤ 2**（超过 2 个 P2 不通过）

## 必需产出

- 审查报告（含问题清单和证据）
- 准出证书（通过时）

请提供 LLD 路径开始评审。建议同时提供 PRD、HLD、API Contract 和 Guardrails 路径。
