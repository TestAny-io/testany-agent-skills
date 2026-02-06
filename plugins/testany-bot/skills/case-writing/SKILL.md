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
2. 使用下方模板生成代码
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

---

## PyRes (Python) 模板 - 推荐

### ZIP 结构

```
my-test.zip
├── tests/
│   └── test_api.py
└── requirements.txt (可选)
```

### Trigger 配置

```json
{
  "executor": "pyres",
  "trigger_command": ["python", "-m", "pytest", "tests/", "-v"]
}
```

### 代码模板

```python
import os
import pytest
import requests

# 环境变量
API_BASE_URL = os.getenv("API_BASE_URL")
USERNAME = os.getenv("USERNAME")
PASSWORD = os.getenv("PASSWORD")

def test_login_success():
    """测试用户登录成功"""
    response = requests.post(
        f"{API_BASE_URL}/api/login",
        json={"username": USERNAME, "password": PASSWORD}
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data

def test_login_invalid_credentials():
    """测试无效凭据登录失败"""
    response = requests.post(
        f"{API_BASE_URL}/api/login",
        json={"username": "invalid", "password": "wrong"}
    )
    assert response.status_code == 401
```

### Relay 输出

```python
def relay_output(data: dict):
    """将数据 relay 给 pipeline 中的下游 case"""
    relay_service = os.getenv("TESTANY_OUTPUT_RELAY_SERVICE")
    if relay_service:
        requests.post(relay_service, json=data)

# 使用
relay_output({"ACCESS_TOKEN": token, "USER_ID": user_id})
```

### 凭证获取 (TSS)

```python
def get_secret(key: str, safe_key: str) -> str:
    """从 Testany Secrets Service 获取凭证"""
    tss_url = os.getenv("TESTANY_SECRETS_SERVICE")
    resp = requests.get(tss_url, params={"key": key, "safe_key": safe_key})
    return resp.json()["value"]

# 使用
password = get_secret("api-password", "WKS-CS-0001")
```

---

## Postman 模板

### ZIP 结构

```
my-test.zip
└── api-tests.postman_collection.json
```

### Trigger 配置

```json
{
  "executor": "postman",
  "trigger_path": "api-tests.postman_collection.json"
}
```

### Collection 结构

```json
{
  "info": {
    "name": "API Tests",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "url": "{{API_BASE_URL}}/api/login",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\"username\": \"{{USERNAME}}\", \"password\": \"{{PASSWORD}}\"}"
        }
      },
      "event": [{
        "listen": "test",
        "script": {
          "exec": [
            "pm.test('Status 200', () => pm.response.to.have.status(200));",
            "pm.test('Has token', () => pm.expect(pm.response.json().token).to.exist);"
          ]
        }
      }]
    }
  ]
}
```

### Relay 输出 (Tests 脚本)

```javascript
const data = pm.response.json();
pm.sendRequest({
    url: pm.environment.get('TESTANY_OUTPUT_RELAY_SERVICE'),
    method: 'POST',
    header: {'Content-Type': 'application/json'},
    body: {mode: 'raw', raw: JSON.stringify({ACCESS_TOKEN: data.token})}
});
```

---

## Playwright 模板

### ZIP 结构

```
my-test.zip
├── package.json
├── playwright.config.ts
└── tests/
    └── example.spec.ts
```

### Trigger 配置

```json
{
  "executor": "playwright",
  "trigger_path": "tests/example.spec.ts"
}
```

### package.json

```json
{
  "name": "playwright-tests",
  "version": "1.0.0",
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "axios": "^1.6.0"
  }
}
```

### playwright.config.ts

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.APP_URL,
    headless: true,
  },
});
```

### 代码模板

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully', async ({ page }) => {
    const username = process.env.USERNAME;
    const password = process.env.PASSWORD;

    await page.goto('/login');
    await page.fill('#username', username!);
    await page.fill('#password', password!);
    await page.click('#submit');

    await expect(page).toHaveURL('/dashboard');
  });
});
```

### Relay 输出

```typescript
import axios from 'axios';

const relayService = process.env.TESTANY_OUTPUT_RELAY_SERVICE;
if (relayService) {
  await axios.post(relayService, {ACCESS_TOKEN: token});
}
```

---

## Maven / Gradle 模板

### ZIP 结构 (Maven)

