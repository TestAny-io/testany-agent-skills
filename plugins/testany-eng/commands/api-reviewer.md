---
description: API contract review, 评审接口契约文档
argument-hint: <Contract 路径> [PRD 路径] [Index 路径]
---

# API Reviewer

启动 API Contract 评审流程。作为进入 HLD/LLD/实现前的门禁，检测 PRD→Contract 漂移与契约完整性。

## 使用方式

提供文档路径：

$ARGUMENTS

## API 审查在研发流程中的位置

```
PRD → API Writer → API Contract → [API Reviewer] → HLD/LLD/实现
```

## 审查框架

采用四道门审查：

1. **Gate 1 - 基线与覆盖**：PRD 基线、范围/所有权、映射覆盖率
2. **Gate 2 - 协议完整性**：各协议必填项检查
3. **Gate 3 - 漂移与冲突**：PRD 漂移、重复造轮子、兼容冲突
4. **Gate 4 - 兼容性与演进**：版本策略、破坏性变更、幂等与错误语义

## 准出门槛

- **P0 = 0**（任一 P0 即阻断）
- **P1 = 0**（任一 P1 即不通过）
- **P2 ≤ 2**（超过 2 个 P2 不通过）

## 必需产出

- 审查报告（含问题清单和证据）
- 准出证书（通过时）

请提供 Contract 路径开始评审。建议同时提供 PRD 和 Index（如为多协议）。
