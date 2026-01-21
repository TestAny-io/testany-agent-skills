---
description: User journey interview, 用户旅程访谈
argument-hint: <BRD 文件路径>
---

# UC Interviewer

启动用户旅程访谈流程。在 BRD 和 PRD 之间建立对齐检查点。

## 使用方式

提供 BRD 文件路径：

$ARGUMENTS

## 为什么需要这个步骤

BRD 定义了"做什么"，但用户旅程有很多"模糊地带"：
- 主流程的具体步骤
- 替代路径的选择
- 异常情况的处理方式
- 边界情况的优先级

这些决策如果在 PRD 阶段才暴露，返工成本高。

## 访谈内容

1. **Journey 范围** - 确认要细化哪些用户旅程
2. **主流程** - 逐步确认 Happy Path
3. **替代路径** - 其他完成方式
4. **异常处理** - 出错时怎么办
5. **边界情况** - 极端场景

## 输出物

结构化的 User Journey 文档，可直接喂给 prd-writer。

## 工作流程

```
BRD → uc-interviewer → User Journey 文档 → prd-writer → PRD
                ↓
          逐条确认 ✓
```

请提供 BRD 文件路径开始访谈。
