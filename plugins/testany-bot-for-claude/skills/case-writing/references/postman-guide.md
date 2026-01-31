# Postman 测试脚本指南

Postman 适合简单的 API 测试，无需编程即可快速验证接口。

## 适用场景

- 简单 API 请求验证
- 无需编程经验
- 快速原型测试
- REST API 测试

## ZIP 结构

```
my-test.zip
└── collection.postman_collection.json
```

## Trigger 配置

```json
{
  "executor": "postman",
  "trigger_path": "collection.postman_collection.json"
}
```

## Collection 模板

### 基础结构（v2.1 格式）

```json
{
  "info": {
    "name": "API Tests",
    "_postman_id": "unique-collection-id",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Login API",
      "request": {
        "method": "POST",
        "url": "{{API_BASE_URL}}/api/login",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"username\": \"{{USERNAME}}\", \"password\": \"{{PASSWORD}}\"}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Status code is 200', function () {",
              "    pm.response.to.have.status(200);",
              "});",
              "",
              "pm.test('Response has token', function () {",
              "    const json = pm.response.json();",
              "    pm.expect(json.token).to.be.a('string');",
              "});"
            ],
            "type": "text/javascript"
          }
        }
      ]
    }
  ]
}
```

### 带 Relay 输出的 Collection

```json
{
  "info": {
    "name": "Login with Relay",
    "_postman_id": "relay-collection-id",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Login and Relay Token",
      "request": {
        "method": "POST",
        "url": "{{API_BASE_URL}}/api/login",
        "header": [
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"username\": \"{{USERNAME}}\", \"password\": \"{{PASSWORD}}\"}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Login successful', function () {",
              "    pm.response.to.have.status(200);",
              "});",
              "",
              "// Relay token to downstream case",
              "const response = pm.response.json();",
              "pm.sendRequest({",
              "    url: pm.environment.get('TESTANY_OUTPUT_RELAY_SERVICE'),",
              "    method: 'POST',",
              "    header: {'Content-Type': 'application/json'},",
              "    body: {",
              "        mode: 'raw',",
              "        raw: JSON.stringify({",
              "            ACCESS_TOKEN: response.token,",
              "            USER_ID: response.user_id",
              "        })",
              "    }",
              "});"
            ],
            "type": "text/javascript"
          }
        }
      ]
    }
  ]
}
```

## 环境变量使用

### 在 URL/Body 中使用

```
{{VARIABLE_NAME}}
```

### 在脚本中使用

```javascript
// 获取变量
const apiUrl = pm.environment.get("API_BASE_URL");

// 设置变量（供后续请求使用）
pm.environment.set("TOKEN", response.token);
```

## 常用断言

```javascript
// 状态码
pm.test('Status 200', () => pm.response.to.have.status(200));

// 响应时间
pm.test('Response time < 500ms', () => pm.expect(pm.response.responseTime).to.be.below(500));

// JSON 字段
pm.test('Has token', () => {
    const json = pm.response.json();
    pm.expect(json.token).to.be.a('string');
    pm.expect(json.token).to.not.be.empty;
});

// 数组长度
pm.test('Has items', () => {
    const json = pm.response.json();
    pm.expect(json.items).to.be.an('array').that.is.not.empty;
});
```

## 注意事项

1. **Collection 版本**：使用 v2.1.0 schema
2. **环境变量**：Testany 会自动注入配置的环境变量
3. **Pre-request Script**：可用于获取凭证或设置动态值
4. **Tests 脚本**：用于断言和 Relay 输出
