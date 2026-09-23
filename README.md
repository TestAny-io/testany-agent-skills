# Testany Agent Skills

**把需求、设计、评审、内容创作与测试中的工作方法，交给你的 AI Agent。**

[Testany](https://testany.io) 出品的开源工具集：四组按领域组织的 plugin / skills，以及用于管理 Codex 本机技能的 **SkillDock** 图形应用。每个插件独立安装，按你要做的事选择。

[English](README.en.md) · [选择插件](#选择适合你的插件) · [SkillDock 界面与安装](plugins/skilldock/README.md) · [交流与反馈](#交流与反馈) · [了解 Testany](https://testany.io)

## 选择适合你的插件

| 你想做什么 | Plugin | 从这里开始 |
| --- | --- | --- |
| 把业务想法推进到需求、设计、评审、测试与交付准备 | **[testany-eng](plugins/testany-eng/README.md)** | 从 `guide` 判断下一步，或直接使用 21 个研发 skills 中的一项 |
| 改写和优化提示词 | **[testany-llm](plugins/testany-llm/README.md)** | 把原提示词和目标交给 `prompt-optimizer` |
| 创作多平台营销内容 | **[testany-mrkt](plugins/testany-mrkt/README.md)** | 用 `media-writer` 说明受众、平台和写作目标 |
| 在 Testany 上编写、编排、执行和诊断测试 | **[testany-bot](plugins/testany-bot/README.md)** | 连接 Testany MCP，按用例、流水线或执行结果选择入口 |
| 在图形界面中整理、安装和更新 Codex skills / plugins | **[SkillDock](plugins/skilldock/README.md)** | 安装独立 `skilldock` 插件，用 `$skill-manager` 打开面板 |

研发、AI、营销与测试插件的命令和说明见下方[技能目录](#包含的-skills)。SkillDock 当前面向 macOS 上的 Codex；其他插件的宿主能力与前置条件见各自 README。

## 在 Codex 中使用领域插件

可以让 Codex 从本仓库安装你选中的插件，以研发工具集为例：

```text
请从 https://github.com/TestAny-io/testany-agent-skills 安装 testany-eng 插件，确认安装并启用成功。
```

安装后，在新任务中用 `$guide 帮我判断这个项目下一步该做什么` 开始。安装其他领域插件时，把请求中的插件名换成 `testany-llm`、`testany-mrkt` 或 `testany-bot`，然后按其 README 使用对应 skill。若 CLI 不可用，沿用下方 [CLI 发现与回退说明](#在-codex-中使用-skilldock)，但安装目标仍是你选择的领域插件。

## 在 Claude Code 中使用

### 安装

在 Claude Code 对话中添加本仓库，然后安装你需要的一组插件。下面以研发工具集为例：

```text
/plugin marketplace add TestAny-io/testany-agent-skills
/plugin install testany-eng@testany-agent-skills
```

把第二行中的 `testany-eng` 换成 `testany-llm`、`testany-mrkt` 或 `testany-bot` 即可分别安装。也可以打开 `/plugin`，在 Discover 中选择本 marketplace 的插件。添加 marketplace 只添加目录，不会自动安装所有插件。

### 使用

```text
/testany-eng:guide 帮我扫一下这个项目下一步该做什么
/testany-eng:prd-writer 写一个用户登录功能的 PRD
/testany-eng:prd-reviewer ./docs/prd-login.md
/testany-eng:code-reviewer . main abc123 ./docs/LLD-login.md
/testany-llm:prompt-optimizer 帮我优化这个提示词...
/testany-mrkt:media-writer 写一篇关于 AI 的公众号文章
```

`testany-bot` 的平台操作需要先配置 [Testany MCP 及访问权限](plugins/testany-bot/README.md#前置要求)。

### 更新

在终端中刷新 marketplace，再更新指定插件；以默认 user 安装范围的研发插件为例：

```bash
claude plugin marketplace update testany-agent-skills
claude plugin update testany-eng@testany-agent-skills
```

其他插件替换插件名即可；使用 project 或 local 安装范围时，为第二条命令添加对应的 `--scope project` 或 `--scope local`。回到已打开的 Claude Code 对话后运行 `/reload-plugins`，或新建会话加载更新。[Claude Code 官方插件说明](https://code.claude.com/docs/en/plugins-reference#plugin-update)。

## 在 Codex 中使用 SkillDock

查看 [SkillDock 产品页与界面](plugins/skilldock/README.md)，了解标签筛选、同名技能管理、更新 diff 与自动更新。

**安装 `skilldock` 只会添加一个 SkillDock 应用入口，不会安装 testany-eng 的研发 skills。** 当前版本为 SkillDock 0.4.2，自 0.2.0 起独立分发；旧版 testany-eng 2.4.0 所带的 SkillDock 0.1.0 用户请按下方迁移说明接续数据。

无需用户手动 clone。可以在 Codex 中提出：

> 请从 https://github.com/TestAny-io/testany-agent-skills 安装独立的 SkillDock 插件，并打开技能管理面板。

安装需要 Git 和支持 plugin 管理的 Codex CLI。macOS 用户无需预装 Node.js/npm，应用启动器会自动选择或准备运行环境。

<details>
<summary>手动安装、CLI 回退与启动目录排查</summary>

先运行 `codex --version` 和 `codex plugin --help`。仅 `command -v codex` 成功不能证明 CLI 可用：旧 npm wrapper 可能已经损坏。如果 PATH 命令失败或没有 plugin 管理能力，依次检查以下位置的真实可执行文件，并对每个候选执行相同的版本和能力检查：

- `/Applications/ChatGPT.app/Contents/Resources/codex`
- `/Applications/Codex.app/Contents/Resources/codex`
- 用户 `~/Applications` 下对应应用的 `Contents/Resources/codex`
- `${CODEX_HOME:-$HOME/.codex}/plugins/.plugin-appserver/codex`

应用内位置是经过实测的发现候选，不是所有客户端都保证提供的固定接口；应用装在其他位置时使用其实际路径。不要修改旧 wrapper、全局 Node、shell 配置或应用签名。确认后把绝对路径保存在 `CODEX_CLI`，打印最终路径与版本，并在整个安装过程中使用同一个文件：

```bash
# 替换为上一步实际验证通过的路径
CODEX_CLI="/Applications/ChatGPT.app/Contents/Resources/codex"
printf 'Using Codex CLI: %s\n' "$CODEX_CLI"
"$CODEX_CLI" --version
"$CODEX_CLI" plugin marketplace add TestAny-io/testany-agent-skills
"$CODEX_CLI" plugin add skilldock@testany-agent-skills
```

已有源码目录时，可以让依赖无关的启动引导自动完成候选验证，输出最终 CLI 路径：

```bash
CODEX_CLI="$(/bin/sh plugins/skilldock/skills/skill-manager/scripts/launch.sh cli --print-path)"
```

从本地 clone 安装时，在仓库根目录把 marketplace add 的来源替换成 `.`；clone 或添加 marketplace 都不代表插件已安装。安装后读回 `plugin list --marketplace testany-agent-skills --json`，确认 skilldock 已启用且仅含 `skill-manager`。已添加同名来源时先核对来源，无需重复添加。

新建 Codex 任务，用 `$skill-manager 打开技能管理面板` 打开。启动前先确定用户要扫描的项目绝对路径，不能把下载目录或 skill 安装目录误当用户项目：

```bash
/bin/sh "/实际安装位置/skill-manager/scripts/launch.sh" start --project "/用户项目的绝对路径"
```

核对启动输出中的请求目录、最终扫描目录和 CLI 路径，再把返回 URL 打开在 Codex 右侧浏览器面板。界面“当前项目”旁的“切换项目”可以修改扫描范围。中断启动调用不一定会停止后台服务；用同一启动入口的 `status` 核实，只有 `stop` 确认结束才表示服务已停止。

</details>

安装后，新建 Codex 任务，输入 `$skill-manager 打开技能管理面板`。在 Codex 右侧浏览器中确认“当前项目”，再开始管理。

<details>
<summary>如何更新与设置自动更新</summary>

GitHub 来源更新：先执行 `"$CODEX_CLI" plugin marketplace upgrade testany-agent-skills`，再执行 `"$CODEX_CLI" plugin add skilldock@testany-agent-skills`。本地来源先自行更新 clone，再刷新安装副本；定时计划不会替用户执行本地仓库的 `git pull`。

在应用的“更新”页面，将独立的 `skilldock` 插件加入计划，启用计划和“自动应用”。自 0.4.0 起，macOS 会按需启动更新任务并在完成后退出，SkillDock 网页服务和 Codex 无需打开；重启并登录后自动恢复。睡眠或离线错过的检查补做一次，失败退避重试；系统每五分钟判断是否到期。自身更新后，下次任务使用新版；已经打开的网页服务会自动重启、重连。旧版已开启的计划在新版首次启动时迁移，更新后的自动重启也会完成迁移；只有插件文件已更新、应用尚未运行过新版时，才需手动启动一次。系统禁用后台运行时，更新页会明确提示。

</details>

### 从旧版 testany-eng 迁移

<details>
<summary>仅适用于曾随 testany-eng 2.4.0 安装 SkillDock 0.1.0 的用户</summary>

安装独立 skilldock 后，用其实际安装路径启动，并加 `--migrate-from testany-eng`。启动器仅允许接续同一 Codex 根、同一 testany-agent-skills marketplace 中旧 testany-eng 的 SkillDock 数据；保留计划、历史和来源记录，构建成功后才替换运行实例。

```bash
/bin/sh "/独立skilldock安装位置/skills/skill-manager/scripts/launch.sh" start --project "/用户项目的绝对路径" --migrate-from testany-eng
```

更新 testany-eng 到 2.4.1 后旧的 SkillDock skill 会移除，其余 21 个研发 skills 保留。若已授权升级旧工具集，可刷新其安装副本；不要为了迁移而自动卸载整套工具集。两个旧新副本同时存在时，使用独立 skilldock 的实际路径打开。

**这次拆包需要一次显式迁移，等待旧版定时更新不会自动完成迁移。** 原更新计划对 testany-eng 的选择保持原意；迁移后需将新 `skilldock` 插件加入计划，并启用计划和“自动应用”。旧版用户可以直接在 Codex 中提出：

> 请按 https://github.com/TestAny-io/testany-agent-skills 的 README，把 testany-eng 2.4.0 内的 SkillDock 迁移到独立 skilldock 插件，保留现有计划、历史和来源记录，打开面板，并将新 skilldock 加入原更新计划、启用定时检查和自动应用。保留原计划的周期与其他目标，不卸载研发工具集。

</details>

详见 [SkillDock 使用说明](plugins/skilldock/skills/skill-manager/assets/app/README.md)。本次采用 Git 仓库分发，官方目录上架留待后续。

## 包含的 Skills

### testany-eng（研发流程）

[插件说明与工作流](plugins/testany-eng/README.md) · 21 个研发 skills

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

### testany-llm（AI/LLM 工具）

[插件说明](plugins/testany-llm/README.md)

| 命令 | 描述 |
|------|------|
| `/testany-llm:prompt-optimizer` | 先保留任务与调用方输出契约，不按模型品牌强制格式；有限自查后交付，不要求完整内部思维链 |

### testany-mrkt（营销内容）

[插件说明](plugins/testany-mrkt/README.md)

| 命令 | 描述 |
|------|------|
| `/testany-mrkt:media-writer` | 多平台写作，按请求连续完成、停在指定检查点或仅做单阶段；不默认发布 |

### testany-bot（测试平台 - 通用版）

[插件说明与连接要求](plugins/testany-bot/README.md) · [Testany MCP](https://github.com/TestAny-io/testany-mcp)

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

## 交流与反馈

中文和 English 都欢迎。不必写完整报告：告诉我们你想完成什么、卡在哪一步，就能开始交流。

- **使用疑问、安装求助** → [Discussions · Q&A](https://github.com/TestAny-io/testany-agent-skills/discussions/categories/q-a)
- **功能建议、试用感受** → [Discussions · Ideas](https://github.com/TestAny-io/testany-agent-skills/discussions/categories/ideas)
- **分享工作流与成果** → [Discussions · Show and tell](https://github.com/TestAny-io/testany-agent-skills/discussions/categories/show-and-tell)
- **可复现的故障** → [提交 Bug](https://github.com/TestAny-io/testany-agent-skills/issues/new?template=bug-report.yml)

试用 SkillDock 后，我们尤其想知道：是否顺利安装并打开、哪项管理功能最有用、哪一步最困惑。其他 plugin / skills 的体验同样欢迎。需要附哪些信息，见[反馈指南](.github/SUPPORT.md)。

## 认识 Testany

[Testany](https://testany.io) 面向人类测试人员与 AI 测试 Agent，围绕测试编排、执行与结果反馈构建协作平台。这些开源工具来自我们自己的研发与使用场景。

如果你希望把测试工作接到平台上，可以继续了解 [Testany 产品](https://testany.io)、[使用文档](https://docs.testany.io) 和 [testany-bot](plugins/testany-bot/README.md)；也可以通过 [engineering@testany.io](mailto:engineering@testany.io) 联系团队。

## 关于本仓库

Skills 是包含指令、脚本和资源的文件夹，Agent 可以按需加载它们来完成特定任务。维护本仓库的 skill 或安装发现配置时，按任务范围使用[开发与发布约定](docs/plugin-development.md)；普通局部编辑不自动安装、发布或改版本。

<a id="仓库结构"></a>

<details>
<summary>仓库结构</summary>

```
testany-agent-skills/
├── plugins/                    # 按领域分组的 Plugins
│   ├── testany-eng/           # 研发流程工具集
│   │   ├── commands/          # CLI 命令（/testany-eng:xxx）
│   │   └── skills/            # 完整实现
│   ├── skilldock/             # 独立 Codex 技能管理应用
│   │   └── skills/skill-manager/
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

</details>

## 创建自定义 Skill

本轮模型适配的已测范围、已知限制与本地测试入口见 [GPT-6 适配验证摘要](docs/gpt6-adaptation-validation.md)。源码合入不等于所有模型或宿主已通过验收，也不自动刷新已安装插件缓存。

Skill 的创建很简单 - 只需一个包含 `SKILL.md` 文件的文件夹。`SKILL.md` 包含 YAML frontmatter 和 Markdown 指令：

```markdown
---
name: my-skill-name
description: 清晰描述这个 skill 做什么，以及什么时候应该使用它
---

# My Skill Name

[在这里添加 Agent 执行此 skill 时需要遵循的指令]
```

Frontmatter 必须包含两个基础字段（不表示只允许这两个字段）：

- `name` - skill 的唯一标识符（小写，用连字符分隔）
- `description` - 完整描述 skill 的功能和使用场景

可选字段及宿主扩展使用[分层 frontmatter 检查](docs/plugin-development.md#frontmatter-校验范围)：`python3 plugins/testany-eng/scripts/validate_codex_compat.py --profile repository --format json`。公共字段与 Claude 参数提示/Stop hook 分开验证和报告；严格公共字段检查使用 `--profile portable`。不要把通用 quick validator 的窄白名单当成所有宿主的 schema，也不要把静态通过当成已安装运行。

本仓库当前不再内置 `skill-creator` scaffolding/打包工具。新增或维护 skill 时，请直接创建或编辑对应 plugin 下的 `SKILL.md` 与配套 `references/`、`assets/`、`scripts/`，并同步更新 `README`、`marketplace.json`、plugin `plugin.json` 和 `CHANGELOG.md`。

了解 Skills：[Agent Skills 规范](https://agentskills.io/specification) · [在 Claude 中使用 Skills](https://support.anthropic.com/en/articles/12512180-using-skills-in-claude) · [创建自定义 Skills](https://support.anthropic.com/en/articles/12512198-creating-custom-skills)。

## 许可证

本仓库默认采用 [MIT License](LICENSE)。例外：`plugins/skilldock/` 下的 SkillDock 自有软件、启动器、测试和文档采用 [GNU AGPL v3，仅第 3 版](plugins/skilldock/skills/skill-manager/LICENSE)（`AGPL-3.0-only`）；第三方依赖保留各自的许可证和版权声明，详见 [SkillDock 许可与第三方声明](plugins/skilldock/skills/skill-manager/THIRD_PARTY_NOTICES.md)。其他现有 skills 的 MIT 许可不变，已按 MIT 合法取得的历史版本授权不追溯撤销。

## 联系方式

- 社区：[GitHub Discussions](https://github.com/TestAny-io/testany-agent-skills/discussions)
- Email：[engineering@testany.io](mailto:engineering@testany.io)
- Website：[testany.io](https://testany.io)
