---
name: case-writing
description: 测试用例和脚本编写助手 - 根据需求生成测试用例文档和 Testany-compatible 测试脚本
argument-hint: "[需求描述]，如：根据 PRD 生成登录测试、写一个 API 测试脚本"
---

# 测试用例和脚本编写助手

根据用户需求生成测试用例文档和 Testany-compatible 测试脚本。

用户输入: $ARGUMENTS

## 职责

- 根据用户需求生成测试用例文档
- 根据测试用例生成 Testany-compatible 测试脚本
- 帮助用户选择合适的 Executor
- 创建可直接上传到 Testany 的 ZIP 包

## 工作流程

### Phase 1: 需求收集

询问用户：
1. **测试目标**：API 测试 / UI 测试 / 性能测试？
2. **技术栈偏好**：Python / JavaScript / Java？
3. **环境变量**：需要哪些配置？
4. **Relay 需求**：是否需要传递数据给下游用例？

### Phase 2: 生成测试用例文档

包含：
- 测试场景描述
- 前置条件
- 测试步骤
- 预期结果

### Phase 3: 生成测试脚本

根据选择的 Executor 生成代码：
1. 创建符合 ZIP 结构要求的文件
2. 参考对应 Executor 模板生成代码
3. 打包为 ZIP

### Phase 4: 交付

询问用户是否要上传到 Testany：
- **是** → 告知使用 `/case` 命令上传
- **否** → 仅保留本地文件

---

## Executor 选择决策树

```
用户需求
    ├─ API 测试
    │   ├─ 熟悉 Python → PyRes ✓
    │   └─ 不想写代码 → Postman
    ├─ UI/E2E 测试 → Playwright
    └─ Java 项目 → Maven 或 Gradle
```

根据选择的 Executor，参考对应模板：

| Executor | 模板文件 | 适用场景 |
|----------|---------|---------|
| PyRes | [pyres.md](./references/executors/pyres.md) | Python API 测试（推荐） |
| Postman | [postman.md](./references/executors/postman.md) | 无代码 API 测试 |
| Playwright | [playwright.md](./references/executors/playwright.md) | UI/E2E 测试 |
| Maven/Gradle | [maven.md](./references/executors/maven.md) | Java 项目测试 |

---

## 环境变量类型

| 类型 | 用途 | 示例 |
|------|------|------|
| `env` | 普通配置 | `API_BASE_URL`, `TIMEOUT` |
| `secret` | 敏感数据 | `PASSWORD`, `API_KEY` |
| `output` | Relay 输出 | `ACCESS_TOKEN`, `USER_ID` |

---

## Output Relay 完整指南

Output Relay 用于在 Pipeline 中将一个 case 的输出传递给下游 case。**必须同时完成配置和代码两部分**，否则 relay 不会生效。

### 端到端流程

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Output Case 配置                                              │
│    environment_variables:                                        │
│      - name: ACCESS_TOKEN    ←── 变量名                          │
│        type: output          ←── 必须是 output                   │
│        value: ""                                                 │
├─────────────────────────────────────────────────────────────────┤
│ 2. Output Case 代码                                              │
│    requests.post(relay_service, json={                          │
│        "ACCESS_TOKEN": token  ←── key 必须与配置的变量名一致      │
│    })                                                            │
├─────────────────────────────────────────────────────────────────┤
│ 3. Pipeline YAML                                                 │
│    - run: 'INPUT_CASE'                                          │
│      relay:                                                      │
│        - key: AUTH_TOKEN      ←── Input Case 中的变量名          │
│          refKey: OUTPUT_CASE/ACCESS_TOKEN  ←── Output Case 的输出│
├─────────────────────────────────────────────────────────────────┤
│ 4. Input Case 配置                                               │
│    environment_variables:                                        │
│      - name: AUTH_TOKEN      ←── 与 relay.key 一致               │
│        type: env             ←── 必须是 env                      │
│        value: ""                                                 │
├─────────────────────────────────────────────────────────────────┤
│ 5. Input Case 代码                                               │
│    token = os.getenv("AUTH_TOKEN")  ←── 直接读取环境变量          │
└─────────────────────────────────────────────────────────────────┘
```

### 关键约束

| 约束 | 说明 |
|------|------|
| **变量名必须一致** | 代码中 POST 的 key 必须与 case 配置的 `environment_variables.name` 完全一致 |
| **type 必须正确** | Output Case 用 `type: output`，Input Case 用 `type: env` |
| **只有 passed 才 relay** | 如果 Output Case 失败，relay 数据不可用 |
| **必须预先声明** | Output 变量必须在 case 配置中声明，否则 relay 不生效 |

### 常见错误

```python
# ❌ 错误：代码中的 key 与配置不一致
# 配置：name: ACCESS_TOKEN
# 代码：
relay_output({"TOKEN": token})  # 应该是 ACCESS_TOKEN

# ✅ 正确：
relay_output({"ACCESS_TOKEN": token})
```

```python
# ❌ 错误：只写了代码，没有在 case 配置中声明 output 变量
requests.post(relay_service, json={"ACCESS_TOKEN": token})
# 但 case 的 environment_variables 里没有 type=output 的 ACCESS_TOKEN

# ✅ 正确：必须同时配置
# case 配置：
#   environment_variables:
#     - name: ACCESS_TOKEN
#       type: output
#       value: ""
# 代码：
requests.post(relay_service, json={"ACCESS_TOKEN": token})
```

### 检查清单

编写带 Relay 的 case 时，确认以下内容：

- [ ] Output Case 的 `environment_variables` 中声明了 `type: output` 的变量
- [ ] 代码中 POST 的 key 与配置的变量名**完全一致**
- [ ] Input Case 的 `environment_variables` 中声明了 `type: env` 的变量
- [ ] Pipeline YAML 中的 `relay.refKey` 格式正确：`{case_key}/{variable_name}`

---

## 完成后

脚本编写完成后，告知用户：
1. 已生成的文件列表
2. ZIP 包位置
3. 使用 `/case` 命令可上传到 Testany

---

## 参考文档

### 本地 References

**Executor 模板**
- [PyRes (Python)](./references/executors/pyres.md) - 推荐
- [Postman](./references/executors/postman.md)
- [Playwright](./references/executors/playwright.md)
- [Maven/Gradle](./references/executors/maven.md)

**设计规范**
- [测试设计原则](./references/test-design.md) - Test Case vs Assertion、如何从 PRD 设计测试
- [Case 元数据规范](./references/case-metadata-spec.md) - **必读**：name/labels/description/env_vars 的填写标准

### 官方文档（兜底）

如果本地 references 不足以解决问题，请查阅 Testany 官方文档：

**综合指南**
- [How to Build a Testany-Compatible Test Case](https://docs.testany.io/en/docs/how-to-build-a-testany-compatible-test-case/)

**凭证与安全**
- [How to Protect Credentials](https://docs.testany.io/en/docs/how-to-protect-the-credentials-used-in-testing/) - TSS 使用指南

**Output Relay**
- [Understanding Output Relay](https://docs.testany.io/en/docs/understanding-output-relay/)
- [Managing Test Case with Relay Case](https://docs.testany.io/en/docs/managing-test-case-with-relay-case/)
