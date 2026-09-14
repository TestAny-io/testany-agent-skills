# CLAUDE.md

为 Claude Code 在本仓库工作提供全局约束；具体业务流程由本次任务适用的 skill 决定。

## 仓库与编辑边界

Testany Agent Skills 按领域聚合 plugin（testany-eng / testany-llm / testany-mrkt / testany-bot）。
技能位于 `plugins/<plugin>/skills/<skill>/SKILL.md`，slash 入口位于对应 `commands/`。
先读取本次相关材料和当前差异，保留已有未提交修改。只改用户目标涉及的范围，不因普通编辑自动启动完整研发流程、安装、发布或远程操作。

## Skill 规范

- 英文 kebab-case 命名；必须有 SKILL.md，根文件少于 500 行，包含使用示例。
- Frontmatter 包含 name 与带实际触发词/适用范围的 description；不要把局部任务扩大为整个工作流。
- 维护指令默认中文，技术术语可保留英文；工件输出语言遵循具体 skill 与用户要求。
- 根文件保留关键决策、授权边界和完成标准；细节按需放 references/scripts/assets，并保留明确读取条件。
- 脚本/引用按实际安装位置解析；只依赖当前存在的工具能力，不假设旧 skill-creator 脚本或宿主专用工具必然存在。
- 完成声明必须有实际证据；生成、静态检查、远程配置读回、执行终态与正式批准不能互相代替。

## 发现与文档不变量

- 根 README 与各 plugin README 是对外事实源；marketplace、默认组件约定及存在时的 plugin.json 是发现事实源。
- 同一领域新增 skill 不新增 marketplace plugin；新增/删除/重命名时同步相关入口、README、发现配置与 CHANGELOG。
- Plugin version 只能有一个 authority；同一 marketplace 内可复用 symlink，但 dangling 或越出 marketplace root 必须 fail closed。
- 修改或审查 manifest、组件发现路径、symlink、skill 增删改名，或准备安装/发布时，先读 [发现与发布维护](docs/plugin-development.md)，保留 strict/合并/路径/版本语义。
- 普通局部编辑只执行相关本地验证，不强制读完整发布手册，不自动改版本、安装、提交或推送。

## 输出位置

根 `/output/` 只放本机临时交付物并保持 Git ignored；可复用资产放对应 skill 的 assets，可复现样本进入相关 tests/references。
