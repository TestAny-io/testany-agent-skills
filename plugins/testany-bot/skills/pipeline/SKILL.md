---
name: pipeline
description: Testany 流水线 CRUD - 创建/查询/更新/删除 pipeline，编排用例执行顺序和变量传递（执行请用 /tests）
argument-hint: "[操作] [描述]，如：创建 pipeline、查看 Y2K-0001A、删除我的所有 pipeline"
---

# Testany Pipeline CRUD

本 skill 通过 Testany MCP 工具管理 **Testany 平台上的测试流水线**。
所有操作都是对 Testany 平台的远程 API 调用，不涉及本地文件系统。

**注意**：
- 如果用户需要**执行** pipeline 或查看执行状态，请告知使用 `/tests` 命令
- 如果用户需要创建**门禁**或**定时计划**，请告知使用 `/orchestrator` 命令

用户输入: $ARGUMENTS

---

## 操作速查

| 用户意图 | 操作类型 | 工具 |
|---------|---------|------|
| 创建新 pipeline | Create | `testany_create_pipeline` |
| 查看 pipeline 详情 | Read | `testany_get_pipeline` |
| 查看 pipeline YAML | Read | `testany_get_pipeline_yaml` |
| 搜索/列出 pipelines（按 workspace） | Read | `testany_list_pipelines` |
| 列出我的 pipelines（按 workspace） | Read | `testany_list_my_pipelines` |
| 修改 pipeline 配置 | Update | `testany_update_pipeline` |
| 删除 pipeline | Delete | `testany_get_pipeline_used_by` → `testany_delete_pipeline` |
| 验证 YAML 语法 | Validate | `testany_verify_pipeline` |
| 检查被引用情况 | Query | `testany_get_pipeline_used_by` |

---

## 选择 Cases 的逻辑

当用户描述一个测试场景（如"创建测试订阅流程的 pipeline"），需要从现有 cases 中选择合适的 cases。

### 可用于判断的信息

调用 `testany_list_cases` 或 `testany_get_case` 获取 case 信息后，可用于判断的字段：

| 字段 | 用途 | 可靠程度 |
|------|------|---------|
| `case_labels` | 按 User Story 编号、功能模块筛选 | 高（如果有填写） |
| `description` | 理解测试场景、前置条件 | 中（取决于填写质量） |
| `environment_variables[].description` | 理解输入/输出变量语义 | 中（如果有填写） |
| `name` | 简单判断测试内容 | 低（可能不够详细） |

### 选择流程

#### 步骤 1：尝试按 case_labels 筛选

如果用户提到了 User Story 编号或功能模块：
```
用户："创建测试 US-G006 的 pipeline"
→ 在 case_labels 中查找包含 "US-G006" 的 cases
```

#### 步骤 2：尝试按 description 语义匹配

如果 labels 筛选结果不足，读取 case 的 description：
```
用户："创建测试订阅流程的 pipeline"
→ 查找 description 中提到"订阅"、"subscribe"、"Gallery Item" 的 cases
```

#### 步骤 3：分析依赖关系

从匹配的 cases 的 description 中查找"前置条件"信息：
```
description: "...前置条件：需要登录状态（AUTH_TOKEN 来自 LOGIN case）"
→ 识别出依赖 LOGIN case
```

从 `environment_variables[].description` 中查找变量来源：
```
{ "name": "AUTH_TOKEN", "type": "env", "description": "登录令牌，来自 LOGIN case" }
→ 识别出需要 LOGIN case 的输出
```

### **重要原则：禁止猜测**

如果上述信息**不足以确定**：
- 哪些 cases 应该被选择
- cases 之间的依赖顺序
- Relay 变量如何配置

**必须使用 AskUserQuestion 询问用户**，而不是猜测。

#### 需要询问用户的场景

| 场景 | 问题示例 |
|------|---------|
| case_labels 和 description 都没有明确信息 | "我找到以下 cases，请确认哪些应该包含在 pipeline 中：..." |
| 无法确定执行顺序 | "Case A 和 Case B 之间是否有依赖关系？哪个应该先执行？" |
| 无法确定 Relay 配置 | "Case A 的 TOKEN 输出是否应该传递给 Case B 的 AUTH_TOKEN？" |
| 找到多个可能匹配的 cases | "找到 3 个与'订阅'相关的 cases，请确认要包含哪些：..." |

#### 错误示例

