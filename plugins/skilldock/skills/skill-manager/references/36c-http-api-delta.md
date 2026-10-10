# SkillDock HTTP 接口增量（0.11.0）

> 所属契约：[API-SDX-001 跨 Agent 管理接口契约](36-cross-agent-api-contract.md)（索引）
> 本文是索引中的“HTTP”分册。wire 类型的事实源仍是 `assets/app/shared/contracts.ts`：实现时按本文更新该文件，两者不一致时以本文为准并同步修正。

## 1. 基本信息

| 项目 | 内容 |
|------|------|
| 契约 | API-SDX-001-C HTTP 接口增量 |
| 版本 | 0.30 |
| 状态 | 第 12 轮契约复核 APPROVED（v0.12），第 14 轮绑定 0.13，第 15 轮（与 HLD 第 25 轮合并）核对 0.14～0.29 后重新绑定到 0.29。v0.13 处理第 12 轮的 P2；v0.14 为阶段 3 试用与阶段 4a、4b 实现中的澄清（索引 0.15），v0.15 为阶段 4d 实现中的澄清（索引 0.16），v0.16 处理阶段 4d 代码评审（索引 0.17），v0.17 处理阶段 4c 代码评审（索引 0.18），v0.18 处理 4c、4d 合并复审（索引 0.19），v0.19 为阶段 5a 实现（索引 0.20），v0.20 为阶段 5b 实现（索引 0.21），v0.21 为阶段 5c1 实现（索引 0.22），v0.22 为阶段 5c2 实现（索引 0.23），v0.23 为阶段 5d2a 实现（索引 0.24），v0.24 为阶段 5d2b 实现（索引 0.25），v0.25 处理阶段 5c 代码评审（索引 0.26），v0.26 处理阶段 5a、5b 代码评审（索引 0.27），v0.27 处理阶段 5d 代码评审（索引 0.28），v0.28 处理阶段 5 合并复审（索引 0.29），v0.29 处理另一台电脑试用的观察（索引 0.30），v0.30 处理第 15 轮与阶段 6 代码评审的意见（索引 0.31），待增量复核。第 4、5 节随 0.10.3 冻结（HLD 11A 条件 1a，0.10.3 已发布）；其余各节属条件 1b |
| Owner | SkillDock 维护者（产品 Owner：用户） |
| 服务方 | SkillDock 0.11.x 本机服务（仅监听 `127.0.0.1`） |
| 消费方 | 0.11.x 浏览器界面与原生界面；0.10.2、0.10.3 的原生界面（经各自原生入口代理）；0.10.2 启动器与原生入口、0.10.3 转交链（只读健康检查） |
| 上游 | PRD-SKILLDOCK-002 v0.9（5.2.2、5.6、AC-002、003、015、016）；HLD-SDX-001 v1.13 第 3.2、3.5、4、5 节 |

## 2. 范围与边界

覆盖：健康检查字段（含 0.10.x 依赖的冻结字段）、接口版本规则、“多 Agent 客户端”的声明方式、新增与变化的数据模型、操作与错误码、原生入口路由白名单。

不覆盖：未变化的接口（`/api/session`、`/api/license`、`/api/source` 以及各操作的 Codex 语义），以 `contracts.ts` 与现有实现为准。同源归组、“两边都更新”、完整兼容性推断（P1，M4）在交付时另行增补本文。

数据所有权：Agent 环境的配置与插件状态归宿主所有，服务每次按宿主证据读回；SkillDock 只持久化环境管理状态、来源记录与计划。

## 3. 接口清单（变化部分）

| 操作 | 方法 | 路径 | 变化 | PRD 条目 |
|------|------|------|------|----------|
| 健康检查 | GET | `/api/health` | 增加字段（第 4 节） | REQ-SDX-007 |
| 快照 | GET | `/api/state` | 新增 `multiAgent=1` 参数；声明后返回 Agent 环境与各对象的 Agent 字段 | REQ-SDX-001、002、003 |
| 技能详情 | GET | `/api/skill` | 新增可选 `agent` 参数 | REQ-SDX-003、005 |
| 更新进度 | GET | `/api/updates/progress` | 新增可选 `agent` 参数 | REQ-SDX-006 |
| 插件图标 | GET | `/api/plugin-icon` | 新增可选 `agent` 参数 | REQ-SDX-003 |
| 操作 | POST | `/api/actions` | 请求可带 `agent` 等字段；新增操作（第 7 节） | REQ-SDX-001、004、005、006、009、012、015、016、017 |

`agent` 参数取值 `codex` 或 `claude`，缺省为 `codex`。

## 4. 健康检查（部分字段冻结）

`GET /api/health` → `200`

```json
{
  "app": "skilldock",
  "pid": 41235,
  "instanceId": "8c1f…",
  "state": "/Users/u/.local/share/skilldock",
  "sourceDigest": "3f2a…",
  "project": "/Users/u/work/repo",
  "launchProject": "/Users/u/work/repo",
  "projectContext": { "requested": "…", "effective": "…", "source": "saved", "workingDirectory": "…", "warnings": [] },
  "restart": null,
  "appVersion": "0.11.0",
  "apiVersion": 2,
  "dataGeneration": 2,
  "minimumCompatibleGeneration": 2,
  "installations": [
    { "agent": "codex", "marketplace": "testany-agent-skills", "version": "0.11.0", "running": false },
    { "agent": "claude", "marketplace": "testany-agent-skills", "version": "0.11.0", "running": true }
  ]
}
```

| 字段 | 冻结 | 读取方与用途 |
|------|------|-------------|
| `app`、`pid`、`instanceId`、`state`、`sourceDigest` | 是 | 0.10.2 原生入口与启动器核实实例；0.10.3 第 2 步核实（36b 第 4.5 节）。值须与启动记录一致 |
| `project`、`launchProject` | 是 | 0.10.2 启动器用 `(launchProject‖project)` 与记录旧 `project` 比较；**两者都不得等于**固定子目录（36a 第 7 节），以保证 0.10.2 启动器无法核实实例（K3）。0.10.3 第 2 步用 `project` 判断是否需要切换 |
| `appVersion` | 是 | 0.10.3 第 2 步要求 `x.y.z` 且 ≥ 0.11.0 |
| `dataGeneration` | 是 | 0.10.3 第 2 步要求整数 ≥ 2 |
| `apiVersion` | 是 | 接口版本，规则见第 5 节 |
| `minimumCompatibleGeneration` | 否 | 诊断 |
| `restart` | 对 1 版客户端冻结 | 0.10.x 原生界面每 1.5 秒读取 `restart` 与 `instanceId` 判断后台是否在重启；形态沿用 0.10.2：缺省、`null` 或 `{id, status, message?, restored?}`；0.11.x 完成 0.10.x 重启任务后的写法见 36b 7.4 |
| `projectContext` | 否 | 沿用 0.10.2 |
| `installations` | 否 | 安装登记摘要，供界面与诊断；不含路径与凭证 |

健康检查不需要令牌，只受现有的 Host、Origin、跨站标记校验约束。

