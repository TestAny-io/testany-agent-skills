---
name: case-writing
description: 测试用例和脚本编写助手 - 根据需求生成测试用例文档和 Testany-compatible 测试脚本
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

## 完成后

脚本编写完成后，告知用户：
1. 已生成的文件列表
2. ZIP 包位置
3. 使用 `/case` 命令可上传到 Testany