```
❌ 猜测：description 没写清楚，但变量名是 TOKEN，应该是认证令牌吧
❌ 猜测：这两个 case 名字看起来有关联，应该有依赖关系
❌ 猜测：用户说"订阅流程"，这个 case 名字有"subscribe"，应该是对的

✓ 正确：信息不足，使用 AskUserQuestion 让用户确认
```

---

## Single Pipeline 操作

### Create（创建）

创建新 pipeline 需要以下步骤：

#### 阶段 1: 收集信息（并行调用）

同时调用以下工具获取可选项：
- `testany_list_cases` 或 `testany_list_my_cases` → 获取可用的 case 列表
- `testany_get_my_workspaces` → 获取用户有权限的工作空间列表

#### 阶段 2: 询问用户（AskUserQuestion）

使用 AskUserQuestion 询问：

| 问题 | 类型 | 说明 |
|------|------|------|
| Pipeline 名称 | 用户输入 | - |
| 所属工作空间 | 单选 | 决定 pipeline 所属 workspace，pipeline_key 前缀为 workspace_key |
| 要编排的 cases | 多选或用户描述 | 用户选择或描述执行顺序和依赖关系 |

#### 阶段 3: 构建 YAML（或使用 case_keys）

根据用户需求，有两种方式：

**方式 A：构建 YAML**（复杂编排）
1. **确定执行顺序**：根据用户描述确定 cases 的执行顺序
2. **配置依赖关系**：如有依赖，添加 `whenPassed` 或 `whenFailed`
3. **验证 Relay**（如有）：
   - 调用 `testany_get_case` 检查源 case 是否有 `type='output'` 变量
   - 调用 `testany_get_case` 检查目标 case 是否有 `type='env'` 变量
4. **生成 YAML**：按 [Pipeline YAML 语法](./references/pipeline-yaml.md) 格式化

**方式 B：使用 case_keys**（简单顺序执行）
- 直接传入 case keys 数组，系统自动生成顺序执行的 YAML

#### 阶段 4: 创建 pipeline

调用 `testany_create_pipeline`：

| 参数 | 必填 | 说明 |
|------|-----|------|
| `name` | 是 | pipeline 名称 |
| `workspace` | 是 | 所属工作空间 key |
| `description` | 否 | 描述 |
| `definition` | 否 | Pipeline YAML 配置（方式 A） |
| `case_keys` | 否 | Case keys 数组（方式 B，与 definition 二选一） |

#### 阶段 5: 验证（可选）

调用 `testany_verify_pipeline` 验证 YAML 语法是否正确。

### Read（查询）

| 场景 | 工具 | 说明 |
|------|------|------|
| 获取 pipeline 详情 | `testany_get_pipeline` | 传入 pipeline key |
| 获取 YAML 内容 | `testany_get_pipeline_yaml` | 传入 pipeline key |
| 搜索/列出 pipelines（按 workspace） | `testany_list_pipelines` | `workspace` 必填，支持关键词与更多过滤条件 |
| 仅列出我的 pipelines（按 workspace） | `testany_list_my_pipelines` | `workspace` 必填 |

### Update（更新）

#### 可更新的字段

| 参数 | 说明 |
|------|------|
| `name` | pipeline 名称 |
| `description` | 描述 |
| `definition` | 执行规则 YAML（与 case_keys 二选一） |
| `case_keys` | Case keys 数组（与 definition 二选一） |
| `environments` | 环境标签列表 |
| `owned_by` | 所有者邮箱（可转移所有权） |
| `pipeline_labels` | Pipeline 标签列表（须在 tenant labels 中存在） |

**注意**：Pipeline 的 `creator`（创建者）不可更新，但 `owned_by`（所有者）可以转移给其他用户。

#### 更新流程

1. 调用 `testany_get_pipeline` 获取当前配置
2. 调用 `testany_get_pipeline_yaml` 获取当前 YAML（如需修改编排）
3. 使用 AskUserQuestion 确认要修改哪些字段及新值
4. 如修改 YAML，重新验证 Relay 约束
5. 调用 `testany_update_pipeline` 提交更新

### Delete（删除）

删除前必须检查引用情况：

1. 调用 `testany_get_pipeline_used_by` 检查是否被 Plan 或 Gatekeeper 引用
2. 如果有引用，告知用户需要先解除引用
3. 如果无引用，调用 `testany_delete_pipeline`

**警告**：此操作不可撤销。

---

## Bulk Pipeline 操作

### List / Search（列表/搜索）

