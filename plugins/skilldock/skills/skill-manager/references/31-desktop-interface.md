# SkillDock 桌面界面

2026-09-28：用户授权直接改正式产品，替代原型阶段。沿用现有 React、API、MCP Apps、本机服务与所有管理能力，不引入外部 UI 框架。

## 产品与交互约定

- 任务：快速找到技能或插件，核对来源、状态和重复副本，再执行安装、启禁、更新、移除或恢复。
- 导航：五个资料区保持一致；项目选择和偏好放在侧边栏。当前页以选中背景表示，更新数量只表示实际待更新项目。
- 浏览：技能与插件默认紧凑列表，保留卡片视图；统计收敛为筛选按钮，搜索、来源、标签和重复筛选集中在工具栏。
- 详情：宽窗口使用非模态检查器，可保持列表位置并连续选择不同对象；窄窗口使用带焦点约束的详情面板。安装、移除确认等事务仍用模态对话框。
- 输入：可见的更多操作入口与右键菜单共用命令；列表上下键、Home/End 移动焦点，Enter 打开详情；Escape 关闭当前层，搜索快捷键只作用于应用内搜索。
- 连续性：保存页签、视图、筛选、详情对象及各页滚动位置；重新取得清单后核对对象，禁止用持久化 UI 状态绕过后端能力检查。
- 既有多选场景（同名技能、安装插件的技能选择、更新目标）保持；本轮不新增未经定义的批量破坏操作。

## 视觉与工程约定

以 macOS 26/27 为参考的 Web 界面，不声称使用了原生 AppKit Liquid Glass。CSS 材质由模糊、环境色、边缘高光和轻阴影组成，集中于侧边栏、顶部控制区与菜单；正文、长列表和 diff 使用普通表面。

浅色与深色拥有完整语义 token。独立于宿主配色，所有原生 select、option 和 optgroup 跟随应用主题。系统字体与现有 Lucide 图标继续使用，不分发 Apple 字体或设计套件。

控件维持可读文本与稳定尺寸；缩放、窄窗口不裁掉功能。支持系统减少动态效果、对比度偏好，以及应用内减少透明度开关。材质不可用时退回清晰的不透明表面。数值、断点和动画时长是本产品工程决策，不是 Apple 的强制规范。

## 参考与适用边界

查阅日期：2026-09-28。

- Apple HIG：[macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/)、[Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection/)、[Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards)。作为平台设计依据。
- [Modernize your AppKit app / WWDC26](https://developer.apple.com/videos/play/wwdc2026/289/)。借鉴输入、状态恢复和布局原则，不引入原生 API。
- [design-with-apple-hig](https://github.com/Sunwood-ai-labs/design-with-apple-hig/blob/main/SKILL.md)。用于证据分类和实现后验证。
- [macos-liquidglass-web-design](https://github.com/Lee-zg/skills/blob/main/macos-liquidglass-web-design/SKILL.md)。只参考 Web 材质构成；不采用其“所有表面透明”及装饰性背景的绝对规则。

## 验证范围

执行 TypeScript、Web/native 构建和现有浏览器回归。真实本机清单只做浏览验证，涉及文件写入的回归在临时 home/project 中运行。重点验证五页、三个语言、深浅色、窄窗口、下拉菜单、检查器、快捷键、状态恢复、安装预览、同名技能管理、更新 diff 与计划设置。实测记录放在根 output/skilldock-desktop-ui；不把自动检查等同于完整 VoiceOver 或原生宿主 UAT。

## 本轮实测（2026-09-28）

- `npm run build`（含 TypeScript）与 `npm run build:native` 成功；浏览器产物仍有既有的大 chunk 提示。
- `npm test`：178 项通过；`npm run test:e2e`：72 项通过。既有安装、逐技能启禁、同名副本、标签、更新 diff/进度/计划、私仓来源、项目切换和后台恢复流程均保留。
- 真实本机清单只读走查五页，查看 1440、784、390 宽度的深浅色截图；无页面或主内容区横向溢出。检查项目、来源、插件市场、语言和计划下拉控件随应用主题渲染。
- 实际操作验证：列表方向键连续浏览及 Escape 返回当前条目；菜单键盘导航和焦点恢复；⌘F 搜索；保存并恢复各页搜索、卡片/列表、详情与 980px 滚动位置；窄窗口详情背景不可交互，关闭后恢复焦点。
- “减少透明度”与系统提高对比度偏好均将玻璃模糊关闭；保留相同布局。修复 701–850px 范围偏好入口被历史响应式规则隐藏，以及搜索有内容时清空按钮污染其可访问名称的问题。
- 隔离 MCP 浏览器宿主加载本次分发的 UI 和真实 MCP/后台：对临时技能保存标签、刷新后读回；详情、插件安装、更新计划窗口均可操作。宿主深色、应用浅色时弹窗为不透明白色且控件为 light；切换深色后弹窗与 select 均为 dark。已查看完成动画后的截图。
- 通过本机开发插件的 cachebuster / Codex CLI 流程刷新已有 Preview 入口，读回启用状态和指向当前生产源码的 MCP 配置。受管浏览器服务已重启到本轮构建，仍使用原数据目录及原项目。原生侧栏的最终视觉 UAT 由用户重新打开入口验收；不自动退出 Codex。

2026-09-28 的界面实现阶段未改后端业务实现，也未发布到远程 main。2026-09-29 用户授权将本界面与原生接入一起发布为 0.8.0，发布记录见[仓库 CHANGELOG](../../../../../CHANGELOG.md)。浏览器截图、命令记录及本轮前源码摘要位于本机忽略目录 `output/skilldock-desktop-ui/`；它们不随软件分发，也不替代完整 VoiceOver、其他 Mac 或正式宿主验收。
