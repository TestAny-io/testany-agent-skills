# Executor 配置详解

`case_meta` 的后端字段名仍为 `trigger_method`。这里的 `trigger` 指的是 **case 级运行入口配置**，也就是 executor 对应的 path/command；它不等于 `Plan / Manual Trigger / Gatekeeper` 这类 pipeline trigger。

## Executor 选择规则

根据脚本语言/框架自动选择 executor：

| 脚本类型 | 默认 Executor | 判断依据 |
|---------|--------------|----------|
| Python (.py) | `pyres` | Python 脚本默认使用 pyres（推荐） |
| Java | `maven` | 有 `pom.xml` 则使用 maven |
| Java | `gradle` | 有 `build.gradle` 则使用 gradle |
| Postman | `postman` | `.postman_collection.json` 文件 |
| Playwright | `playwright` | `.spec.js` / `.spec.ts` 文件 |

**注意**：`python` 和 `pyres` 的区别是 pyres 提供更丰富的测试报告能力，推荐使用 `pyres`。

---

## Postman

**Executor**: `postman`

| 字段 | 必填 | 说明 |
|------|-----|------|
| `executor` | 是 | 固定值 `postman` |
| `trigger_path` | 是 | Collection JSON 在 ZIP 中的相对路径 |

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

**ZIP 结构**：
```
my-case.zip
└── my-collection.postman_collection.json
```

---

## Python / PyRes

**Executor**: `pyres`（推荐）或 `python`

| 字段 | 必填 | 说明 |
|------|-----|------|
| `executor` | 是 | `pyres`（推荐）或 `python` |
| `trigger_command` | 是 | 命令数组，空格连接执行 |

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

执行命令：`python test_api.py --env staging`

**ZIP 结构**：
```
my-case.zip
├── test_api.py
└── utils/
    └── helpers.py
```

**高级用法** - 嵌套目录执行：
```json
{
  "trigger_command": ["cd", "tests", ";", "python", "run_all.py"]
}
```

---

## Maven

**Executor**: `maven`

| 字段 | 必填 | 说明 |
|------|-----|------|
| `executor` | 是 | 固定值 `maven` |
| `trigger_path` | 是 | 测试文件路径或 `./` 表示项目根目录 |

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

**指定测试文件**：
```json
{
  "trigger_path": "src/test/java/com/testany/LoginTest.java"
}
```

**ZIP 结构**：
```
my-case.zip
├── pom.xml
└── src/
    └── test/
        └── java/
            └── com/testany/LoginTest.java
```

---

## Gradle

**Executor**: `gradle`

配置与 Maven 类似，区别在于项目根目录有 `build.gradle` 而非 `pom.xml`。

```json
{
  "case_meta": {
    "trigger_method": {
      "executor": "gradle",
      "trigger_path": "./"
    }
  }
}
```

---

## Playwright

**Executor**: `playwright`

| 字段 | 必填 | 说明 |
|------|-----|------|
| `executor` | 是 | 固定值 `playwright` |
| `trigger_path` | 是 | spec 文件相对路径 |
| `playwright_config_path` | 否 | 配置文件路径，省略则自动检测 |

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

**必需文件**：
- `package.json`
- `playwright.config.js`（或在 `playwright_config_path` 指定）

**ZIP 结构**：
```
my-case.zip
├── package.json
├── playwright.config.js
└── tests/
    └── e2e/
        └── login.spec.js
```

---

## 环境变量

### 限制

- 每个 case 最多 **16 组** 环境变量
- `name` 必须遵循 **POSIX.1-2017 标准**：仅大写字母、数字、下划线（如 `API_URL`、`MAX_RETRY_COUNT`）
- `name` 在同一 case 内必须唯一（不区分 type）
- 每条变量按 `type` 决定填 `value` 还是 `secret_ref`（见下表）

### 类型

| type | 用途 | 如何填 |
|------|------|-------|
| `env`（默认） | 普通环境变量、relay 输入 | 填 `value`（必填、非空） |
| `output` | 输出变量，供 pipeline 中其他 case relay 消费 | 填 `value`（运行时由脚本写入，初始可用 `"-"` 占位） |
| `secrets` | 引用 workspace 的 Credential Safe 条目 | 填 `secret_ref`（**禁止**填 `value`）；脚本里直接读同名环境变量即可 |

**`secret_ref` 结构**：`{ workspace_key, credential_safe_key, credential_key }`，三个字段都必填。

