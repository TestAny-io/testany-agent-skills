# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 仓库概述

Testany 公司的 Agent Skills 集合，为 Codex 提供产品研发流程中的专业技能。仓库按领域聚合 plugin（例如 `testany-eng`）；每个 plugin 可在自己的 `skills/` 目录中包含多个 skill。每个 skill 至少包含 `SKILL.md`，并可按需附带 `references/`、`scripts/`、`assets/`、`agents/` 等资源。

## 开发方式

当前仓库已不再内置 `skill-creator` 初始化 / 校验 / 打包脚本。

- 新增或维护 skill 时，直接在对应 plugin 下编辑 `skills/<skill-name>/SKILL.md`
- 如需暴露 slash command，同步维护对应 plugin 的 `commands/`
- 发布前同步更新根目录 `README.md`、`.claude-plugin/marketplace.json`、plugin 级 `README.md` / `.claude-plugin/plugin.json` 与 `CHANGELOG.md`

## 架构

```
.claude-plugin/marketplace.json    # 插件注册与发现层描述
plugins/
├── testany-eng/                   # 研发流程聚合 plugin
│   ├── .claude-plugin/plugin.json # 本仓库保留的 plugin 元数据；宿主允许省略
│   ├── skills/<skill-name>/      # 同一领域内的多个 skill
│   └── commands/                  # 可选 slash command 入口
├── testany-llm/                   # AI/LLM 聚合 plugin
├── testany-mrkt/                  # 营销内容聚合 plugin
└── testany-bot/                   # Testany 测试平台聚合 plugin
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

## Plugin 注册与 Skill 发现

`.claude-plugin/marketplace.json` 按领域注册聚合 plugin，`source` 指向对应的 `plugins/<plugin-name>`：

```json
{
  "plugins": [
    {
      "name": "testany-eng",
      "description": "研发流程与导航工具集……",
      "source": "./plugins/testany-eng"
    }
  ]
}
```

Claude Code 会自动发现 plugin 根目录 `skills/<skill-name>/SKILL.md`；`plugin.json` 本身在上游规范中可选，本仓库为版本、描述和明确组件配置而保留。`plugin.json.skills` 通常在默认 `skills/` 之外**追加**发现范围；marketplace entry 在默认 `strict: true` 下可继续补充并合并组件。`strict: false` 时 marketplace entry 是完整组件 authority，若 `plugin.json` 同时声明组件则冲突并 fail closed。只有当 marketplace entry 的 `source` 解析到 marketplace root，且该 entry 自身 `skills` 列出实际存在的特定子目录时，这些路径才按官方例外成为完整集合；列 `./skills/`/plugin root 保持全量扫描，全部列出路径均不存在时回退默认扫描。一旦显式声明，路径必须是 `.`（plugin root）或以 `./` 开头的非空相对路径/路径数组，`null` 不是“未声明”。同一 marketplace 内可用 symlink 复用 skill/resource；dangling target 或越出 marketplace root 的 target 必须 fail closed。`commands` 等其他组件遵循各自合并规则。在既有领域中新增 skill 时，应增加 `skills/<skill-name>/`，而不是新增 marketplace plugin；只有新建独立领域级 plugin 时才增加 marketplace 条目。上游规则见 [Claude Code Plugins reference](https://code.claude.com/docs/en/plugins-reference) 与 [Plugin marketplace strict mode](https://code.claude.com/docs/en/plugin-marketplaces#strict-mode)。

Plugin version 只能保留一个 authority，三选一：仅在 marketplace entry 声明、仅在 `plugin.json` 声明，或两处都省略并使用 source resolved version；绝不能同时在 marketplace entry 与 `plugin.json` 声明。显式版本每次发布必须递增，否则安装端会继续复用旧 cache。

## 文档维护

- 以仓库根目录 `README.md` 与各 plugin README 为对外说明事实源
- 以 `.claude-plugin/marketplace.json`、plugin 根目录默认组件约定和存在时的 `plugin.json` 为安装发现层事实源
- 新增、删除或重命名 skill 后，必须同步更新上述文档与 `CHANGELOG.md`
- 根目录 `/output/` 只放本机生成的临时交付物并保持 Git ignored；可复用资产进入对应 skill 的 `assets/`，可复现测试样本进入该 skill 的 tests/references
