---
name: testany-import-git
description: Testany Git 导入：把 Git 仓库里的测试脚本批量注册成 Testany platform cases，并持续同步、切 commit、演化 binding、配 webhook
argument-hint: "[操作] [描述]，如：连接 GitHub、从 owner/repo 建一个导入、同步一下、切到新的 commit、开 webhook"
---

# Testany Git Import

把一个 Git 仓库里的测试脚本批量注册成 Testany platform cases，并在后续以 sync / switch / relation 的方式保持与仓库同步。

用户输入: $ARGUMENTS

---

## 核心概念

| 对象 | 说明 |
|------|------|
| **Connection** | 一次 OAuth 授权后得到的 Git 平台身份（当前支持 GitHub）。GitHub 连接下有若干 `installation_bindings`，每个绑定代表一个 GitHub App 安装（owner/org + 可访问 repo 范围）。`installation_id` 是后续浏览仓库的必填入参 |
| **Import History** | 一次导入配置：绑定到某个 connection、某个 repo、某个 ref，决定了"这些文件 ↔ 这些 case"的映射 |
| **File Binding** | import history 下"一个文件 ↔ 一个 case"的绑定记录，是 Testany 上那批 case 的真源 |
| **Sync Record** | 一次同步动作的审计记录（per-file 成功/失败/跳过） |

### import_mode（枚举值必须严格匹配）

**本质差别：后端 auto-diff vs 用户手动选** —— 不是"仓库内容多少是测试"之类的场景判断。

- `managed_import`：镜像仓库、自动 diff。`confirm_git_sync` 触发一次 mirror→binding 的增量落地；新增文件还可以另走 addFiles，上游被删走 sourceDeleted 两阶段确认
- `sync_link`：显式管理 binding 集。**current phase 下 `confirm_git_sync` 不可用**，binding 集演化统一走 addFiles（新增文件）和 sourceDeleted（上游删除）两条关系流。`preview_git_sync` 在这里仅用于查看"已绑定文件相对 last_synced_commit 的变化"

选择建议：想省心 + 信任仓库当 source-of-truth → `managed_import`；想精细控制每次哪些文件入 binding 集 → `sync_link`。不要基于"仓库是否纯测试"这类理由推断。

### sync_mode（枚举值必须严格匹配）

- `latest`：跟随 `tracked_branch` 的 HEAD，每次 sync 自动前进
- `pinned_commit`：钉在某个 commit；要前进必须走 switchCommit

---

## 操作速查

| 意图 | 工具链 |
|------|--------|
| 看我有哪些 Git 连接 | `testany_list_git_connections` |
| 新建 GitHub 连接 | `testany_initiate_git_oauth` → 用户浏览器完成 → 轮询 list |
| Access token 快过期 / 已过期但 refresh_token 还在 | `testany_refresh_git_connection_scope`（server-to-server，无需浏览器） |
| Refresh_token 也挂了 / 用户主动断连 / 换账号 | `testany_reauthorize_git_connection`（返回 `authorize_url`，需用户浏览器完成） |
| 连接侧 repo 选择 / scope 变更 | `testany_refresh_git_connection_scope`（同入口；它既刷 token 又校对 scope） |
| 删连接 | `testany_disconnect_git_connection` |
| 列可访问仓库 | `testany_list_git_repositories`（必填 `installation_id`） |
| 选分支 / commit | `testany_list_git_branches` / `testany_list_git_commits` |
| 看仓库目录 / 预览文件 | `testany_browse_git_tree` / `testany_preview_git_file` |
| 列 / 查 / 删 import | `testany_list_git_imports` / `testany_get_git_import` / `testany_delete_git_import` |
| 新建导入 | `testany_create_git_import` |
| 看 / 清 bindings | `testany_list_git_import_file_bindings` / `testany_delete_git_import_file_bindings` |
| 周期同步（**managed_import 专属**） | `testany_preview_git_sync` → `testany_confirm_git_sync`（sync_link 在 current phase **不支持** confirm_sync；改走 addFiles/sourceDeleted） |
| 重放失败 sync（sync_link 专属） | `testany_retry_git_sync({sync_record_id})` |
| 切 commit（要求 sync_mode=pinned_commit） | `testany_preview_git_switch_commit` → `testany_confirm_git_switch_commit` |
| 解除 pinned、回 latest（要求 sync_mode=pinned_commit） | `testany_preview_git_switch_mode` → `testany_confirm_git_switch_mode` |
| 审计同步历史 | `testany_list_git_sync_records` → `testany_get_git_sync_record` |
| 加新文件（managed_import 与 sync_link 均可） | `testany_get_git_add_files_summary` → `_list_git_add_files_candidates` → `_confirm_git_add_files` |
| 标记源删除（managed_import 与 sync_link 均可） | `testany_get_git_source_deleted_summary` → `_list_..._candidates` → `_confirm_git_source_deleted` |
| Webhook 读 / 开关 / 轮换 | `testany_get_git_webhook_config` / `_update_git_webhook_config` / `_disable_git_webhook` / `_regenerate_git_webhook_secret` |

