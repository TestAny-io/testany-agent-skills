# Testany Agent Skills

Skills 是包含指令、脚本和资源的文件夹，Claude 可以动态加载它们以提升特定任务的表现。Skills 教会 Claude 以可重复的方式完成特定任务，无论是按照公司规范撰写文档、使用特定工作流分析数据，还是自动化日常任务。

更多信息请参考：
- [What are skills?](https://support.anthropic.com/en/articles/12512176-what-are-skills)
- [Using skills in Claude](https://support.anthropic.com/en/articles/12512180-using-skills-in-claude)
- [How to create custom skills](https://support.anthropic.com/en/articles/12512198-creating-custom-skills)

# 关于本仓库

维护 skill 或安装发现配置时，按任务范围使用 [开发与发布约定](docs/plugin-development.md)；普通局部编辑不自动安装、发布或改版本。

本仓库包含 Testany 公司内部使用的 Agent Skills，覆盖产品研发流程中的各类专业场景。Skills 按领域分为多个 Plugin：

| Plugin | 领域 | 命令 |
|--------|------|------|
| **testany-eng** | 研发流程 | `/testany-eng:guide`, `/testany-eng:brd-interviewer`, `/testany-eng:uc-interviewer`, `/testany-eng:prd-writer`, `/testany-eng:prd-reviewer`, `/testany-eng:prototype-designer`, `/testany-eng:prototype-reviewer`, `/testany-eng:api-writer`, `/testany-eng:api-reviewer`, `/testany-eng:guardrails-writer`, `/testany-eng:guardrails-reviewer`, `/testany-eng:hld-writer`, `/testany-eng:hld-reviewer`, `/testany-eng:test-strategy-writer`, `/testany-eng:test-strategy-reviewer`, `/testany-eng:lld-writer`, `/testany-eng:lld-reviewer`, `/testany-eng:code-reviewer`, `/testany-eng:test-spec-writer`, `/testany-eng:test-reviewer`, `/testany-eng:runbook-writer` |
| **testany-llm** | AI/LLM 工具 | `/testany-llm:prompt-optimizer` |
| **testany-mrkt** | 营销内容 | `/testany-mrkt:media-writer` |
| **testany-bot** | 测试平台（通用版，按宿主能力适配） | `/testany-bot:case`, `/testany-bot:case-writing`, `/testany-bot:pipeline`, `/testany-bot:execution`, `/testany-bot:debug`, `/testany-bot:trigger`, `/testany-bot:workspace` |

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
│   ├── testany-mrkt/          # 营销内容工具集
│   │   ├── commands/
│   │   └── skills/
│   └── testany-bot/           # Testany 测试平台（通用版，交互原语按宿主能力适配）
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
   - `testany-eng` - 研发流程（BRD/UC/PRD/Prototype/API/Guardrails/HLD/LLD/Code Review/Test/Runbook）
   - `testany-llm` - AI 工具（Prompt 优化）
   - `testany-mrkt` - 营销内容（自媒体）
   - `testany-bot` - 测试平台（通用版，按宿主能力适配）
4. 选择 `Install now`

## 使用

安装后，可以通过 `/` 命令调用：

```
/testany-eng:prd-writer 写一个用户登录功能的 PRD
/testany-eng:guide 帮我扫一下这个项目下一步该做什么
/testany-eng:prd-reviewer ./docs/prd-login.md
/testany-eng:code-reviewer . main abc123 ./docs/LLD-login.md
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

`testany-eng` 默认跟随用户输入语言输出；用户显式指定语言时以用户指定为准；`TRACEABILITY-METADATA` 的字段名、枚举值与稳定 ID 保持英文。

正式新功能按完整流程推进；存量系统有限修复按问题层级进入 HLD/LLD/Code，不强制重做全链文档。四个相关 skill 共用 [评审边界规则](plugins/testany-eng/references/review-boundaries.md)：技术合理性、设计授权与执行许可分离，技术理由不能自授权，旧 review comment 不能循环变成批准基线。P2 在 HLD/LLD/Code Review 中均不阻断。

| 命令 | 描述 |
|------|------|
| `/testany-eng:guide` | 按正式设计、有限修复、实现对象及决策层级分流，核实批准来源，推荐最小下一步 |
| `/testany-eng:brd-interviewer` | 按材料选择访谈、直接整理或缺口补问；区分实测、估算、测量计划和离散验收，草稿与批准分开 |
| `/testany-eng:uc-interviewer` | 复用已知流程，仅补问未决分支，产出带 metadata、步骤级边界和真实 checkpoint 的 User Journey |
| `/testany-eng:prd-writer` | PRD 写作技能，支持多种类型：新功能、第三方集成、重构、优化 |
| `/testany-eng:prd-reviewer` | PRD 审查专家，作为「准出门禁」从多角色视角全面审查 |
| `/testany-eng:prototype-designer` | 交互原型设计助手，在前端仓库中基于 PRD + User Journey 生成可交互原型 |
| `/testany-eng:prototype-reviewer` | 原型评审门禁，检查上游对齐、交互完整性、工程隔离与下游输入质量 |
| `/testany-eng:api-writer` | API 契约撰写助手，支持 9 种协议，PRD→Contract 100% 覆盖检查 |
| `/testany-eng:api-reviewer` | API 契约评审门禁，检查完整性/一致性/兼容性 |
| `/testany-eng:guardrails-writer` | 工程规范编写助手，产出项目级 Guardrails |
| `/testany-eng:guardrails-reviewer` | 工程规范审查门禁，检查覆盖性与可执行性 |
| `/testany-eng:hld-writer` | HLD 写作技能，基于 PRD + API Contract 做技术决策 |
| `/testany-eng:hld-reviewer` | 正式 HLD / 架构增量评审，检查职责、信任、依赖及失败边界；技术建议不代替授权 |
| `/testany-eng:test-strategy-writer` | 测试策略写作助手，基于 PRD/API/HLD 定义测试方法、分层、环境与门禁 |
| `/testany-eng:test-strategy-reviewer` | 测试策略评审门禁，检查风险覆盖、分层、环境和入口/出口标准 |
| `/testany-eng:lld-writer` | LLD 写作技能，将 HLD 和 Contract 细化为可实现的详细设计 |
| `/testany-eng:lld-reviewer` | 正式 LLD / 已批准范围内有限工程设计评审；局部修复不强制全套 Manifest |
| `/testany-eng:code-reviewer` | 可溯源批准范围内的源码评审：核验生产语义、管理入口及整改整链；保留有限漏审规则，拒绝循环自证授权 |
| `/testany-eng:test-spec-writer` | 测试规格与测试用例包写作助手，输出完整 test case package |
| `/testany-eng:test-reviewer` | 测试评审门禁，检查测试包覆盖、证据与残余风险 |
| `/testany-eng:runbook-writer` | 运维手册（Runbook）编写协调器，基于 HLD/LLD 产出生产就绪的运维手册 |

## testany-llm（AI/LLM 工具）

| 命令 | 描述 |
|------|------|
| `/testany-llm:prompt-optimizer` | 先保留任务与调用方输出契约，不按模型品牌强制格式；有限自查后交付，不要求完整内部思维链 |

## testany-mrkt（营销内容）

| 命令 | 描述 |
|------|------|
| `/testany-mrkt:media-writer` | 多平台写作，按请求连续完成、停在指定检查点或仅做单阶段；不默认发布 |

## testany-bot（测试平台 - 通用版）

通用版，适用于 VS Code Copilot、GitHub Copilot、Claude Code 等 AI 平台。Skill 格式与 MCP workflow 跨平台复用；结构化问答与 slash command 会按宿主能力自动适配。需要配置 Testany MCP Server。

| 命令 | 描述 |
|------|------|
| `/testany-bot:case` | Platform Case 注册与管理 - 注册 case package、更新 metadata、上传脚本、管理生命周期 |
| `/testany-bot:case-writing` | Platform Case 编写 - 将传统测试场景拆解为 Testany platform cases，并生成可注册 case packages |
| `/testany-bot:pipeline` | 流水线编排 - 基于 decomposition 或 case keys 创建 Pipeline，配置依赖、Relay 和分支 |
| `/testany-bot:execution` | Execution 管理 - 查看进度、查历史、刷新状态、取消未开始执行 |
| `/testany-bot:debug` | 故障诊断 - 分析失败原因，查看日志 |
| `/testany-bot:trigger` | 测试触发 - 为 Pipeline 配置 Plan、Manual Trigger、Gatekeeper，或立即执行一次 |
| `/testany-bot:workspace` | 工作空间管理 - 成员管理、权限配置 |

# 创建自定义 Skill

本轮模型适配的已测范围、已知限制与本地测试入口见 [GPT-6 适配验证摘要](docs/gpt6-adaptation-validation.md)。源码合入不等于所有模型或宿主已通过验收，也不自动刷新已安装插件缓存。

Skill 的创建很简单 - 只需一个包含 `SKILL.md` 文件的文件夹。`SKILL.md` 包含 YAML frontmatter 和 Markdown 指令：

```markdown
---
name: my-skill-name
description: 清晰描述这个 skill 做什么，以及什么时候应该使用它
---

# My Skill Name

[在这里添加 Claude 执行此 skill 时需要遵循的指令]
```

Frontmatter 必须包含两个基础字段（不表示只允许这两个字段）：
- `name` - skill 的唯一标识符（小写，用连字符分隔）
- `description` - 完整描述 skill 的功能和使用场景

可选字段及宿主扩展使用[分层 frontmatter 检查](docs/plugin-development.md#frontmatter-校验范围)：`python3 plugins/testany-eng/scripts/validate_codex_compat.py --profile repository --format json`。公共字段与 Claude 参数提示/Stop hook 分开验证和报告；严格公共字段检查使用 `--profile portable`。不要把通用 quick validator 的窄白名单当成所有宿主的 schema，也不要把静态通过当成已安装运行。

本仓库当前不再内置 `skill-creator` scaffolding/打包工具。新增或维护 skill 时，请直接创建或编辑对应 plugin 下的 `SKILL.md` 与配套 `references/`、`assets/`、`scripts/`，并同步更新 `README`、`marketplace.json`、plugin `plugin.json` 和 `CHANGELOG.md`。

# 许可证

MIT License - 详见 [LICENSE](LICENSE)

# 联系方式

- Email: engineering@testany.io
- Website: https://testany.io
