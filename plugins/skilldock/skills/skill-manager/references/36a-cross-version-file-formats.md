# SkillDock 跨版本文件格式契约

> 所属契约：[API-SDX-001 跨 Agent 管理接口契约](36-cross-agent-api-contract.md)（索引）
> 本文是索引中的“文件格式”分册。共享规则（版本、兼容、安全）以索引第 3 节为准。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 契约 | API-SDX-001-A 跨版本文件格式 |
| 版本 | 0.2 |
| 状态 | 草稿（首轮契约评审 CHANGES_REQUESTED 后的修订，待复审；复审通过前不得编写 0.10.3） |
| Owner | SkillDock 维护者（产品 Owner：用户） |
| 写入方 | SkillDock 0.11.x 的启动器、服务与后台任务 |
| 读取方 | 0.10.2 冻结代码（只读旧字段）；0.10.3（只读本文标注“0.10.3 读取”的字段）；0.11.x |
| 上游 | PRD-SKILLDOCK-002 v0.9；HLD-SDX-001 v1.3 第 3.7、5.3、5.4 节 |
| 兼容目标 | 0.10.3 发布后，本文中标注“冻结”的位置、字段名、取值规则与判定方式不得再改；只要 0.11.x 仍声明与 0.10.2、0.10.3 共存，就必须按本文写入 |

## 2. 范围与边界

覆盖：
- 数据目录中跨版本共享或用于跨版本识别的文件：数据代号标记、启动记录、Claude 根目录记录、计划文件版本、旧项目固定子目录；
- 0.10.3 识别 SkillDock 安装时依赖的插件缓存布局与 marketplace 来源记录（只读，属于宿主格式，本文只冻结 0.10.3 的读取方式）；
- marketplace 来源标识的规范化与等价规则。

不覆盖：
- 0.11.x 内部数据（来源记录分区、环境管理状态、安装登记、计划内容的具体结构）。它们只受“0.10.x 不读取”和第 8 节的限制，字段由实现定义并随代码评审。
- HTTP 接口：见 [36c](36c-http-api-delta.md)。启动脚本的调用与转交：见 [36b](36b-launcher-handover-protocol.md)。

数据所有权：数据目录（默认 `~/.local/share/skilldock`，可由 `SKILLDOCK_STATE_DIR` 指定，下称 `<state>`）只属于 SkillDock。宿主文件（Codex 的 `config.toml` 与插件缓存，Claude 的 `known_marketplaces.json` 与插件缓存）只属于宿主，SkillDock 不写这里列出的宿主文件。

## 3. 通用规则

- 编码 UTF-8 的 JSON，不带注释；写入方用“同目录临时文件 + 原子重命名”，文件权限 `0600`，目录 `0700`。
- 路径一律为绝对路径，取 `realpath` 后的规范形式；不得包含控制字符；长度 ≤ 4096。
- 读取方单个文件只读取不超过 1 MiB 的内容（超出视为不可读）；遇到未知字段一律忽略；遇到冻结字段缺失、类型不符或 JSON 无法解析时，按各节写明的“失败方向”处理。失败方向的原则：**0.10.3 读不懂时不接管、不改写**。
- 版本号只认 `x.y.z`（三段非负整数）。带预发布或构建后缀的视为无效版本，对应安装不参与比较。比较按三段数值逐段进行。
- 下文“冻结”指 0.10.3 发布后不得改动；“0.11 自定”指只受本文约束、具体内容由 0.11.x 实现决定。

## 4. 数据代号标记（冻结）

位置：`<state>/generation.json`

```json
{
  "format": 1,
  "generation": 2,
  "minimumCompatibleGeneration": 2,
  "writtenBy": "0.11.0",
  "writtenAt": "2026-10-20T08:00:00.000Z"
}
```

| 字段 | 类型 | 约束 |
|------|------|------|
| `format` | 整数 | 本标记文件自身的格式，固定为 1 |
| `generation` | 整数 ≥ 1 | 当前数据代号。0.10.x 数据为 1，0.11.0 迁移完成后为 2 |
| `minimumCompatibleGeneration` | 整数 | 能安全读写本数据的最低代号支持；0.11.0 写 2 |
| `writtenBy` | 字符串 | 写入方应用版本，仅供诊断 |
| `writtenAt` | 字符串 | ISO 8601 时间，仅供诊断 |

