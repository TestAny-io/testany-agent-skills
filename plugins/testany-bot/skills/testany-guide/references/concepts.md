# Testany 核心概念

## 实体定义

### Case（测试用例）

**定义**：可复用的测试脚本单元

**属性**：
- `case_key`: 8 位大写十六进制标识符（如 `A1B2C3D4`）
- `name`: 用例名称
- `runtime_uuid`: 执行环境 UUID（推荐 cloudprime）
- `case_meta`: 执行配置（trigger_method, environment_variables）
- `is_private`: 可见性控制
- `workspace_keys`: 私有 case 可见的工作空间列表

### Pipeline（流水线）

**定义**：编排多个 case 的执行单元

**属性**：
- `pipeline_key`: 格式为 `{WS_KEY}-{4-5位大写十六进制}`（如 `Y2K-0601`、`Y2K-0001A`）
- `name`: 流水线名称
- `definition`: YAML 格式的执行规则定义（Pipeline YAML）
- `case_keys`: Case keys 列表（可替代 `definition`）
- 支持依赖关系（whenPassed/whenFailed）和变量传递（relay）

### Execution（执行）

**定义**：一次测试运行的实例

**属性**：
- `execution_id`: 格式为 `{pipeline_key}-{5位大写十六进制}`（如 `Y2K-0601-0000A`）
- `status`: NOT_STARTED(-1), RUNNING(0), SUCCESS(1), FAILURE(2), SKIPPED(3), FAIL_AS_EXPECTED(4), CANCELLED(5), ERROR(99)

### Plan（定时计划）

**定义**：自动化调度的执行计划

**属性**：
- 关联 pipeline
- Cron 表达式定义执行周期
- 可启用/禁用

### Gatekeeper（质量门禁）

**定义**：CI/CD 集成的质量控制点

**属性**：
- 关联 pipeline
- 通过率阈值（100% = 全部通过才放行）
- Webhook URL 接收结果

### Workspace（工作空间）

**定义**：资源隔离和权限控制单元

**属性**：
- `workspace_key`: 3 位大写字母数字（如 `Y2K`）
- 角色：Owner > Admin > Member > Viewer

---

## 可见性规则

### Case / Pipeline 可见性

| 类型 | `is_private` | `workspace_keys` | 可见范围 |
|------|-------------|------------------|----------|
| **Global** | `false` | `[]`（空数组） | 全组织可见 |
| **Private** | `true` | `["WS1", "WS2"]` | 仅指定工作空间可见 |

### 使用建议

- **Global**：共享工具类测试、组织级标准用例
- **Private**：团队专属测试、开发中的用例、含敏感数据的测试

---

## 工作空间角色权限

| 角色 | 权限范围 |
|------|---------|
| **Owner** | 完全控制，包括删除工作空间、管理成员 |
| **Admin** | 管理资源，创建/编辑/删除 case、pipeline、plan |
| **Member** | 执行测试、查看结果、有限编辑 |
| **Viewer** | 只读访问 |

---

## 执行状态码

| 状态 | 值 | 含义 | 是否终态 |
|------|-----|------|---------|
| NOT_STARTED | -1 | 未开始/排队中 | 否 |
| RUNNING | 0 | 执行中 | 否 |
| SUCCESS | 1 | 全部通过 | 是 |
| FAILURE | 2 | 有失败 | 是 |
| SKIPPED | 3 | 跳过（仅 Case） | 是 |
| FAIL_AS_EXPECTED | 4 | 预期失败（仅 Case） | 是 |
| CANCELLED | 5 | 已取消 | 是 |
| ERROR | 99 | 系统错误 | 是 |
