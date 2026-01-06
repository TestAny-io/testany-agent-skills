# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库概述

Testany 公司的 Agent Skills 集合，为 Claude Code 提供产品研发流程中的专业技能。每个 skill 是独立的 plugin，包含 SKILL.md 和可选的 references/、scripts/、assets/ 资源。

## 开发命令

### 初始化新 Skill
```bash
python skills/skill-creator/scripts/init_skill.py <skill-name>
# 默认输出到 skills/ 目录
```

### 验证 Skill 格式
```bash
python skills/skill-creator/scripts/quick_validate.py skills/<skill-name>
```

### 打包 Skill
```bash
python skills/skill-creator/scripts/package_skill.py skills/<skill-name>
```

## 架构

```
.claude-plugin/marketplace.json    # 插件注册，每个 skill 独立为一个 plugin
skills/
├── prd-writer/                    # PRD 写作（5 个模板在 references/）
├── skill-creator/                 # Skill 创建指南 + 3 个 Python 工具
└── prompt-optimizer/              # 提示词优化（6 平台适配）
spec/                              # Agent Skills 规范文档
```

## Skill 编写规范

| 规范项 | 要求 |
|--------|------|
| 命名 | 英文 kebab-case |
| 必须文件 | SKILL.md |
| 行数限制 | < 500 行 |
| 语言 | 中文（技术术语可保留英文） |
| Frontmatter | 必须包含触发词 |
| 示例 | 必须有使用示例 |

## marketplace.json 结构

每个 skill 作为独立 plugin 注册，确保用户浏览时能看到各 skill 的描述：

```json
{
  "plugins": [
    {
      "name": "skill-name",
      "description": "触发词1、触发词2。功能描述。",
      "skills": ["./skills/skill-name"]
    }
  ]
}
```

## 规范文档

详细规范见 `spec/` 目录：
- `agent-skills-spec.md` - 规范总览
- `skill-authoring.md` - 编写指南
- `skill-client-integration.md` - 客户端集成
