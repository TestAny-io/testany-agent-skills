# V17 结果：在真实 Codex 中把 SkillDock 从 0.10.3 更新到 0.11.0

> 日期：2026-10-10（两轮）；补充证据取自 2026-10-10～12 的最终 UAT（[61](61-final-uat-claude-desktop.md)）
> 执行：另一台电脑上的 Codex 按 [60](60-v17-real-codex-update.md) 执行，用户在旁操作原生界面；本文由开发者根据两轮报告与最终 UAT 记录整理
> 环境：macOS 27.0.1；Codex Desktop 26.1007.21159（build 20052）；可运行的 Codex CLI 为桌面应用内置的 `codex-cli 0.162.0-alpha.17.2`（PATH 中的 wrapper 报 ENOENT，按 60 改用内置 CLI）；更新前 `skilldock@testany-agent-skills` 0.10.3、已启用；更新前数据目录没有 `generation.json`
> 备份与采样：那台电脑的 `~/skilldock-v17/`（含本地私人配置，不入库）
>
> **修订（2026-10-12）**：按复核 [63 r3](63-cross-agent-synthesized-manifest-review-r3.md) 修订，上一版 sha256 `c91bd3e0d4383492509b506b5d27c00dcc34485c908f2423333deecc9172a111`（提交 `c223730`）：第 4 节按 60 第 9 节的项名一一对应；语言与主题的说明更正为页面本地存储；计划中 SkillDock 自身一项需重新选择写入第 1 节。

## 1. 结论

**主体通过；两项未按 60 记录，见第 4 节。** 0.10.3 → 0.11.0 的真实更新、0.10.3 自更新协调器的转交、数据迁移、开着的原生页面重连、关闭再打开入口都与 HLD 3.7、36b 第 7 节的预期一致；计划、绑定、历史与后台任务在迁移后保留（计划中 SkillDock 自身一项因安装目录变化需重新选择，见第 4 节）。

## 2. 第一轮（BLOCKED，未改动任何东西）

- 依据 60 的上一版（sha256 `aeb85b1e2721dff5d0a692559cea1fff3d40e95dccf1df4108a26120d04628e4`）。只读预检、备份（18:31:22 完成，20,241 个普通文件逐一校验一致）与 0.10.3 原生页面基准完成。
- 第 6.1 步 `codex plugin marketplace add TestAny-io/testany-agent-skills --ref feature/skilldock-0.11-cross-agent --json` 退出码 1：`marketplace 'testany-agent-skills' is already added from a different source; remove it before adding this source`。按 60 第 2 节停下，没有执行 remove，配置文件哈希与备份一致，服务（pid 12194，instanceId `6f0a6307-…`）与三个原生连接进程不变。
- 处理：60 第 6 步改为不运行 `marketplace add/remove`，经同意只在配置中为该 marketplace 加一行 `ref`，再 `marketplace upgrade` 与 `plugin add`（提交 `e7bf95a`）。

## 3. 第二轮（更新与观察）

依据修订后的 60（sha256 `57b9432cf90ac96d871a3f11661b77228b1c9740efb427247bda64f9654b945d`）。源副本提交 `e7bf95a`（含 `122ef9f`），manifest 与安装读回均为 0.11.0。配置只新增该 marketplace 的 `ref` 一行，权限保持 0600。

安装命令于 18:45:07.451（上海时间）成功完成，此后原生页面保持不刷新，每 30 秒采样：

| 安装后 | 时间 | appVersion | dataGeneration | 服务 pid | 原生连接 pid | generation.json |
|---|---|---|---|---|---|---|
| +0s | 18:45:07 | 缺省 | 缺省 | 12194 | 72000、73919 | 无 |
| +30s | 18:45:37 | 缺省 | 缺省 | 12194 | 72000、73919 | 无 |
| +60s | 18:46:07 | 缺省 | 缺省 | 12194 | 72000、73919 | 无 |
| +90s | 18:46:37 | 0.11.0 | 2 | 74544 | 72000、73919 | 有 |
| +120s | 18:47:07 | 0.11.0 | 2 | 74544 | 72000、73919 | 有 |

