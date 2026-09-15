# SkillDock 初版交付计划

当前发布决定：用户结束本轮 UAT，选择先通过 Git 仓库分发。发布准备见 [仓库分发记录](16-repository-release.md)，自身更新后的自动重启见 [重启交付记录](17-self-update-restart.md)，macOS 无需预装 Node.js 的启动入口见 [运行环境接入](18-codex-node-runtime.md)；以下保留各轮验收历史。


当前：第三轮 UAT 移除产品 Sandbox，最新证据与验收步骤见 [第三轮整改交付](14-uat-round3-delivery.md)。以下保留各阶段历史记录。

状态：初版已交付并收到第一轮 UAT；六项变更已实现并完成整合测试，第二轮用户验收待执行。

本轮依据 [UAT 变更基线](07-uat-round1-changes.md)，最新测试和运行证据见 [第一轮整改验证](10-uat-round1-verification.md)，用户步骤见 [第二轮 UAT](08-uat-round2-guide.md)。以下保留初版交付过程记录。

## 授权与输入

输入 ID：`BRIEF-SKILLDOCK-001`。2026-09-14 当前任务对话确定：在本仓库实现一个面向 Codex 本地 skills、plugins 与 marketplaces 的 GUI 管理台；在 Codex 右侧内置浏览器显示；现代、美观、实用；依次完成产品需求、界面设计、工程设计、开发实现、验证测试，初版交给用户 UAT。

用户授权本轮完成上述本地研发流程、运行应用和必要开发验证。阶段间采用独立工程审查继续推进，不虚构用户逐份批准。产品决策与 UAT 结论保留给用户。既有大量未提交修改不属于本轮范围，不进行提交、推送、公开发布或改动本机现有技能安装状态。测试写操作只针对独立 fixture 或演练工作区；本机清单只读核验。用户在 app 中显式操作是后续实际管理动作的输入。

## 目录决定

源码：`plugins/testany-eng/skills/skill-manager/assets/app/`；需求、设计和验收材料：本目录。launcher 位于 skill 的 `scripts/`，从实际安装目录定位 app。遵循现有按领域聚合 plugin 的规则，不创建新的 marketplace plugin，不修改既有版本。

## 顺序与完成证据

| 阶段 | 产物 | 状态 |
|---|---|---|
| 产品需求 | 01-product-requirements.md、产品审查 | 完成，独立技术审查无阻断项 |
| 界面设计 | 02-interface-design.md、交互状态与页面映射 | 完成，1440/720/390px 成品视觉与交互验证通过 |
| 工程设计 | 03-engineering-design.md、API 类型契约 | 完成，独立技术审查无阻断项 |
| 开发实现 | app 源码、launcher、skill 与入口 | 完成，独立源码审查无开放 P0/P1 |
| 验证测试 | 04-test-plan.md、05-verification.md、浏览器截图、06-uat-guide.md | 完成，36 项 Node 测试与 10 项浏览器测试通过；本机只读核验通过 |
| 用户 UAT | 用户填写验收结果 | 待验收 |

## 已核对上下文

仓库是 skills/plugin 集合，未发现现有 app 的 package.json 或可复用前端；根 AGENTS.md、docs/plugin-development.md、根及 testany-eng README、marketplace 与 plugin manifest 是本轮依据。已有工程测试样本不作为本 app 的业务基线。

官方资料（2026-09-14 查阅）：

- https://learn.chatgpt.com/docs/build-skills：独立技能发现、安装与 skills.config 开关。
- https://learn.chatgpt.com/docs/plugins：插件安装、卸载、启禁；插件和独立技能不同管理范围。
- https://developers.openai.com/plugins/build/plugins：本地 marketplace、打包规则、CLI。
- https://learn.chatgpt.com/docs/browser：内置浏览器展示本地 Web App。
- https://learn.chatgpt.com/docs/app-server：部分 plugin RPC 仍标注开发中，不作为唯一生产管理接口。

本机 CLI、目录和配置能力另行只读取证；官方文档存在不等于该本机版本支持，界面必须根据实际 adapter 能力显示操作。