---

## Phase 1：连接 Git 平台

1. `testany_list_git_connections`，找目标平台的连接
2. 如果**没有连接** → `testany_initiate_git_oauth({platform: "github"})` 拿 `authorize_url`，交给用户浏览器完成 GitHub App 安装授权（agent 不能替点击；明确告知"完成后回来说一声"），然后轮询 `testany_list_git_connections` 到新连接出现
3. 如果**有连接**，做**健康检查**（详见 [connection-health.md](./references/connection-health.md)）：
   - **配置层**：`status == "connected_scope_ready"` 才是健康 ⚠️ 不是字面 `"ready"`
   - **凭证层**：`token_expires_at` 必须 > `now + 60s`；否则先调 `testany_refresh_git_connection_scope` 做 server-to-server 刷新（不打扰用户）
   - 看各 `installation_bindings[i].scope_verified_at` 是否太旧（>24h 可选刷）
4. 健康后，从 `connection.installation_bindings[]` 挑目标 `installation_id`

**常见不健康状态 → 修复路径速查**（完整枚举见 `connection-health.md`）：

| `status` / 症状 | 处理 |
|---|---|
| `connected_scope_ready` 但 `token_expires_at` 过期或临近 | `refresh_connection_scope`（server-to-server） |
| `token_expired` | `reauthorize_git_connection` → 浏览器 |
| `permission_changed` | 先 `refresh_connection_scope`；失败再 `reauthorize` |
| `authorized_no_installation` | 用 `scope_management_entry_url` 让用户浏览器装 installation |
| `disconnected` | `initiate_git_oauth` 重新授权 |

> **关键纪律**：不要只看 `status`。GitHub App access_token 默认 8h 过期，到期时 `status` 仍然是 `connected_scope_ready`（滞后指标），下次 GitHub-API 调用才会让后端把它翻到 `token_expired`。主动用 `token_expires_at` 判断能避免一次多余的失败重试。

---

## Phase 2：选仓库与 ref

1. `testany_list_git_repositories({connection_id, installation_id, search?})` 选出 `owner/repo` + `repo_full_name`
2. 再选参照系：
   - `sync_mode=latest` → `testany_list_git_branches` 选 `tracked_branch`
   - `sync_mode=pinned_commit` → 还要 `testany_list_git_commits` 选出具体 `pinned_commit`
3. 需要核对文件的话，用 `testany_browse_git_tree` + `testany_preview_git_file`
4. 选 runtime：**直接调 `testany_filter_case_runtimes` 拿列表给用户选**，不要先问用户测试脚本是什么语言。大多数 runtime 的 executor 是一致的，默认推荐 `CloudPrime-Default`（或其它 CloudPrime 系列）。用户挑完用对应 `runtime_uuid`。不要让用户背 UUID。
5. 调 `testany_get_tenant_config` 拿 `deployment_type`，供 Phase 3 决定 `selected_files` 的 `visibility` 默认值。Session 级缓存即可。

---

## Phase 3：组装 `selected_files` 并创建 import

### 必填字段

调 `testany_create_git_import` 时：

