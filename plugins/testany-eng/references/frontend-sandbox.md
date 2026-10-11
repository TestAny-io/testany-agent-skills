# 前端仓库与原型沙箱

ui-designer（仓库模式）和 prototype-designer 共用本文：探查前端仓库、判断能否写入、在隔离沙箱中实现，以及运行与隔离自检。两者在同一个沙箱里工作——ui-designer 先建立设计层，prototype-designer 再补全流程、状态和数据——交接不需要迁移文件。

## 1. 扫描仓库结构

先读取指定仓库的关键配置，再按需发现以下内容；目录索引无需全量深读，但工作区判定必须依据实际配置。

| 扫描目标 | 搜索模式 | 目的 |
|---------|---------|------|
| 包管理 | `package.json`, `pnpm-workspace.yaml`, `turbo.json` | 技术栈和依赖 |
| 框架配置 | `next.config.*`, `nuxt.config.*`, `vite.config.*`, `angular.json`, `tsconfig.json` | 框架和构建 |
| 路由 | `**/router/**`, `**/routes/**`, `**/app/**/page.*`, `**/pages/**` | 路由方案 |
| 组件库 | `**/components/**`, `**/ui/**`, `**/design-system/**` | 可用组件 |
| 样式方案 | `**/tailwind.config.*`, `**/.storybook/**`, `**/*.module.css` | 样式体系 |
| 状态管理 | `**/store/**`, `**/stores/**`, `**/context/**` | 状态方案 |
| Lint/格式 | `.eslintrc*`, `.prettierrc*`, `biome.json` | 工程规范 |

