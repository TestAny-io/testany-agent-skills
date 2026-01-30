---
name: pipeline
description: Pipeline management in Testany - orchestrate test execution workflows with dependencies and variable relay
---

# Testany Pipeline Management

## What is a Pipeline?

A **Pipeline** in Testany is an orchestration unit that:
- Groups multiple test cases for sequential or parallel execution
- Defines execution dependencies (whenPassed/whenFailed)
- Supports variable relay between cases
- Provides a single trigger point for complex test workflows

## Schema Reference (必读)

**在创建或更新 pipeline 前，必须先读取此 MCP Resource：**

```
URI: testany://schema/pipeline
Method: resources/read
```

---

## Pipeline YAML Structure

Pipeline 使用 YAML 格式定义执行规则：

```yaml
kind: rule/v1.2
spec:
  rules:
    - run: '04E41DDE'           # First case (no dependency)
    - run: 'FAFC249A'
      whenPassed: '04E41DDE'    # Run only if 04E41DDE passes
      relay:
        - key: API_URL          # Variable to set in this case
          refKey: 04E41DDE/BASE_URL  # Source: case/variable
          nonSecret: true
```

### Rule Fields

| Field | Required | Description |
|-------|----------|-------------|
| `run` | Yes | Case key (8-char hex, e.g., `04E41DDE`) |
| `whenPassed` | No | Prerequisite case that must PASS |
| `whenFailed` | No | Prerequisite case that must FAIL |
| `expect` | No | Set to `fail` to invert result |
| `relay` | No | Variables to relay from other cases |

### Dependency Rules

1. **Mutual Exclusion**: `whenPassed` 和 `whenFailed` 不能同时出现
2. **DAG Constraint**: 引用的 case 必须在 rules 数组中**之前**定义
3. **Single Prerequisite**: 每个 rule 只能依赖一个 case

---

## Variable Relay (变量传递)

Relay 允许将一个 case 的输出变量传递给另一个 case。

### Relay Fields

| Field | Required | Description |
|-------|----------|-------------|
| `key` | Yes | 目标变量名（接收 case 中的变量） |
| `refKey` | Yes | 源引用：`{case_key}/{variable_name}` |
| `nonSecret` | No | `true` 时值在日志中明文显示 |

### Relay Constraints (重要)

配置 relay 时，**必须先查询 case 定义**来验证环境变量：

```
验证流程:
1. testany_get_case 获取 run 对应的 case
   → 检查 case_meta.environment_variables
   → relay.key 必须存在且 type='env'

2. testany_get_case 获取 refKey 中的 case
   → 检查 case_meta.environment_variables
   → refKey 中的变量必须存在且 type='output'
```

| Constraint | Requirement |
|------------|-------------|
| `relay.key` | 必须在 **run** case 中定义，`type='env'` |
| `relay.refKey` | 变量必须在 **源** case 中定义，`type='output'` |

### Relay Example

**Case A (04E41DDE)** 的 environment_variables:
```json
[{ "name": "TOKEN", "type": "output", "value": "" }]
```

**Case B (FAFC249A)** 的 environment_variables:
```json
[{ "name": "AUTH_TOKEN", "type": "env", "value": "" }]
```

**Pipeline YAML**:
```yaml
spec:
  rules:
    - run: '04E41DDE'
    - run: 'FAFC249A'
      whenPassed: '04E41DDE'
      relay:
        - key: AUTH_TOKEN        # ✓ FAFC249A 中 type='env'
          refKey: 04E41DDE/TOKEN # ✓ 04E41DDE 中 type='output'
```

---

## Pipeline Structure (概念视图)

```
Pipeline: E2E Checkout Flow
├── Case 1: Login Test
├── Case 2: Cart Operations (whenPassed: Case 1, relay: TOKEN)
├── Case 3: Payment Processing (whenPassed: Case 2)
└── Case 4: Order Confirmation (whenPassed: Case 3)
```

## Pipeline Operations

### Listing Pipelines

Use `testany_list_pipelines` with filters:

| Filter | Description |
|--------|-------------|
| `workspace` | Filter by workspace key |
| `keyword` | Search in pipeline name |
| `version` | Filter by version |
| `environment` | Filter by environment |

### Getting Pipeline Details

Use `testany_get_pipeline` to retrieve:
- Pipeline metadata (name, description, version)
- Included test cases
- Default parameters
- Execution history summary

