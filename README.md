# Testany Agent Skills

Skills 是包含指令、脚本和资源的文件夹，Claude 可以动态加载它们以提升特定任务的表现。Skills 教会 Claude 以可重复的方式完成特定任务，无论是按照公司规范撰写文档、使用特定工作流分析数据，还是自动化日常任务。

更多信息请参考：
- [What are skills?](https://support.anthropic.com/en/articles/12512176-what-are-skills)
- [Using skills in Claude](https://support.anthropic.com/en/articles/12512180-using-skills-in-claude)
- [How to create custom skills](https://support.anthropic.com/en/articles/12512198-creating-custom-skills)

# 关于本仓库

本仓库包含 Testany 公司内部使用的 Agent Skills，覆盖产品研发流程中的各类专业场景。每个 skill 都是独立的文件夹，包含 `SKILL.md` 文件以及 Claude 所需的指令和元数据。

# 仓库结构

- [./skills](./skills): 所有 Skills
- [./spec](./spec): Agent Skills 规范文档
- [./CHANGELOG.md](./CHANGELOG.md): 版本变更记录

# 在 Claude Code 中使用

## 安装

```
/plugin marketplace add TestAny-io/testany-agent-skills
```

然后选择要安装的 plugin：
1. 选择 `Browse and install plugins`
2. 选择 `testany-agent-skills`
3. 选择需要的 plugin（如 `prd-writer`）
4. 选择 `Install now`

## 更新

```
/plugin marketplace remove <plugin-name>
/plugin marketplace add TestAny-io/testany-agent-skills
```

# 包含的 Skills

| Skill | 描述 |
|-------|------|
| [brd-interviewer](./skills/brd-interviewer) | 业务需求访谈专家，通过选择题引导 stakeholder 输出结构化 BRD |
| [prd-writer](./skills/prd-writer) | PRD 写作技能，支持多种类型：新功能、第三方集成、重构、优化 |
| [prd-reviewer](./skills/prd-reviewer) | PRD 审查专家，作为「准出门禁」从多角色视角全面审查 |
| [hld-writer](./skills/hld-writer) | HLD 写作技能，承接 PRD 做技术决策，支持 PRD:HLD 1:N 场景 |
| [hld-reviewer](./skills/hld-reviewer) | HLD 审查专家，模拟 Design Review 会议，重点检测 PRD→HLD 漂移 |
| [media-writer](./skills/media-writer) | 自媒体内容创作工作流，支持公众号、知乎、小红书、LinkedIn、Medium、Reddit |
| [skill-creator](./skills/skill-creator) | Skill 创建指南，帮助创建和优化 Claude Code Skills |
| [prompt-optimizer](./skills/prompt-optimizer) | AI 提示词优化专家，支持 Claude、ChatGPT、DeepSeek、豆包、智谱、Gemini 等多平台 |

# 创建自定义 Skill

Skill 的创建很简单 - 只需一个包含 `SKILL.md` 文件的文件夹。`SKILL.md` 包含 YAML frontmatter 和 Markdown 指令：

```markdown
---
name: my-skill-name
description: 清晰描述这个 skill 做什么，以及什么时候应该使用它
---

# My Skill Name

[在这里添加 Claude 执行此 skill 时需要遵循的指令]
```

Frontmatter 只需要两个字段：
- `name` - skill 的唯一标识符（小写，用连字符分隔）
- `description` - 完整描述 skill 的功能和使用场景

更多详情请参考 [spec/skill-authoring.md](./spec/skill-authoring.md) 或使用 `skill-creator` skill。

# 许可证

MIT License - 详见 [LICENSE](LICENSE)

# 联系方式

- Email: engineering@testany.io
- Website: https://testany.io
