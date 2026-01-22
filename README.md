# Testany Agent Skills

Skills 是包含指令、脚本和资源的文件夹，Claude 可以动态加载它们以提升特定任务的表现。Skills 教会 Claude 以可重复的方式完成特定任务，无论是按照公司规范撰写文档、使用特定工作流分析数据，还是自动化日常任务。

更多信息请参考：
- [What are skills?](https://support.anthropic.com/en/articles/12512176-what-are-skills)
- [Using skills in Claude](https://support.anthropic.com/en/articles/12512180-using-skills-in-claude)
- [How to create custom skills](https://support.anthropic.com/en/articles/12512198-creating-custom-skills)

# 关于本仓库

本仓库包含 Testany 公司内部使用的 Agent Skills，覆盖产品研发流程中的各类专业场景。Skills 按领域分为三个 Plugin：

| Plugin | 领域 | 命令 |
|--------|------|------|
| **testany-eng** | 研发流程 | `/testany-eng:brd-interviewer`, `/testany-eng:uc-interviewer`, `/testany-eng:prd-writer`, `/testany-eng:prd-reviewer`, `/testany-eng:prd-studio`, `/testany-eng:api-writer`, `/testany-eng:api-reviewer`, `/testany-eng:guardrails-writer`, `/testany-eng:guardrails-reviewer`, `/testany-eng:hld-writer`, `/testany-eng:hld-reviewer`, `/testany-eng:runbook-writer` |
| **testany-llm** | AI/LLM 工具 | `/testany-llm:skill-creator`, `/testany-llm:prompt-optimizer` |
| **testany-mrkt** | 营销内容 | `/testany-mrkt:media-writer` |

# 仓库结构

```
testany-agent-skills/
├── plugins/                    # 按领域分组的 Plugins
│   ├── testany-eng/           # 研发流程工具集
│   │   ├── commands/          # CLI 命令（/testany-eng:xxx）
│   │   └── skills/            # 完整实现
│   ├── testany-llm/           # AI/LLM 工具集
│   │   ├── commands/
│   │   └── skills/
│   └── testany-mrkt/          # 营销内容工具集
│       ├── commands/
│       └── skills/
└── CHANGELOG.md               # 版本变更记录
```

# 在 Claude Code 中使用

## 安装

```
/plugin marketplace add TestAny-io/testany-agent-skills
```

然后选择要安装的 plugin：
1. 选择 `Browse and install plugins`
2. 选择 `testany-agent-skills`
3. 选择需要的 plugin：
   - `testany-eng` - 研发流程（BRD/PRD/HLD）
   - `testany-llm` - AI 工具（Skill/Prompt）
   - `testany-mrkt` - 营销内容（自媒体）
4. 选择 `Install now`

## 使用

安装后，可以通过 `/` 命令调用：

```
/testany-eng:prd-writer 写一个用户登录功能的 PRD
/testany-eng:prd-reviewer ./docs/prd-login.md
/testany-llm:prompt-optimizer 帮我优化这个提示词...
/testany-mrkt:media-writer 写一篇关于 AI 的公众号文章
```

## 更新

```
/plugin marketplace remove testany-eng
/plugin marketplace add TestAny-io/testany-agent-skills
```

# 包含的 Skills

## testany-eng（研发流程）

| 命令 | 描述 |
|------|------|
| `/testany-eng:brd-interviewer` | 业务需求访谈专家，通过选择题引导 stakeholder 输出结构化 BRD |
| `/testany-eng:uc-interviewer` | 用户旅程访谈专家，在 BRD 和 PRD 之间建立对齐检查点 |
| `/testany-eng:prd-writer` | PRD 写作技能，支持多种类型：新功能、第三方集成、重构、优化 |
| `/testany-eng:prd-reviewer` | PRD 审查专家，作为「准出门禁」从多角色视角全面审查 |
| `/testany-eng:prd-studio` | PRD 全自动工作室，自动完成写→审→改→审循环，无需人工干预 |
| `/testany-eng:api-writer` | API 契约撰写助手，支持 9 种协议，PRD→Contract 100% 覆盖检查 |
| `/testany-eng:api-reviewer` | API 契约评审门禁，检查完整性/一致性/兼容性 |
| `/testany-eng:guardrails-writer` | 工程规范编写助手，产出项目级 Guardrails |
| `/testany-eng:guardrails-reviewer` | 工程规范审查门禁，检查覆盖性与可执行性 |
| `/testany-eng:hld-writer` | HLD 写作技能，基于 PRD + API Contract 做技术决策 |
| `/testany-eng:hld-reviewer` | HLD 审查专家，模拟 Design Review 会议，重点检测 PRD→HLD 漂移 |
| `/testany-eng:runbook-writer` | 运维手册（Runbook）编写协调器，基于 HLD/LLD 产出生产就绪的运维手册 |

## testany-llm（AI/LLM 工具）

| 命令 | 描述 |
|------|------|
| `/testany-llm:skill-creator` | Skill 创建指南，帮助创建和优化 Claude Code Skills |
| `/testany-llm:prompt-optimizer` | AI 提示词优化专家，支持 Claude、ChatGPT、DeepSeek、豆包、智谱、Gemini 等多平台 |

## testany-mrkt（营销内容）

| 命令 | 描述 |
|------|------|
| `/testany-mrkt:media-writer` | 自媒体内容创作工作流，支持公众号、知乎、小红书、LinkedIn、Medium、Reddit |

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

更多详情请使用 `/testany-llm:skill-creator`，或参考 [skill-authoring.md](./plugins/testany-llm/skills/skill-creator/references/skill-authoring.md)。

# 许可证

MIT License - 详见 [LICENSE](LICENSE)

# 联系方式

- Email: engineering@testany.io
- Website: https://testany.io
