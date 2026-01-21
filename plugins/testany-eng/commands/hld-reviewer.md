---
description: HLD review, 审查技术设计文档
argument-hint: <HLD 文件路径> [PRD 文件路径]
---

# HLD Reviewer

启动 HLD 审查流程。模拟真实 Design Review 会议，重点检测 PRD→HLD 漂移风险。

## 使用方式

提供 HLD 文件路径（建议同时提供对应的 PRD）：

$ARGUMENTS

## 三道门审查框架

### 第一道门：PRD↔HLD 一致性（P0 阻塞）
- 需求遗漏检测（PRD 有，HLD 没有）
- 需求膨胀检测（HLD 有，PRD 没有）
- 需求曲解检测（语义偏离）
- 边界漂移检测（范围变更）

### 第二道门：核心技术审查
- Tech Lead 视角：架构合理性
- Senior Engineer 视角：实现可行性

### 第三道门：风险驱动角色审查（按需）
- Security 视角（敏感数据场景）
- DBA 视角（数据迁移场景）
- SRE 视角（高并发场景）
- Architect 视角（跨系统场景）
- QA 视角（复杂测试场景）

## 问题分级

- **P0 阻塞**：必须修复（PRD 覆盖率 < 100%）
- **P1 严重**：强烈建议修复
- **P2 建议**：可选优化

请提供 HLD 文件路径开始审查。