`GET /api/session` 的返回形态 `{token, defaultMode}` 对 1 版客户端冻结（0.10.x 原生入口读取它取得写令牌）。

## 5. 接口版本规则

- `apiVersion` 为整数。0.10.x 没有该字段，视为 1；0.11.0 为 2。
- **只增不破**：在不改变已有客户端所见行为的前提下新增字段、参数、操作或错误码，不递增版本。
- 改变已有路由对旧客户端可见的行为时，必须递增版本，并让新行为由新的显式参数或请求字段开启；没有显式开启的请求保持旧行为。`multiAgent=1` 就是 2 版的开启方式。
- 服务端在声明与 0.10.x 共存期间，必须同时服务 1 版客户端（0.10.2、0.10.3 的原生界面）：
  - 不带 `multiAgent` 的 `/api/state` 只返回 Codex 对象，`paths`、`cli` 保持 Codex 含义；
  - 不带 `agent` 的请求与操作按 Codex 处理；
  - 新错误码原则上只出现在新增路径上。例外：Codex 环境被设为只读或处于“无法确认”、或数据代号高于服务支持时，1 版客户端的 Codex 写请求会收到 `AGENT_READ_ONLY`、`AGENT_UNCONFIRMED` 或 `DATA_GENERATION_NEWER`。0.10.x 界面对不认识的错误码显示服务端 `message`（中文界面原样显示，英日界面显示原文），所以这三个错误码的 `message` 必须是完整、可独立理解的句子，并说明下一步（例如“请在 SkillDock 的 Agent 环境页启用 Codex 管理”）。
- 客户端在发送 `multiAgent=1` 或任何 2 版字段之前，先确认健康检查的 `apiVersion ≥ 2`；不满足时按 1 版工作，并提示“SkillDock 服务版本较旧，请更新”。

## 6. 数据模型（增量，写入 `contracts.ts`）

```ts
export type Agent = "codex" | "claude";
export type AgentManagement = "enabled" | "read-only" | "unconfirmed";

export interface AgentEnvironment {
  agent: Agent;
  /** 每次发现时计算，不持久化。 */
  installed: boolean;
  /** 持久化的管理状态；“未安装”不在此表示。 */
  management: AgentManagement;
  /** 只读或无法确认的原因（人可读）。 */
  reason?: string;
  roots: { config: string; pluginCache: string; skills: string; origin?: "explicit" | "session" | "default" };
  cli: { available: boolean; version?: string; path?: string; error?: string };
  /** 该 Agent 中安装的 SkillDock；没有安装时省略。`canUpdate`：版本低于两侧最高、该 Agent 的命令行可用且环境不处于“无法确认”时为真（`agent.updateSkilldock`），与管理状态无关：只读一侧也可一键更新 SkillDock 本身，经 Owner 决定（HLD 第 10 节 DG-R24-1）。 */
  skilldock?: { version: string; running: boolean; canUpdate: boolean; reason?: string };
  /** 宿主层面的已知行为说明（例如 Claude 桌面应用会话整体禁用自动更新，PRD 附录 A）；Codex 命令行不可用时，Codex 保持存储的管理状态，这一事实写在这里（MR-SDX-001：只显示、不禁用写操作）。 */
  notes?: string[];
}

export type ClaudeSettingsLayer = "user" | "project" | "local" | "managed";
export type ClaudePluginScope = ClaudeSettingsLayer;

/** Claude 插件的安装身份（DEC-SDX-023）。对象 ID、计划目标与绑定都由它派生。 */
export interface ClaudeInstallation {
  scope: ClaudePluginScope;
  /** project、local 作用域的项目路径。 */
  projectPath?: string;
  /** 技能目录插件（名称@skills-dir）所在的技能目录。 */
  skillsDir?: string;
  /** 项目路径不存在等原因导致只读。 */
  readOnlyReason?: string;
}

/** 启用状态（插件）或可见性（技能）由哪一层设置决定（PRD 5.2.2，AC-002、AC-015）。 */
export interface EnablementSource {
  /** 决定当前实际状态的层级；没有任何设置条目时为 "default"。 */
  decidedBy: ClaudeSettingsLayer | "default";
  /** 用户可写的层级被更高优先级层级覆盖时，覆盖它的层级。 */
  overriddenBy?: Exclude<ClaudeSettingsLayer, "user">;
  /** 托管强制启用或组织要求的同步插件：不可停用。 */
  locked?: boolean;
}

export type SkillVisibility = "enabled" | "disabled" | "name-only" | "user-invocable-only";

/** 共用技能对象在某一侧的发现位置与状态（两侧状态互相独立）。 */
export interface SkillSide {
  /** 该侧发现它的路径（可能是指向共用目录的链接）。 */
  path: string;
  scope: Scope;
  enabled: boolean | null;
  /** 仅 Claude 侧。 */
  visibility?: SkillVisibility;
  enablement?: EnablementSource;
  canToggle: boolean;
  canRemove: boolean;
  /** 能否经这一侧发起更新（规则见下文“共用对象”）。 */
  canUpdate: boolean;
  /** 仅在 canRemove 为真时给出：链接只移除链接；目录则移走真实目录（另一侧随之失效）。 */
  removeKind?: "link" | "directory";
  reason?: string;
  protection?: Protection;
  /** 该侧状态摘要，供界面判断是哪一侧发生了变化；写请求不使用它，改带顶层 revision。 */
  revision?: string;
}
export type Protection = "managed" | "synced" | "system";

/** 预览或确认结果中携带的原生规则说明（HLD 3.5）。 */
export interface NativeRule {
  kind: "scope" | "dependencies" | "affected-plugins" | "data-removal" | "visibility" | "reload";
  message: string;
  /** 依赖插件、受影响插件等对象名称。 */
  items?: string[];
}
```

对现有类型的增量：

