# 导航状态与私有 Git 来源

状态：SkillDock 0.3.0 发布基线。用户于 2026-09-15 授权提交、推送并通过 PR 合并到 main；沿用更新进度和标签功能。

## 产品与界面

- 左侧导航只用当前项的背景区分页面，移除红点及窄屏对应装饰；保留 `aria-current` 和真实可用更新数量。
- 私仓访问复用本机 Git 身份。HTTPS 仓库/目录链接使用 credential helper；SSH 仓库使用已配置密钥及 agent。浏览器登录不是 Git 登录，不暗中切换协议或账号。
- 安装技能、关联来源和添加 Git 市场均提供可展开的访问说明，覆盖 HTTPS、SSH、组织授权、定时更新和认证恢复。中英日文一致；应用不收集或持久化密码/token。
- 认证失败、仓库不存在或不可见、SSH 主机未验证分别提供可执行提示；404 不武断认定为私仓，也不伪装为无更新。定时检查使用相同凭据，凭据失效记录失败，授权恢复后可重试。

## 工程设计

- 现实现把 `GIT_CONFIG_GLOBAL` 设为 `/dev/null` 并禁用 system config，导致部分私仓认证 helper 不可用。
- 分离 Git 下载和文件检出：下载阶段使用用户/system Git 配置来解析 credential helper、SSH、企业 CA/代理；`--no-checkout`、空 template、禁用 hooks/submodule 和显式协议允许列表保持读取边界。检出阶段继续屏蔽全局/system filters；来源仓库不能让导入执行文件过滤脚本。
- 不继承调用目录的 Git 工作树环境或命令行配置注入，清除 Git trace，保留用户的 SSH agent 和身份设置。关闭终端/askpass/GCM 交互；授权在用户自己的终端完成。
- Codex 市场和插件操作仍由现有 Codex CLI 负责，继承同样的本机认证环境并提供同一错误分类，不另存一套账号。
- 保持来源 URL 不含凭据的原有契约；Git helper 输出直接交给 Git，应用只记录干净的来源地址、分支和 commit。
- SSH URL 中的用户名是连接身份，公开来源和预填保留它；密码、查询参数仍移除。GitHub 的 `ssh://` 根地址不走 HTTPS 目录链接解析。

## 验证计划

- 使用临时 HTTPS Git 服务（真实 Git HTTP backend）验证认证挑战、helper 成功和缺失、技能安装/关联/更新与计划失败后恢复；测试凭据完全独立于用户账号。
- 检查 hooks、smudge filters、模板及 URL rewrite 后非法协议仍不能在导入时执行；SSH 设置/agent 传递与错误分类。
- 验证 Codex CLI 适配器复用认证环境；本机可用时，以临时 Codex 根完成私有市场和包更新集成检查。
- 构建、相关自动回归及浏览器定向检查导航背景、无红点/伪元素和三语私仓说明；刷新现有 4774 候选服务供 UAT。

依据：Git 官方 [credential helpers](https://git-scm.com/docs/gitcredentials)、[clone 的 no-checkout/template 语义](https://git-scm.com/docs/git-clone)，以及 GitHub CLI [auth setup-git](https://cli.github.com/manual/gh_auth_setup-git)。

## 执行记录（2026-09-15）

- 生产构建与 TypeScript 通过。后端全量 123/123 通过；最后补充 SSH 来源用户名保留后，相关认证/来源/安全测试 22/22 通过。
- 真实 HTTPS Git HTTP backend 的 401 挑战、credential helper、自定义 CA 和 URL rewrite 成功；无凭据时不启动 askpass，清晰报告认证失败。技能安装、来源关联、定时更新失败后的文件保留、权限恢复后的下一轮成功及源码 commit 记录均通过。
- 使用本机 `codex-cli 0.154.0-alpha.6.2` 和独立临时 Codex 根完成私有 Git marketplace 添加、插件安装及 1.0.0 → 2.0.0 更新，读回包内技能确已变化。没有操作用户真实私仓、账号或安装；组织实际 SSO 和系统 Keychain 授权仍需用户环境 UAT。
- hooks/template/smudge filters 未执行；远程 URL 被用户配置 rewrite 成 file/ext 时仍被拒绝。SSH 命令与 agent 环境传递、主机未验证/账号认证失败/仓库不可见的分类通过。
- 原有浏览器回归 57 项直接通过，6 项 GitHub URL 用例因测试替身把远程地址换成本地文件而触发协议限制。仅调整该固定测试 URL 的替身环境后，6/6 定向复跑通过；生产协议限制保持。最终覆盖全部 63 项。
- Playwright CLI 检查了五个导航项在 1440/720/390px、浅/深主题的选中背景、无红点/伪元素及 `aria-current`。中/英/日私仓帮助和真实认证失败消息均验证，窄屏无水平溢出，截图已人工查看。

本机证据沿用 `output/skilldock-progress-tags/private-*` 和 `output/playwright/skilldock-progress-tags/private-*` / `navigation-*`；可复跑的认证 fixture、后端测试和真实 CLI smoke 位于 `assets/app/tests/helpers/private-git.mjs`、`private-git.test.mjs`、`private-market-smoke.mjs`。用户已授权发布本轮改动，未提供逐项 UAT 结果；实际组织 SSO、Keychain 和账号权限仍以各用户环境为准。

0.3.0 发布候选复核：生产构建、后端 123/123 和浏览器全量 63/63 单次运行全部通过。真实 Codex CLI 的独立 0.3.0 安装、损坏 PATH CLI 回退、交付内容/权限比对与只读 doctor 通过。日志记录为 `output/skilldock-progress-tags/release-*`。
