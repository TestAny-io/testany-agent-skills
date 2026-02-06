# PyRes (Python) 模板 - 推荐

PyRes 是 Testany 推荐的 Python 测试执行器，基于 pytest。

## ZIP 结构

```
my-test.zip
├── tests/
│   └── test_api.py
└── requirements.txt (可选)
```

## Trigger 配置

```json
{
  "executor": "pyres",
  "trigger_command": ["python", "-m", "pytest", "tests/", "-v"]
}
```

## 代码模板

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

## Relay 输出

```python
def relay_output(data: dict):
    """将数据 relay 给 pipeline 中的下游 case"""
    relay_service = os.getenv("TESTANY_OUTPUT_RELAY_SERVICE")
    if relay_service:
        requests.post(relay_service, json=data)

# 使用
relay_output({"ACCESS_TOKEN": token, "USER_ID": user_id})
```

## 凭证获取 (TSS)

```python
def get_secret(key: str, safe_key: str) -> str:
    """从 Testany Secrets Service 获取凭证"""
    tss_url = os.getenv("TESTANY_SECRETS_SERVICE")
    resp = requests.get(tss_url, params={"key": key, "safe_key": safe_key})
    return resp.json()["value"]

# 使用
password = get_secret("api-password", "WKS-CS-0001")
```

## 官方文档

- [PyRes Best Practice](https://docs.testany.io/en/docs/test-case-writing-guideline-best-practice-pyres/)
