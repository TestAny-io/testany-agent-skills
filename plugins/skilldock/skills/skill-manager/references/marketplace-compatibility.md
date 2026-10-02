# 第三方 Marketplace 兼容性（0.10.1）

SkillDock 读取第三方插件时遵循其 manifest 与 marketplace 的组合语义；本仓库编写插件时继续使用单一版本声明。这两种约束不混用。

## 解析与提示

- 条目和 manifest 都声明版本：保留原文件，以 manifest 版本为准，生成非阻断提示。版本值仍须是安全的单段字符串。
- manifest 不存在：条目提供组件；`strict` 省略、true、false 均可。
- manifest 存在：`strict` 省略或 true 时默认目录、manifest 与条目中的技能范围合并；保留根来源条目明确子目录的既有例外。
- manifest 存在且 `strict:false`：条目不能声明 `commands`、`agents`、`skills`、`hooks`、`outputStyles`、`themes`，空声明也冲突；仅 manifest 声明组件合法。
- manifest 存在时，条目的 `mcpServers`、`lspServers`、`userConfig`、`channels` 不参与组件信息展示。SkillDock 不负责执行这些组件。
- 添加来源、安装预览、重新扫描、更新检查共用解析规则；版本提示显示在市场卡片、插件详情、安装预览和更新项中，不混入会阻止操作的错误诊断。
- 路径越界、悬空 symlink、来源身份不匹配和非法版本仍拒绝；不改写第三方 manifest，不修改已安装缓存来绕过检查。

## 验证范围

回归测试覆盖有无 manifest、strict 三态、六个组件字段、空声明、版本相同或不同、字段优先级、来源边界，以及添加 → 预览 → 安装 → 更新 → 重启后发现。

实际兼容样本为 [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/09170eec67eefd46a7ae85de61b40c194020f997)，市场和 manifest 都声明 2.13.0，条目 `strict:false` 且无组件字段，manifest 的 skills 为 `./.claude/skills/`。2026-10-02 只读扫描确认 7 个技能和 682 个文件，源文件未变。

Codex CLI 0.159.2 在临时 HOME / CODEX_HOME 中，使用原始 metadata 和无害的合成技能完成添加、预览、7 技能安装、2.13.0 → 2.13.1 更新与读回；只提高 manifest 版本仍可更新，未选中的技能保持禁用。未向用户真实环境安装该第三方插件，未执行其技能或脚本。

在 app 目录执行：

```sh
node --test tests/marketplace-compatibility.test.mjs
npx playwright test tests/marketplace-compatibility.spec.ts
# 显式指向已有 CLI，只使用临时目录：
SKILLDOCK_CODEX_BIN=/absolute/path/to/codex node tests/marketplace-compatibility-native-smoke.mjs
```

语义依据：[Claude Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference#plugin-entries) 与 [strict mode](https://code.claude.com/docs/en/plugins/marketplace-reference#strict-mode)。这不是所有 Claude 组件在 Codex 中均可执行的声明；安装结果仍由当前 Codex CLI 及读回验证确认。