| 类型 | 新增字段 | 说明 |
|------|----------|------|
| `Snapshot` | `agents?: AgentEnvironment[]` | 仅在 `multiAgent=1` 时返回；只列出已安装或曾启用的环境 |
| `Skill`、`Plugin`、`Marketplace` | `agents?: Agent[]` | 对象所属的 Agent，非空、按 `codex`、`claude` 排序；缺省表示 `["codex"]`。`multiAgent=1` 时服务端对每个对象都显式给出 |
| `UpdateTarget`（计划中的目标） | `confirmation?: "pending" \| "confirmed"` | 只出现在 `multiAgent=1` 快照的计划目标中，只对“另一侧已启用管理时须确认”的这类技能给出：待确认或已确认（第 6 节）；照常应用的目标、运行记录与进度中的目标都省略。服务端忽略请求中的该字段（确认只经带 `confirm: true` 的请求发生）；“原样提交”的比较只看目标身份（`kind`、`id`、`agent` 与安装身份）。0.11.x 界面据此列出待确认的目标 |
| `UpdateItem`、`UpdateTarget`、`Activity`、`ActionResult` | `agent?: Agent` | 这些都针对某一侧的一次检查或操作，取单值；缺省为 Codex |
| `UpdateItem` | `route` 新增 `"plugin-files"`、`"claude-plugin"` | 前者为 Claude 技能目录插件（经文件事务替换技能目录中的插件文件），后者为从 marketplace 安装的 Claude 插件（经 Claude 命令行） |
| `Skill` | `visibility?: SkillVisibility`；`enablement?: EnablementSource`；`perAgent?: Partial<Record<Agent, SkillSide>>` | 前两者仅用于只属于 Claude 的技能，此时 `enabled` 与 `visibility` 对应（后两档为 `null`）。`perAgent` 只用于两侧共用的技能，见下文“共用对象” |
| `Skill`、`Plugin`、`Marketplace` | `revision?: string` | Claude 对象与共用对象的状态摘要，写请求须带回（7.1）。共用技能的顶层 `revision` 覆盖两侧状态；Claude marketplace 的 `revision` 覆盖其自动更新设置与从它安装的插件集合 |
| `Skill`、`Plugin` | `protection?: Protection` | 与现有 `managed`、`reason` 一起显示保护状态与原因 |
| `Plugin` | `installation?: ClaudeInstallation`；`enablement?: EnablementSource`；`manifests?: Agent[]` | 前两者仅 Claude 插件；`manifests` 为该插件带有专用 manifest 的 Agent（兼容性证据，0.11.0 只展示） |
| `Marketplace` | `autoUpdate?: { enabled: boolean; isDefault: boolean; note?: string }` | 仅 Claude marketplace：自动更新实际值、是否为默认值；桌面应用会话整体禁用自动更新时，`note` 给出说明（AC-002）。`refreshedAt` 沿用现有字段 |
| `PluginInstallPreview` | `agent?: Agent`；`scopes?: ClaudePluginScope[]`；`defaultScope?: ClaudePluginScope`；`dependencies?: { id: string; name: string; installed: boolean }[]`；`manifests?: Agent[]`；`nativeRules?: NativeRule[]` | Claude 安装预览：可选作用域、会一并安装的依赖插件、manifest 归属与原生规则说明（PRD 5.6） |
| `ActionResult` | `nativeRules?: NativeRule[]` | 确认类结果（卸载、移除 marketplace、改可见性等）携带的原生规则说明 |

共用对象与去重（PRD 5.2.2、AC-003、AC-005）：
- 只合并**独立技能**：两侧都在技能根中发现、真实路径相同的技能目录视为同一个对象，只出现一次，`agents` 同时包含两侧，对象 ID 取 Codex 侧的现有 ID。某一侧是插件附带的技能时不合并，两侧各是一个对象。
- 共用对象的顶层 `path`、`scope`、`enabled`、`canToggle`、`canRemove`、`canUpdate`、`removeKind`、`reason`、`managed`、`protection` 一律取 **Codex 侧**的值（1 版客户端与 MR-SDX-001 的语义）；顶层不出现 `visibility`、`enablement`。
- `perAgent` 只在 `multiAgent=1` 时给出；对共用对象必须给出，并包含两侧各自的 `SkillSide`，两侧状态互相独立（例如 Codex 启用、Claude 关闭是正常状态）。
- **2 版请求的判定**：写请求带 `agent` 即按 2 版规则处理（确认、修订号核对等）；2 版客户端的所有写请求都必须带 `agent`（HLD 4.2）。全局操作（`settings.*`、`project.select`、`project.chooseDirectory`）与多目标操作（`schedule.configure`、`updates.run`、`skill.previewRemoval`、`skill.removeSelected`）的顶层 `agent` 只作 2 版标志，固定取 `codex`，不影响语义，也不据此做环境检查（不因它返回 `AGENT_NOT_INSTALLED`、`AGENT_READ_ONLY`、`AGENT_UNCONFIRMED`）；各目标的侧别取自 `targets[].agent` 或对象 ID。`agent.*` 操作与创建类操作（`marketplace.add`、`plugin.previewInstall`、`skill.previewInstall`）的 `agent` 指定作用的一侧，只按 7.2 与第 8 节为该操作列出的错误检查该侧：`agent.setManagement` 不因该侧只读而拒绝（它正是改变只读状态的操作）；`agent.updateSkilldock` 只更新 SkillDock 自身，在该侧未启用管理时同样可用（HLD 3.7：迁移后对每个装有较旧 SkillDock 的 Agent 显示一键更新），该侧无法确认时返回 `AGENT_UNCONFIRMED`（HLD 3.2，见 7.2）；创建类操作按该侧返回 `AGENT_NOT_INSTALLED`、`AGENT_READ_ONLY`、`AGENT_UNCONFIRMED`。以上为封闭列举；今后新增的操作在 7.2 中逐个写明 `agent` 的含义。以预览为准的操作（`preview.diff`、`skill.install`、`plugin.installSource`、`skill.connectSource`、`update.apply`）的侧别取自预览，请求的 `agent` 与预览所属一侧不一致时返回 `STALE_PREVIEW`（0.10.2 已有的错误码）。不带 `agent` 的请求按 1 版处理：对象按 Codex 侧解释，保持 0.10.2 行为。
- **启禁**按侧执行：服务端按请求一侧的 `SkillSide` 判断能否操作、是否需要确认；结果的 `ActionResult.agent` 为该侧。
- **移除**按请求的一侧作用于**该侧的发现路径**，沿用 0.10.2 与 AC-005：该侧是链接（`removeKind: "link"`）就只移除链接，只影响该侧；该侧发现路径就是真实目录（`removeKind: "directory"`）时移走目录，另一侧随之失效。后一种情况下，2 版请求未带 `confirm: true` 时返回 `CONFIRMATION_REQUIRED`，`nativeRules` 中一条 `kind: "scope"` 说明会同时影响 Codex 与 Claude。`ActionResult.agent` 为请求的一侧。
- **恢复**（`activity.restore`）按操作记录还原到原发现路径，作用的一侧取自操作记录（`Activity.agent`），与请求中的 `agent` 无关；`ActionResult.agent` 为记录中的一侧。
- **批量移除**（同名副本：`skill.previewRemoval`、`skill.removeSelected`）：2 版请求的 `ids` 可以包含 Claude 对象 ID；预览中任何一项的移除会移走两侧共用的真实目录，或改动另一侧插件的内容时，预览结果带相应的 `nativeRules`，执行时须带 `confirm: true`，否则返回 `CONFIRMATION_REQUIRED`。批量中的共用对象一律作用于 Codex 侧的发现路径（与 1 版一致）。整批仍保持 0.10.2 的原子语义：整组签名与任一项的核对（含 Claude 对象与共用技能的状态：各副本由哪些 Agent 看到、各侧的移除方式）失败都整批拒绝（`REMOVAL_CHANGED`），一份都不移。2 版执行的环境检查按各项所属的一侧：含 Codex 项时 Codex 只读才拒绝（`AGENT_READ_ONLY`），只含 Claude 项时不看 Codex 的状态。1 版请求保持 0.10.2 行为。
- **更新**作用于真实目录，只能经 `canUpdate` 为真的一侧发起，`UpdateTarget.agent` 取该侧；预览带一条 `kind: "scope"` 的 `NativeRule`，说明两侧看到的内容都会改变。`canUpdate` 的规则：
  - 一侧可更新，须该侧发现路径就是真实目录（技能根本身可以是链接），且该侧分区有来源记录；
  - 两侧都满足时（例如两侧的技能根都链接到同一目录），以 **Codex 侧**为准，Claude 侧 `canUpdate` 为假，`reason` 说明“由 Codex 侧的来源记录管理”；两侧来源记录指向不同来源时，两侧都不可更新，`reason` 说明冲突，2 版的检查更新与更新（含更新页）返回 `SOURCE_CONFLICT`（1 版保持 0.10.2）；多 Agent 快照中它的更新项不可检查（`canCheck` 为假，`reasonCode: "SOURCE_CONFLICT"`），批量执行与后台计划照此跳过（Claude 已启用管理时；未启用时批量与计划使用 1 版快照，保持 0.10.2 行为，MR-SDX-001）；
  - 关联来源（`skill.previewSource`、`skill.connectSource`）写入请求一侧的分区；2 版请求遇到另一侧已有指向不同来源的记录时拒绝，返回 `SOURCE_CONFLICT`，`message` 说明怎样解除（例如在另一侧重新关联到相同来源）；预览时即在结果中带一条 `kind: "scope"` 的说明，关联时才拒绝；本地目录按真实路径比较，子目录或 ref 不同即为不同来源；1 版请求不做冲突检查，照 0.10.2 写入，冲突状态按上一条处理（两侧都不可更新）。经一侧更新后，另一侧的同源记录同步刷新内容指纹；恢复一次更新（`activity.restore`）时，另一侧的同源记录同样还原为更新前的指纹。两者都是为了避免日后误报本地修改。
