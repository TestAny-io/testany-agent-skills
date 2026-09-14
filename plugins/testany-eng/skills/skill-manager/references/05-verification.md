# SkillDock 初版验证与交接记录

> 历史记录：本页对应第一轮 UAT 前的初版；六项整改后的最新证据见 [第一轮 UAT 变更验证](10-uat-round1-verification.md)。

状态：初版开发验证完成，可交由用户 UAT；用户验收待执行。日期：2026-09-14。本文记录实际执行证据；[源码独立审查](05-source-review.md) 已关闭 9 个历史 P1，本次审查范围内开放 P0/P1 为 0。

## 交付范围与流程

源码位于 `../assets/app/`，启动器位于 `../scripts/launch.mjs`；本轮新增 `skill-manager` 与对应 command，并同步根/领域 README、marketplace 发现描述和 CHANGELOG。没有创建新的领域 plugin，没有更新 plugin 版本、提交、推送、安装此 skill 到 Codex 或公开发布。

| 阶段 | 实际交付 |
|---|---|
| 产品需求 | `01-product-requirements.md`，REQ-SD-001–010；独立产品审查无阻断项 |
| 界面设计 | `02-interface-design.md`；五页面、详情/预览/确认、宽/窄布局与状态设计 |
| 工程设计 | `03-engineering-design.md`、共享 API 类型；独立设计审查无阻断项 |
| 开发实现 | React/TypeScript/Vite GUI、Node HTTP/文件/CLI 服务、演练 fixture、启动 skill |
| 验证测试 | Node 集成、浏览器旅程、规模测试、本机只读、仓库发现校验、独立反例复核 |
| 用户 UAT | `06-uat-guide.md` 绑定实际按钮和样例，13 项全部待用户验收 |

用户在本任务授权完成本地研发到可运行初版；阶段技术审查不伪称用户逐份文档批准。开发过程中保留仓库已有未提交修改。

## 执行环境与结果

主执行环境为 macOS、Node v25.9.0、npm、Google Chrome 与 Playwright 1.63.0。独立审查者另用 Node v22.14.0 验证后端和启动器，支持最低运行时要求；项目声明 Node >=22.12。依赖由 `package-lock.json` 锁定。

以下命令除最后两项仓库校验外，均在 `assets/app` 执行：

| 验证 | 实际结果与边界 |
|---|---|
| `npm run build` | TypeScript 检查与 Vite 生产构建通过；CSS 38.17 KB、JS 278.55 KB（gzip 85.88 KB） |
| `npm test` | 最终 36 项全部通过（含 3 个子测试）：后端 29、launcher 6、性能 1；0 失败/跳过/取消，约 3.26 秒 |
| `npm run test:e2e` | 最终 10 项通过，0 失败，约 14.9 秒 |
| `node --test tests/launcher.test.mjs` | 6 项通过：构建指纹、并发启动锁、端口占用、实例复用/身份核实、注册失败清理、等待进程真正退出 |
| `node --test tests/performance.test.mjs` | 100 个独立技能全部发现、身份唯一；最终统一回归扫描 77ms，低于3秒目标。fixture排除外部 CLI 延迟 |
| `SKILLDOCK_PROJECT_DIR="仓库绝对路径" node tests/local-smoke.mjs` | 真实本机读取通过；详细范围见下表 |
| 仓库 `validate_codex_compat.py --format json` | repository profile通过：34个可发现技能、0 error；其他既有Claude扩展单独报告，不声称宿主运行通过 |
| 系统 `skill-creator/scripts/quick_validate.py <skill-manager目录>` | Skill is valid；仅本次新skill使用公共frontmatter |
| 相关路径 `git diff --check` | 通过 |

浏览器10项包括：旧环境迟到响应不覆盖当前环境；搜索/详情/键盘返回与开关持久化；预览取消、安装与重复冲突；更新与恢复前版；移除取消/恢复；市场/插件安装启禁卸载；4106条合成目录分批显示和全量搜索；1440/720/390px五页面与对话框布局。主要生命周期操作调用真实隔离后端；只有大目录规模测试替换了清单响应以复现规模，不用于声称真实插件安装成功。

已通过图像工具实际查看1440、720、390px技能库截图。窄屏隐藏导航的可访问名称和390px市场按钮溢出均由首轮测试发现，修复后全部通过。截图由 `test:e2e` 生成在被Git忽略的 `assets/app/test-results/` 中，可重复生成。

本机只读结果（最终一次并行回归期间）：

| 观测 | 结果 |
|---|---|
| 已发现技能 | 67：个人27、系统6、已核实插件附带31、仅缓存3；当前项目0 |
| 已安装插件 / 市场 | 15 / 3 |
| CLI | `codex-cli 0.154.0-alpha.6.2`，使用已探测的 plugin-appserver 二进制 |
| 完整清单读取 | 最终约2.87秒，包含外部 CLI 读取；此前运行约1.32–1.82秒 |
| 正文抽样读取 | 成功 |
| 诊断 | 0条 |
| 内容保留 | 339个受检查文件的前后散列一致，未调用任何写入API |

散列范围：真实Codex配置、已知用户/当前项目技能根内的文件；符号链接只比较链接本身，不递归证明其目标内容。插件缓存作为只读输入，不声称做过全量缓存字节比对。真实远程插件/市场写入、私有Git认证和已运行Codex会话重新加载没有在用户环境执行。

## 运行实例

从仓库根执行 `node plugins/testany-eng/skills/skill-manager/scripts/launch.mjs start`，已实际完成隔离运行目录的 `npm ci --ignore-scripts`、构建、启动及健康检查。URL为 [SkillDock](http://127.0.0.1:4771)，状态目录为 `~/.local/share/skilldock`，项目扫描上下文为本仓库。

已通过 Codex 内置浏览器实际读取到管理台页面：默认演练、6个预置技能、5个已启用、五个页面入口与安装按钮。新样例未被真实实例的开发测试消耗，用户可从UAT第一项开始。右侧打开请求及保留页面属于本地应用展示，不代表发布或安装Codex插件。

## 版本范围与限制

- 独立技能有可追踪来源才支持更新。初版对系统、平台托管、仅缓存或归属不明的资源保护；没有独立插件更新命令时，不把市场刷新说成插件升级。
- 配置含多行字符串或不支持的内联TOML写法时，开关操作会明确拒绝并保留原文件；通过官方设置管理这些情况。符号链接配置文件也不直接改写。
- 导入最多32MB、3000项、20层；SKILL.md最多2MB。预览30分钟有效，目标已有内容或来源/安装文件变动时需重新预览。
- 移除与恢复采用同磁盘原子移动；技能和备份区跨文件系统时明确拒绝移动，可通过同盘 `SKILLDOCK_STATE_DIR` 使用。
- GUI中的配置读回不等于当前Codex会话已重新加载；界面提示新会话/重启生效。
- 当前交付为单用户本地运行应用；不含原生左侧栏任意扩展注册、多用户、云服务或自动发布。

用户验收按[UAT指南](06-uat-guide.md)进行；界面美观、日常实用性与最终产品接受由用户决定。
