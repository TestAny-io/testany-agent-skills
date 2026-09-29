# SkillDock 提供者图标

2026-09-29：按用户要求在正式产品界面优先呈现提供者声明的原始图标，并采用用户确认的 SkillDock 品牌方案。同日用户授权将本轮改动升至 0.9.0，经 PR 合并 main 发布；版本记录见[仓库 CHANGELOG](../../../../../CHANGELOG.md)。下文区分开发验证与发布候选检查，实际合并状态以对应 PR 为准。

## 规则与依据

- Skill：读取技能目录下 `agents/openai.yaml` 的 `interface.icon_small`、`icon_large`，路径相对技能根；这是 Codex 的可选展示元数据，并非通用 `SKILL.md` frontmatter 的必填字段。见 [Build skills](https://learn.chatgpt.com/docs/build-skills#optional-metadata) 与 [Agent Skills specification](https://agentskills.io/specification)。
- Plugin：读取 OpenAI interface 的 `composerIcon`、`logo`，以及本机宿主和提供者实际使用的 `logoDark`。支持 `.codex-plugin/plugin.json`，兼容 `.claude-plugin/plugin.json` / 根 manifest；可移植 `plugin.json` 中的 `extensions["com.openai"]` 存在时完整替代 overlay，不合并遗漏字段。见 [Package your plugin](https://developers.openai.com/plugins/build/plugins)。
- Marketplace：目前公开 schema 未提供通用 logo 字段，不猜测 `logo.png`，也不将任意子插件品牌当作市场品牌。SkillDock 为单插件安装生成的单来源目录可以使用该插件图标。
- 展示顺序：技能自己的有效图标 → 所属插件图标 → 既有默认图标。列表偏好小图、详情偏好大图；深色模式优先插件声明的深色图。没有深色图时保留原图与浅色底，不反色、不拉伸。
- 版本边界：已安装插件从实际安装目录读取；可安装目录与安装预览从来源包读取，避免展示尚未安装版本的品牌资源。

## 实现范围

扫描与安装预览共用 `server/provider-icons.mjs`。清单中的对象只保存内容摘要键，`iconAssets` 按摘要去重保存 data URI。React 共用 `ProviderIcon`，覆盖技能/插件列表、详情、Marketplace 安装目录、单插件安装预览与技能选择。普通浏览器和 MCP Apps 使用同一前端，不新增外部图片请求或任意文件下载接口。

图片声明限包内相对路径，解析真实路径后检查边界，拒绝越界符号链接、目录、URL 与不可读取文件。元数据与图片均限制大小，单图最多 512 KiB，清单编码后总量最多 8 MiB。支持 PNG、JPEG、GIF、WebP、ICO 和自包含 SVG；SVG 只作为图片显示，拒绝活动文档、实体和外部资源。异常展示元数据不应使技能从清单中消失；浏览器解码失败后尝试其他可用图，再回退默认图标。

## 验证

`tests/provider-icons.test.mjs` 覆盖声明解析与去重、portable overlay 替代、技能图标优先与回退、越界与非法内容、总量限制、图标变更刷新，以及真实服务扫描/安装预览的版本来源。

- Web 与 native 构建（含 TypeScript）通过，184 项后端测试与 72 项既有浏览器回归通过。
- 本机清单只读扫描：79 个技能中 62 个具有有效图标，识别到 17 个插件图标；去重后的 66 个图片资源编码约 2.76 MB。实际显示的图片无解码失败；查看了浅色、深色及选中行/插件详情截图，GitHub 与 visualize 使用声明的深色版本。
- 全新临时 HOME 经真实 Codex CLI 安装后，隔离 MCP 浏览器宿主读取分发的原生 UI 与真实后台；技能图标成功经过 MCP 传递。插件安装预览验证自身图标、继承图标、损坏 PNG 回退默认图标，主题切换后插件与继承图标一起切到深色版本。预览不执行安装确认。
- 截图与测试日志保存在本机忽略目录 `output/playwright/skilldock-icons/`。开发验证未改用户已安装技能；隔离宿主验证不等同于 Codex 原生侧栏 UAT。

## SkillDock 自身品牌图标

网页 favicon 和 MCP server 原先引用 `src/native-icon.svg` 的双抽屉图案，桌面界面的三层横条 Logo 则由独立 CSS 绘制，因此没有同步。用户确认采用 E 修改版：保留三层，上两层旋转 −8°、底层水平，透明节点及连线呼应 Testany；浅色品牌蓝为 `#0764D9`，深色为 `#83B6FF`。

`src/native-icon.svg` 是图形事实源，应用导航使用其透明轮廓作为 mask；`src/brand-wordmark.svg` 保存 Ubuntu Medium 0.83 的字形轮廓，使没有安装该字体的设备也能一致显示 SkillDock 字标。字体来源记录于第三方声明。原生打包复制共用图标；网页标签采用由其生成的透明 64×64 PNG，使用 Vite 内容摘要路径。插件 interface 同时声明 `composerIcon`、`logo` 和 `logoDark`。图标生成使用开发依赖中的 Chromium/Chrome 渲染，普通安装直接使用提交的资源，不增加字体或浏览器运行时依赖。

原生 esbuild 的 SVG data URL 可能保留 XML 引号，直接放入双引号 CSS `url()` 会使 mask 声明失效。两处品牌 mask 均对 URL 做 CSS 字符串转义，确保 Vite 网页与原生包显示一致。

- `npm run build:icons`、原生/网页构建、类型检查及插件/仓库静态校验通过；最终修改后重跑 12 项原生协议、提供者图标与源码分发相关已有测试，全部通过。
- 全新临时 HOME 经真实 Codex CLI 安装后，在隔离 MCP 浏览器宿主核对浅色、深色及收起侧栏：图形和 Ubuntu 字标 mask 均有效，自身插件技能继承对应主题的图标。截图为 `final-brand-native-light.png`、`final-brand-native-dark.png`、`final-brand-collapsed.png`。
- 本机 4771 已重新构建并启动，实际网页中的定稿图形与字标显示正常；favicon 返回 HTTP 200 / image/png，字节与共用源文件一致。证据为 `final-brand-web.png` 与 `final-brand-verification.json`，均位于上述忽略目录。
- Codex 原生侧栏的当前显示无法通过本轮 UI 工具读取，宿主重新加载后的最终图标仍需 UAT；隔离宿主、源码与协议校验不等同于 Codex 原生侧栏验收。未自动重启 Codex。

远程未安装插件的在线图标元数据补齐按用户要求暂缓，本轮未实现。

## 0.9.0 发布候选验证

- 相对远程 main 的 0.8.0，仅 SkillDock 分发内容发生变化；插件 manifest、应用 package.json 与锁文件同步为 0.9.0，marketplace 不重复声明版本。根与插件中英文 README、CHANGELOG 已同步。
- 重新生成原生分发资源；原生构建、网页构建及 TypeScript 检查通过。36 个活动技能的仓库发现校验与 SkillDock 插件校验通过。
- 使用 Codex Node.js 24.19.0 执行 `node --test tests/*.test.mjs`，184 项全部通过；浏览器回归 72 项全部通过。
- 初次通过本机 NVM Node.js 22.14.0 执行 `npm test` 时为 183/184：运行环境测试将当前 Node 链接到临时目录，但解析真实路径后优先找到 NVM 随附的 npm，与该测试预期的模拟应用 npm 不符。使用没有随附 npm 的 Codex Node 复核该用例及全套测试通过；没有为适配断言改动产品的运行环境选择规则。原始失败日志保留。
- 发布检查日志位于本机忽略目录 `output/playwright/skilldock-icons/release-0.9.0-*.log`。历史 `assets/app/prototype/` 与本机截图不纳入本次提交；未对用户已安装插件执行升级，也未重启 Codex。