- 写入时机：0.11.0 迁移的最后一步（HLD 3.7“迁移与接管”第 5 步）。此后永不删除，也不回写为 1。
- 0.10.3 的判定（冻结）：
  - 文件不存在：代号视为 1；
  - 文件存在且可解析、`generation` 为整数：取其值；
  - 文件存在但不可读、无法解析或 `generation` 不是整数：**视为 ≥ 2**（不接管）。
- 代号 ≥ 2 时，0.10.3 进入转交链（36b 第 4 节），后台任务本次直接结束（36b 第 8 节）。

## 5. 启动记录（冻结旧字段 + 冻结新字段）

位置：`<state>/launcher.json`（与 0.10.x 同一文件）

0.11.x 写下的启动记录同时含有两组字段：供 0.10.2 读取的旧字段，以及供 0.10.3 与 0.11.x 识别的新字段。

### 5.1 示例（实例运行中，Codex 侧有 0.11.0）

```json
{
  "url": "http://127.0.0.1:4771",
  "pid": 41235,
  "state": "/Users/u/.local/share/skilldock",
  "project": "/Users/u/.local/share/skilldock/compat/legacy-project",
  "projectContext": null,
  "source": "/Users/u/.codex/plugins/cache/testany-agent-skills/skilldock/0.11.0/skills/skill-manager/assets/app",
  "installation": {
    "kind": "plugin",
    "codexHome": "/Users/u/.codex",
    "marketplace": "testany-agent-skills",
    "plugin": "skilldock",
    "appPath": "skills/skill-manager/assets/app"
  },
  "digest": "3f2a…（与健康检查 sourceDigest 相同）",
  "runtime": "/Users/u/.local/share/skilldock/runtimes/3f2a…",
  "codexHome": "/Users/u/.codex",
  "cli": { "available": true, "path": "/…/codex", "version": "0.160.1" },
  "execution": { "node": "/…/node", "nodeVersion": "22.14.0", "source": "saved" },

  "format": 2,
  "generation": 2,
  "status": "running",
  "running": {
    "agent": "claude",
    "marketplace": "testany-agent-skills",
    "appPath": "/Users/u/.claude/plugins/cache/testany-agent-skills/skilldock/0123456789ab/skills/skill-manager/assets/app",
    "version": "0.11.0",
    "sourceKey": "github.com/testany-io/testany-agent-skills"
  },
  "preferred": {
    "agent": "codex",
    "marketplace": "testany-agent-skills",
    "appPath": "/Users/u/.codex/plugins/cache/testany-agent-skills/skilldock/0.11.0/skills/skill-manager/assets/app",
    "version": "0.11.0",
    "sourceKey": "github.com/testany-io/testany-agent-skills"
  },
  "actualProject": "/Users/u/work/repo",
  "updatedAt": "2026-10-20T08:00:00.000Z"
}
```

### 5.2 旧字段（冻结；0.10.2 读取）

这些字段的读取方是无法修改的 0.10.2 代码：`scripts/launch.mjs`、`server/native-backend.mjs`、`server/self-update.mjs`、`server/background.mjs`。规则对应 HLD 5.4“启动记录旧字段对 0.10.2 冻结代码的兼容约束”①～⑦。