- **Claude 一侧的更新项**（阶段 5a）：多 Agent 快照的 `updates` 包含只属于 Claude 的技能、由 Claude 一侧主导更新的共用技能（这时该技能只以 Claude 一侧列出）与 Claude 插件，`target.agent` 与 `agent` 为 `claude`。技能与技能目录插件从 SkillDock 记录的来源经文件事务检查与更新（`skill-source`、`plugin-files`）；从 marketplace 安装的插件经 Claude 命令行（`claude-plugin`，阶段 5b、5c）；不代为更新的（claude.ai 同步、组织托管、链接、不在两个技能根中的）给出原因，`canCheck` 为假（DEC-SDX-019）。`update.check`、`update.apply` 的侧别取自 `target.agent`，与请求顶层的 `agent` 无关；Claude 只读或无法确认时，其更新项 `canCheck`、`canApply` 都为假，请求返回 `AGENT_READ_ONLY` 或 `AGENT_UNCONFIRMED`（与 Codex 只读时仍可检查不同：Claude 的检查要在 Claude 锁下读取 Claude）。更新页与计划不带修订号时，服务端以当前快照的修订号核对 Claude 对象，预览的基线与来源身份仍在应用前核对。计划目标可带 `agent: "claude"`；Claude 未启用管理、未安装或无法确认时其目标暂停（HLD 3.8）；只属于 Claude 的技能变为两侧共用、对象 ID 改变时，计划目标与绑定按真实目录迁移，并留操作记录（`schedule.migrate`）；共用状态反向变化（只剩 Claude 一侧）时同样迁移。例外：Claude 已启用管理时，1 版的“检查全部”（不带目标的 `updates.run`）与 1 版保存计划的校验也使用多 Agent 视图，会覆盖 Claude 对象（1 版界面看不到它们的结果；只在与 0.10.x 共存期间出现，不另设视图，以免同一目标在两种视图间绑定不一致）。
- **Claude 插件的检查与应用**（`claude-plugin`，阶段 5b；HLD 3.3、3.3A）：都在 Claude 锁下进行。检查先刷新远端 marketplace（本地目录的不刷新），按插件条目的来源暂存 Claude 将装入的内容（本地目录 marketplace 中的插件目录、Git 托管 marketplace 副本中的插件目录、`github`/`url`/`git-subdir` 的受限检出、npm 包、https 压缩包），与安装目录比较（两侧都排除顶层的 `node_modules`、`.in_use/`、`.orphaned_at`，暂存时也不复制它们）：一致为 `current`；内容不同而按 Claude 规则算出的版本不变为 `blocked`（`reasonCode: "VERSION_UNCHANGED"`）；否则为 `available`，带差异、可预测时带 `availableVersion` 与 `previewId`。`command` 来源、带 `headersHelper` 的条目与无法识别的来源为 `blocked`（`OWNER_MANAGED`），项目目录已不存在的安装为 `blocked`（`PROJECT_PATH_MISSING`）；这两类在更新列表中就不可检查、不能加入计划（读 marketplace 的本机副本判断，不联网），计划中项目目录缺失的目标暂停。只有组织托管范围（`managed`）的安装不代为更新，组织只是强制启用的个人安装照常。SkillDock 记下检查时的安装指纹，同一版本下安装内容变了即 `LOCAL_CHANGES`（MR-SDX-003）；安装内容与暂存的来源内容一致时没有要保护的修改，记录随之更新（版本为 `unknown` 的插件可能被 Claude 原地更新过，这时的 `LOCAL_CHANGES` 说明这种可能，并给出“在 Claude 中卸载后重新安装”的出路）。这条路线以预览绑定的安装目录、版本、指纹与条目代替修订号核对。应用时核对预览仍属这个插件（`PREVIEW_MISMATCH`）、安装目录与版本未变（`INSTALLATION_CHANGED`）、安装内容未变（`LOCAL_CHANGES`）、条目与来源未变（`SOURCE_CHANGED`：本地内容指纹、Git 提交、npm 版本与完整性摘要、压缩包摘要）；版本为 `unknown` 的插件先复制到隔离区（含 `node_modules`，复制失败即中止）；随后运行 `plugin update <名称>@<marketplace> --scope <作用域>`，project、local 范围以安装所在项目为工作目录（项目不在时 `PROJECT_PATH_MISSING`）；读回安装目录指纹等于预览即成功，结果写明版本变化与副本位置，操作记录为 `plugin.update`（`agent: "claude"`）；不等即 `READBACK_CONTENT_CHANGED`（第 8 节），说明旧版本目录或副本位置，以实际装入的内容为新的记录，并暂停这个插件的自动应用（之后的检查结果 `canAutoApply` 为假并说明），直到有人在更新页手动应用一次，或检查发现安装内容已与来源一致。版本为 `unknown` 的插件，检查结果在应用前就说明 Claude 会原地覆盖、更新前会复制一份。计划中这类目标绑定安装身份（插件的缓存目录，而不是某个版本目录）与条目来源的位置（Git 仓库与子目录、npm 包名与源、压缩包的下载主机、相对路径；不含所固定的 `sha`/`ref`、npm 版本或具体下载地址），Claude 自己更新它、维护者改条目发布新版都不算新对象，换仓库、换包或换下载主机才须重新选择；读不到 marketplace 本机副本时这一轮跳过（`SOURCE_MISSING`），绑定不变。npm 来源的应用前核对比较 `npm pack` 再次取得的版本与完整性摘要；压缩包地址不能指向本机。SkillDock 生成的本地 marketplace 中的插件（阶段 5c）：检查时从记录的原始来源重新暂存，不改动数据目录中的副本；预测版本取来源中 Claude manifest（没有时取 Codex manifest）所写的版本，所取的 manifest 不写版本时为 `unknown`；应用时先核对原始来源未变（本地内容指纹或 Git 提交），再替换副本与条目版本、刷新这个 marketplace 后更新并读回；来源中插件改名时检查返回 `SOURCE_CHANGED`。列表项与检查结果都带 `installedPath`（插件缓存中的安装目录）与 `sourceInfo`：从普通 marketplace 安装的插件，`sourceInfo.kind` 为 `marketplace-entry`、`confidence` 为 `inferred`（取自 marketplace 副本当前的条目，不能证明已装内容来自它），`source` 为条目来源的可读描述（地址去掉账号、密码、查询串与片段），只供显示，不进入计划绑定；SkillDock 生成的 marketplace 中的插件显示记录的原始来源，`kind` 为 `tracked`、`owner` 为 `SkillDock`（v0.29、v0.30）。计划绑定中的条目位置：Git 来源为仓库与子目录，npm 为包名（用包地址时为地址的 origin），压缩包为下载地址的 origin，本地目录与 Git 托管 marketplace 中的条目为相对路径加该 marketplace 自身的来源（仓库、地址或路径，不含所固定的 ref）；所固定的版本都不进入绑定（v0.30）。
- **跨侧影响提示**：Codex 侧独立技能的真实路径位于某个 Claude 插件的目录内（含 Claude 技能目录插件 `名称@skills-dir`）时，虽然不合并，2 版请求对它的移除与更新在会移走或改写插件目录内的内容时同样要求确认（只移除指向插件目录的链接不需要），`nativeRules` 中一条 `kind: "affected-plugins"` 列出受影响的 Claude 插件；反之亦然（AC-003）。更新页的 `update.check`、`update.apply` 以技能为目标时，同样按本节核对共用修订号、来源冲突与跨侧确认，说明随结果返回。只在另一侧环境已被发现时提示；确认后，操作的效果与不提示时相同。后台计划的确认门槛与此不同，是“另一侧已启用管理”：单次操作的提示只是界面中多一次确认，计划的确认会改变后台结果，须守住 MR-SDX-001，两者有意不统一。后台计划中的这类技能：
  - 另一侧已启用管理时，2 版 `schedule.configure` 新增这类目标、改变其安装身份，或把计划改为自动应用、启用一个自动应用的已停用计划（这两种计划级改动会开始自动应用；启用仅检查的计划不需要确认），都须对其中的这类目标带 `confirm: true`，否则返回 `CONFIRMATION_REQUIRED`；计划关闭时保存（`enabled: false`）不因此被拦住（关闭计划必须总能完成），其中新增或改变的这类目标记为待确认，之后启用这个自动应用的计划或改为自动应用时按本条确认；确认记在计划内容中（36a 第 2 节由 0.11.x 自定），重新提交计划时保留已有确认；原样重新提交的目标保持原状态，不算修改；2 版 `schedule.configure` 带 `confirm: true` 时，计划中全部待确认的这类目标都记为已确认（“在计划设置中确认”即这一请求），不带时保持原状态；返回 `CONFIRMATION_REQUIRED` 时，`nativeRules` 覆盖带 `confirm` 后将被确认的全部这类目标（本次新增或改变的，以及原有待确认的），界面主动发起确认时同样列出，确认范围与确认框所列一致；
  - 经 2 版请求保存、但在另一侧已启用管理时尚未确认的这类目标（例如保存之后才启用另一侧管理），后台照常检查、不自动应用，结果的 `message` 说明须先在 0.11.x 界面的计划设置中确认（0.10.x 界面无法确认）；
  - 经 1 版请求保存的目标、从 0.10.x 继承且尚未在 0.11.x 界面中新增或改变的目标，以及另一侧未启用管理时的全部目标，保持 0.10.2 行为，照常检查与应用（MR-SDX-001）；
  - 1 版请求整份保存计划时，只替换 Codex 侧目标；它看不到的 Claude 侧目标与已有确认原样保留；目标的来源按“原样保存保持原状态”判定，与 2 版的规则一致（原本经 2 版保存、未确认的目标被 1 版原样保存后仍是未确认，不会因此变成自动应用）；1 版快照与 1 版 `schedule.configure` 的返回中，`schedule.targets` 只含 Codex 侧目标；
  - 保存校验：“启用计划时每个目标都须可检查”（7.1）照 0.10.2 校验请求中的目标——1 版请求中的目标一律照 0.10.2 校验（有不能检查的目标时仍整体返回 `TARGET_NOT_READY`）；暂停豁免只适用于请求之外保留下来的目标，以及 2 版请求中所属 Agent 已暂停的目标：它们连同绑定原样保留，不阻断保存，恢复后重新纳入（HLD 3.6、3.8；MR-SDX-001）。“暂停”指所属 Agent 被停用管理、未安装或处于无法确认（HLD 3.8“某个 Agent 不可用”）；Claude 已启用管理时，Codex 未安装则其目标全部暂停，Codex 命令行不可用则只暂停其插件目标（Codex 环境本身保持存储的状态，只附说明）；只管理 Codex 时保持 0.10.2 行为。
