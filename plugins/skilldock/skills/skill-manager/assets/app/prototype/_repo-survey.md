# 仓库探查报告

2026-09-28。仅用于本轮 SkillDock 界面原型；不代表生产实现准出。

## 前端工作区门禁

| 信号 | 命中 | 证据 |
|---|---|---|
| UI 框架依赖 | 是 | 上级 package.json：React / React DOM 19.3.0 |
| 页面/路由目录 | 是，非典型结构 | assets/app 是实际应用；src/App.tsx 以 page 状态切换五个页面，Vite index.html 为入口 |
| 组件目录 | 是，平铺结构 | src/Modal.tsx、LibraryUI.tsx、InstallDialog.tsx 等导出组件 |

**门禁结论**：通过。使用用户已确认、此前持续开发的 assets/app 前端；不因没有 components 文件夹误判为非前端仓库。

## 技术栈

| 项目 | 值 | 来源 |
|---|---|---|
| 框架 | React 19.3.0 / Vite 8.3.0 | ../package.json |
| 路由方案 | page 状态切换，无第三方路由 | ../src/App.tsx |
| 样式方案 | CSS + 变量，lucide-react 图标，系统字体 | ../src/styles.css、tokens.css |
| 状态管理 | React hooks；偏好 external store | ../src/preferences.ts |
| TypeScript | 7.0.2，strict，react-jsx | ../tsconfig.json |
| 包管理器 | npm | ../package-lock.json |

## 组件目录索引

| 组件名 | 类别 | 路径 |
|---|---|---|
| Modal | 浮层 / 焦点管理 | ../src/Modal.tsx |
| LibraryButton / ViewSwitch / InstallSteps / CollectionFooter | 基础 / 导航 | ../src/LibraryUI.tsx |
| InstallDialog / PluginSkillPicker | 安装表单 | ../src/InstallDialog.tsx、PluginSkillPicker.tsx |
| GitSourceFields / ResolvedGitSource | 来源表单 | ../src/GitSourceFields.tsx |
| TagFilter / TagStrip / TagsDialog | 筛选 / 标签编辑 | ../src/Tags.tsx |
| DuplicateSkillsDialog | 按路径移除 / 保留 | ../src/DuplicateSkillsDialog.tsx |
| ProjectPicker / ProjectDialog | 项目选择 | ../src/ProjectControls.tsx |
| DiffBrowser | 变更审阅 | ../src/DiffBrowser.tsx |
| UpdatesWorkspace | 生产更新工作区 | ../src/UpdatesWorkspace.tsx |
| Empty / Toggle / Badge | 未导出的局部函数 | ../src/App.tsx，不能独立 import |

## 设计规范与页面模式

- **设计依据**：用户明确选择“克制、精致：接近原生 Mac 应用，紧凑而清晰”；保留 SkillDock 名称、dock 图形和 A Testany Product 身份。
- **系统状态**：已有基础组件、浅深色变量和交互规范；用户授权重做整体视觉，因此在独立根容器建立中性新色板，不修改生产 token。
- **参考页面**：实际查看了仓库 output/playwright/skilldock-native/unknown-write-result.png（技能，1200×813）与 full-ui.png（更新，1200×813）；这些来自此前原生桥接测试，测试外框不属于产品设计。

| 维度 | 现有约定/观察 | 来源路径或截图及视口 | 本轮处理 |
|---|---|---|---|
| 排版/颜色 | 森林绿、橘红主操作；28px 页面标题、英文 eyebrow | ../src/tokens.css、styles.css，以上截图 | 中性灰底、蓝色操作；删去重复英文 eyebrow 与标题句点 |
| 布局/间距/密度 | 四个大统计卡、说明文字、项目条将技能清单下压；更新大块计划信息占据首屏 | ../src/App.tsx、截图 | 统计改为筛选计数；项目移至侧栏；计划改成紧凑摘要 |
| 组件/状态/动效 | 弹窗焦点循环、Escape、返回焦点；真实安装预览、逐技能选择 | ../src/Modal.tsx、InstallDialog.tsx 等 | 复用行为，用沙箱样式重排；不重写平替 |
| 适配 | 390 / 720 / 1440px；浅、深、系统 | 01-product-requirements.md、02-interface-design.md | 沿用；窄屏顶部导航与单列清单，详情全屏 |

- **已识别体验问题与允许范围内的改进**：大块状态和重复说明冲淡管理对象；卡片高度和边框过多；通过清单为主、渐进展示元数据、控件位置统一修正。来源保护、整包安装和启用选择语义保留。
- **剩余方向缺口**：无；风格已由用户选定。

## 运行命令识别

| 项目 | 命令 | 来源 |
|---|---|---|
| 包管理器 | npm | package-lock.json |
| 开发启动 | npm run dev -- --config prototype/vite.config.ts | 复用上级 dev；沙箱独立 root/base，端口 4780，无 API proxy |
| Lint 检查 | 无独立 lint 脚本/配置 | 已检查 package.json 与配置文件 |
| 类型检查 | npm run typecheck；npx tsc --noEmit -p prototype/tsconfig.json | 原应用 include 不含 prototype，需另查原型 |
| 工作区定位 | plugins/skilldock/skills/skill-manager/assets/app | 无 npm workspace 配置的独立嵌套应用 |

## 验证能力

| 能力 | 实际可用方式 | 限制及影响 |
|---|---|---|
| 运行/浏览器操作 | 已有 Vite、Playwright CLI | 独立浏览器验证；不声称原生 Codex 集成已验证 |
| 截图及查看 | CLI 截图 + view_image | 保存于沙箱 output/playwright，逐图实际观察 |
| 对比度测量 | 浏览器计算色值 + WCAG 相对亮度公式 | 只覆盖列出的文本/控件配对，不等同完整 WCAG 审计 |

## 原型沙箱规划

- **沙箱路径**：当前文件所在 assets/app/prototype/。复用用户授权的当前应用目录，无位置歧义。
- **路由隔离方式**：独立 index.html / Vite 配置，不注入生产入口；复用的三个 CSS 文件只在此配置下包装进 @scope (.sd-prototype)。
- **路由前缀**：/prototype/；page query 导航并支持浏览器返回。
- **已有工作**：本轮前存在的 0.8.0 原生集成及主题修复保持原样。output/baseline.json 保存本轮开始时 869 个沙箱外文件摘要，交付时复核。
