# 兼容测试矩阵对照：0.11.0 关口（HLD 11A 第 3 条）

> 日期：2026-10-10
> 分支：`feature/skilldock-0.11-cross-agent`（基于 `2b3cacb`；本表随阶段 6c 的提交一起提交）
> 依据：API-SDX-001 36b 附录 A（期望结果）、HLD 11A 第 3 条（“矩阵改用真实 0.11.0 代码写下的启动记录与健康检查返回，重跑全部 0.10.2 与 0.10.3 用例，含附录 A.5 的全部 0.11.0 关口用例，并补入 S-28 的正式用例”）
> 运行：在 `assets/app` 下，`sandbox-exec -f <hermetic.sb> node --test --test-concurrency=1 tests/compat-matrix.test.mjs`（沙箱禁止运行真实 Codex、Claude 命令行与对外联网）；全量 `npm test` 也包含它

## 1. 结果

- `tests/compat-matrix.test.mjs`：103 项全部通过（0.10.3 发布时为 37 项），其中 3 项为 V18（见第 3 节末）。全量 `npm test` 在加入 V18 之前为 599 项全部通过。
- 附录 A 中与共用技能、迁移、启动计划相关的用例另由 `shared-skills`、`migration`、`launch-plan`、`launcher`、`self-update` 测试覆盖，见第 3 节；本轮在 `shared-skills` 中补了 3 项（G-13 布局 C、G-15 两项）。

## 2. 运行方式

- **三类代码**：0.10.2 取 Git 提交 `ab6856f`（冻结代码），0.10.3 取 `337547a`（已发布），0.11.x 有两种：手写样本（`tests/fixtures/skilldock-0.11-sample`）与真实 0.11.0（当前工作树，`package.json` 为 0.11.0）。
- **两版都跑**：凡是用到 0.11 代码的用例，都对样本和真实 0.11.0 各跑一次（标题带“（真实 0.11）”的为后者）。只跑一版的用例不涉及 0.11 代码（N-12、S-23、S-26、B-01～B-03），或本来就只针对真实 0.11（A.5 的 G 系列）。
- **真实 0.11 的故障注入**：需要被调用方失败、换端口、输出超长、等待信号的用例，与样本读同一个控制文件 `stub-control.json`。真实 0.11 安装目录里的 `launch.sh` 是一层包装：先记录这次调用，再按控制文件处理，然后进入真实启动器。“失败”“先输出再失败”“等待信号”在进入真实启动器之前发生；“换端口”设置 `PORT` 后进入真实启动器；“超长输出”和“重启后失败”在真实启动器完成之后发生。启动记录与健康检查始终由真实 0.11 写出。
- **每条用例都断言**（附录 A 前言）：计划文件哈希不变、未注册后台任务、未新增 `<state>/node/`、未运行 npm。

## 3. 逐条对照

### A.1 0.10.2 原生入口

| ID | 覆盖 | 说明 |
|----|------|------|
| N-01、N-02 | 矩阵 `N-01/N-02a`、`N-02b`（两版） | |
| N-03～N-11、N-13 | 矩阵同名用例（两版） | N-08/N-09 分“首选”“兜底”两种 |
| N-12 | 矩阵 `N-12`（单版） | 本轮新增。没有启动记录、又没有 `PORT` 时，0.10.2 原生入口会用默认端口 4771；用例只给它测试世界自己的端口（见第 4 节） |
| N-14 | 矩阵 `N-14` 两项（两版） | 本轮新增：已打开过 / 首次打开 / 实例未运行 |
| N-15 | 矩阵 `N-15`（两版） | 本轮新增：只校验记录字段 |
| N-16、N-17 | 矩阵同名用例（两版） | |

### A.2 0.10.3 自身入口

| ID | 覆盖 | 说明 |
|----|------|------|
| S-01～S-17、S-19～S-25、S-27 | 矩阵同名用例（两版，S-23 单版） | S-17 真实版改为核对运行目录前后不变（真实 0.11 安装时运行目录已预先构建）；S-22 真实版的首选目标改为同版本的另一安装（真实 0.11 会主动切换到更高版本的首选目标，阶段 5d 行为） |
| S-18 | 每条 S 用例的共同断言 | 判定发生在工具链解析、Node 下载与构建之前：未新增 `<state>/node/`、未运行 npm；S-17b 另断言未新建运行目录 |
| S-26 | 矩阵 `S-26`（单版） | 本轮新增。以 SIGTERM 结束 `bootstrap.mjs`（原生入口 600 秒超时的效果），`launch.mjs` 照常完成启动 |
| S-28 | 矩阵 `S-28` 五项 × 两版 | 本轮新增（真实版在注入点之前不运行真实启动器，验证的是 0.10.3 认出真实安装布局并转发信号；S-27 同）：判定点 1 + SIGINT；判定点 2 + SIGINT、SIGTERM；判定点 3 + SIGINT、SIGTERM。判定点 3 由一个驱动脚本触发：它重复已发布 `launch.mjs` 入口的几行代码，在取锁后把数据代号改为 2，转交与信号转发仍走已发布的代码 |

### A.3 0.10.3 后台任务、原生入口与自更新

| ID | 覆盖 | 说明 |
|----|------|------|
| B-01、B-02、B-03 | 矩阵同名用例（单版，不涉及 0.11） | |
| B-04 | 矩阵 `B-04`（两版） | |
| U-01 | `self-update`：“0.10.3 backs off after failed restarts…”“caps the restart back-off at 30 minutes” | |
| U-02 | `self-update`：同上第一项的“starts over for a new target or an installation change” | |
| U-03 | 未自动化 | 0.10.2 协调器按轮询周期反复发起，属已登记残留 Q10，附录写明以第 10 轮评审实验为证；0.11 一侧对重复的重启任务快速拒绝由 G-11 覆盖 |
| U-04 | `self-update`：“0.10.3 also backs off when a restart fails before the launcher is called” | |

