---
description: User journey interview, 用户旅程访谈
argument-hint: <BRD 文件路径>
---

# UC Interviewer

按 [访谈模式与事实标准](../references/interview-modes.md) 选择 interview / synthesis / gap_followup。资料充分直接整理草稿；只对缺口补问，不要求逐条再确认。用户要求逐条检查点时遵循；草稿生成和 lint 成功都不等于正式批准。

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动用户旅程访谈流程。在 BRD 和 PRD 之间建立对齐检查点。

## 使用方式

提供 BRD 文件路径：

$ARGUMENTS

## 为什么需要这个步骤

BRD 定义了"做什么"，但用户旅程有很多"模糊地带"：
- 主流程的具体步骤
- 跳转/分支的选择
- 异常情况的处理方式
- Edge case 的触发、用户可见结果与恢复方式

这些决策如果在 PRD 阶段才暴露，返工成本高。

## 访谈内容

1. **BRD baseline** - 先读相关 BRD 并核验批准依据，只有仍有冲突才询问具体权威基线
2. **Journey 范围** - 确认要细化哪些用户旅程
3. **主流程** - 复用已有 Happy Path；未知时开放发现，只确认未决项
4. **跳转/分支** - 其他完成方式与跨 Journey 流转
5. **异常处理** - 出错时怎么办
6. **步骤级 Edge Case** - 检查触发条件、用户可见结果、恢复方式的覆盖，仅补问缺口

## 输出物

结构化的 User Journey 文档，包含 `TRACEABILITY-METADATA`、`JOURNEY-* / FLOW-*`、步骤级 Edge Case Matrix 和真实 checkpoint 状态。草稿可供讨论，但未经批准不能作为 prd-writer 的锁定基线。

## 工作流程

```
BRD → uc-interviewer → User Journey 文档 → prd-writer → PRD
                ↓
          按缺口确认；按证据判定状态
```

先读取已提供材料；确实没有 BRD 或来源时再询问，不重复索取。
