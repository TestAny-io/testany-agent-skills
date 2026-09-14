# Git Import 细节补充

本文档列出 MCP 工具 payload 的具体字段、枚举值、错误码。与 `SKILL.md` 配合使用。

---

## 枚举值速查

### `import_mode`

| 值 | 含义 | 创建时 `selected_files` | `confirm_git_sync` | addFiles / sourceDeleted |
|----|------|------------------------|--------------------------|--------------------------|
| `managed_import` | 镜像仓库并自动维护 binding 集 | **必填**（首轮 seed） | **可用**（`file_selections` 会被忽略，由 mirror diff 决定变更） | **可用** |
| `sync_link` | 显式管理 binding 集 | **必填**（首轮 seed） | **current phase 不支持**；演化走 addFiles / sourceDeleted | **可用** |

> **current-phase 约束**：`testany_confirm_git_sync` 仅 managed_import 生效。sync_link 要加新文件 / 标记源删除，走 `testany_confirm_git_add_files` / `testany_confirm_git_source_deleted`。

### `sync_mode`

| 值 | 含义 |
|----|------|
| `latest` | `tracked_branch` 的 HEAD 就是 `to_commit`，每次 sync 自动前进 |
| `pinned_commit` | 钉在 `pinned_commit`；想前进只能走 `switchCommit` |

两种 sync_mode 下创建都要带 `tracked_branch`；`pinned_commit` 模式额外必填 `pinned_commit`。

### 平台支持

当前只能对 **GitHub** 仓库进行浏览与导入。非 GitHub 的 connection 调用 `testany_list_git_repositories` / `_branches` / `_commits` / `_tree` / `_blob` 会返回 `ERR_REPO_UNREACHABLE`。

---

## `FileSelectionInput` 字段

用于 `create_git_import.selected_files`、`confirm_git_add_files.selected_files`、`confirm_git_switch_commit.file_selections`（sync_link 时）、`confirm_git_switch_mode.file_selections`（sync_link 时）。`confirm_git_sync` 在 current phase 下仅 managed_import 可用且忽略 `file_selections`。

```jsonc
{
  "file_path": "e2e/login.spec.ts",         // 必填，相对仓库根（不是 root_path）
  "name": "Login smoke",                      // 可选，不给就取文件名
  "executor": "playwright",                   // 可选；browse_git_tree 的 entry.executor 是后端推荐值
  "trigger_method": {                         // playwright / maven / gradle 等多 config 执行器必填
    "executor": "playwright",
    "trigger_path": "e2e/login.spec.ts",
    "playwright_config_path": "playwright.config.ts",
    "trigger_command": ["npx", "playwright", "test"]
  },
  "case_labels": ["smoke", "auth"],           // 标签必须已存在（testany_list_labels / _create_label）
  "visibility": "restricted",                 // 首选: "restricted" | "global"；后端兼容 "private"
  "description": "...",
  "environments": ["staging"],
  "environment_variables": [
    { "key": "BASE_URL", "value": "https://..." }
  ],
  "is_private": true,                         // 和 visibility 二选一（设一个即可）
  "workspace_keys": ["Y2K"]                   // visibility=restricted 时必填
}
```

---

## Sync 流程按 import_mode 分叉

### managed_import

1. `testany_preview_git_sync({import_history_id})` — 取得本轮完整 diff；no_changes 则结束，按 [授权决策表](./sync-authorization.md) 核对实际影响。
2. 已授权全部差异且提交前状态无冲突时调用 `testany_confirm_git_sync({import_history_id})`。由 mirror diff 决定变更，`file_selections` 会被忽略，不能用它做授权过滤；不自造 commit/snapshot 锁定参数。
3. 核对 record、实际 commit 与失败项；部分失败照实报告。`testany_retry_git_sync` 仅对 sync_link 生效且需在本轮重试许可内（managed 的 confirm 已在内部做 per-file 容错）。

### sync_link（不走 confirm_git_sync）

`testany_confirm_git_sync` 对 sync_link 会失败，current phase 下不支持。要在 sync_link 上演化 binding：

| 意图 | 工具链 |
|------|--------|
| 仓库里多出文件、要新增 case | `testany_list_git_add_files_candidates` → `testany_confirm_git_add_files({snapshot_commit, selected_files})` |
| 仓库里删掉文件、要下线 binding | `testany_list_git_source_deleted_candidates` → `testany_confirm_git_source_deleted({snapshot_commit, file_binding_ids})` |
| 重放失败的 sync record | `testany_retry_git_sync({sync_record_id})` |

`testany_preview_git_sync` 在 sync_link 上仍可用来审计当前已绑定文件相对 `last_synced_commit` 的变化（不会冒出未选入的新文件）。

### idempotency_key

MCP 已在 `preview_git_sync` / `confirm_git_sync` / `retry_git_sync` / `confirm_git_add_files` / `confirm_git_source_deleted` 内部自动生成 UUID。**不要再让用户传**——除非上层想跨多次调用去重（例如自己做幂等重试），此时显式传一个合法 UUID 即可。