| 字段 | 何时必填 |
|------|----------|
| `connection_id` | 总是 |
| `installation_id` | 总是 |
| `import_mode` | 总是（`managed_import` 或 `sync_link`） |
| `sync_mode` | 总是（`latest` 或 `pinned_commit`） |
| `tracked_branch` | 总是（即使 `pinned_commit` 模式，也要带分支上下文） |
| `pinned_commit` | 仅 `sync_mode=pinned_commit` |
| `runtime_uuid` | 总是 |
| `repo_full_name` | 总是，形如 `owner/repo` |
| `selected_files` | **两种 import_mode 都必填**，作为 binding 集的首轮种子 |
| `root_path` | **必填**，取仓库根时传 `"/"`；取子目录传相对路径 |
| `workspace_key` | **可选**。作为兼容性默认：当 per-file 没给 `workspace_keys` 且该 case 是 restricted 时，用这个兜底。**不要当成必填**让用户从几十个 workspace 里挑 |

### `selected_files` 怎么组

对每个要纳入的文件给一个 `FileSelectionInput`：
- `file_path`：**相对仓库根**（不是相对 `root_path`）
- `name`：case 名，不给就用文件名
- `executor`：`testany_browse_git_tree` 返回的 `entry.executor` 是后端推荐值，直接用
- `trigger_method`：多 config 的 executor（playwright / maven / gradle 等）必填；结构见 `testany://schema/import-git`
- `case_labels`：先 `testany_list_labels` 确认存在（不存在先 `testany_create_label`）
- `visibility` / `is_private`：见下方「Case 可见性策略」

### Case 可见性策略

`visibility` / `is_private` / `workspace_keys` 规则受租户 `deployment_type` 约束。**完整规则、错误码、获取方式见 [case-visibility-policy.md](../testany-guide/references/case-visibility-policy.md)**。

Import 路径特有的点：

1. Phase 2 已经调过 `testany_get_tenant_config`；这里直接用缓存的 `deployment_type` 决定 per-file 的 `visibility` 默认值
2. **默认策略**：
   - `deployment_type=1` → per-file `visibility: "global"`，不需要 `workspace_keys`，也不需要顶层 `workspace_key`
   - `deployment_type=2` → per-file `visibility: "restricted"` + `workspace_keys: ["<key>"]`（或用顶层 `workspace_key` 兜底），因为 global 不被允许
3. **顶层 `workspace_key` 是 per-file 没给 `workspace_keys` 时的兜底**；`type=1` 走 global 的情况下完全不用传
4. 用户在 `type=2` 下硬要 global：向用户解释限制，降级到 restricted；不要盲目重试

后端当前把 `private` / `workspace` 也视为 `restricted` 的兼容别名，但对 agent 文案和构造 payload，统一使用 `global | restricted` 更稳。

### 导入后：提示凭证类变量改用 secrets 声明

Import 会把脚本文件上传成 case，但**不负责**为 case 填 `environment_variables`（那是 `testany-case` / `testany-sync-case-env-from-source` 的职责）。

导入完成后，如果脚本里有这些命名模式，主动提示用户在 `case_meta.environment_variables` 中把它们声明为 `type: secrets` + `secret_ref`，而不是明文 `type: env`：

- `*_PASSWORD` / `*_PWD`
- `*_TOKEN` / `*_APIKEY` / `*_API_KEY`
- `*_SECRET` / `*_KEY`

用户确认 `secret_ref` 的三个字段（`workspace_key` / `credential_safe_key` / `credential_key`）后，脚本里就可以直接读同名环境变量拿到凭证值。

---

## Phase 4：周期性同步

> **current-phase 约束**：`testany_confirm_git_sync` 当前只对 `managed_import` 生效；`sync_link` 的 binding 演化统一走 addFiles / sourceDeleted。
> `idempotency_key` 由 MCP 自动生成，**不要手传 UUID**——除非你明确要跨多次调用做去重。

### managed_import

先获取本轮 `testany_preview_git_sync`，按 [同步授权决策表](./references/sync-authorization.md) 核对实际差异与当前许可。只有全部差异在授权内且提交前状态没有冲突时，才提交；已明确许可不重复征求确认：

```
testany_confirm_git_sync({ import_history_id })
```