- **手动批量执行中的这类技能**：手动 `updates.run`（用户在场）不看计划中的确认，门槛与单次操作相同（另一侧已被发现）：2 版请求中这类目标按请求的 `confirm` 处理，未带的只检查、不应用，单独说明原因，不影响其他目标（与 7.1 的逐目标失败一致）；1 版请求保持 0.10.2 行为。
- **并行改动核对**：2 版请求对共用对象的单对象写请求都带顶层 `revision`（覆盖两侧状态）作为 `expectedRevision`；1 版请求免带。多目标操作的处理见 7.1 的 `expectedRevision`。
- 插件与 marketplace 由各宿主分别安装与登记，两侧各是一个对象，`agents` 只含一侧，不使用 `perAgent`；同源归组（REQ-SDX-010）在 M4 另行增补。

对象 ID：
- Codex 对象沿用现有 ID，不加前缀（MR-SDX-001）。
- Claude 对象 ID 以 `claude:` 开头，由对象类型与安装身份派生，例如 `claude:plugin:<名称>@<marketplace>:<作用域>[:<项目路径摘要>]`、`claude:skill:<作用域>:<技能目录摘要>`。摘要为规范路径的 sha256 前 12 位。客户端不得解析 ID 的内部结构。尚未在任何作用域安装的 Claude 插件还没有安装身份，ID 为 `claude:plugin:<名称>@<marketplace>`。
- 共用状态变化（例如只属于 Claude 的技能后来也被 Codex 发现）会改变对象 ID。服务端为计划目标、来源记录与操作记录另存真实路径，按真实路径把旧 ID 解析到当前对象，据此继续关联。解析不到时（目录已不存在），这些记录显示为“无法解析”并保留，不静默丢弃。