### A.4 0.10.2 回退

| ID | 覆盖 | 说明 |
|----|------|------|
| R-01、R-02 | 矩阵 `R-01/R-02`（两版） | |
| R-03 | 矩阵 `R-03`（两版） | 本轮新增。0.10.2 启动自己的服务，服务因计划文件 version 2 退出：断言不留启动记录、`server.log` 含 `INVALID_UPDATE_STATE`、端口空闲、计划不变（阶段 6 评审 PH6-P2-02 后补齐；N-12、N-14 实例未运行一支同样断言） |
| R-04 | 矩阵 `R-04`（两版） | 本轮新增 |

### A.5 0.11.0 关口（真实 0.11.0）

| ID | 覆盖 | 说明 |
|----|------|------|
| G-01 | 矩阵 `G-01/G-02/G-03`、`G-01 一键更新`；`launch-plan` 一键更新各项 | |
| G-02、G-03 | 矩阵 `G-01/G-02/G-03` | |
| G-05～G-10 | 矩阵同名用例 | G-08、G-09 另见 `migration` |
| G-11 | `migration`：“a failed takeover restores every file and the old instance; restart jobs for that target are refused until an interactive retry”；`launch-plan`：“generation 2: a restart job into a target whose switch failed and was rolled back is refused at once…” | 代号 1 与代号 2 两种失败记录 |
| G-12 | `launcher`：“a restart job that fails before the old instance stops is closed as failed without restored (G-12)” | |
| G-13 | `shared-skills`：布局 A（`claudeOwns`）、B（默认）、C（本轮新增“layout C…”）、D（`bothRoots`）各用例；版本 1 行为与 `SNAPSHOT_STALE` 见“moving a shared real directory away…” | |
| G-14 | `shared-skills`：批量移除与“a standalone skill whose content lies inside a plugin of the other side…”等 | |
| G-15 | `shared-skills`：来源冲突、恢复、跨侧确认各用例，本轮新增“a batch: the target whose two sides name different sources is skipped alone…”与“a plan target whose directory is gone is reported as missing and kept…”；`claude-skill-files`：“removal goes to the restorable area; restore follows the side of the record, not of the request” | |
| G-16 | `launch-plan`：“health version 2: … restart derived from restart.json only”（带不带执行者标记、执行进程是否仍持锁、目标是否一致）；`launcher` G-17 用例；`migration` G-08 | 判定规则已覆盖；“启动器在停止信号前后被强制终止”的时序本身没有端到端用例 |
| G-17 | `launcher`：“leftover jobs are closed as ready when the instance runs their source…(G-17)” | |
| G-18 | `launch-plan`：“0.10.x record ownership: same family, explicit testany-eng, pre-0.10.3 Claude directory form, others refused”；`migration`：Claude 侧旧记录各用例 | |

### V18 门槛的环境组合（HLD 9.3，真实 0.11.0 启动器）

| 组合 | 覆盖 | 结果 |
|------|------|------|
| 只有 Codex 装着 SkillDock，Claude 配置目录存在但 Claude 命令行不可用（无法确认） | 矩阵 `V18-a` | 门槛通过并接管，不因 Claude 无法确认而阻断（MR-SDX-001）；断言输出“Claude 命令行不可用，改用安装记录”，确认走的是无法确认一支 |
| 只有 Claude 装着 SkillDock，残留 `~/.codex`（配置在、无 SkillDock） | 矩阵 `V18-b` | 门槛通过并接管 |
| 只有 Claude 装着 SkillDock，残留 `~/.codex` 中有 0.10.2 缓存 | 矩阵 `V18-c/d` | 退出 4，stdout 为空；列出构成“已安装”判定的缓存目录与 `config.toml` 条目；不提供跳过；不写任何文件 |
| 同上，要求一键更新而 Codex 命令行不可用 | 矩阵 `V18-c/d` | 退出 4，说明“未找到可用的 Codex 命令行，无法一键更新”，并给出手动步骤 |

V18 的内容是环境组合，在临时目录中用真实 0.11.0 启动器能忠实构造；HLD 3.13A 原把它列为“真实宿主行为”，v1.30 已据此改正（阶段 6 评审 PH6-P3-05）。Claude 一侧带旧版、Codex 命令行可用时的一键更新由 `G-01 一键更新` 与 `launch-plan` 覆盖；文件证据不可读时不放行由 `migration` 的 “gate evidence…” 覆盖。

## 4. 本轮发现与处理

1. **N-12 首次实现时接触过用户本机的 SkillDock**：没有启动记录、又没有 `PORT` 时，0.10.2 原生入口回落到默认端口 4771。第一次写的 N-12 因此向本机 4771 端口发了几次只读的 `GET /api/health`（三次运行，每次最多两次），没有启动、停止或写入。已改为只给这条用例测试世界自己的端口；其他用例都有启动记录或显式端口，全部测试中再无落到 4771 的路径。
2. **R-03 的实际过程**：0.10.2 会先启动自己的服务，服务随即因计划文件 version 2 退出；面板显示的是固定错误。结果与附录一致（不留记录、计划不变）。
3. **真实 0.11 会主动切换到更高版本的首选目标**（阶段 5d），所以“运行中与首选不同”的状态在真实 0.11 下只在同版本时稳定，S-22 真实版据此调整，用例意图不变。
4. **未自动化的两处**：U-03（附录指定以实验为证的 0.10.2 残留）、G-16 的强制终止时序（判定规则已由单元测试覆盖）。是否需要为 G-16 补端到端用例，由 Owner 在阶段 6e 决定。
