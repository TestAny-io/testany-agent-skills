# SkillDock

独立的 Codex 本地技能管理应用，只包含 `skill-manager` 一个 skill。支持本机技能、插件、marketplace、来源追溯、自动更新，提供深浅主题及中英日界面。

安装、CLI 回退和旧版迁移见 [仓库安装入口](../../README.md#在-codex-中使用-skilldock)。打开时用 `$skill-manager`，在 Codex 右侧浏览器面板中使用；扫描项目可在界面选择。运行环境由启动器自动处理，macOS 无需预装全局 Node.js。

使用与开发说明见 [应用 README](skills/skill-manager/assets/app/README.md)，许可证为 [AGPL-3.0-only](LICENSE)。当前版本 0.3.0，变更见 [发布记录](../../CHANGELOG.md)。本版支持检查更新的实时进度、技能和插件的本机标签与筛选，并复用本机 Git 凭据访问私仓。

设计与验证范围见 [更新进度与标签](skills/skill-manager/references/22-progress-and-tags.md)、[导航与私仓支持](skills/skill-manager/references/23-navigation-and-private-git.md) 和 [种子反馈整改记录](skills/skill-manager/references/19-seed-feedback.md)。

GitHub 目录链接与可展开更新 diff 的后续改进见 [使用反馈记录](skills/skill-manager/references/20-source-links-and-diff.md)。

同名技能可按安装路径选择保留或移除，每份独立恢复，详见 [同名技能管理](skills/skill-manager/references/21-duplicate-selection.md)。