## Executing Pipelines

### Basic Execution

Use `testany_execute_pipeline`:

```json
{
  "pipeline_key": "pl-checkout-flow",
  "environment": "staging"
}
```

### Execution with Parameters

Override default parameters at runtime:

```json
{
  "pipeline_key": "pl-checkout-flow",
  "environment": "staging",
  "parameters": {
    "browser": "chrome",
    "timeout": "30000",
    "baseUrl": "https://staging.example.com"
  }
}
```

### Execution Response

Returns an execution ID for tracking:
```json
{
  "execution_id": "exec-12345",
  "status": "PENDING",
  "pipeline_key": "pl-checkout-flow"
}
```

## Managing Pipelines

### Creating Pipelines

Use `testany_create_pipeline`:

```json
{
  "name": "API Integration Suite",
  "workspace_keys": ["ws-backend-team"],
  "is_private": true,
  "description": "Full API integration test suite",
  "case_keys": ["case-auth", "case-users", "case-orders"]
}
```

### Updating Pipelines

Use `testany_update_pipeline` to modify:
- Add/remove test cases
- Change execution order
- Update default parameters
- Modify visibility (global/private)

### Deleting Pipelines

Use `testany_delete_pipeline`:
- Removes pipeline definition only
- Does not delete associated test cases
- Historical executions remain accessible

## Pipeline Visibility

Same as cases:

| Type | `is_private` | Visibility |
|------|-------------|------------|
| **Global** | `false` | Organization-wide |
| **Private** | `true` | Specified workspaces only |

## Common Workflows

### 1. Create Pipeline with Relay (完整流程)

```
Step 1: 读取 schema
        → resources/read testany://schema/pipeline

Step 2: 查询相关 case 的定义
        → testany_get_case 获取每个 case
        → 检查 environment_variables 的 type 字段
        → 确认 relay.key 是 type='env'
        → 确认 relay.refKey 是 type='output'

Step 3: 创建 pipeline
        → testany_create_pipeline 或 testany_update_pipeline
```

### 2. Create a Test Suite Pipeline

```
testany_list_cases → Find relevant cases
testany_create_pipeline → Create pipeline with case list
testany_execute_pipeline → Run initial test
```

### 3. Add Cases to Existing Pipeline

```
testany_get_pipeline → Get current case list
testany_update_pipeline → Add new case keys
```

### 4. Run Regression Suite

```
testany_list_pipelines → Find regression pipeline
testany_execute_pipeline → Execute with production params
testany_get_execution → Monitor progress
```

### 5. Clone Pipeline for New Environment

```
testany_get_pipeline → Get source pipeline
testany_create_pipeline → Create new with modified params
```

## Best Practices

1. **Pipeline Organization**:
   - **Smoke Tests**: Quick validation, 5-10 key cases
   - **Regression**: Comprehensive, all feature areas
   - **Integration**: Cross-service communication tests
   - **Performance**: Load and stress tests

2. **Case Ordering**:
   - Place setup/prerequisite cases first
   - Group related cases together
   - Place cleanup cases at the end

3. **Parameter Management**:
   - Define sensible defaults
   - Document required parameters
   - Use environment-specific values

4. **Naming Convention**:
   - `smoke-[area]`: Quick validation
   - `regression-[module]`: Full regression
   - `e2e-[flow]`: End-to-end scenarios

## Pipeline vs Individual Case Execution

| Aspect | Pipeline | Individual Case |
|--------|----------|-----------------|
| Use case | Suite execution | Single test debug |
| Reporting | Aggregated results | Single result |
| Parameters | Shared across cases | Case-specific |
| Trigger | One action | Per case |

## Related Tools

| Tool | Purpose |
|------|---------|
| `testany_list_pipelines` | Search and filter pipelines |
| `testany_get_pipeline` | Get pipeline details |
| `testany_create_pipeline` | Create new pipeline |
| `testany_update_pipeline` | Modify pipeline |
| `testany_delete_pipeline` | Remove pipeline |
| `testany_execute_pipeline` | Run pipeline |
| `testany_get_execution` | Check execution status |
| `testany_get_case` | 获取 case 定义，验证 relay 约束 |

## Related Resources

| URI | Description |
|-----|-------------|
| `testany://schema/pipeline` | Pipeline YAML 完整 schema 定义 |
| `testany://schema/case` | Case schema，含 environment_variables 定义 |
