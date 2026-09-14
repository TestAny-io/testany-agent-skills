---
description: Testany platform case 编写，优先消费 approved Test Spec + Testany Automation Handoff，再生成可注册的 case packages
argument-hint: <需求描述>，如：根据 approved test spec 的 handoff 生成 cases、把登录场景拆成 Testany cases
---

# Testany Platform Case 编写

将传统测试场景拆解为 Testany platform cases，并生成可注册的 metadata、脚本和 ZIP 包。

## 使用方式

$ARGUMENTS

读取 `testany-case-writing/SKILL.md` 和 [整体目标交接](../skills/testany-guide/references/task-handoff.md)：仅本地包不访问平台；完整目标已授权时继续注册/编排/执行，不只留下一步建议。

## 核心动作

- **场景拆解**：先判断一个传统测试场景要拆成几个 Testany platform cases
- **case package 生成**：为每个 platform case 生成 metadata、脚本和 ZIP
- **automation design 输出**：明确后续是否需要 `testany-pipeline`
- **上游优先级**：优先读取 approved Test Spec 中的 `Testany Automation Handoff`

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
/case-writing 根据 approved test spec 里的 Testany Automation Handoff 生成可上传到 Testany 的多个 cases
```

## 输出

- platform case inventory
- Testany-compatible 测试脚本
- 实际 ZIP 包及本地归档/入口/metadata/静态语法检查结果；未验证项不能说成可注册就绪
- 面向 `testany-pipeline` 的 decomposition / handoff 摘要