| 字段 | 0.11.x 必须写入的值 | 依据（0.10.2 代码） | 达到的效果 |
|------|-------------------|--------------------|-----------|
| `url` | `http://127.0.0.1:<端口>`，即实例实际监听的地址 | `native-backend.mjs` 的 `localOrigin` 只接受此形态 | 0.10.2 原生入口代理到实际端口；新实例换端口时读到新地址 |
| `pid` | 实例进程号；“已停止”形态保留最后一次的进程号 | 健康检查比对 `h.pid === r.pid` | 实例运行中时 0.10.2 原生入口能核实并代理 |
| `state` | `<state>` 的规范路径 | 两处都比对 `record.state` | — |
| `project` | `<state>/compat/legacy-project` 的规范路径（第 7 节），不得等于健康检查的 `launchProject` 与 `project` | `launch.mjs` 的 `matches()` 比对 `(launchProject‖project) === record.project` | 0.10.2 启动器的 `start`、`restart`、`stop` 无法核实实例而拒绝，`status` 报“已停止”，都不会停止正在运行的 0.11.x（K3） |
| `projectContext` | `null` | 仅在 0.10.2 自己启动时使用 | — |
| `source` | ① 规则见下 | `native-backend.mjs` 用它判断能否转交与转交目标 | 0.10.2 原生入口转交给较新的 Codex 侧安装 |
| `installation` | ② 规则见下；**键顺序固定**为 `kind, codexHome, marketplace, plugin, appPath` | `sameInstallation` 用 `JSON.stringify` 全等比较 | 缓存被删除时 0.10.2 仍能核实身份 |
| `digest` | 与健康检查 `sourceDigest` 相同 | `native-backend.mjs` 要求 `h.sourceDigest === r.digest` | 0.10.2 原生入口能核实实例 |
| `runtime`、`codexHome`、`cli`、`execution` | 实际值 | 诊断与 0.10.2 自更新的自检（0.10.2 服务在代号 2 下不会运行） | — |

规则 ①（旧 `source`）：
- 取 Codex 侧插件缓存中、与运行实例属于**同一已核实 marketplace 来源**（第 9 节）的最高版本 SkillDock 的应用目录：`<codexHome>/plugins/cache/<marketplace>/skilldock/<版本>/skills/skill-manager/assets/app`。
- 版本目录名必须等于该缓存中 `.codex-plugin/plugin.json` 的 `version`，`<source>/package.json` 的 `version` 必须为 `x.y.z`（0.10.2 用它比较新旧）。
- `<source>/../../scripts/launch.sh` 必须存在（0.10.2 原生入口转交时执行它）。
- 迁移门槛保证 Codex 侧此时已是 ≥0.10.3。
- Codex 侧没有同源（第 9 节）的 SkillDock 安装时：取当前运行安装的应用目录（即 `running.appPath`）。此时不存在需要转交的 Codex 侧同源 0.10.x 入口。

规则 ②（旧 `installation`）：
- Codex 侧有同源安装时：取与 `source` 对应的 Codex 安装身份 `{"kind":"plugin","codexHome":<规范路径>,"marketplace":<名称>,"plugin":"skilldock","appPath":"skills/skill-manager/assets/app"}`，与 0.10.2 `installationIdentity()` 对该路径的计算结果逐字节相同。
- Codex 侧没有同源安装时：取 0.10.2 对 `source` 的计算结果 `{"kind":"directory","source":<规范路径>}`。

刷新时机：0.11.x 的启动器、服务与后台检查发现 Codex 侧 SkillDock 缓存新增、升级或删除时，在锁内（HLD 3.7“共存期的锁”）刷新 `source` 与 `installation`（⑦）。

### 5.3 新字段（冻结；0.10.3 读取）

| 字段 | 类型 | 约束 | 0.10.3 是否读取 |
|------|------|------|----------------|
| `format` | 整数 | 0.11.x 写 2。**判定特征**：`format` 为整数且 ≥ 2 即为“0.11.x 写入的启动记录” | 是 |
| `generation` | 整数 | 与第 4 节标记一致，仅供诊断 | 否（以第 4 节为准） |
| `status` | `"running"` \| `"stopped"` | 0.11.x 自己停止实例时不删除记录，改为 `"stopped"`，其余字段保留 | 是 |
| `running` | 安装引用 | 实例运行所用的安装。实例启动或切换运行源完成时写入；其他时候不改 | 是（第 2 步） |
| `preferred` | 安装引用 | 首选启动目标：各 Agent 中同一已核实来源、未带废弃标记、产品版本最高的安装（DEC-SDX-008）。首次写记录时写入；任一侧安装新增、升级或删除时在锁内刷新 | 是（第 3 步） |
| `actualProject` | 绝对路径或 `null` | 实例实际扫描的项目。实例启动或切换项目时写入；写成“已停止”形态时保留 | 否（0.11.x 项目回退第④级使用） |
| `updatedAt` | 字符串 | ISO 8601 | 否 |

