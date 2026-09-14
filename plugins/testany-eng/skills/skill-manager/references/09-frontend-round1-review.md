# UAT 第一轮：更新页独立复核

日期：2026-09-14（Asia/Shanghai）

Reviewer：`/root/frontend`，未实现本次受审的 `UpdatesWorkspace` 组件。
结论：**本轮发现的问题均已关闭，有界独立复核通过。** 本记录是 mutable worktree 的组件审查意见，不是整个项目的正式审查证书，也不代表用户已完成 UAT。

## 范围与候选

依据：[UAT 第一轮变更设计](07-uat-round1-changes.md)、共享 `assets/app/shared/contracts.ts` 和本次用户确认的语言、主题、来源及计划需求。

完整阅读新组件 `assets/app/src/UpdatesWorkspace.tsx`、`UpdatesWorkspace.css`，并追踪其与 `App.action`、`Modal`、`ServiceMessage` 的直接调用边界。检查重点是完整更新清单、来源关联和更新确认、计划目标表达、环境切换、语言及 390px 布局；不重新宣称原 App 全部代码或后端调度实现已经由本 reviewer 独立审查。

候选所在仓库 HEAD：`fab1502573825c7a7b4fa6039d9dbba9e42f0280`。两份组件文件在此次工作树中为新增文件，以下 SHA-256 在 delta 验证前后相同：

| 对象 | SHA-256 |
| --- | --- |
| `src/UpdatesWorkspace.tsx` | `a716a26c49382bce54f802b2bd8ccd21e3af1051f6cfb0a743f30468d0384b9b` |
| `src/UpdatesWorkspace.css` | `5220a5f5e4bc7ae072c32680a89167a80c1f604700f2628e6835ccaf8d6a21cb` |
| 已测试构建 `dist/assets/index-eYTuF9FO.js` | `84fd4a7a5e773604a65407bd35ea6e5b706ee348a2a7682a8c2fb99858340a29` |

## 问题及闭合证据

| ID | 原问题 | 最小修复与复验结果 |
| --- | --- | --- |
| FR-01 | 浏览器原生数字校验绕过组件译文；中文、日文输入 14 时出现英文提示 | 表单使用 `noValidate`，由组件校验。三语分别输入 14、15.5、10081 和空值，均显示对应语言的 15–10080 整数分钟提示；15 可保存。 |
| FR-02 | 已翻译的本地校验被当成未知服务错误再次包装 | 本地错误使用译文 key，只有服务错误交给 `ServiceMessage`。三语无目标、空来源校验均直接呈现；未知 503 错误仍保留原始内容。 |
| FR-03 | 管理器 `Codex`、`SkillDock` 被包装为“来源信息 / 原始详情”；文件差异 aria 固定英文 | 管理器名直接呈现、已知管理器类别显式翻译；文件差异 aria 使用组件词典。实测 `Codex` 原样、差异为“修改 / Modified / 変更”。 |
| FR-04 | 计划中两个同名技能只显示相同名称及更新方式；来源、更新预览缺少最终安装路径 | 计划对象和两类确认预览增加实际安装路径。使用真实隔离文件生成个人及项目两个 `writing-assistant`，标签包含各自不同路径；保存后的两个显式 target ID 与所选安装完全一致。来源及更新预览均显示 API 对应的安装路径。 |
| FR-05 | 计划卡不能区分“仅检查”与“自动应用”，保存后无法直接核对周期及目标数 | 卡片摘要显示执行模式、分钟数、目标数及时区。三语验证默认只检查摘要，以及保存后 15 分钟、两个目标、自动应用、`Asia/Shanghai` 的摘要和持久化状态。 |
| FR-06 | Git 工作区的官方更新链接被仅允许 OpenAI 域名的条件隐藏 | 读码确认增加精确 `git-scm.com` HTTPS 域；仍使用明确域名条件。此项为静态路径复核，没有对外执行 Git 或点击远程页面。 |

复核未发现新的待修问题。上述修复均使用既有合同字段，没有新增后端入口或授权模式。

## 独立行为验证

所有检查均使用临时 `home/project/state`、`createApp` 和随机 loopback 端口。测试结束调用 `app.close()` 并删除这些临时目录，没有连接或修改用户的实际运行实例。

- **计划授权目标**：在隔离后端中复制真实项目技能目录，通过实际 `skill.previewSource` 和 `skill.connectSource` 关联其来源，形成两个同名但不同安装路径的对象。通过 UI 勾选并保存计划，再从 API 读回精确的静态 target ID、`autoApply=true` 和 15 分钟周期。
- **语言与失败恢复**：中文、英语、日语各测试无目标、非法周期、空来源，以及修正后的成功提交。仅未知服务错误一项在 HTTP 边界注入 503 响应；真实前端解析与渲染链保留原始错误文本，包含 `<script>` 的内容按文本显示，没有执行。
- **预览身份**：来源关联和更新预览展示的安装位置与真实隔离 API 返回值一致；仅预览，不以查看操作替代确认提交。
- **环境竞态**：首轮检查延迟真实后端 `update.check` 响应，在页面可操作时切换 Local 后再释放响应。结果保持 Local，0 个对话框、0 个旧 `writing-assistant` 标题、0 个 `pageerror`。相关 mode guard 本轮未修改，此证据按直接影响范围复用。
- **窄屏与视觉**：三语深色下分别检查计划、来源和更新弹窗。每组均为 viewport/document 390px、dialog/client 与 scroll 366px；计划 fieldset/client 与 scroll 320px，均无横向溢出、无浏览器 `pageerror`。路径换行、长文案和操作按钮可见，较长表单及目标列表可以纵向滚动。截图关闭入场动画，避免把淡入中间帧当成渲染缺陷。
- **已有 E2E 证据核对**：第一次读取报告为 18 expected / 0 unexpected / 0 flaky / 0 skipped。修复及新增校验用例后再次独立读取 `test-results/e2e-results.json`，为 **21 expected / 0 unexpected / 0 flaky / 0 skipped**，开始于 `2026-09-14T09:29:51.250Z`、耗时 17.43 秒。本 reviewer 未重跑这整套测试；另行运行了上述有界独立检查。

## 本机复现材料

临时交付物遵循仓库约定，放在 Git ignored 的根 `output/skilldock-uat-round1-review/`：

- `delta-runner.mjs`：独立检查脚本。从 `assets/app` 目录执行 `node ../../../../../../output/skilldock-uat-round1-review/delta-runner.mjs`。使用本机 Google Chrome 与已有 Playwright 依赖，不启动真实用户实例。
- `delta-results.json`：三语尺寸、错误文案、目标持久化及异常处理结果。
- `zh/en/ja-schedule-390.png`、`zh/en/ja-source-390.png`、`zh/en/ja-update-390.png`：九张当前构建截图；计划截图包含校验反馈态。

这些本机文件可能随临时输出清理而消失，长期复核应重跑脚本。完整工程验证、真实服务启动及源码下载一致性记录见 [验证补充](10-uat-round1-verification.md)。用户是否接受交互、视觉和实际工作习惯，仍由第二轮 UAT 决定。