## 7. 操作（`POST /api/actions`）

### 7.1 请求字段增量

| 字段 | 类型 | 说明 |
|------|------|------|
| `agent` | `Agent` | 对象所属的一侧。带 `agent` 的写请求按 2 版规则处理；2 版客户端的所有写请求都必须带（见第 6 节“2 版请求的判定”）。缺省为 Codex（1 版） |
| `scope` | `"user" \| "project" \| "local"` | Claude 写入作用域；缺省 `user`，`plugin.toggle` 例外：缺省按安装范围与决定层，用户范围的安装为 `user`，但当前由项目的本地或共享设置决定时为 `local`（写当前项目）；project、local 范围的安装为 `local`（写该安装所在项目），技能目录插件为 `local`（写当前项目），都不影响其他项目（HLD 3.3）。显式指定的 `scope` 低于当前决定启用状态或可见性的层时，返回 `SCOPE_INEFFECTIVE`，不写入。`skill.toggle`（Claude 技能）缺省：个人技能为 `user`，当前由项目的本地或共享设置决定时为 `local`；项目技能为 `local`（HLD 3.4）。`skill.previewInstall`（Claude）：`user` 为个人技能目录，`project` 为当前项目的 `.claude/skills`，不接受 `local`。`plugin.installSource`（Claude）：来源带 Claude manifest 时同上（`local` 返回 `INVALID_ACTION`）；不带 manifest 时只接受 `user`、`local`（`project` 返回 `UNSUPPORTED_FOR_AGENT`）；预览的 `scopes` 给出可选值。写设置的操作中，`project` 会改动协作者共享的设置，须同时带 `confirm: true`。写入 `local` 会在 Git 仓库中新建未被忽略的 `.claude/settings.local.json` 时，须带 `gitExclude`（`true` 或 `false`），否则返回 `CONFIRMATION_REQUIRED`，`nativeRules` 中一条 `kind: "scope"` 的 `items` 列出该文件 |
| `confirm` | `boolean` | 用户已在确认框中同意本次需要确认的改动：共享作用域、可见性从“仅名称/仅用户可调用”改为开或关、卸载 Claude 插件（默认删除插件数据）、移除 Claude marketplace（会卸载从它安装的插件）、移走两侧共用的技能目录、移除或更新会改写另一侧插件目录内容的技能、批量移除中涉及上述两类的项、另一侧已启用管理时把这类技能加入或改入后台计划、把含这类技能的计划改为自动应用或启用自动应用的计划、在计划设置中确认待确认的这类目标（第 6 节“跨侧影响提示”）、清理 SkillDock 管理的本地 marketplace（停用 Claude 管理时，见 7.2 `agent.setManagement`） |
| `gitExclude` | `boolean` | 新建的 `.claude/settings.local.json` 位于未忽略的 Git 仓库时，用户是否同意写入 `.git/info/exclude` |
| `keepData` | `boolean` | 卸载 Claude 插件时保留插件数据 |
| `expectedRevision` | `string` | 界面所依据的对象 `revision`。2 版请求对**单个**已存在、带 `revision` 的对象（Claude 对象、共用技能、Claude marketplace）的写操作必须带；缺失或不一致都返回 `SNAPSHOT_STALE`，界面刷新后重试。多目标操作不带：`updates.run` 执行前按目标重新读取并核对预览基线，不一致的目标单独记为失败并说明原因，不影响其他目标；`skill.removeSelected` 保持 0.10.2 的整批原子语义（见第 6 节“批量移除”）；`schedule.configure` 只保存计划，不做修订号核对，其余校验沿用 0.10.2（启用计划时每个目标都须可检查，否则整体拒绝；暂停的目标除外，见第 6 节）。1 版请求免带 |
| `management` | `AgentManagement` | 用于 `agent.setManagement`（只接受 `enabled`、`read-only`） |
| `claudeRoot` | `{ configDir: string; pluginCacheDir: string }` | 用于 `settings.setClaudeRoot` |
| `nodePath` | `string` | 用于 `settings.setNodePath` |

### 7.2 新增操作

| 操作 | 说明 | 成功结果 | 主要错误 |
|------|------|----------|----------|
| `agent.setManagement` | 启用或停用某 Agent 环境的管理；启用前验证主证据可读、命令行可用并读回。停用 Claude 管理而 SkillDock 管理的本地 marketplace 仍在时（HLD 3.3）：不带 `confirm: true` 照常停用，`message` 列出仍登记在 Claude 中的这些 marketplace；带 `confirm: true` 先逐个按 `marketplace.remove` 的语义移除（卸载从它安装的插件、读回、删除生成的文件与登记）；Claude 中已没有的登记只删 SkillDock 自己的文件；每一项都留操作记录；全部清完才停用，任何一项失败或未清完即返回错误，管理保持启用。只在 Claude 管理已启用时执行：已是只读时带 `confirm: true` 返回 `AGENT_READ_ONLY` | `message`；快照中环境状态更新；尽力写一条操作记录（`action: "agent.setManagement"`，带 `agent`，不可恢复；写入失败不影响已生效的开关；v0.29、v0.30） | `AGENT_NOT_INSTALLED`、`AGENT_UNCONFIRMED`、`CLI_UNAVAILABLE`；清理时另有 `AGENT_READ_ONLY`、`marketplace.remove` 的错误与 `READBACK_FAILED` |
| `agent.updateSkilldock` | 一键更新另一侧的 SkillDock（经该 Agent 的插件更新命令并读回）：先刷新 SkillDock 所在的 marketplace，再更新插件（Claude 按每个非托管的安装作用域，project、local 以其项目为工作目录），读回按安装逐项比对（插件与作用域），至少一项版本升高即成功，未升高的在结果中注明；project、local 安装所在的项目目录不存在时跳过并注明，全部如此时返回 `PROJECT_PATH_MISSING`；命令行超时原样返回 `CLI_TIMEOUT`（结果未确认）。只改动 SkillDock 本身，该侧只读时同样可用；该侧已是两侧最高版本时返回说明、不运行命令。错误的 `message` 第二行是手动步骤；执行更新命令之后的成功与失败都写一条 `action: "agent.updateSkilldock"` 的操作记录，此前的拒绝不写（阶段 5d2a；5d 评审） | `message`、`needsReload` | `AGENT_UNCONFIRMED`（该侧无法确认，附手动步骤）、`CLI_UNAVAILABLE`、`SKILLDOCK_UPDATE_FAILED`、`READBACK_FAILED`、`PROJECT_PATH_MISSING`、`CLI_TIMEOUT` |
| `settings.setClaudeRoot` | 切换 Claude 根目录；切换前重新核验新目录 | `message` | `INVALID_PATH`、`AGENT_UNCONFIRMED` |
| `settings.setNodePath` | 手动指定 Node 路径；按 HLD 3.10 核验后保存 | `message` | `NODE_UNAVAILABLE` |
| `settings.redetectNode` | 重新扫描 Node 并保存结果 | `message` | `NODE_UNAVAILABLE` |