**排除目录**：`node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `coverage/`

## 2. 前端工作区门禁

扫描完成后，先判断当前仓库是否具备前端工作区特征。

| # | 高置信信号 | 判断方法 |
|---|------|---------|
| A | UI 框架依赖 | `package.json` dependencies 含 React/Vue/Angular/Svelte/Solid |
| B | 页面/路由目录 | 存在 `pages/`、`app/`、`views/`、`router/`、`routes/` |
| C | 组件目录 | 存在 `components/`、`ui/`、`design-system/`、`features/*/components/` |

同时识别 monorepo 信号：`pnpm-workspace.yaml`、`turbo.json`、`lerna.json`、`apps/`、`packages/` 存在时，UI 栈可能在子包中（如 `apps/web/`、`packages/ui/`）。

| 命中信号数 | 处理 |
|-----------|------|
| 3/3 | 通过 |
| 2/3 或 monorepo 命中 | 先读 workspace/package 配置并检查用户已给位置；能确认真实前端工作区则继续，仍有歧义才提问 |
| 0-1/3 且无 monorepo 信号 | 未通过，按调用方的规则处理 |

门禁未通过时：prototype-designer 中止并按下方模板引导；ui-designer 改用独立模式（不写仓库），并告诉用户原因。

```
当前仓库的前端工作区信号不足：
- [逐项列出 A/B/C 的命中/缺失及原因]

请确认：
- 这是一个 monorepo，前端代码在子目录中？（请提供路径）
- 前端组件在非常规目录下？（如 features/、modules/，请提供路径）
- 这不是前端仓库？（请提供前端仓库位置；若只需要先看设计，可改用 /testany-eng:ui-designer 的独立模式；若在 testany 研发流程中且本轮不需要原型，可直接进入 /testany-eng:api-writer）
```

## 3. 技术栈、组件与设计系统

- 读取关键配置，提取框架及版本、路由方案、样式方案、组件库（内部/第三方）、状态管理、TypeScript 配置。
- 只做**结构级**组件发现，建立组件目录索引（名称、粗分类：布局/表单/数据展示/反馈/导航、路径）；具体 Props 在匹配组件时才按需读取类型定义或源码，不假设接口。
- 按需读取主题/token、字体与全局样式，记录颜色角色、字号层级、间距、圆角、阴影、图标、密度和断点的来源。有 Storybook（`.storybook/`）时记录路径作为用法参考。
- 页面构成模式按 [页面模式提取](design/page-patterns-guide.md) 取证。
- 沙箱里已有 `_design/` 设计包或 `_prototype-manifest.md` 时先读取，在其基础上迭代，不另起一套。

## 4. 沙箱目录与隔离规则

所有设计与原型代码放在一个独立的沙箱目录内，位置与用户确认（已有沙箱则沿用）。典型结构：

```
src/prototype/                    # 沙箱根目录——所有设计与原型文件在此之下
├── README.md                     # 标注为原型/设计稿、运行方式、入口路由
├── _design/                      # ui-designer 设计包：设计说明、设计语言、token、证据
├── _prototype-manifest.md        # prototype-designer 的 Manifest
├── mock/                         # Mock 数据与真实感内容
├── components/                   # 沙箱组件：[DESIGN] 设计组件、[PROTOTYPE] 原型组件
├── pages/  或  routes/           # 页面（按仓库约定）
└── ...
```

**禁止清单**：

- 在沙箱目录之外创建或修改任何文件（唯一例外见下方「路由隔离」）。
- 修改仓库已有的路由配置中的现有路由、已有页面或组件源码。
- 修改 `package.json`、引入仓库中没有的 npm 包、使用与仓库不同的样式方案。

**路由隔离**：页面使用独立入口，不注入生产路由表。

- **Next.js App Router**：利用 `app/prototype/` 目录的文件路由天然隔离。
- **Next.js Pages Router**：利用 `pages/prototype/` 目录。
- **Vue Router / React Router**：在沙箱内创建独立路由配置，通过独立入口文件挂载（如 `prototype/main.tsx`），不修改生产路由文件。
- **其他框架**：与用户确认隔离方式。

**唯一例外**：框架不支持目录级路由隔离（如 SPA 只有单一入口）时，允许在生产路由文件中**新增**一条 prototype-only 路由入口（如 `{ path: '/prototype/*', lazy: () => import('./prototype/routes') }`），且必须同时满足：用户明确批准；变更仅为新增一行，不修改已有路由；在交付记录（交付摘要或设计包）中写明。除此之外，沙箱外零变更。

**样式隔离**：用仓库支持的作用域样式或沙箱根容器限定 token 与选择器（例如在根容器上定义 CSS 变量），禁止污染 `:root`、`body`、全局主题或生产组件。字体、图标、图片、动画不能成为擅加依赖或修改全局配置的理由。

**沙箱组件**：

| 标注 | 由谁新增 | 何时允许 |
|---|---|---|
| `[DESIGN]` | ui-designer | 现有组件无法表达设计决定时新增，记录对应的生产组件、替代理由和对组件库的改进建议 |
| `[PROTOTYPE]` | prototype-designer | 仓库与设计包都没有对应组件时新增最小组件，在 Manifest 记录缺口 |

已有通用组件且能表达设计时，不在沙箱重写平替。prototype-designer 使用设计包中已记录的 `[DESIGN]` 组件不算平替。

## 5. 状态切换

每个声明的关键状态都要能不改代码切换演示：URL 参数（如 `?state=empty`）、明确标注的演示控件或 mock 数据切换。演示控件与产品操作明确区分，不遮挡待评审的界面。

## 6. 运行与工程检查

1. **包管理器**：`pnpm-lock.yaml` → pnpm；`yarn.lock` → yarn；`bun.lockb`/`bun.lock` → bun；`package-lock.json` 或无 lock → npm。
2. **Monorepo 定位**：存在 workspace 配置时，读取沙箱所在包的 `package.json` 获取包名，用 filter/workspace 语法定位（如 `pnpm --filter <pkg-name> dev`）。
3. **按顺序执行**：类型检查 → Lint（scripts 中的 `lint`）→ 开发启动（`dev`/`start`/`serve`），失败则修复后重试。
4. **类型检查命令**：scripts 中有 `typecheck`/`type-check`/`tsc` 时用它；否则有 `tsconfig.json` 时用包管理器的 exec 形式（如 `pnpm exec tsc --noEmit`、`npx tsc --noEmit`）；仍不确定就询问用户，不要猜。
5. 启动成功后确认沙箱入口路由可访问。

## 7. 隔离自检

- [ ] 所有新增/修改文件都在沙箱目录内（唯一例外：经批准新增的 prototype-only 路由入口行，已记录）
- [ ] 沙箱路由全部在专属前缀下，未修改已有生产路由
- [ ] 未修改 `package.json`，未引入仓库以外的依赖
- [ ] token 与样式限定在沙箱作用域内
- [ ] 代码通过仓库 lint/类型检查；目录结构和命名符合仓库约定
