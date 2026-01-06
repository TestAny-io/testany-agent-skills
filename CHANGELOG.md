# Changelog

本文件记录 Testany Agent Skills 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.2.0] - 2026-01-06

### 新增

- **skill-creator** 技能：Skill 创建指南，帮助创建和优化 Claude Code Skills
  - 包含 `init_skill.py`、`package_skill.py`、`quick_validate.py` 脚本
  - 提供完整的 skill 编写最佳实践
- **spec/** 目录：Agent Skills 规范文档
  - `agent-skills-spec.md`：规范总览
  - `skill-authoring.md`：Skill 编写指南
  - `skill-client-integration.md`：客户端集成指南

### 变更

- **prd-writer 改进**
  - Frontmatter description 加入触发词，提升激活可靠性
  - `templates/` 目录改名为 `references/`，符合 skill 最佳实践
  - 「选型分析/选定方案」改为「方案分析/建议方案」，最终选型决定留给 HLD
  - 语言规范增加「用户要求英文时可切换」例外条款
- **README.md** 重写，符合仓库级别定位

### 修复

- 修复 `integration.md` 表格缺失 pipe 的格式问题
- 修复 `new-feature-backend.md` 嵌套代码围栏导致的格式解析问题

---

## [1.1.0] - 2026-01-06

### 新增

- **阶段零：上下文收集（强制）**：写 PRD 前必须先了解项目上下文
  - 自动读取项目中的已有 PRD/HLD 文档
  - 识别项目命名规范和技术栈
  - 确保输出遵循项目现有约定
- **PRD 内容边界定义**：明确 PRD 与 HLD 的职责边界
  - PRD 只描述 What 和 Why，不规定 How
  - 添加正确/错误示例对比
- **边界检查（强制）**：在审查阶段增加边界检查步骤

### 变更

- **核心原则更新**
  - 新增「先读后写，遵循项目现有约定」原则
  - 新增「PRD 只描述 What 和 Why，不规定 How」原则
- **模板优化**（所有 5 个模板）
  - `new-feature-ui.md`：「数据模型」改为「数据概念」，移除技术字段定义
  - `new-feature-backend.md`：「接口规格」改为「接口能力」，移除 API 路径设计
  - `integration.md`：「集成方案」改为「集成需求」，移除技术接口映射
  - `refactoring.md`：移除架构图和代码结构变更，简化为业务层面描述
  - `optimization.md`：移除优化代码示例，简化为目标和验证要求
  - 所有模板添加「具体技术方案见 HLD」引用

### 修复

- 修复 PRD 内容越界到 HLD 领域的问题
- 修复不遵循项目现有约定的问题

---

## [1.0.0] - 2026-01-06

### 新增

- **prd-writer** 技能：PRD（产品需求文档）写作技能
  - 支持 5 种 PRD 类型：新功能（有UI）、新功能（无UI）、第三方集成、功能重构、性能/安全优化
  - 4 阶段工作流程：需求理解 → 结构规划 → 内容撰写 → 强制审查
  - 使用 AskUserQuestion 工具进行结构化交互
  - 包含 5 个专业模板
