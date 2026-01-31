# PyRes (Python) 测试脚本指南

PyRes 是 Testany 推荐的 Python 测试执行器，支持 pytest 框架，内置 50x 网络重试机制。

## 适用场景

- API 测试（REST/GraphQL）
- 数据处理和验证
- 复杂断言逻辑
- 需要编程灵活性的测试

## ZIP 结构

```
my-test.zip
├── tests/
│   └── test_api.py          ← 主测试文件
├── conftest.py              ← pytest fixture（可选）
└── requirements.txt         ← 依赖列表（可选）
```

## Trigger 配置

```json
{
  "executor": "pyres",
  "trigger_command": ["python", "-m", "pytest", "tests/", "-v"]
}
```

**其他常用命令**：
- 单文件：`["python", "-m", "pytest", "tests/test_api.py", "-v"]`
- 带标记：`["python", "-m", "pytest", "-m", "smoke", "-v"]`
- 直接运行：`["python", "test_api.py"]`

## 代码模板

### 基础 API 测试

```python
import os
import requests
import pytest

class TestAPI:
    """API 测试类"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """测试前置 - 从环境变量获取配置"""
        self.base_url = os.getenv("API_BASE_URL")
        self.api_key = os.getenv("API_KEY")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def test_login_success(self):
        """测试登录成功场景"""
        response = requests.post(
            f"{self.base_url}/api/login",
            json={
                "username": os.getenv("USERNAME"),
                "password": os.getenv("PASSWORD")
            },
            headers=self.headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["token"] is not None

    def test_login_invalid_credentials(self):
        """测试登录失败场景"""
        response = requests.post(
            f"{self.base_url}/api/login",
            json={
                "username": "invalid_user",
                "password": "wrong_password"
            },
            headers=self.headers
        )

        assert response.status_code == 401
```

### 带 Relay 输出的测试

```python
import os
import requests
import pytest

class TestLoginWithRelay:
    """登录测试 - 输出 token 供下游 case 使用"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.base_url = os.getenv("API_BASE_URL")

    def test_login_and_relay_token(self):
        """登录并将 token relay 给下游"""
        response = requests.post(
            f"{self.base_url}/api/login",
            json={
                "username": os.getenv("USERNAME"),
                "password": os.getenv("PASSWORD")
            }
        )

        assert response.status_code == 200
        data = response.json()
        token = data["token"]

        # Relay 输出
        self._relay_output({
            "ACCESS_TOKEN": token,
            "USER_ID": data.get("user_id", "")
        })

    def _relay_output(self, data: dict):
        """将数据 relay 给 pipeline 中的下游 case"""
        relay_service = os.getenv("TESTANY_OUTPUT_RELAY_SERVICE")
        if relay_service:
            requests.post(relay_service, json=data)
```

## requirements.txt 示例

```
requests>=2.28.0
pytest>=7.0.0
```

**可选依赖**：
```
pytest-html>=3.2.0      # HTML 报告
pytest-xdist>=3.0.0     # 并行执行
jsonschema>=4.0.0       # JSON Schema 验证
```

## 环境变量使用

在代码中使用 `os.getenv()` 获取环境变量：

```python
import os

# 必需变量（无默认值）
api_url = os.getenv("API_BASE_URL")

# 可选变量（有默认值）
timeout = int(os.getenv("TIMEOUT", "30"))
```

## 注意事项

1. **Python 版本**：Testany 支持 Python 3.12.6
2. **网络重试**：PyRes 内置 50x 网络抖动容错
3. **依赖安装**：requirements.txt 中的依赖会自动安装
4. **测试发现**：pytest 默认发现 `test_*.py` 或 `*_test.py` 文件