### 7.3 现有操作在 Claude 侧的语义

| 操作 | Claude 侧语义 |
|------|---------------|
| `plugin.install` | 经 Claude 命令行安装，显式带作用域 |
| `plugin.previewInstall`、`plugin.installSource` | 从本地目录或 Git 安装（HLD 3.3、DEC-SDX-025）。来源带 Claude manifest 时作为技能目录插件放入个人技能目录或当前项目的 `.claude/skills`：文件事务，不经命令行、不写设置，来源记录写 Claude 分区，按 Claude 清单读回。不带 manifest 但有 Claude 能加载的技能或命令时，在数据目录生成 SkillDock 管理的本地 marketplace，登记后经命令行安装，只允许 `user`、`local`。两者都没有返回 `UNSUPPORTED_FOR_AGENT`；同一来源已安装返回 `PLUGIN_ALREADY_INSTALLED`。预览为 `PluginInstallPreview`（`agent`、`manifests`、`scopes`、`defaultScope`、`nativeRules`；`canSelectSkills` 为假）。没有任何 manifest 时插件名取来源本身（本地目录名；Git 来源取子路径末段，子路径为根时取仓库名），不合规返回 `INVALID_NAME`。Claude 中已有同名、但指向别处的 marketplace 时返回 `MARKETPLACE_EXISTS`；`enabledSkills` 返回 `UNSUPPORTED_FOR_AGENT`。安装失败时撤销这次生成的 marketplace（仍有从它安装的插件时保留），两种情形都在结果中说明。从这类 marketplace 安装的最后一个插件被卸载（命令行清单与 Claude 的安装记录中都没有其他安装）、或这个 marketplace 被移除时，经 `marketplace remove` 并读回后删除生成的文件与登记；清理失败不改变已完成的卸载或移除，结果追加说明，另记一条 `marketplace.remove` 的失败记录。快照中这类 marketplace 带 `direct: true` 与原始来源；它在 Claude 中的 `marketplace.refresh` 只重读数据目录中的副本，不从原始来源取新内容（随阶段 5） |
| `plugin.toggle` | 写对应作用域设置中的启用条目；不支持“只启用部分技能”（`UNSUPPORTED_FOR_AGENT`） |
| `plugin.remove` | 卸载，`keepData` 决定是否保留数据。技能目录插件位于个人技能目录或当前项目的 `.claude/skills` 时，确认后移到可恢复区，可经 `activity.restore` 恢复；指向其内容的 Codex 独立技能在确认的 `nativeRules` 中列出（`kind: "scope"`）；其他位置的不可移除（`canRemove` 为假并说明原因） |
| `marketplace.add`、`marketplace.refresh`、`marketplace.remove` | 经 Claude 命令行；移除前在确认框列出从该 marketplace 安装的插件。`marketplace.add` 的 `scope` 决定声明写在哪一层设置（缺省 `user`）；Claude 侧不支持 `ref`（`UNSUPPORTED_FOR_AGENT`）；新 marketplace 按添加前后清单的差异读回。`marketplace.remove` 由 Claude 从所有设置层删除声明并卸载从它安装的插件：项目共享设置声明了它、或其中有 project 范围的安装时，确认的 `nativeRules` 另有一条 `kind: "scope"` 说明会改动协作者共享的 `.claude/settings.json`；组织托管设置声明的不可移除（`HOST_MANAGED`）；结果只说读回证实的卸载数 |
| `plugin.previewMarketplace` | Claude 中未安装的插件：返回 `PluginInstallPreview`（`agent`、`scopes`、`defaultScope`、`nativeRules`；`canSelectSkills` 为假），不保存预览；随后的 `plugin.install` 以 `expectedRevision` 绑定所见的插件，`previewId` 不作校验 |
| `skill.toggle` | 写技能可见性条目；当前值（决定层的或写入层中的）为后两档时须 `confirm: true`；同名的其他 Claude 技能共用这一条目，会一并改变，须 `confirm: true`（`nativeRules` 列出它们）；这些确认与共享设置、本地设置文件的选择一次给出。两侧共用技能的 Claude 一侧按 Claude 自己的条目写入，核对两侧共同的修订号（第 6 节）；只属于 Codex 的技能以 `agent: "claude"` 切换返回 `UNSUPPORTED_FOR_AGENT` |
| `skill.install`、`skill.update`、`skill.remove`、`activity.restore` | 复用现有文件事务，目标为 Claude 个人根或项目的 `.claude/skills`；`activity.restore` 作用于操作记录中的一侧 |
| `skill.previewRemoval`、`skill.removeSelected` | 同名副本的批量移除，`ids` 可含 Claude 对象 ID；涉及两侧共用目录或另一侧插件内容时须确认；环境检查按各项所属的一侧（第 6 节） |
| `skill.previewSource`、`skill.connectSource` | 写入请求一侧的来源记录分区；与另一侧不同来源的记录冲突时返回 `SOURCE_CONFLICT` |
| `update.check`、`update.apply`、`updates.run`、`schedule.configure` | 目标带 `agent`；Claude 插件按 HLD 3.3A 的候选内容与读回规则 |

移除 Claude marketplace 时，服务端在执行前重新计算受影响的插件并核对 `expectedRevision`（marketplace 的 `revision` 覆盖从它安装的插件集合）；不一致按通用规则返回 `SNAPSHOT_STALE`，界面刷新后重新显示确认框。

需要确认的操作在未带 `confirm: true` 时返回 `CONFIRMATION_REQUIRED`（例外：`agent.setManagement` 的 `confirm` 是“停用时一并清理”的选择，不带时照常停用，从不返回这个错误，见 7.2），错误体额外带 `nativeRules`（`{ "error": { "code", "message", "nativeRules": NativeRule[] } }`），界面据此显示确认框（AC-016）；这是错误体唯一的扩展字段，只出现在这个错误码上。

所有 Claude 写操作：写前重新读取对象状态并与 `expectedRevision` 比较（多目标操作见 7.1）；成功后核对结果（命令行操作与可见性从 Claude 的清单读回；技能文件事务以内容指纹与移动结果核对，与 Codex 一侧相同），结果带 `agent: "claude"`；改变会话中可用内容的（插件与技能的启停、安装、卸载、移除，以及卸载了插件的 marketplace 移除）带 `needsReload: true`，添加与刷新 marketplace 不带。项目目录不存在的 project、local 范围安装返回 `PROJECT_PATH_MISSING`；组织托管范围的安装与托管设置声明的 marketplace 返回 `HOST_MANAGED`；命令行超时返回 `CLI_TIMEOUT`，结果未确认，须刷新核实。

### 7.4 示例

启用 Claude 项目作用域的插件（需要确认共享设置）：

```json
{ "mode": "local", "action": "plugin.toggle", "agent": "claude", "id": "claude:plugin:demo@market:project:1a2b3c4d5e6f",
  "enabled": true, "scope": "project", "confirm": true, "expectedRevision": "9f8e…" }
```