---

## Switch 流程细节

**注意**：switch 工具不改 `import_mode`（managed_import ↔ sync_link）——只在 `sync_mode` 维度上操作。

### switchCommit — 换钉住的 commit

- 前置条件：**`sync_mode=pinned_commit`**（`import_mode` 可以是 managed_import 或 sync_link）
- Payload：`{ target_commit: "<sha>" }`（preview）/ `{ target_commit, file_selections? }`（confirm）
- 对 sync_link，`file_selections` 从 preview.changes 派生；对 managed_import，不要传（会被拒绝）
- 只提交本轮已授权目标和选择，漂移/新影响按授权决策表处理；不一律再问，也不一律直提
- 前置条件不满足返回 `ERR_SWITCH_NOT_ALLOWED`

### switchMode — 解除 pinned，回到跟随 branch HEAD

- **语义**：把 `sync_mode` 从 `pinned_commit` → `latest`。**不是** managed_import ↔ sync_link 的切换。
- 前置条件：`sync_mode=pinned_commit`；已经是 `latest` 的会拿到 `ERR_SWITCH_MODE_UNCHANGED`
- Payload：
  - managed_import：`{}`（confirm 不要传 `file_selections`，会被拒绝）
  - sync_link：confirm 可选地传 `file_selections`（从 preview 派生）
- 非法调用返回 `ERR_SWITCH_NOT_ALLOWED`

---

## Relation（managed_import 和 sync_link 都支持）

### addFiles

1. `testany_get_git_add_files_summary`
   - `available=false` → 看 `blocked_reason`，常见：镜像未 ready / 状态机不允许
2. `testany_list_git_add_files_candidates(page, per_page, keyword?)`
   - 返回 `{ snapshot_commit, items: [...] }`
3. `testany_confirm_git_add_files({ snapshot_commit, selected_files })` — `idempotency_key` 由 MCP 自动生成
   - **`snapshot_commit` 必须原样回传** list 时拿到的值（防止 list 和 confirm 之间仓库又变了）
   - selected_files 仅含本轮批准集合；并发冲突后重新 list、核对授权，不自动扩大集合或只换 snapshot 重试

### sourceDeleted

同构于 addFiles，区别在候选单位是 `file_binding_id`（不是 `file_path`）。confirm 的参数叫 `file_binding_ids`。
仅在对应删除/下线影响已授权时提交，原样保留候选 snapshot；脚本同步许可不包括删除。提交后核对每项实际结果。

> 这条关系流是 sync_link 在 current phase 下**唯一**的 binding 演化路径（因为 confirm_git_sync 暂不支持 sync_link）。

---

## Webhook 字段

### update payload

```json
{ "webhook_enabled": true, "track_scope": { "...platform-specific..." } }
```

### WebhookConfigView 返回字段

- `webhook_enabled`：是否启用
- `webhook_url`：给用户在 Git 平台填的目标地址
- `webhook_secret`：**仅** 首次启用 / regenerate 后这一次是明文；之后一律 masked
- `webhook_status`：`not_configured` / `pending_verification` / `verified` / `error`
- `webhook_last_received_at`：最近一次收到事件的时间
- `platform_setup_guide.steps`：按平台生成的一次性配置步骤清单，整段交给用户执行

### 轮换纪律

1. 调 `testany_regenerate_git_webhook_secret` → 拿到 NEW `webhook_secret`
2. 让用户立刻在 Git 侧 hook 设置里替换 secret
3. 让用户发一次测试事件，验证 `webhook_status=verified`

漏掉第 2 步 = 旧 secret 失效、Git 平台那边的推送会全部被 Testany 拒收，且 secret 再也拿不回来 —— 只能再 regenerate。

---

## 错误码速查

后端错误码来自 `ImportGitErrorCodes`（`ERR_*`）。常见分类：

补充：visibility 的规范写法建议用 `global` / `restricted`。后端仍兼容 `private` / `workspace` 作为 restricted 别名。

| 场景 | 典型 code | 含义 / 建议 |
|------|-----------|-------------|
| 连接不可用 | `ERR_CONNECTION_*` | 连接 not_ready：重授权 / refresh scope |
| 仓库无法访问 | `ERR_REPO_UNREACHABLE` | 非 GitHub 平台 / installation 权限不足 |
| Payload 不合法 | `ERR_PAYLOAD_INVALID` | 必填字段缺失、格式错（例如 pinned 模式没给 pinned_commit） |
| 不允许 switch | `ERR_SWITCH_NOT_ALLOWED` | 组合被状态机拦截（见 switchCommit / switchMode 前置条件） |
| 并发冲突 | 去重 / 占用相关码 | 先查前序状态、重新核对候选与授权；只在重试仍被授权且可安全复用同一逻辑提交时重试 |

遇到错误时优先按 `ApiResult.error.code` 分类反馈，不要只复读 `message`。