安装引用（冻结）：

| 字段 | 约束 |
|------|------|
| `agent` | `"codex"` \| `"claude"` |
| `marketplace` | 宿主中的 marketplace 名，满足 `^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$` |
| `appPath` | 安装中应用目录的规范绝对路径，形态见第 10 节 |
| `version` | 该安装 `package.json` 的 `x.y.z` 版本 |
| `sourceKey` | 第 9 节规范化后的来源标识，仅供诊断；**0.10.3 不信任它**，一律按第 9、10 节自行复核 |

失败方向（0.10.3）：
- `launcher.json` 不存在：视为没有记录；
- 存在但不可读或无法解析：本身不触发转交链。代号为 1 时 0.10.3 沿用 0.10.2 的“启动记录不可读”报错（不接管）；代号 ≥ 2 时进入转交链，`running`、`preferred` 视为不可用；
- `format ≥ 2` 但 `running` 或 `preferred` 缺失、类型不符：对应步骤视为不可用，继续转交链的下一步。

### 5.4 写入顺序与锁

- 迁移时的写入顺序固定为：新格式计划文件 → 启动记录 → 数据代号标记（HLD 3.7）。因此“代号 2 存在”时，计划文件与启动记录都已就位。
- 迁移完成后，启动记录的每次写入都在“实例锁 → Codex 锁（Codex 配置根存在时）”下进行。
- 0.10.3 **从不写**启动记录。转交链第 2 步要求记录逐字节不变。
- 代号 ≥ 2 而启动记录不存在时（被 0.10.x 启动器删除），0.11.x 的启动器、服务与后台检查在锁内补写一份反映实际状态的记录（36b 第 6.3 节；PRD Q8）。

## 6. Claude 根目录记录（冻结）

位置：`<state>/agents/claude-root.json`

```json
{
  "format": 1,
  "configDir": "/Users/u/.claude",
  "pluginCacheDir": "/Users/u/.claude/plugins/cache",
  "origin": "default",
  "updatedAt": "2026-10-20T08:00:00.000Z"
}
```

| 字段 | 类型 | 约束 |
|------|------|------|
| `format` | 整数 | 固定为 1 |
| `configDir` | 绝对路径 | Claude 配置根 |
| `pluginCacheDir` | 绝对路径 | Claude 插件缓存根 |
| `origin` | `"explicit"` \| `"session"` \| `"default"` | 来源（DEC-SDX-024 的三级），仅供诊断 |
| `updatedAt` | 字符串 | ISO 8601 |

- 写入方：0.11.x，在首次发现或启用 Claude 环境时写入，用户切换 Claude 根目录后更新。门槛通过前也可以写（该目录不在 0.10.x 读取范围内）。只要 0.11.x 仍声明与 0.10.3 共存，就不得删除或改变格式。
- 0.10.3 的读取（冻结）：
  - 只在转交链触发后（代号 ≥ 2，或存在 `format ≥ 2` 的启动记录）读取；
  - 只用于两件事：识别“本安装”是否位于该 Claude 缓存下，以及第 3 步兜底时枚举该缓存；
  - `format` 不是 1、任一路径不是绝对路径或 JSON 无法解析：忽略整份记录，退回默认值（36b 第 5.1 节）；
  - 0.10.3 不读取 `<state>/agents/` 下的其他文件，不写任何文件。
- 0.10.2 不读取 `<state>/agents/`。

## 7. 旧项目固定子目录（冻结）

位置：`<state>/compat/legacy-project/`

- 0.11.x 在写入启动记录之前创建；之后每次启动器运行时确认它存在（缺失即重建，权限 `0700`）。
- 内容为空，不存放任何数据，也不作为任何项目使用。
- 作用：作为启动记录旧 `project` 字段的值。0.10.2 原生入口在 `SKILLDOCK_PROJECT_DIR` 与 `project.json` 都不存在时，会把它作为 `--project` 与子进程工作目录，因为目录存在，转交不会失败（HLD 第 5 轮 E2/E1）。
- 0.11.x 收到它作为项目时一律跳过（36b 第 6.3 节项目回退）。