**`secrets` 行的只读字段**：读回 case 时每条 `secrets` 行附带 `status`（`valid` / `blocked` / `invalid`）和 `status_reasons[]`；非 `valid` 要向用户说明原因（常见：`owner_access_not_satisfied`、`visibility_not_satisfied`、`target_not_found_or_unresolvable`、`secret_ref_malformed`）。写入时不要传这两个字段。

#### 查询 `credential_safe_key` / `credential_key`

如果用户没有现成的 safe_key / credential_key，按顺序用两个 MCP 工具解析：

1. **`testany_list_credential_safes`**（入参 `workspace_key` + `runtime_uuid`）→ 返回该 workspace 可见的 Credential Safes
2. 从返回列表中取目标 safe 的 `key` 字段作为 `credential_safe_key`
3. **`testany_list_credential_keys`**（入参 `credential_safe_key` + `runtime_uuid`）→ 返回该 safe 下的所有 credential
4. 取目标 credential 的 `key` 字段（**不是 `name`**）作为 `credential_key`

**关键约束**：

- 两个工具都需要 `runtime_uuid`，且**必须与 case 的 `runtime_uuid` 一致**——TSSM 是按 runtime 部署的，不同 runtime 看到的 safe 列表不同
- 两个工具都**不直接返回列表**，返回的是 `{sign, url, curlCommand}`（MCP 与 TSSM 运行在不同集群）。请求数据不能直接运行：优先用可核对的 URL/headers 构造 HTTPS GET；只有 curl 文本时先按允许列表解析，拒绝额外命令、文件输出、代理、TLS 放宽和重定向。
- 精确 TSSM 主机、端点及签名格式须由当前 runtime/工具契约核对，不仅靠字符串自己的域名。缺少安全解析或契约依据时报告列表未取得，不能回退 `eval`/`sh -c`。debug 的日志 helper 限定日志路径，不能直接拿它调用 TSSM 或擅自扩其白名单。只查询 safe/key 元数据，不读取凭证明文；签名及认证值不进入摘要。
- `secret_ref.credential_safe_key` / `credential_key` 必须填**返回中的 `key`**，不要用 `name`（`name` 仅是展示名，可重复）

**返回字段速查**：

| 工具 | 返回每项的关键字段 |
|------|--------------------|
| `testany_list_credential_safes` | `key`（给 `credential_safe_key` 用）、`name`、`type`（底层 KMS，如 `azure-key-vault`）、`workspace` |
| `testany_list_credential_keys` | `key`（给 `credential_key` 用）、`name`、`safe_key`、`type`、`env`、`description`、`expire_date`、`labels` |

**故障处理**：

- curl 返回 HTTP 401 且 body 为空 → 签名时序/缓存问题。重新调用同一个 MCP 工具拿新签名再试，通常立刻成功
- curl TLS 握手失败（exit 35、connection reset）→ 当前环境到该 runtime 的 TSSM 网关不可达；若用户允许切换 runtime，换一个 trusted runtime 再试，否则如实报告

**端到端示例**：

```
# 1) 列 workspace 下的 safe
testany_list_credential_safes(workspace_key="MCP", runtime_uuid="81c91231-...")
  → 安全解析签名 GET，核对 runtime 端点后读取 → [{"key":"MCP-CS-0B89", "name":"BOYI-Azure-Keyvault", "type":"azure-key-vault", ...}]

# 2) 列 safe 内的 credential
testany_list_credential_keys(credential_safe_key="MCP-CS-0B89", runtime_uuid="81c91231-...")
  → 同一安全读取流程 → [{"key":"boyi-github-token", "name":"my-secret", ...}, ...]

# 3) 填入 case_meta.environment_variables 的 secret_ref
{
  "name": "GITHUB_TOKEN",
  "type": "secrets",
  "secret_ref": {
    "workspace_key": "MCP",
    "credential_safe_key": "MCP-CS-0B89",
    "credential_key": "boyi-github-token"
  },
  "description": "GitHub API 访问凭证"
}
```

### 配置示例

```json
{
  "case_meta": {
    "environment_variables": [
      { "name": "API_URL", "type": "env", "value": "https://api.example.com" },
      {
        "name": "API_KEY",
        "type": "secrets",
        "secret_ref": {
          "workspace_key": "WKS",
          "credential_safe_key": "WKS-CS-0001",
          "credential_key": "prod-api-key"
        }
      },
      { "name": "TOKEN", "type": "output", "value": "-" }
    ]
  }
}
```
