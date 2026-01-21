---
description: Write HLD, 撰写技术设计文档
argument-hint: <PRD 路径> <API Contract 路径>
---

# HLD Writer

启动 HLD 撰写流程。基于 PRD 和 API Contract，做出架构级技术决策。

## 使用方式

提供 PRD 和 API Contract 文件路径：

$ARGUMENTS

## 为什么需要 API Contract？

API Contract（来自 api-writer）是接口定义的**唯一事实源**：
- HLD 直接引用契约中的接口，不重新设计
- 确保前后端/跨团队对接口理解一致
- 避免 HLD 与契约产生漂移

## 支持的 HLD 类型

1. **新功能（有 UI）** - 涉及前后端的新功能
2. **新功能（无 UI / 后端）** - 纯后端服务
3. **第三方集成** - 接入外部服务
4. **功能重构** - 内部架构重构
5. **性能/安全优化** - 非功能性改进

## HLD 聚焦内容

- **高成本决策**：技术选型、架构模式
- **接口引用**：引用 API Contract，不重新定义
- **风险决策**：安全、性能、兼容性
- **复用决策**：复用 vs 新建

## 工作流程

1. **上下文收集**：读取 PRD + API Contract，扫描技术文档
2. **需求映射**：PRD 需求 → HLD 章节
3. **结构规划**：选择合适的模板
4. **内容撰写**：技术决策 + 理由（接口引用契约）
5. **强制审查**：PRD 覆盖率、契约一致性检查

请提供 PRD 和 API Contract 路径开始撰写。
