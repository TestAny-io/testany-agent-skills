# SkillDock 仓库分发记录

2026-09-14：用户结束本轮 UAT，选择先走仓库分发，后续迭代有更多用户后再考虑官方目录。本文件记录发布准备，不把安装测试、commit、push 或合并视为互相替代。

## 分发决定

继续使用仓库已有 `.claude-plugin/marketplace.json`，来源 `./plugins/testany-eng`；SkillDock 是其中 `skills/skill-manager` 的能力，不新建领域插件。testany-eng 的版本 authority 仍只有其 `.claude-plugin/plugin.json`，由 2.3.0 提升为 2.4.0；内部应用 package.json 的 0.1.0 是 SkillDock 自身软件版本。

OpenAI 允许仓库 marketplace 使用既有 Claude-compatible 布局。Git来源可配置ref，插件安装到用户缓存；安装后的文件不等同Git工作区。仓库安装入口与官方公共目录为不同分发路径。[官方包装文档](https://developers.openai.com/plugins/build/plugins)、[官方GitHub导入说明](https://learn.chatgpt.com/docs/enterprise/plugin-management)。本次不申请平台身份、提交目录审核或建立公网MCP服务。

## 提交边界

仅包含skill-manager子树、对应command、marketplace的skill-manager描述、eng manifest的说明与版本，以及根README、eng README、CHANGELOG中的SkillDock段落和AGENTS中的SkillDock安装入口。仓库现有其他研发流程、营销、测试平台、AGENTS的其他改动、CLAUDE和B1–B4相关改动继续留在原工作区，不纳入本次候选。

发布候选从当前主干另建隔离工作区，使用明确的文件列表与共享文件片段，避免将其他任务的改动一起发布。构建产物、node_modules、测试截图/trace、.state、.source-snapshot和本机output不进入Git或安装包。历史取证文档的用户home前缀匿名化，AGPL许可证和第三方声明一并保留。

## 验证与执行状态

自身升级补测见[17记录](17-self-update-restart.md)：Node全量70项及更新整改17项、浏览器全量43项及重连整改5项通过；真实CLI的本地与Git来源自升级和Git下一轮计划通过。该阶段源码摘要为`8cfdbbb650440f3dba9060b826e7c848b7ea300570de059fc4f210940915bf96`。最新启动入口与运行环境验证见[18记录](18-codex-node-runtime.md)。以下保留初次分发准备时的安装证据与历史源码摘要。

- UAT代码基线：61项Node、39项浏览器回归通过；见14/15记录。
- 候选静态发现：testany-eng全部22个技能通过，含skill-manager；本skill独立frontmatter检查通过，差异无空白错误。
- 本机Codex CLI 0.154.0-alpha.6.2在临时配置根识别既有Claude-compatible marketplace，安装并读回testany-eng 2.4.0；73个SkillDock文件与候选逐字节相同。
- clone安装入口补测：在候选仓库根目录、另一份临时Codex配置中执行`marketplace add .`与`plugin add`，本地相对来源解析正确，读回2.4.0为已启用，安装后的SKILL.md与候选一致；AGENTS到README的安装入口检查通过。
- 从实际安装缓存中的launcher启动，Node 22.14.0完成依赖安装、TypeScript/Vite构建与健康检查，生产会话为local；测试实例随后正常停止，用户4771实例未停止。
- HTTP下载源码与许可证摘要匹配构建manifest；下载源码解包后分发/启动回归11/11通过（4.88秒）。源摘要e0fc96f130da6d94f81b1609336e7167f84dd63b8264268909a422db6bb49493。
- 首次误在派生运行缓存执行作者测试，因该目录不是完整源码树而失败；原始日志保留。随后改为从完整下载源码执行上述11项测试，未通过改动产品来规避失败。
- 全库用较新的工作区校验器检查候选时，报告testany-llm中主干已有的prompt-optimizer Stop hook缺once:true。该文件与HEAD字节一致，不在本次testany-eng版本内；不能声称全仓检查全部通过。
- commit/push/main可用性分别在实际完成后记录；不预填已发布。

## 自身升级重启：已修复

用户追问直接GitHub安装、日常打开和自身定时更新后，核对代码发现：Git来源的包更新会刷新marketplace并通过Codex安装新版本，但当前服务运行的是独立runtime，调度器不会重新构建或切换正在运行的SkillDock。需要区分“插件包已更新”与“应用正在运行新版”。

隔离复现已确认启动器的版本目录问题：用临时目录模拟2.4.0安装记录与2.5.0缓存位置，调用新版`launch start`会因`record.source !== appDir`报“此数据目录属于另一个源码实例”。复现没有启动服务或修改用户数据。既有测试覆盖同一源码路径下的重建，未覆盖版本化缓存目录迁移。

用户确认采用更新后自动restart。上述缺口已修复，稳定安装身份、旧缓存清理、运行目录恢复、浏览器重连和计划持续执行均已验证；详见[自身更新重启记录](17-self-update-restart.md)。GitHub直装说明已置于根README首选入口，AGENTS仅提供clone场景的附加提示。自动更新仍以服务运行中且用户明确选择目标为前提，本地clone来源不会自动pull用户工作区。

## 首次安装与更新

首次安装：`codex plugin marketplace add TestAny-io/testany-agent-skills`，然后`codex plugin add testany-eng@testany-agent-skills`。在新任务中用`$skill-manager`打开应用。已安装用户先`codex plugin marketplace upgrade testany-agent-skills`，再安装新副本。CLI缺少对应命令时使用宿主插件页面；安装需要Git。macOS启动入口自动选择或准备Node 22.12+与npm，用户无需预装全局Node，见[运行环境接入](18-codex-node-runtime.md)。

已clone的用户也可在Codex中打开仓库并请求“请按照README安装SkillDock，并打开技能管理面板”。AGENTS将该请求指向根README；本地来源使用仓库根目录的`codex plugin marketplace add .`，再安装`testany-eng@testany-agent-skills`。本地来源更新先在clone中`git pull --ff-only`，再安装新副本；clone本身不代表已安装，GitHub与本地来源选择一种即可。

当前支持声明为macOS已验证，Windows/Linux未验证。软件在本机loopback运行；不将管理本机技能的服务放到公网。自动更新在本地服务运行时生效，电脑休眠或服务停止时暂停，未注册开机自动启动。
