---
name: case
description: Test case management in Testany Platform - create, organize, and manage test cases with scripts
---

# Testany Test Case Management

## What is a Test Case?

A **Test Case** in Testany is a reusable test script that can be:
- Executed individually or as part of a pipeline
- Organized by workspace, version, and environment
- Shared globally or kept private to specific workspaces

## Case Visibility: Global vs Private

| Type | `is_private` | `workspace_keys` | Visibility |
|------|-------------|------------------|------------|
| **Global** | `false` | `[]` (empty array) | Visible to everyone in the organization |
| **Private** | `true` | `["ws-key-1", "ws-key-2"]` | Visible only in specified workspaces |

### When to Use Each Type

- **Global Cases**: Shared utilities, common test scenarios, organization-wide standards
- **Private Cases**: Team-specific tests, work-in-progress, sensitive test data

## Creating a Test Case

### Prerequisites

1. **Get available runtimes** - Call `testany_filter_case_runtimes` once to get the list
   - Recommended runtime: **cloudprime** (cloud-based execution)
   - Cache the runtime UUID for subsequent case creation

2. **Get workspaces** (for private cases) - Call `testany_get_my_workspaces` to see available workspaces

### Creation Workflow (3 Steps)

创建 case 需要三个步骤：

```
准备: 读取 MCP Resource testany://schema/case 获取完整字段定义
      → 了解 case_meta 结构、environment_variables 格式、trigger_method 配置

Step 1: testany_create_case
        → 创建 case 基本信息 (name, runtime_uuid, is_private, workspace_keys)
        → 返回 case_key

Step 2: testany_update_case
        → 设置 case_meta.trigger_method (executor, trigger_path/trigger_command)
        → 可选：设置 case_meta.environment_variables

Step 3: testany_update_case_script
        → 上传代码 ZIP 包
```

**前置步骤**（可缓存复用）：
```
testany_filter_case_runtimes → 获取 runtime UUID (推荐 "cloudprime")
testany_get_my_workspaces → 获取 workspace keys (私有 case 需要)
```

**重要**：在组装 payload 前，必须先读取 `testany://schema/case` 资源，确保字段名称、类型、格式符合 schema 定义。

### Example: Create a Global Case

```json
{
  "name": "API Health Check",
  "runtime_uuid": "<uuid-from-filter-runtimes>",
  "is_private": false,
  "description": "Checks API endpoint availability",
  "workspace_keys": []
}
```

### Example: Create a Private Case

```json
{
  "name": "Payment Gateway Test",
  "runtime_uuid": "<uuid-from-filter-runtimes>",
  "is_private": true,
  "description": "Tests payment processing flow",
  "workspace_keys": ["ws-finance-team"]
}
```

## Executor Types & Trigger Configuration

Each case has a `case_meta.trigger_method` that defines how to execute the test. The configuration varies by executor type.

### Executor 选择规则（默认值）

根据脚本语言自动选择 executor：

| 脚本语言 | 默认 Executor | 判断依据 |
|---------|--------------|----------|
| Python (.py) | `pyres` | Python 脚本默认使用 pyres |
| Java | `maven` | 有 pom.xml 则使用 maven |
| Java | `gradle` | 有 build.gradle 则使用 gradle |
| Postman | `postman` | .postman_collection.json 文件 |
| Playwright | `playwright` | .spec.js/.spec.ts 文件 |

**注意**：`python` 和 `pyres` 的区别是 pyres 提供更丰富的测试报告能力，推荐使用 `pyres`。

---

### Postman Cases

**Language**: Postman Collection (JSON)

| Field | Required | Description |
|-------|----------|-------------|
| `executor` | Yes | Fixed: `postman` |
| `trigger_path` | Yes | Relative path to collection JSON in the ZIP |

```json
{
  "case_meta": {
    "trigger_method": {
      "executor": "postman",
      "trigger_path": "my-collection.postman_collection.json"
    }
  }
}
```

**ZIP Structure**:
```
my-case.zip
└── my-collection.postman_collection.json
```

---

### Python / PyRes Cases

**Language**: Python
**默认 Executor**: `pyres`（推荐，提供更丰富的测试报告）

| Field | Required | Description |
|-------|----------|-------------|
| `executor` | Yes | `pyres`（推荐）或 `python` |
| `trigger_command` | Yes | Array of command parts, joined with spaces |

```json
{
  "case_meta": {
    "trigger_method": {
      "executor": "pyres",
      "trigger_command": ["python", "test_api.py", "--env", "staging"]
    }
  }
}
```

The above becomes: `python test_api.py --env staging`

**ZIP Structure**:
```
my-case.zip
├── test_api.py
└── utils/
    └── helpers.py
```

**Advanced**: Use `cd` with `;` for nested scripts:
```json
{
  "trigger_command": ["cd", "tests", ";", "python", "run_all.py"]
}
```

---

### Maven / Gradle Cases

**Language**: Java
**Executor 选择**: 有 `pom.xml` → `maven`，有 `build.gradle` → `gradle`

| Field | Required | Description |
|-------|----------|-------------|
| `executor` | Yes | `maven`（默认）或 `gradle` |
| `trigger_path` | Yes | Path to test file or `./` for project root |

```json
{
  "case_meta": {
    "trigger_method": {
      "executor": "maven",
      "trigger_path": "./"
    }
  }
}
```

**For specific test file**:
```json
{
  "case_meta": {
    "trigger_method": {
      "executor": "maven",
      "trigger_path": "src/test/java/com/testany/LoginTest.java"
    }
  }
}
```