| 场景 | 工具 |
|------|------|
| 搜索所有 pipelines | `testany_list_pipelines` |
| 仅列出我的 pipelines | `testany_list_my_pipelines` |

支持的过滤条件：
- `workspace` - 按工作空间过滤（必填）
- `keyword` - 按名称关键词搜索
- `owned_by` - 按 owner 过滤（email 列表）
- `environments` - 按 environment labels 过滤
- `pipeline_labels` - 按 pipeline labels 过滤
- `case_keys` - 按包含的 case keys 过滤
- `pipeline_labels` - 按 pipeline 标签过滤
- `page` / `page_size` - 分页

---

## 辅助操作

### Verify（验证）

调用 `testany_verify_pipeline` 验证 YAML 语法：
- 检查 `kind` 版本是否正确（必须为 `rule/v1.2`）
- 检查 `rules` 结构是否合法
- 检查依赖关系是否满足 DAG 约束
   
**复制粘贴易错点**：YAML 第一行必须从第 1 列开始写 `kind:`（行首不能有空格），否则后端无法探测 schema 版本并会报错。

### Query Used By（查询引用）

调用 `testany_get_pipeline_used_by` 查询 pipeline 被哪些资源引用：
- Plan（定时计划）
- Gatekeeper（质量门禁）

**使用场景**：删除前检查、评估修改影响范围

---

## 工具完整清单

共 11 个 MCP 工具：

**Pipeline CRUD (7)**
- `testany_create_pipeline` - 创建 pipeline
- `testany_get_pipeline` - 获取 pipeline 详情
- `testany_get_pipeline_yaml` - 获取 YAML 内容
- `testany_list_pipelines` - 搜索/列出 pipelines
- `testany_list_my_pipelines` - 列出我的 pipelines
- `testany_update_pipeline` - 更新 pipeline
- `testany_delete_pipeline` - 删除 pipeline

**辅助 (2)**
- `testany_verify_pipeline` - 验证 YAML 语法
- `testany_get_pipeline_used_by` - 查询被引用情况

**执行相关 (2)**
- `testany_execute_pipeline` - 执行 pipeline（建议使用 `/tests`）
- `testany_get_pipeline_status` - 获取执行状态（建议使用 `/tests`）

**注意**：执行相关工具虽然属于 pipeline 类别，但建议用户使用 `/tests` skill 进行执行和监控操作。

---

## 常见问题处理

| 场景 | 处理方式 |
|------|---------|
| 用户没有 case 但想创建 pipeline | 建议先使用 `/case` 创建测试用例 |
| 简单顺序执行（无依赖） | 使用 `case_keys` 参数，无需手写 YAML |
| 需要配置 Relay | 1) 先验证源 case 有 `type='output'` 变量，2) 验证目标 case 有 `type='env'` 变量 |
| 删除时报"被引用" | 调用 `testany_get_pipeline_used_by` 查看引用方，建议用户先解除 |
| 更新已有 pipeline | 先 `testany_get_pipeline` + `testany_get_pipeline_yaml` 获取当前配置 |
| 想执行 pipeline | 告知用户使用 `/tests` 命令 |
| 想创建定时计划或门禁 | 告知用户使用 `/orchestrator` 命令 |

---

## 返回格式

任务完成后，向用户汇报：
- Pipeline Key（如 `Y2K-0001A`）
- Pipeline 名称
- 所属工作空间
- 包含的 Case 数量和执行顺序
- Relay 配置摘要（如有）
- 下一步建议（如"可以使用 `/tests` 执行 pipeline"或"可以使用 `/orchestrator` 设置定时计划"）

---

## 查阅官方文档

遇到不确定的问题时，查阅 Testany 官方文档：

1. **获取文档结构**：`WebFetch https://docs.testany.io/sitemap.xml`
2. **找到相关页面**：从 sitemap 中搜索关键词（如 `pipeline`、`relay`、`yaml`）
3. **读取具体页面**：`WebFetch https://docs.testany.io/en/docs/<page-name>/`

**常用文档页面**：
- `/en/docs/managing-pipeline/` - 流水线管理
- `/en/docs/relay-variables-between-cases/` - Relay 配置
- `/en/docs/pipeline-yaml-syntax/` - YAML 语法详解

---

## 参考文档

详细配置规则请参考：
- [Pipeline YAML 语法](./references/pipeline-yaml.md) - 包含 YAML 结构、依赖规则、Relay 约束
- [核心概念](./references/concepts.md) - 包含 Pipeline 定义、执行状态码
