# Relay 输出和凭证获取指南

本文档说明如何在测试脚本中实现 Relay 输出和从 Testany Secrets Service (TSS) 获取凭证。

## Relay 输出

Relay 允许一个测试用例将数据传递给 Pipeline 中的下游用例。

### 工作原理

1. **Output Case**：产生数据的用例，POST 到 `TESTANY_OUTPUT_RELAY_SERVICE`
2. **Input Case**：消费数据的用例，从环境变量获取 relay 过来的值

### 配置步骤

1. 在 Testany 平台配置 Output Case 的环境变量，设置 `type='output'`
2. 在代码中 POST 数据到 `TESTANY_OUTPUT_RELAY_SERVICE`
3. 在 Pipeline YAML 中配置 relay 关系

### 代码示例

#### Python

```python
import os
import requests

def relay_output(data: dict):
    """将数据 relay 给 pipeline 中的下游 case"""
    relay_service = os.getenv("TESTANY_OUTPUT_RELAY_SERVICE")
    if relay_service:
        response = requests.post(relay_service, json=data)
        response.raise_for_status()

# 使用
relay_output({
    "ACCESS_TOKEN": "eyJhbGciOiJIUzI1...",
    "USER_ID": "12345",
    "TIMESTAMP": "2024-01-29T10:30:00Z"
})
```

#### JavaScript (Postman/Playwright)

```javascript
// Postman (Tests 标签)
const response = pm.response.json();
pm.sendRequest({
    url: pm.environment.get('TESTANY_OUTPUT_RELAY_SERVICE'),
    method: 'POST',
    header: {'Content-Type': 'application/json'},
    body: {
        mode: 'raw',
        raw: JSON.stringify({
            ACCESS_TOKEN: response.token,
            USER_ID: response.user_id
        })
    }
});

// Playwright (TypeScript)
import axios from 'axios';

const relayService = process.env.TESTANY_OUTPUT_RELAY_SERVICE;
if (relayService) {
    await axios.post(relayService, {
        ACCESS_TOKEN: token,
        USER_ID: userId
    });
}
```

#### Java

```java
private void relayOutput(String json) throws Exception {
    String relayService = System.getenv("TESTANY_OUTPUT_RELAY_SERVICE");
    if (relayService != null) {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(relayService))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build();
        HttpClient.newHttpClient().send(request,
            HttpResponse.BodyHandlers.ofString());
    }
}

// 使用
relayOutput("{\"ACCESS_TOKEN\":\"xxx\",\"USER_ID\":\"123\"}");
```

### Relay 约束

1. **只能 relay 成功的用例**：失败/中止/超时的用例没有可靠数据
2. **不允许循环依赖**：A→B→A 不允许
3. **不支持性能测试**：仅适用于功能测试

---

## 凭证获取 (TSS)

Testany Secrets Service 提供安全的凭证存储和获取机制。

### 工作原理

1. 管理员在 Testany 平台配置凭证保险箱
2. 将凭证绑定到测试用例
3. 代码中调用 `TESTANY_SECRETS_SERVICE` API 获取凭证值

### API 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `key` | 是 | 凭证的 Key（如 `api-secret`） |
| `safe_key` | 是 | 凭证保险箱标识符（如 `WKS-CS-0001`） |

### 代码示例

#### Python

```python
import os
import requests

def get_secret(key: str, safe_key: str) -> str:
    """从 Testany Secrets Service 获取凭证"""
    tss_url = os.getenv("TESTANY_SECRETS_SERVICE")
    response = requests.get(
        tss_url,
        params={"key": key, "safe_key": safe_key}
    )
    response.raise_for_status()
    return response.json()["value"]

# 使用
api_secret = get_secret("api-secret", "WKS-CS-0001")
db_password = get_secret("db-password", "WKS-CS-0001")
```

#### JavaScript (Postman Pre-request Script)

```javascript
const tssUrl = pm.environment.get("TESTANY_SECRETS_SERVICE");

pm.sendRequest({
    url: `${tssUrl}?key=api-secret&safe_key=WKS-CS-0001`,
    method: 'GET'
}, (error, response) => {
    if (error) {
        throw new Error("Failed to get secret: " + error);
    }
    const secret = response.json().value;
    pm.environment.set("API_SECRET", secret);
});
```

#### Playwright (TypeScript)

```typescript
import { test } from '@playwright/test';

let apiSecret: string;

test.beforeAll(async ({ request }) => {
    const tssUrl = process.env.TESTANY_SECRETS_SERVICE;
    const response = await request.get(`${tssUrl}`, {
        params: {
            key: 'api-secret',
            safe_key: 'WKS-CS-0001'
        }
    });
    const json = await response.json();
    apiSecret = json.value;
});

test('use secret', async ({ page }) => {
    // 使用 apiSecret
});
```

#### Java

```java
public String getSecret(String key, String safeKey) throws Exception {
    String tssUrl = System.getenv("TESTANY_SECRETS_SERVICE");
    String url = String.format("%s?key=%s&safe_key=%s", tssUrl, key, safeKey);

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create(url))
        .GET()
        .build();

    HttpResponse<String> response = HttpClient.newHttpClient()
        .send(request, HttpResponse.BodyHandlers.ofString());

    // 使用 Gson 解析
    JsonObject json = JsonParser.parseString(response.body())
        .getAsJsonObject();
    return json.get("value").getAsString();
}

// 使用
String apiSecret = getSecret("api-secret", "WKS-CS-0001");
```

### 安全注意事项

1. **不要硬编码凭证**：始终使用 TSS 获取
2. **不要打印凭证**：避免在日志中暴露敏感数据
3. **配置 secret 类型**：敏感环境变量使用 `type='secret'`

---

## 组合使用示例

登录获取 token，然后 relay 给下游用例：

```python
import os
import requests

def get_secret(key: str, safe_key: str) -> str:
    tss_url = os.getenv("TESTANY_SECRETS_SERVICE")
    resp = requests.get(tss_url, params={"key": key, "safe_key": safe_key})
    return resp.json()["value"]

def relay_output(data: dict):
    relay_service = os.getenv("TESTANY_OUTPUT_RELAY_SERVICE")
    if relay_service:
        requests.post(relay_service, json=data)

def test_login_and_relay():
    # 从 TSS 获取密码
    password = get_secret("user-password", "WKS-CS-0001")

    # 登录
    response = requests.post(
        f"{os.getenv('API_BASE_URL')}/api/login",
        json={
            "username": os.getenv("USERNAME"),
            "password": password
        }
    )
    assert response.status_code == 200

    # Relay token
    data = response.json()
    relay_output({
        "ACCESS_TOKEN": data["token"],
        "USER_ID": data["user_id"]
    })
```