## 8. 计划文件版本（冻结）与其他 0.10.x 读取的文件

| 文件 | 0.11.x 的写法 | 对旧版本的效果 |
|------|--------------|---------------|
| `<state>/local/updates.json` | 顶层 `"version": 2`；迁移时无论原先是否存在都写，此后永不删除；其余内容 0.11 自定 | 0.10.2、0.10.3 的调度器要求 `version === 1`，否则报 `INVALID_UPDATE_STATE`，服务启动失败，不改写计划、绑定、历史（HLD 9.3 V16）。0.10.3 后台任务读到 `version ≠ 1` 时本次直接结束（36b 第 8 节） |
| `<state>/background/context.json` | 顶层 `"version": 2`，由 0.11.x 在接管后台注册时连同 `entry.mjs`、`run.sh` 一起改写 | 0.10.x 的后台入口只接受 `version === 1`；接管后旧入口不再被调用 |
| `<state>/project.json` | 沿用 0.10.x 格式（`path`、`recent`），在用户切换项目时写入 | 0.10.2 原生入口用它作为 `--project` 的第二级 |
| `<state>/restart.json` | 沿用 0.10.x 格式 | — |

0.10.2 的后台工作进程读取 `updates.json` 的 `schedule` 时不检查 `version`，并会在“已卸载”路径改写该文件（`background-worker.mjs`）。因此新格式计划文件必须在 0.11.x 接管后台注册（改写 `entry.mjs`、`run.sh`、`context.json` 并读回）之后才写入，即 HLD 3.7 迁移顺序的第 2、3 步，不得颠倒。

门槛失败（发现低于 0.10.3 的安装）时，0.11.x 不得写上表任何文件，也不得写 `<state>/launcher.json`。门槛通过前只允许写 `<state>/agents/`、`<state>/settings/` 等 0.10.x 不读取的位置。

## 9. marketplace 来源标识的规范化与等价（冻结）

用途：判断两个 SkillDock 安装是否来自“同一已核实 marketplace 来源”（DEC-SDX-007）。0.10.3 转交链第 3 步与 0.11.x 归属核实使用同一规则。

### 9.1 读取来源（只读宿主文件）

| 宿主 | 文件 | 读取的内容 |
|------|------|-----------|
| Codex | `<codexHome>/config.toml` | 表头 `[marketplaces.<名称>]` 或 `[marketplaces."<名称>"]` 下的 `source_type` 与 `source` 两个键。值为单行基本字符串或字面量字符串；读到下一个表头即止。以其他写法（内联表、点号键）出现的视为无法读取 |
| Claude | `<configDir>/plugins/known_marketplaces.json` | 顶层 `<名称>` 对象的 `source` 字段；其中只用 `source`、`repo`、`url` 三个键，`ref` 等其他键一律忽略 |

0.10.3 读取时只解析上述键，不加载其他内容、不输出文件内容；URL 中的用户信息（凭证）在任何输出与日志中都替换为 `[redacted]`。

### 9.2 可核实的来源形态

| 宿主记录 | 视为 |
|----------|------|
| Codex `source_type = "git"`，`source` 为 Git 地址 | Git 地址 |
| Claude `{"source":"github","repo":"<owner>/<repo>"}` | `github.com/<owner>/<repo>` |
| Claude `{"source":"git","url":"<Git 地址>"}` | Git 地址 |
| 其他（Codex `local`、Claude `directory`、`url`、`npm` 等，或字段缺失） | **不可核实**：不产生来源标识 |

### 9.3 规范化

Git 地址支持以下写法，统一规范为 `<host>/<path>`：

| 写法 | 例 |
|------|----|
| `https://[userinfo@]host[:port]/path[.git][/]` | `https://github.com/TestAny-io/testany-agent-skills.git` |
| `http://…`（同上） | — |
| `ssh://[user@]host[:port]/path[.git]` | `ssh://git@github.com/TestAny-io/testany-agent-skills.git` |
| `[user@]host:path[.git]`（scp 风格） | `git@github.com:TestAny-io/testany-agent-skills.git` |
| `owner/repo`（仅 Claude 的 github 形态） | `TestAny-io/testany-agent-skills` |