`no_changes` 时结束；意外删除/新增不能被「同步一下」或旧 preview 授权覆盖。managed confirm 按整体镜像差异落地，不能传 file_selections 裁掉未授权项。要求锁定精确候选但工具不支持时停止并披露，不伪造快照参数。提交后核对 sync record、实际 commit 和 failed_items。

### sync_link

**不走 confirm_git_sync**。要演化 binding 集：

| 意图 | 工具链 |
|------|--------|
| 仓库里多出文件、要新增 case | Phase 6 **addFiles** 流 |
| 仓库里删掉文件、要下线 binding | Phase 6 **sourceDeleted** 流 |
| 重放已有 sync record 里的失败项 | `testany_retry_git_sync({sync_record_id})` |

`testany_preview_git_sync` 在 sync_link 上仍可调，作为"当前绑定文件相对 `last_synced_commit` 的变化"审计——但**它不会把仓库里尚未选入的新文件作为候选**，新文件由 addFiles 候选列表负责。

### 失败处理

`SyncResult.failed_items` 非空先报告部分完成；仅当前任务已授权相同范围重试时，才考虑 `testany_retry_git_sync({sync_record_id})`，不无限循环。注意：**retry 仅 sync_link 可用**，managed_import 的 confirm 内部已自行处理 per-file 失败。

---

## Phase 5：Switch（只在 sync_mode 维度上操作）

**switch 工具不改 `import_mode`**（managed_import ↔ sync_link）；只操作 `sync_mode`。
都是 `preview → confirm` 两阶段，先 preview 取证；按 [同步授权决策表](./references/sync-authorization.md) 区分已授权提交与真正需要新增决定的差异。不能从普通 sync 许可推导切版本或跟踪模式许可。

### switchCommit — 换钉住的 commit

- 前置条件：**`sync_mode=pinned_commit`**（managed_import 和 sync_link 都可以）
- `testany_preview_git_switch_commit({target_commit})` → `_confirm_git_switch_commit({target_commit, file_selections?})`
- sync_link 的 confirm 从 preview.changes 派生 `file_selections`；managed_import 的 confirm 不接受 `file_selections`（会 400）
- 前置条件不满足（例如当前已是 latest）返回 `ERR_SWITCH_NOT_ALLOWED`

### switchMode — 解除 pinned，回到跟随 branch HEAD

- **语义**：`sync_mode: pinned_commit → latest`。**不是** managed_import ↔ sync_link 之间切换
- 前置条件：`sync_mode=pinned_commit`
- 已经是 `latest`：返回 `ERR_SWITCH_MODE_UNCHANGED`
- 非 pinned：返回 `ERR_SWITCH_NOT_ALLOWED`
- Payload：
  - managed_import：`_confirm_git_switch_mode({})`（带 file_selections 会被后端拒绝）
  - sync_link：`_confirm_git_switch_mode({file_selections?})`（可选，从 preview 派生）

---

## Phase 6：关系演化（managed_import 和 sync_link 都支持）

这是 sync_link 在 current phase 下**唯一**的 binding 集演化路径（managed_import 的 addFiles 只是和 confirm_git_sync 并列的可选手段）。

### 新增文件（addFiles）

仓库里多出的、Testany 上还没有 binding 的文件：

1. `testany_get_git_add_files_summary` — `available=false` 就不能走，看 `blocked_reason`
2. `testany_list_git_add_files_candidates` — 拿到 `snapshot_commit` 和候选列表
   - 读取完整候选，只选择本轮已授权文件/元数据；新候选不自动扩大授权
3. `testany_confirm_git_add_files({selected_files, snapshot_commit})` — `idempotency_key` 由 MCP 自动生成
   - **`snapshot_commit` 必须原样回传** list 时拿到的值；值对不上时后端会拒绝，防止竞态下把过期候选集落地

### 源文件被删（sourceDeleted）

仓库里已经删掉、但 Testany 上 binding 还在的：summary → list → confirm 同一套，但 confirm 的参数是 `file_binding_ids`（不是 file_path）。
删除/下线影响必须在许可内，不能从脚本同步推导。按本轮 list 的 snapshot_commit 提交，提交后核对绑定与实际处理结果。

---

## Phase 7：Sync 审计

