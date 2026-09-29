# SkillDock 界面设计原型

> 历史设计资料，随 0.9.1 归档。以下说明保留 2026-09-28 原型阶段的设计与验证背景；正式界面已在后续版本另行实现。此目录不接入正式页面、后台任务或应用源码下载包，仅可按下列独立命令运行示例。历史截图与自检输出属于本机临时工件，不随仓库提供。

按“克制、精致，接近原生 Mac 应用，紧凑而清晰”的方向重新设计。覆盖技能库、插件、市场来源、更新和操作记录，以及安装、详情、同名副本管理、标签、更新计划和偏好设置。

这是独立的可交互设计原型，使用示例数据。安装、移除、更新与计划只修改内存，不访问本机技能库或创建系统任务。刷新恢复示例业务数据；外观与语言偏好保存在这个独立 origin。正式应用未被替换。

## 启动与检查

在已准备好依赖的 `plugins/skilldock/skills/skill-manager/assets/app` 目录运行：

```sh
npm run dev -- --config prototype/vite.config.ts
```

打开 [设计预览](http://127.0.0.1:4780/prototype/)。原型监听本机 4780，使用独立入口、样式作用域和 `/prototype/` 路由前缀，不代理生产 API。

```sh
npm run typecheck -- --project prototype/tsconfig.json
npx vite build --config prototype/vite.config.ts
```

生成文件位于本目录的 `dist/`、`.cache/`，验证证据在 `output/`，均已忽略。没有新增依赖或修改应用的 package.json。

## 建议体验顺序

1. **技能库**：搜索、按来源和标签筛选，切换列表/卡片；点“有同名”，按路径选择某一份副本，再预览移除。
2. **插件**：点击“安装插件”，直接粘贴 GitHub 地址或从 Marketplace 选择；预览附带技能，调整启用选择后安装。
3. **更新**：点击“检查全部”查看进度；打开“查看更新”并展开文件差异；设置计划，选择 SkillDock 与其他目标。
4. **市场来源与记录**：浏览来源中的插件；添加/移除示例来源；从记录恢复移除的技能。
5. **偏好设置**：切换浅色、深色或跟随系统；调整窗口宽度，查看侧栏、清单与浮层的重排。

本轮新增页面以中文设计稿为准，复用组件保留既有三语言能力。新增英文与日文文案待设计确认后补齐，不将此原型当作已完成本地化的正式版本。

## 页面与状态

页面参数：`skills`、`plugins`、`markets`、`updates`、`activity`。

状态参数：`normal`、`loading`、`empty`、`error`、`boundary`。例如：

- [技能长名称与大清单](http://127.0.0.1:4780/prototype/?page=skills&state=boundary)
- [市场读取失败](http://127.0.0.1:4780/prototype/?page=markets&state=error)
- [更新冲突与来源缺失](http://127.0.0.1:4780/prototype/?page=updates&state=boundary)

页面底部“示例数据 · 设计预览”也可切换状态与重置数据。这些控件只用于设计走查，不属于产品导航。

## 设计与交付记录

- [仓库探查](./_repo-survey.md)
- [视觉说明、旅程与状态映射](./_prototype-manifest.md)
- [验证结果与交付摘要](./_delivery-summary.md)

设计验收后，将确认的布局与样式接入现有正式页面和原生运行链路；本目录不作为新的生产业务层。
