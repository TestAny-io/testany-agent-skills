---
name: case
description: Testany 测试用例 CRUD - 创建/查询/更新/删除单个或批量 case（编写脚本请用 /case-writing）
argument-hint: "[操作] [描述]，如：创建 case、查看 A1B2C3D4、删除我的所有 case"
---

# Testany Case CRUD

本 skill 通过 Testany MCP 工具管理 **Testany 平台上的测试用例**。
所有操作都是对 Testany 平台的远程 API 调用，不涉及本地文件系统。

**注意**：如果用户需要**编写**测试脚本，请告知使用 `/case-writing` 命令。

用户输入: $ARGUMENTS

---

## 操作速查

| 用户意图 | 操作类型 | 工具 |
|---------|---------|------|
| 创建新 case | Create | `testany_create_case` → `testany_update_case` → `testany_update_case_script` |
| 查看 case 详情 | Read | `testany_get_case` |
| 查看 case 脚本内容 | Read | `testany_get_case_script` |
| 搜索/列出 cases | Read | `testany_list_cases` |
| 列出我的 cases | Read | `testany_list_my_cases` |
| 修改 case 配置 | Update | `testany_update_case` |
| 更新 case 脚本 | Update | `testany_update_case_script` |
| 删除 case | Delete | `testany_delete_case` |
| 批量更新 cases | Bulk Update | `testany_bulk_update_cases` |
| 批量删除 cases | Bulk Delete | `testany_bulk_delete_cases` |
| 验证 case 配置 | Validate | `testany_dry_run_case` → `testany_get_dry_run_result` |

---

## Single Case 操作

### Create（创建）

创建新 case 分为三个阶段：先收集可选项，再统一询问用户，最后执行创建。

#### 阶段 1: 收集可选项（并行调用）

同时调用以下工具获取可选项：
- `testany_filter_case_runtimes` → 获取运行环境列表（uuid + name）
- `testany_get_my_workspaces` → 获取用户有权限的工作空间列表

#### 阶段 2: 统一询问用户（一次 AskUserQuestion）

使用 AskUserQuestion 一次性询问以下问题：

| 问题 | 类型 | 选项来源 |
|------|------|---------|
| Case 名称 | 用户输入 | - |
| 运行环境 | 单选 | 阶段 1 获取的 runtimes（显示 name，推荐 cloudprime） |
| 可见性 | 单选 | "全局可见（所有人）" / "仅特定工作空间可见" |
| 工作空间 | 多选 | 阶段 1 获取的 workspaces（仅当选择"特定工作空间"时需要） |

**注意**：AskUserQuestion 最多支持 4 个问题。如果用户选择"全局可见"，workspace 问题可跳过。

#### 阶段 3: 创建 case

根据用户回答调用 `testany_create_case`：
- `name`：用户输入的名称
- `runtime_uuid`：用户选择的运行环境对应的 UUID
- `is_private`：全局可见 = false，特定工作空间 = true
- `workspace_keys`：如果 is_private=true，传入用户选择的工作空间列表；否则 `[]`

#### 阶段 4: 配置执行方式（可选）

如果用户有测试脚本，需要配置 `case_meta.trigger_method`：
- 调用 `testany_update_case` 设置 executor 和 trigger 配置
- 详细配置规则见 [Executor 配置详解](./references/executors.md)

#### 阶段 5: 上传脚本（可选）

调用 `testany_update_case_script` 上传测试脚本。

### Read（查询）

| 场景 | 工具 | 说明 |
|------|------|------|
| 获取单个 case 详情 | `testany_get_case` | 传入 case key |
| 获取 case 脚本内容 | `testany_get_case_script` | 下载 ZIP 并返回文件内容 |

### Update（更新）

#### 可更新的字段

| 字段 | 说明 |
|------|------|
| `name` | case 名称 |
| `description` | 描述 |
| `is_private` | 可见性（true=私有，false=全局） |
| `workspace_keys` | 可见的工作空间列表 |
| `environments` | 环境标签列表 |
| `case_labels` | 标签列表 |
| `case_version` | 版本号 |
| `owned_by` | 所有者邮箱 |
| `case_meta` | 执行配置（trigger_method, environment_variables） |

#### 更新配置流程

1. 调用 `testany_get_case` 获取当前配置
2. 使用 AskUserQuestion 确认要修改哪些字段及新值
3. 调用 `testany_update_case` 提交更新（只传需要修改的字段）

#### 更新脚本

调用 `testany_update_case_script` 上传新的测试脚本。

#### 检测脚本中的 Relay / Credentials 使用

如果用户上传的脚本中包含以下代码，需要在 `testany_update_case` 中配置相应设置：

| 脚本中的代码特征 | 需要配置 |
|-----------------|---------|
| `TESTANY_OUTPUT_RELAY_SERVICE` | 添加 `type='output'` 的环境变量 |
| `TESTANY_SECRETS_SERVICE` | 绑定 credential safe 和 credential keys |