- `testany_list_git_sync_records({import_history_id, page?, per_page?})`
- `testany_get_git_sync_record({record_id, detail_page?, detail_per_page?})` 翻 per-file 结果

---

## Phase 8：Webhook

| 动作 | 工具 |
|------|------|
| 查看配置 | `testany_get_git_webhook_config` |
| 启用 / 改 track_scope | `testany_update_git_webhook_config({webhook_enabled: true, track_scope?})` |
| 关闭 | `testany_disable_git_webhook` |
| 轮换 secret | `testany_regenerate_git_webhook_secret` |

**关键纪律**：`webhook_secret` 只有**首次启用**或**刚 regenerate** 的响应里是明文，之后读全是 masked。一旦拿到明文：

1. 立即让用户在 Git 平台 hook 配置里填这个 secret
2. 同时把 `platform_setup_guide.steps` 完整交给用户
3. 让用户触发一次测试事件，观察 `webhook_status` 从 `pending_verification` → `verified`

---

## 必须提醒用户的事

1. **OAuth 要浏览器完成**：agent 不能替用户点授权；返回 `authorize_url` 后要明确告知并承担轮询状态。`initiate_git_oauth` 的 `frontend_return_uri` **必填**（绝对 URL），由后端强校验
2. **webhook_secret 只出现一次**：首次启用或 regenerate 后必须立刻记下并同步到 Git 侧，否则只能再轮换
3. **addFiles / sourceDeleted 依赖 `snapshot_commit`**（managed_import 和 sync_link 都是如此）：list 阶段拿到的值原样回传到 confirm
4. **sync_link 在 current phase 下不走 `confirm_git_sync`**：后端 422。要演化 binding 集就走 addFiles / sourceDeleted
5. **删除连接不会级联删 import history**：那些 import history 会变 `not_ready`，需重新授权
6. **先取证、按影响授权**：sync / switch 用本轮完整 preview，relation 用候选 snapshot；既有许可覆盖实际差异时不重复问，越界/删除/漂移时按 [同步授权决策表](./references/sync-authorization.md) 停止对应提交
7. **不要让用户挑 workspace 除非必要**：顶层 `workspace_key` 是可选兼容字段，不是 UX 必选项。只有当用户明确要建 restricted case，且 per-file 没给 `workspace_keys` 时才问
8. **不要预设 `deployment_type`**：在允许 global case 前，用 `tenantClient.getCreditStatus` 或向用户确认环境类型；`deployment_type=2` 环境下 global 会被后端直接拒（`E400001`）
9. **Runtime 选择不要盘问语言**：直接列 `testany_filter_case_runtimes` 结果让用户选，默认推荐 `CloudPrime-Default`
10. **不要手传 `idempotency_key`**：MCP 已在 preview_sync / confirm_sync / retry_sync / confirm_add_files / confirm_source_deleted 内部自动生成 UUID，传旧风格的 UUID 只会让上层多一步无谓代码。仅在明确要跨多次调用去重时才显式传一个合法 UUID
11. **`installation_id` 必须从 connection 里挑**：`connection.installation_bindings[*].installation_id`，且对应 binding 的 `account_login` 要和 `repo_full_name` 的 owner 一致，否则 400

---

## 常见疑问

| 用户问题 | 处理方式 |
|---------|----------|
| "为什么没同步到新文件？" | `testany_get_git_import` 看 `remote_latest_commit` vs `last_synced_commit`；managed 模式再看 addFiles summary |
| "能回滚一次 sync 吗？" | V2 不支持回滚；最接近的是用 `switchCommit` 回到旧 commit |
| "这些 case 是哪次导入建的？" | `testany_list_git_import_file_bindings` 里的 `test_case_key` 反查 |
| "webhook 收不到事件" | 看 `webhook_status`（`pending_verification` / `error`）+ `platform_setup_guide` |
| "连接变 not_ready 了" | 读 `not_ready_reason`，用 `reauthorize` 或 `refreshScope` 恢复 |

---

## 参考

- [详细 payload 约定与错误码](./references/workflow.md)
- MCP schema resource：`testany://schema/import-git`（枚举、类型、流程图、工具归类）
- [Testany 自动化对象模型](../testany-guide/references/automation-model.md)