规则：
0. 先识别写法：含 `://` 的只接受 `https`、`http`、`ssh` 三种协议（`git://`、`file://` 等其他协议一律不可核实）；不含 `://` 且第一个冒号之前没有 `/` 的，按 scp 风格解析；其余（本地路径等）不可核实。任何位置出现 `?`、`#` 或 `%` 的地址不可核实（不做解码）。
1. 去掉协议、用户信息与端口；host 转为小写；
2. 去掉路径末尾的 `/` 与 `.git`，去掉路径开头的 `/`；
3. host 为 `github.com` 时，路径（`owner/repo`）转为小写（GitHub 大小写不敏感）；其他 host 的路径保持原样；
4. 路径为空、含 `..` 段、含空白或控制字符：不可核实。

例：上表前四种写法与 Claude 的 `TestAny-io/testany-agent-skills` 都规范为 `github.com/testany-io/testany-agent-skills`。

### 9.4 等价判定

两个来源标识**逐字符相等**即为同一来源；任一方不可核实即视为**不同**。同名 marketplace 若指向 fork 或本地目录，因标识不同或不可核实而不被接受（HLD 第 5 轮 E6）。

## 10. SkillDock 安装的识别（冻结；只读宿主插件缓存）

### 10.1 位置形态

| Agent | 应用目录（`appPath`）形态 | 版本目录名 |
|-------|--------------------------|-----------|
| Codex | `<codexHome>/plugins/cache/<marketplace>/skilldock/<版本>/skills/skill-manager/assets/app` | 产品版本 `x.y.z`，须等于 `.codex-plugin/plugin.json` 的 `version` |
| Claude | `<pluginCacheDir>/<marketplace>/skilldock/<目录名>/skills/skill-manager/assets/app` | Claude 计算的提交摘要（12 位十六进制）或 Claude 定义的其他安全单段名；产品版本一律读应用目录的 `package.json` |

`<marketplace>` 与版本目录名都须满足第 5.3 节的安全单段规则。

### 10.2 有效安装的条件

一个候选应用目录被视为“有效的 ≥0.11 安装”，当且仅当：
1. 形态符合 10.1，且其规范路径位于对应缓存根的规范路径之内（不得经链接跳出缓存根）；
2. 版本目录中不存在 `.orphaned_at`（Claude 的废弃标记；Codex 侧同样检查）；
3. `<appPath>/package.json` 可解析，`name` 为 `skilldock`（0.10.2 的现有包名），`version` 为 `x.y.z` 且 ≥ 0.11.0；
4. Codex 侧另需 `.codex-plugin/plugin.json` 的 `name` 为 `skilldock`、`version` 等于版本目录名；
5. `<appPath>/../../scripts/launch.sh` 是普通文件（不是链接）；
6. 第 3 步与兜底还要求：该安装的 `<marketplace>` 名与 0.10.3 本安装的 marketplace 名相同，且该安装所在 Agent 中这个 marketplace 的来源标识（第 9 节）与本安装的来源标识相同（DEC-SDX-007 的归属键：marketplace 名 + 插件名 + 来源标识）。


## 11. 兼容性与迁移

- 0.10.3 发布后，本文第 4、5、6、7、9、10 节与第 8 节的 `version` 字段为冻结面。0.11.x 之后的版本可以**增加**字段，但不得删除、改名或改变冻结字段的含义与取值规则。
- 当 0.11.x 某个版本不再声明与 0.10.2、0.10.3 共存时（由 Owner 决定，并在发布说明中写明），旧字段、Claude 根目录记录与固定子目录才可以停止维护；在此之前，兼容测试矩阵（36b 附录）每次发布都要跑。
- 数据代号再次升级（如 3）时，0.10.3 仍按“≥ 2 即转交”处理；能否正确转交由届时最高版本的启动器负责。

## 12. 待确认问题

见索引第 9 节。