（0.10.3 的健康检查不提供版本与代号字段，“缺省”不表示代号为 0。）

- 转交时间线：重启记录 `requestedAt` 18:46:13.182、`completedAt` 18:46:15.869；`generation.json` 的 `writtenAt` 18:46:15.609；新服务 instanceId `2898bbf8-…`。即 0.10.3 的自更新协调器在安装后约 66 秒发起重启，由 0.11.0 接管并完成迁移。
- 迁移：`updates.json` 格式 1 → 2，schedule、bindings、observations、runs、activity 内容完全保留；`registry.json` 与备份逐字节相同；后台任务的 context 指向 0.11.0 的来源与运行目录，LaunchAgent 名称保留、最近退出码 0；实际扫描项目不变；新启动记录的旧 `project` 字段按 36a 指向 `compat/legacy-project`，`actualProject` 保留真实目录。
- 18:52:46 页面确认：服务 pid 与 instanceId 不变；0.10.3 的原生连接 72000 仍在，另有 0.11.0 的原生连接 74813，73919 已退出。
- 用户确认：开着的原生页面自动重连、没有报错、可见“Agent 环境”；关闭原生入口后重新打开正常，服务 pid 与 instanceId 不变。

## 4. 对照 60 的汇报项

| 项（60 第 9 节） | 结果 |
|---|---|
| 设置 `ref` 的结果、副本的提交与版本 | 配置中为该 marketplace 加 `ref` 一行（权限 0600，未运行 `marketplace add/remove`），`marketplace upgrade` + `plugin add`；副本提交 `e7bf95a`（含 `122ef9f`），manifest 与安装读回 0.11.0。第一轮的 `--ref` 方式受阻，见第 2 节 |
| 更新后原生入口的长连接进程是否保留（进程号前后） | 升级后 120 秒内两个旧连接（72000、73919）都在；到页面确认时 73919 已退出、72000 仍存活，另有 0.11.0 的连接 74813（不能据此断言所有旧连接永久保持） |
| 服务何时切到 0.11.0（时间、`appVersion`、`dataGeneration`） | 18:46:15 完成转交，+90 秒采样为 `appVersion` 0.11.0、`dataGeneration` 2 |
| 开着的原生页面：是否自动重连、有无报错、是否出现“Agent 环境” | 自动重连、无报错、出现“Agent 环境” |
| 关闭再打开入口后 | 正常，同一实例 |
| 重启 Codex 后 | **未按 60 记录**（第二轮报告停在这一步之前）；Owner 决定以间接证据为准：10-12 在 Codex 中打开 SkillDock 原生页面正常、沿用当时的实例（61 第二部分） |
| `$skill-manager` 打开的是否同一实例 | **未按 60 记录**；Owner 决定以间接证据为准：同一启动器在 Claude 一侧验证过沿用同一实例（61 第 6 节） |
| 计划、后台任务是否保留 | 保留（第 3 节）。10-11 10:56 计划照常补跑；其中 SkillDock 自身一项因安装目录变化而跳过（`TARGET_BINDING_CHANGED`，0.10.x 起的规则：经 CLI 在 SkillDock 之外更新插件，旧计划不接管新对象），绑定数据还在但不再生效，需在更新页重新选择，已记入 37 的 0.11.x 改进候选 |
| 其他异常 | 见第 2 节（第一轮的来源冲突）与第 5 节 |

AC-007 的补充说明：语言与主题保存在页面的本地存储（`localStorage`），服务端不保存，也不经数据迁移；能否保留取决于新实例下页面来源不变。由自动用例 `runtime-restart.spec` 覆盖，真机没有单独核对。

## 5. 其他观察

- Codex 中开着 SkillDock 原生页面时，停止实例后 6～25 秒内原生入口会自动重新拉起后台（61 第二部分）。
- 同为 0.11.0 时，Codex 副本的内容曾在原版本目录中被更新（2026-10-12 10:41），实例不因此重启（DEC-SDX-008：同版本沿用运行实例）；正式发布每次都升版本，只在开发分支出现。
- 0.10.3 的服务日志中有历史版本构建与旧提示，缺少逐行时间戳，未作为本次证据。