```
my-test.zip
├── pom.xml
└── src/test/java/com/example/
    └── ApiTest.java
```

### Trigger 配置

```json
{"executor": "maven", "trigger_path": "./"}
```

### pom.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>api-tests</artifactId>
    <version>1.0.0</version>
    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.9.0</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>
```

### 代码模板

```java
package com.example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import java.net.http.*;
import java.net.URI;

public class ApiTest {
    private final String baseUrl = System.getenv("API_BASE_URL");

    @Test
    void testLogin() throws Exception {
        String body = String.format(
            "{\"username\":\"%s\",\"password\":\"%s\"}",
            System.getenv("USERNAME"),
            System.getenv("PASSWORD")
        );

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/api/login"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> response = HttpClient.newHttpClient()
            .send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
    }
}
```

---

## 环境变量最佳实践

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

### Java Relay 输出

Maven/Gradle 项目的 Relay 输出代码：

```java
import java.net.http.*;
import java.net.URI;

public void relayOutput(String key, String value) throws Exception {
    String relayService = System.getenv("TESTANY_OUTPUT_RELAY_SERVICE");
    if (relayService != null) {
        String json = String.format("{\"%s\": \"%s\"}", key, value);
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(relayService))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build();
        HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }
}

// 使用
relayOutput("ACCESS_TOKEN", token);
```

### 检查清单

编写带 Relay 的 case 时，确认以下内容：

- [ ] Output Case 的 `environment_variables` 中声明了 `type: output` 的变量
- [ ] 代码中 POST 的 key 与配置的变量名**完全一致**
- [ ] Input Case 的 `environment_variables` 中声明了 `type: env` 的变量
- [ ] Pipeline YAML 中的 `relay.refKey` 格式正确：`{case_key}/{variable_name}`

### 官方文档（兜底）

如果上述内容不足以解决 Output Relay 问题，请查阅：

- [Understanding Output Relay](https://docs.testany.io/en/docs/understanding-output-relay/) - 概念介绍
- [Managing Test Case with Relay Case](https://docs.testany.io/en/docs/managing-test-case-with-relay-case/) - 各语言代码示例

---

## 完成后

脚本编写完成后，告知用户：
1. 已生成的文件列表
2. ZIP 包位置
3. 使用 `/case` 命令可上传到 Testany

---

## 参考文档

### 本地 References

- [测试设计原则](./references/test-design.md) - Test Case vs Assertion、如何从 PRD 设计测试、常见错误模式
- [Case 元数据规范](./references/case-metadata-spec.md) - **必读**：name/labels/description/env_vars 的填写标准，确保 Pipeline 编排顺利

### 官方文档（兜底）

如果本 SKILL.md 的内容不足以解决问题，请查阅 Testany 官方文档：

**综合指南**
- [How to Build a Testany-Compatible Test Case](https://docs.testany.io/en/docs/how-to-build-a-testany-compatible-test-case/) - 框架无关的综合指南

**各 Executor 编写指南**
- [PyRes Best Practice](https://docs.testany.io/en/docs/test-case-writing-guideline-best-practice-pyres/) - PyRes（推荐）
- [Postman Guidelines](https://docs.testany.io/en/docs/test-case-writing-guidelines-and-examples-postman/) - Postman
- [Maven Guidelines](https://docs.testany.io/en/docs/test-case-writing-guidelines-and-examples-maven/) - Maven
- [Gradle Guidelines](https://docs.testany.io/en/docs/test-case-writing-guidelines-and-examples-gradle/) - Gradle
- [Python Unit Test Guidelines](https://docs.testany.io/en/docs/test-case-writing-guidelines-and-examples-python-u/) - Python Unit Test
- [Playwright Test Case](https://docs.testany.io/en/docs/managing-test-case-playwright/) - Playwright
- [Playwright Codegen Best Practice](https://docs.testany.io/en/docs/playwright-codegen-best-practice/) - Playwright Codegen

**凭证与安全**
- [How to Protect Credentials](https://docs.testany.io/en/docs/how-to-protect-the-credentials-used-in-testing/) - TSS 使用指南，各语言代码示例

**Output Relay**
- [Understanding Output Relay](https://docs.testany.io/en/docs/understanding-output-relay/) - 概念介绍
- [Managing Test Case with Relay Case](https://docs.testany.io/en/docs/managing-test-case-with-relay-case/) - 各语言代码示例
