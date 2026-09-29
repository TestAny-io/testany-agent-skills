# README 图片

供 [中文](../../README.md) / [English](../../README.en.md) 产品介绍使用。截图摄于 2026-09-29。

## 品牌

- `brand-light.svg` / `brand-dark.svg`：组合已有的蓝色三层图标与 Ubuntu Medium 转曲字标；深浅色分别匹配背景。
- 图标来源：[native-icon.svg](../../skills/skill-manager/assets/app/src/native-icon.svg)、[native-icon-dark.svg](../../skills/skill-manager/assets/app/src/native-icon-dark.svg)。
- 字标来源：[brand-wordmark.svg](../../skills/skill-manager/assets/app/src/brand-wordmark.svg)；字体来源与许可见[第三方声明](../../skills/skill-manager/THIRD_PARTY_NOTICES.md#brand-wordmark)。不依赖读者安装字体或加载外部字体。

## 产品截图

| 文件 | 内容 |
| --- | --- |
| `library-{light,dark}-{zh,en}.png` | 1440 × 900 技能库；中英文各有深浅色版本 |
| `plugin-selection.png` | 插件安装预览；整包安装 22 个技能，选择启用 3 个 |
| `update-diff.png` | 本地示例技能的文件差异；仅预览，未应用更新 |

使用当前产品前端、扫描器、预览和 diff 实现，通过 Playwright 截取真实渲染结果，未修改页面 DOM 或合成界面。拍摄时应用版本为 0.9.0，工作树当时包含尚未发布的目录兼容性修复（纳入后续 0.9.1）；图片保留拍摄时的实际版本，不改写界面上的版本号。

所有数据位于临时目录，使用隔离的 home、CODEX_HOME、项目和状态目录，关闭系统调度与自更新。Marketplace 列表来自示例适配器，安装目录和技能内容为示例数据；未连接用户真实的插件库、凭据、项目或后台任务。安装预览没有执行安装。

技能名称及插件预览文案取自本仓库或为展示创建；英文首图的示例说明做了对应翻译。这不表示应用会翻译原始 skill 内容。图标复用本仓库的 SkillDock / Testany 资产。

更新截图时，继续使用隔离环境，通过应用真实操作进入列表、安装预览或 diff；不要在生产环境中为拍摄调整用户数据。README 使用 `<picture>` 选择主题图片，新增图片时也应检查 GitHub 风格渲染、移动端宽度及替代文字。
