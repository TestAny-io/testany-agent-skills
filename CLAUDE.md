# CLAUDE.md

为 Claude Code 在本仓库工作提供全局约束；具体业务流程由本次任务适用的 skill 决定。

## 仓库与编辑边界

Testany Agent Skills 按领域聚合 plugin（testany-eng / testany-llm / testany-mrkt / testany-bot）。
技能位于 `plugins/<plugin>/skills/<skill>/SKILL.md`，slash 入口位于对应 `commands/`。
先读取本次相关材料和当前差异，保留已有未提交修改。只改用户目标涉及的范围，不因普通编辑自动启动完整研发流程、安装、发布或远程操作。

## Main 即发布

- **本仓库任何内容合并到远程 `main` 就是发布**，包括 skill、应用、文档、资源和仓库规则；不能把合并称为“仅源码更新”而把发布准备留到之后，也不以创建 tag、GitHub Release 或完成安装为发布前提。
- 用户授权合并 `main` 时，已包含该次仓库发布；合并前必须完成受影响插件的版本递增、README/CHANGELOG 同步和相关验证，不再为这些必要步骤重复索要发布许可。
- 以最新远程 `main` 为基线识别受影响插件；随包内容、发现配置或运行行为发生变化时，插件版本必须高于该基线。仅改插件内 README、图片等也要升版；多个插件受影响时分别处理，保持各自单一版本 authority。
- 根级规则、说明或测试同样随 `main` 发布，记录本轮变更；按实际影响判断是否需要同步插件版本，不为未受影响的插件空升版本。版本增量及完整检查顺序见 [发现与发布维护](docs/plugin-development.md#main-即发布)。
- 合并后读回 PR、远程 `main` 提交和受影响插件版本，再声明发布完成。发布不等于用户本机已安装或缓存已刷新。

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
- 仅本地或功能分支编辑时执行相关验证，不因此自动安装、提交、推送或合并；准备合并 `main` 时必须执行上述发布规则，不能沿用“普通编辑不升版”作为豁免。已有用户明确约定的版本规则优先。TeamDesk 每次本地迭代升 patch、每次合并远程 main 升 minor，major 由用户决定，详见 [TeamDesk 版本规则](plugins/teamdesk/AGENTS.md#版本规则)。

## 输出位置

根 `/output/` 只放本机临时交付物并保持 Git ignored；可复用资产放对应 skill 的 assets，可复现样本进入相关 tests/references。
