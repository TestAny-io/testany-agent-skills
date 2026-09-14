# Codex 运行环境接入

## 需求与验收

macOS 用户安装 SkillDock 后，通过 Codex 打开应用时无需事先手动安装 Node.js/npm。首次运行、后续打开、自身更新后的重启使用同一套环境发现规则；不修改 shell 配置、系统 Node、Codex 应用签名或 Codex 依赖目录。启动失败保留旧服务和用户数据。

## 交互设计

继续使用“打开 SkillDock”的技能入口和现有浏览器界面。首次准备环境时在任务中说明当前使用的环境或下载进度，启动成功后打开启动器返回的 URL。`status` 和 `stop` 不安装依赖、不下载运行时。诊断命令 `doctor` 返回选择结果，且不下载任何内容。

## 工程设计

- `/bin/sh scripts/launch.sh` 是不依赖 PATH 中 Node 的入口。它寻找 Codex 工作区 Node、已有 Node 或应用包 Node 来运行引导程序。
- 引导程序优先使用 Codex Workspace Dependencies 中可用的 Node，随后考虑已有专用运行时和 PATH 中的 Node。显式 `SKILLDOCK_NODE_BIN` 优先且配置错误时明确失败。
- 检查版本（22.12+）及 macOS 原生模块加载相关的签名权限。带 hardened runtime 且未允许外部动态库的应用包 Node 只用于引导，不用于 Vite 构建；不改签名或关闭系统保护。
- npm 可来自 Codex 应用包；用选定的 Node 显式运行 npm CLI。构建子进程的 node/npm 入口固定到该组合，避免 npm 的 shebang 又选回应用包 Node。
- 如果没有完整可用组合，在 SkillDock 数据目录内下载固定版本的官方 Node.js macOS 发行包；提取前核对代码中固定的 SHA-256，安装完成后原子启用并保留上游 LICENSE。下载失败不影响已有服务。
- 自更新 worker 经同一 shell 入口重新发现环境；新版构建、健康检查及回滚沿用原有机制。源代码归档包含全部引导脚本。

## 调查依据

- [OpenAI 仓库中的 macOS 实测报告](https://github.com/openai/codex/issues/19041)：应用包 Node 存在外部原生模块签名限制。
- [Codex 工作区运行环境实测](https://simonwillison.net/2026/Sep/1/codex-libreoffice/)：工作区依赖包含独立 Node 安装。
- 本机桌面应用 26.908.40834：应用包 Node 24.20.0、npm 11.19.0；工作区 Node 24.19.0。对同一 Rolldown 依赖，前者因 Team ID 不同加载失败，后者加载成功。
- 专用运行时使用 [Node.js 24.21.0 LTS](https://nodejs.org/download/release/v24.21.0/)；macOS arm64/x64 SHA-256 来自该版本官方 `SHASUMS256.txt`，于 2026-09-14 核对。变更固定版本时必须同步摘要并重做下载及启动验证。

## 验证计划

验证无系统 Node/npm 的发现与首次构建、路径含空格、最低版本及签名拒绝、下载失败和摘要不符不启用、重复启动复用、只读诊断、真实 CLI 的计划自更新及下一轮运行。所有安装和服务测试使用临时数据目录及端口；本机用户的 4771 服务保持原状。

## 执行结果（2026-09-14，macOS arm64）

- Node 全量 78 项通过，含新增的 8 项运行环境检查；TypeScript/Vite 构建通过。测试与构建均使用 Codex 工作区 Node 24.19.0。
- 浏览器重启回归 5 项通过：中英日偏好与页面保留、失败后旧服务仍可用、首次健康响应前断线后的新会话恢复。
- 子进程 PATH 仅保留系统目录、没有 Homebrew/nvm 的 Node/npm 时，shell 入口自动组合工作区 Node 24.19.0 与应用包 npm 11.19.0，完成首次构建、页面和源码 HTTP 访问、复用启动、主动重启及停止。
- 工作区依赖缺失且 PATH 无 Node/npm 时，由应用包 Node 引导，下载并校验专用 Node 24.21.0，完成相同整套启动验证；第二次启动和重启复用安装，Node/npm 原有 LICENSE 均保留。收尾再次验证私有环境诊断。
- 对隔离发布候选执行真实 Codex CLI 0.154.0-alpha.6.2 演练：从本地 HTTP Git marketplace 安装 0.1.0，计划更新到 0.2.0 后经 shell 入口自动重启；原计划、历史和下一轮定时运行均通过。测试入口 PATH 同样没有系统 Node/npm。
- 当前工作区、发布候选与构建源码归档的摘要一致：`1d6d38a2d48f74158025f2fe9400841c09e8ab08037081a625dab588b95d7143`，源码归档包含 61 个文件及新增引导入口。技能 frontmatter、shell 语法检查通过。

初次全量测试曾把已选择的 Node 也从测试夹具 PATH 中移除，导致一个使用 `env node` 的模拟 CLI 不能启动；调整为真实启动器使用的 Node PATH 后，完整 78 项重跑通过。候选的首次演练因尚未执行开发依赖安装而在测试程序入口失败；安装 lockfile 依赖后重跑通过。原始失败日志与后续结果分开保留，不将准备失败记为通过。

本次未验证 Intel Mac 实机、Windows/Linux、主机重启自启动。自动下载已配置官方 macOS arm64/x64 发行包的独立摘要；本次真实下载与执行仅覆盖 arm64。所有测试服务已停止；commit/push 尚未执行。