**检测方法**：调用 `testany_get_case_script` 读取脚本内容，搜索上述关键字。

### Delete（删除）

调用 `testany_delete_case`，传入 case key。

**警告**：此操作不可撤销。

---

## Bulk Case 操作

### List / Search（列表/搜索）

| 场景 | 工具 |
|------|------|
| 搜索所有 cases | `testany_list_cases` |
| 仅列出我的 cases | `testany_list_my_cases` |

支持的过滤条件：
- `workspace` - 按工作空间过滤
- `keyword` - 按名称关键词搜索
- `version` - 按版本过滤
- `environment` - 按环境过滤
- `page` / `page_size` - 分页

### Bulk Update（批量更新）

调用 `testany_bulk_update_cases`，可批量更新多个 case 的：
- `version` - 版本
- `environments` - 环境列表
- `workspaces` - 工作空间列表
- `is_private` - 可见性

**注意**：Append 操作时，重复的 key 会 **覆盖** 现有值。

### Bulk Delete（批量删除）

调用 `testany_bulk_delete_cases`，传入 case keys 数组。

**警告**：此操作不可撤销。

### Labels 与目录视图

Testany 使用 **labels** 实现虚拟目录结构：
- 通过 `case_labels` 字段管理 case 的标签
- 一个 case 可以有多个 labels，从而出现在多个目录下
- 批量操作可以追加或替换 labels

---

## 辅助操作

### Filter（过滤选项）

| 工具 | 用途 |
|------|------|
| `testany_filter_case_runtimes` | 获取可用运行环境列表（创建 case 前必调） |
| `testany_filter_case_versions` | 获取可用版本列表（用于搜索过滤） |
| `testany_filter_case_environments` | 获取可用环境列表（用于搜索过滤） |

### Dry Run（验证）

验证 case 配置是否正确：

1. 调用 `testany_dry_run_case` → 触发 dry run，返回 `dry_run_id`
2. 调用 `testany_get_dry_run_result` → 使用 `dry_run_id` 查询结果

---

## 工具完整清单

共 15 个 MCP 工具：

**Single Case CRUD (6)**
- `testany_create_case` - 创建 case
- `testany_get_case` - 获取 case 详情
- `testany_get_case_script` - 获取 case 脚本内容
- `testany_update_case` - 更新 case 配置
- `testany_update_case_script` - 更新 case 脚本
- `testany_delete_case` - 删除 case

**Bulk Case CRUD (4)**
- `testany_list_cases` - 搜索/列出 cases
- `testany_list_my_cases` - 列出我的 cases
- `testany_bulk_update_cases` - 批量更新
- `testany_bulk_delete_cases` - 批量删除

**辅助 (5)**
- `testany_filter_case_runtimes` - 获取运行环境列表
- `testany_filter_case_versions` - 获取版本列表
- `testany_filter_case_environments` - 获取环境列表
- `testany_dry_run_case` - 触发 dry run
- `testany_get_dry_run_result` - 获取 dry run 结果

---

## 常见问题处理

| 场景 | 处理方式 |
|------|---------|
| 用户没提供脚本但想创建 case | 建议使用 `/case-writing` 先编写脚本 |
| 需要 relay 输出 | 1) 配置 `type='output'` 环境变量，2) 代码中 POST 到 `TESTANY_OUTPUT_RELAY_SERVICE` |
| 需要使用凭证 | 1) 绑定凭证到 case，2) 代码中调用 `TESTANY_SECRETS_SERVICE` API |
| 更新已有 case | 先 `testany_get_case` 获取当前配置，用 AskUserQuestion 确认修改项 |

---

## 返回格式

任务完成后，向用户汇报：
- Case Key（如 `A1B2C3D4`）
- Case 名称
- Executor 类型（如已配置）
- 可见性（Global / Private + 工作空间列表）
- 下一步建议（如"可以创建 pipeline 来编排执行"）

---

## 查阅官方文档

遇到不确定的问题时，查阅 Testany 官方文档：

1. **获取文档结构**：`WebFetch https://docs.testany.io/sitemap.xml`
2. **找到相关页面**：从 sitemap 中搜索关键词（如 `case`、`relay`、`credential`）
3. **读取具体页面**：`WebFetch https://docs.testany.io/en/docs/<page-name>/`

**常用文档页面**：
- `/en/docs/managing-test-case/` - 测试用例管理
- `/en/docs/managing-test-case-with-relay-case/` - Relay 配置
- `/en/docs/managing-test-credential/` - 凭证管理
- `/en/docs/bulk-manage-test-cases/` - 批量操作
- `/en/docs/manage-directory-view-of-test-case/` - 目录视图

---

## 参考文档

详细配置规则请参考：
- [Executor 配置详解](./references/executors.md) - 包含 trigger_method 配置和环境变量类型
- [核心概念](./references/concepts.md) - 包含可见性规则和实体定义