```json
{ "message": "已在项目设置中启用 demo。新会话生效，已打开的会话需重载插件。", "needsReload": true, "agent": "claude",
  "nativeRules": [{ "kind": "scope", "message": "这会改动协作者共享的 .claude/settings.json。" }] }
```

（成功结果带 `nativeRules` 的情形：确认过规则的操作，例如有规则的 `skill.toggle`、`plugin.remove`、`marketplace.remove`；没有规则的启停不带，示例中的规则只作说明。）


未带 `confirm` 时：

```json
{ "error": { "code": "CONFIRMATION_REQUIRED", "message": "启用到项目设置会改动协作者共享的 .claude/settings.json，请确认后重试。",
  "nativeRules": [{ "kind": "scope", "message": "这会改动协作者共享的 .claude/settings.json。" }] } }
```

启用 Claude 环境管理：

```json
{ "mode": "local", "action": "agent.setManagement", "agent": "claude", "management": "enabled" }
```

```json
{ "message": "已启用 Claude 管理。" }
```

## 8. 错误契约（新增）

响应体沿用 `{ "error": { "code": string, "message": string } }`。

| 错误码 | HTTP | 含义 | 可重试 | PRD 条目 |
|--------|------|------|--------|----------|
| `AGENT_NOT_INSTALLED` | 404 | 该 Agent 未安装 | 否 | REQ-SDX-001 |
| `AGENT_READ_ONLY` | 409 | 该环境处于只读，写操作被拒 | 启用后可 | REQ-SDX-001 |
| `AGENT_UNCONFIRMED` | 409 | 无法确认该环境的主证据，写操作全部禁用 | 刷新后可 | REQ-SDX-002 |
| `DATA_GENERATION_NEWER` | 409 | 数据代号高于本服务支持，只读 | 更新后可 | REQ-SDX-007 |
| `UNSUPPORTED_FOR_AGENT` | 422 | 该操作不适用于该 Agent（如 Claude 插件只启用部分技能） | 否 | REQ-SDX-016 |
| `SNAPSHOT_STALE` | 409 | 宿主中已有改动（`expectedRevision` 不一致），请刷新 | 刷新后可 | REQ-SDX-016、RISK-SDX-008 |
| `CONFIRMATION_REQUIRED` | 409 | 需要用户确认后带 `confirm: true` 重试；错误体带 `nativeRules` | 确认后可 | REQ-SDX-012、016 |
| `HOST_MANAGED` | 403 | 由宿主或组织管理（managed、`@synced`、command 来源等），只显示手动途径 | 否 | REQ-SDX-004、012 |
| `PROJECT_PATH_MISSING` | 422 | project、local 作用域的项目路径不存在，该安装只读 | 恢复路径后可 | REQ-SDX-004 |
| `READBACK_CONTENT_CHANGED` | 502 | 装入内容与预览不同，未自动重试 | 重新预览后可 | REQ-SDX-004 |
| `SKILLDOCK_UPDATE_FAILED` | 502 | 一键更新另一侧 SkillDock 失败，附手动步骤 | 是 | REQ-SDX-007 |
| `NODE_UNAVAILABLE` | 422 | 指定或扫描到的 Node 不满足要求 | 修正后可 | REQ-SDX-009 |
| `SOURCE_CONFLICT` | 409 | 共用技能的另一侧已关联到不同的来源 | 解除冲突后可 | REQ-SDX-005 |
| `SCOPE_INEFFECTIVE` | 422 | 显式指定的写入层低于当前决定它的设置层，写入不会生效，未写入 | 改选决定层或不指定作用域后可 | REQ-SDX-012、016 |

沿用的错误码（`CLI_UNAVAILABLE`、`READBACK_FAILED`、`INVALID_PATH`、`TOKEN_REJECTED` 等）在 Claude 侧含义不变，消息按 Agent 措辞。新错误码只在 2 版请求（带 `agent`）或新增操作上出现；1 版客户端可能收到的三个例外见第 5 节。

## 9. 原生入口的路由白名单

0.11.x 原生入口代理的读路由与参数白名单：

| 路由 | 允许的参数 |
|------|-----------|
| `/api/health`、`/api/session` | 无 |
| `/api/state` | `mode`、`refresh`、`multiAgent`（取值只允许 `1`） |
| `/api/skill` | `mode`、`id`、`agent` |
| `/api/updates/progress` | `mode`、`agent` |
| `/api/plugin-icon` | `mode`、`id`、`theme`、`agent` |

`agent` 只允许 `codex`、`claude`；其余校验沿用 0.10.2。0.10.x 原生入口的白名单无法更改，它们只会发出 1 版请求，由第 5 节保证兼容。

迁移门槛的一键更新（阶段 5d2b，HLD 3.7，G-01）：0.11.x 原生入口启动后台时，启动脚本若因门槛以退出码 4 结束，入口只读地重算门槛，把被拦下的 Agent 随结构化错误返回（`SKILLDOCK_ERROR:` 加 `{code: "MIGRATION_BLOCKED", message, agents}`，`agents` 取 `codex`、`claude`）；界面经用户确认后调用工具 `skilldock_gate_update`（参数只有 `agent`，取值同上），入口带 `SKILLDOCK_UPDATE_AGENT=<agent>` 重新运行启动脚本，不受上次失败后 10 秒内不重试的限制。

## 10. 安全与非功能

- 沿用现有边界：仅绑定 `127.0.0.1`；同源静态页与接口；校验 Host、Origin、跨站标记；写请求要求会话令牌与 JSON；请求体 ≤ 32 KiB。
- 快照与详情不返回 Claude 设置中与功能无关的键（环境变量、凭证辅助程序等），不返回任何凭证。
- 1 版快照（不带 `multiAgent=1`）的 `activity` 不含 Claude 一侧的操作记录，也不含 `agent.*` 操作（Agent 环境的管理开关与一键更新，1 版客户端不认识；v0.29）与计划关于 Claude 目标的记录，`updateRuns` 中不含 Claude 目标的项（v0.30），保持 0.10.2 语义；过滤在最近 1000 条记录中进行，Claude 记录超过这个数且都比 Codex 记录新时，1 版看到的 Codex 记录会少于 200 条。
- 首屏快照不调用联网的命令（如带 `--available` 的列表）。0.11 的多 Agent 快照中，Claude 的未安装插件取自 Claude 在本机保存的 marketplace 副本（HLD 3.2 表中“可安装插件”的证据，不联网；HLD 第 10 节 DG-NO-AVAILABLE）。0.11 不调用联网的 `--available` 清单：可安装插件取自本机副本，刷新 marketplace（`marketplace.refresh`）即更新副本（阶段 4d 决定）。

## 11. 兼容性与版本策略

- 第 4 节标注“冻结”的健康检查字段在 0.10.3 发布后不得删除或改变含义。
- 其余增量按第 5 节“只增不破”演进。
- `contracts.ts` 与本文同步更新；契约评审同时核对两者。

## 12. 待确认问题

见索引第 9 节。
