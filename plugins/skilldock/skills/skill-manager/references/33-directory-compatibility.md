# SkillDock 目录兼容性修复

2026-09-29，用户批准对已复现的自定义目录问题进行有限修复。本轮修复纳入 0.9.1；不包含开发版转正式版迁移、任意目录注册器或用户本机安装。

## 行为与边界

- 继续使用启动时的 `CODEX_HOME`，默认才是 `~/.codex`。CLI、服务、自更新和独立后台计划使用同一个值；marketplace 使用 Codex 清单返回的实际根目录。
- `CODEX_HOME/skills`、个人 `.agents/skills` 与 `CODEX_HOME/plugins/cache` 在启动前已经存在的合法根目录链接可以指向其他位置。扫描与写入绑定同一个实际目录；运行中替换目录或改写链接目标后停止操作，重新打开应用才能重新确认。
- 项目技能从当前目录向上发现到最近仓库根，识别普通 `.git` 目录和 worktree 的 `.git` 文件。位置不受用户主目录限制；没有仓库时只扫描所选目录，不向任意父级扩展。
- 个人/项目目录中的单个技能文件夹链接可被发现、单独启禁。启禁配置写入 Codex 实际识别的 canonical `SKILL.md` 路径；移除操作只移动链接，可从操作记录恢复，不删除链接目标。
- 链接集合内的子技能可阅读和启禁，但不能把子目录误当作可独立删除的链接。链接技能由真实来源管理更新，不接受来源关联后自动替换共享文件；更新页解释此限制并显示实际路径。
- 整体移动的 skills 根仍允许安装、追踪来源更新、定时更新和恢复。跨磁盘移动保留相对链接，校验复制结果与来源后提交，目标冲突或复制期间内容变化时保留原内容。
- 插件缓存根迁移后仍按照 Codex 的 marketplace/plugin/version 层级定位，安装、逐技能启禁、更新、自更新及原生入口恢复共用路径解析。来源目录不能代替缺失的已安装缓存。
- 此兼容不放宽插件包/marketplace 内组件或资源的边界：包内悬空/越界链接、临时 staging 被替换、指向系统或插件缓存的“个人技能”别名继续受保护。未登记在 Codex 发现范围内的任意文件夹不会被全盘搜索。

官方依据：[技能发现与链接支持](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)、[CODEX_HOME](https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations)、[Marketplace 路径](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)。

## 工程实现

- `server/cache-paths.mjs` 是不依赖第三方包的启动期模块，统一插件缓存层级，避免全新安装尚未准备 node_modules 时启动失败。
- `server/paths.mjs` 负责项目发现范围、根目录验证、技能链接的实际路径与运行期绑定。`scanner`、`service` 共用规则，`installation` 按真实缓存根判断插件身份，后台与自更新复用相同包路径。
- 安装根、插件缓存、技能链接及目标身份分别绑定。单个链接不是向外部目录授予递归写权限；保护判断同时覆盖迁移后的系统技能与插件缓存真实位置。
- `server/move.mjs` 提供同磁盘 rename 和跨磁盘校验复制；校验包含 Git 元数据、原始链接文本与文件权限，不复用会忽略 `.git` 的安装预览摘要。未能清理的额外恢复副本在操作结果中报告。临时文件不会作为技能被发现。
- 清单保留入口路径并补充实际路径。详情、同名技能选择、移除确认与目录面板同步展示，中英日文使用相同操作语义。

## 验证记录

- 新增 `tests/custom-paths.test.mjs`：自定义 CODEX_HOME、外部根目录链接、完整技能生命周期、绝对/相对技能链接、链接集合、循环/悬空/文件越界、运行期 retarget、保护别名、外置项目仓库边界、自定义 marketplace 组件、插件更新与技能开关保留、GUI 关闭后的计划执行、跨磁盘分支与并发来源变化。
- 原生恢复与自更新既有用例增加迁移缓存根场景；保留全新插件在无 node_modules 时启动的回归。
- 跨磁盘分支通过注入真实 rename 的 `EXDEV` 结果验证，后续复制、校验、移动和恢复均使用临时目录中的真实文件；不将其表述为已验证外置硬盘断连或断电恢复。
- 用当前桌面应用内真实 Codex CLI 的 `skills/list`，在临时 HOME/CODEX_HOME 中验证外部链接技能：Codex 返回真实路径；SkillDock 禁用后 Codex 读回 `enabled: false`，重新启用后读回 `true`。无模型调用、无用户配置修改。
- 完整后端回归 **202/202 通过**，无跳过，包含本轮 16 项目录兼容性用例；使用 Codex 提供的 Node.js 24.19.0。
- 现有浏览器回归 **72/72 通过**。另通过 Playwright CLI 在独立临时 HOME 中实际操作：查看入口/实际路径 → 确认只移除链接 → 检查目标文件保留 → 从操作记录恢复链接；核对中文浅色和英文深色详情的显示与换行。
- TypeScript 检查、Web 构建、原生 UI/MCP 构建及仓库 Codex 兼容性静态检查均通过。原生构建和后端恢复用例通过不代表本轮已在用户日常 Codex 侧边栏安装验收。
- 本机隔离验证日志位于 Git ignored 的 `output/skilldock-custom-path-audit/`，浏览器截图位于 `output/playwright/skilldock-directory-compat/`。上述开发验证期间，日常 4771 正式版不参与测试；未安装、未重启日常服务，也未执行发布。发布验证另见 0.9.1 变更记录。
