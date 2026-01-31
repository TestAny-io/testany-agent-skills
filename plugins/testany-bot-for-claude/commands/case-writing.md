---
description: 测试用例/脚本编写 (case writing)，根据需求生成测试用例文档和 Testany-compatible 脚本
argument-hint: <需求描述>，如：写一个登录 API 测试、生成 E2E 测试
---

# 测试用例和脚本编写

根据需求生成测试用例文档和 Testany-compatible 测试脚本。

## 使用方式

$ARGUMENTS

## 支持的 Executor

- **PyRes (Python)** - 推荐，适合 API 测试
- **Postman** - 无需编程，快速 API 验证
- **Playwright** - UI/E2E 测试
- **Maven/Gradle** - Java 项目测试

## 示例

```
/case-writing 写一个测试用户登录 API 的 Python 测试
/case-writing 生成 Playwright E2E 测试，测试购物车结算流程
/case-writing 创建 Postman Collection 测试支付接口
/case-writing 写一个 Java 测试，验证订单创建 API
```

## 输出

- 测试用例文档
- Testany-compatible 测试脚本
- 可直接上传的 ZIP 包
