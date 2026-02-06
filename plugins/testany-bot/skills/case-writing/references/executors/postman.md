# Postman 模板

Postman 执行器适合不想写代码的用户，直接使用 Postman Collection。

## ZIP 结构

```
my-test.zip
└── api-tests.postman_collection.json
```

## Trigger 配置

```json
{
  "executor": "postman",
  "trigger_path": "api-tests.postman_collection.json"
}
```

## Collection 结构

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

## Relay 输出 (Tests 脚本)

在 Postman Tests 脚本中发送 relay 数据：

```javascript
const data = pm.response.json();
pm.sendRequest({
    url: pm.environment.get('TESTANY_OUTPUT_RELAY_SERVICE'),
    method: 'POST',
    header: {'Content-Type': 'application/json'},
    body: {mode: 'raw', raw: JSON.stringify({ACCESS_TOKEN: data.token})}
});
```

## 官方文档

- [Postman Guidelines](https://docs.testany.io/en/docs/test-case-writing-guidelines-and-examples-postman/)
