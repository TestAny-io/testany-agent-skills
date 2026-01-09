---
description: 创建 Claude Code Skill
argument-hint: [可选：skill 名称或描述]
---

# Skill Creator

启动 Skill 创建流程。帮助你创建和优化 Claude Code Skills，遵循最佳实践。

## 使用方式

描述你想创建的 skill：

$ARGUMENTS

## Skill 结构

```
skills/your-skill-name/
├── SKILL.md           # 主技能文件（必需）
├── references/        # 参考文档（可选）
└── assets/           # 输出模板（可选）
```

## SKILL.md 格式

```markdown
---
name: your-skill-name
description: 清晰描述功能和触发场景
---

# Your Skill Name

[指令内容]
```

## 工作流程

1. **需求理解**：明确 skill 要解决什么问题
2. **结构设计**：规划文件结构
3. **内容撰写**：编写 SKILL.md
4. **验证检查**：确保符合规范

如果没有提供具体需求，请告诉我你想创建什么类型的 skill。
