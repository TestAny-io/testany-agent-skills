---
name: case
description: 管理 Testany 测试用例 - 创建、配置、更新、上传脚本（编写脚本请用 /case-writing）
---

# Testany 测试用例管理

管理 Testany 测试用例：创建、配置、更新、上传脚本。

**注意**：如果用户需要**编写**测试脚本（而非上传已有脚本），请告知用户使用 `/case-writing` 命令。

用户输入: $ARGUMENTS

## 职责范围

- 创建测试用例，选择合适的 executor
- 配置环境变量（env/secret/output 类型）
- 设置 relay 输出供 pipeline 使用
- 管理用例可见性（global vs private）
- 上传和更新测试脚本

## 核心知识

### Case 创建三步曲

```
Step 1: testany_create_case
        → 创建基础信息 (name, runtime_uuid, is_private, workspace_keys)
        → 返回 case_key

Step 2: testany_update_case
        → 配置 case_meta.trigger_method (executor, trigger_path/trigger_command)
        → 配置 case_meta.environment_variables

Step 3: testany_update_case_script
        → 上传代码 ZIP 包
```

**前置步骤**（结果可缓存）：
- `testany_filter_case_runtimes` → 获取 runtime UUID（推荐 "cloudprime"）
- `testany_get_my_workspaces` → 获取 workspace keys（私有 case 需要）

### Executor 配置规则

| 脚本类型 | Executor | trigger 字段 | 示例值 |
|---------|----------|-------------|--------|
| Postman | `postman` | `trigger_path` | `"api-tests.postman_collection.json"` |
| Python | `pyres` | `trigger_command` | `["python", "test_api.py"]` |
| Playwright | `playwright` | `trigger_path` | `"tests/e2e/login.spec.js"` |
| Maven | `maven` | `trigger_path` | `"./"` 或具体测试文件路径 |
| Gradle | `gradle` | `trigger_path` | `"./"` 或具体测试文件路径 |

### 环境变量类型

| type | 用途 | 在日志中 |
|------|------|---------|
| `env` | 普通环境变量，可接收 relay | 明文显示 |
| `secret` | 敏感数据（密码、token） | 遮蔽显示 |
| `output` | 输出变量，供其他 case relay | 明文显示 |

### 可见性规则

| 类型 | `is_private` | `workspace_keys` | 可见范围 |
|------|-------------|------------------|----------|
| Global | `false` | `[]` | 全组织可见 |
| Private | `true` | `["WS1", "WS2"]` | 仅指定工作空间 |

## 工作流程

```
1. 理解需求 → 用户想做什么操作？
2. 确定脚本来源：
   ├─ 用户已有脚本 → 继续步骤 3
   └─ 需要编写脚本 → 告知使用 /case-writing 命令
3. 获取 runtime：testany_filter_case_runtimes（推荐 cloudprime）
4. 确认 workspace：testany_get_my_workspaces（私有 case 需要）
5. 执行三步曲：create → update meta → upload script
6. 验证（可选）：testany_dry_run_case 确认配置正确
```

## 常见问题处理

| 场景 | 处理方式 |
|------|---------|
| 用户没提供脚本但想创建 case | 建议使用 `/case-writing` 先编写脚本 |
| 需要 relay 输出 | 1) 配置 `type='output'` 环境变量，2) 代码中 POST 到 `TESTANY_OUTPUT_RELAY_SERVICE` |
| 需要使用凭证 | 1) 绑定凭证到 case，2) 代码中调用 `TESTANY_SECRETS_SERVICE` API |
| 更新已有 case | 先 `testany_get_case` 获取当前配置，保留不变的部分 |

## 返回格式

任务完成后，向用户汇报：
- Case Key（如 `A1B2C3D4`）
- Case 名称
- Executor 类型
- 可见性（Global/Private）
- 下一步建议（如"可以创建 pipeline 来编排执行"）

## 参考文档

详细配置请参考：
- [Executor 配置详解](../testany-guide/references/executors.md)
- [核心概念](../testany-guide/references/concepts.md)