**ZIP Structure**:
```
my-case.zip
├── pom.xml (or build.gradle)
└── src/
    └── test/
        └── java/
            └── com/testany/LoginTest.java
```

---

### Playwright Cases

**Language**: JavaScript/TypeScript

| Field | Required | Description |
|-------|----------|-------------|
| `executor` | Yes | Fixed: `playwright` |
| `trigger_path` | Yes | Relative path to spec file |
| `playwright_config_path` | No | Path to playwright.config.js (auto-detected if omitted) |

```json
{
  "case_meta": {
    "trigger_method": {
      "executor": "playwright",
      "trigger_path": "tests/e2e/login.spec.js",
      "playwright_config_path": "playwright.config.js"
    }
  }
}
```

**Required files in ZIP**:
- `package.json`
- `playwright.config.js` (or specified in `playwright_config_path`)

**ZIP Structure**:
```
my-case.zip
├── package.json
├── playwright.config.js
└── tests/
    └── e2e/
        └── login.spec.js
```

**Note**: If `playwright_config_path` is omitted, Testany looks for `playwright.config.js` in the parent directory of `trigger_path`.

---

### Script Operations

| Operation | MCP Tool | Description |
|-----------|----------|-------------|
| View script | `testany_get_case_script` | Downloads and extracts the script content |
| Update script | `testany_update_case_script` | Creates ZIP and uploads new script |

## Managing Cases

### Searching and Filtering

Use `testany_list_cases` with filters:

| Filter | Description | Example |
|--------|-------------|---------|
| `workspace` | Filter by workspace key | `"ws-team-a"` |
| `keyword` | Search in case name | `"login"` |
| `version` | Filter by version | `"v2.0"` |
| `environment` | Filter by environment | `"staging"` |

### Updating Cases

Use `testany_update_case` to modify:
- `name`, `description`
- `is_private`, `workspace_keys` (change visibility)
- `environments`, `case_labels`, `case_version`
- `owned_by` (transfer ownership)

### Bulk Operations

For managing multiple cases at once:
- `testany_bulk_update_cases` - Update version, environments, workspaces for multiple cases
- `testany_bulk_delete_cases` - Delete multiple cases (irreversible)

## Common Workflows

### 1. Create and Configure a New Test

```
testany_filter_case_runtimes → 获取 runtime UUID
testany_create_case → Step 1: 创建 case (name, runtime_uuid, is_private)
testany_update_case → Step 2: 设置 case_meta (executor, trigger_path/trigger_command, environment_variables)
testany_update_case_script → Step 3: 上传代码 ZIP 包
```

### 2. Clone and Modify an Existing Test

```
testany_get_case → 获取源 case 详情 (包含 case_meta)
testany_get_case_script → 获取源 case 脚本
testany_create_case → Step 1: 创建新 case
testany_update_case → Step 2: 复制 case_meta 配置
testany_update_case_script → Step 3: 上传修改后的脚本
```

### 3. Migrate Cases to a New Workspace

```
testany_list_cases → Find cases to migrate
testany_bulk_update_cases → Update workspace_keys for all
```

### 4. Version Bump for Release

```
testany_list_cases → Filter by current version
testany_bulk_update_cases → Update to new version
```

## Best Practices

1. **Naming Convention**: Use descriptive names like `[Module]-[Feature]-[Scenario]`
   - Example: `Auth-Login-ValidCredentials`, `Payment-Checkout-ExpiredCard`

2. **Workspace Organization**: Group related cases in the same workspace
   - By team: `ws-backend-team`, `ws-frontend-team`
   - By product: `ws-product-a`, `ws-product-b`

3. **Version Management**: Use semantic versioning for case versions
   - `v1.0` → Initial release
   - `v1.1` → Bug fixes
   - `v2.0` → Major changes

4. **Environment Tags**: Tag cases with applicable environments
   - `dev`, `staging`, `production`

5. **Script Quality**:
   - Include clear assertions with meaningful error messages
   - Add logging for debugging
   - Handle cleanup in case of failures

## Schema Reference (必读)

**在创建或更新 case 前，必须先读取此 MCP Resource 获取完整的字段定义：**

```
URI: testany://schema/case
Method: resources/read
```

此资源包含组装 payload 所需的全部信息：
- **CaseCreate**: Required fields for creating a case (`name`, `runtime_uuid`, `is_private`)
- **CaseUpdate**: Optional fields for updating (`name`, `description`, `environments`, `case_labels`, etc.)
- **CaseResponse**: Full response structure with all case properties
- **CaseMeta**: Execution configuration (environment variables, trigger method)

### Key Field Definitions

| Field | Type | Format | Description |
|-------|------|--------|-------------|
| `case_key` | string | `^[0-9A-F]{8}$` | 8-character hex identifier |
| `workspace_key` | string | `^[A-Z][A-Z0-9]{2}$` | 3-char workspace ID (e.g., `Y2K`) |
| `runtime_uuid` | string | UUID | Runtime environment identifier |
| `executor_type` | enum | `postman`, `python`, `pyres`, `maven`, `gradle`, `playwright` | Test executor |

### Visibility Rules

| Condition | Result |
|-----------|--------|
| `is_private = false` | Global - visible to entire organization, `workspace_keys` must be `[]` |
| `is_private = true` | Private - visible only in specified workspaces, `workspace_keys` required |

## Related Tools

| Tool | Purpose |
|------|---------|
| `testany_get_my_workspaces` | Get available workspaces |
| `testany_filter_case_runtimes` | Get available runtimes |
| `testany_filter_case_versions` | Get existing versions for filtering |
| `testany_filter_case_environments` | Get existing environments for filtering |
