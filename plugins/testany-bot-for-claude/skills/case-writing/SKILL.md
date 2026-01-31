---
name: case-writing
description: 测试用例和脚本编写助手 - 根据需求生成测试用例文档和 Testany-compatible 测试脚本
argument-hint: <需求描述>，如：写一个登录 API 测试、生成 Playwright E2E 测试
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

使用 AskUserQuestion 工具收集以下信息：

1. **测试目标**
   - API 测试（REST/GraphQL）
   - UI/E2E 测试（浏览器自动化）
   - 其他

2. **技术栈偏好**（如用户未指定）
   - Python (PyRes) - 推荐，适合 API 测试
   - Postman - 无需编程，适合简单 API 验证
   - Playwright - 适合 UI/E2E 测试
   - Java (Maven/Gradle) - 适合企业级应用

3. **环境变量需求**
   - 需要哪些配置项（如 API_URL, API_KEY）
   - 是否有敏感数据（使用 secret 类型）

4. **Relay 需求**
   - 是否需要将输出传递给下游 case
   - 如需要，输出哪些变量

### Phase 2: 生成测试用例文档

根据收集的需求，生成结构化的测试用例文档：

```markdown
## 测试用例：[用例名称]

### 测试目标
[简述测试目的]

### 前置条件
- [条件1]
- [条件2]

### 测试步骤
1. [步骤1]
2. [步骤2]

### 预期结果
- [预期1]
- [预期2]

### 环境变量
| 变量名 | 类型 | 说明 |
|--------|------|------|
| API_URL | env | API 基础地址 |
```

### Phase 3: 生成测试脚本

根据选择的 Executor，参考对应的模板生成代码：

- [PyRes (Python) 指南](references/pyres-guide.md)
- [Postman 指南](references/postman-guide.md)
- [Playwright 指南](references/playwright-guide.md)
- [Maven/Gradle 指南](references/java-guide.md)
- [Relay 和凭证代码](references/relay-and-secrets.md)

**操作步骤**：
1. 创建临时目录：`/tmp/testany-case-{timestamp}/`
2. 使用 Write 工具创建所需文件
3. 使用 Bash 工具打包：`cd /tmp/testany-case-xxx && zip -r case.zip .`

### Phase 4: 交付

询问用户下一步操作：

1. **上传到 Testany**
   - 告知用户使用 `/case` 命令上传 ZIP
   - 提供推荐的 executor 和 trigger 配置

2. **仅保留本地文件**
   - 告知文件路径
   - 提供后续手动上传的指引

## Executor 选择指南

```
用户需求
    │
    ├─ API 测试
    │   ├─ 简单请求/无需编程 → Postman
    │   └─ 复杂逻辑/数据处理 → PyRes（推荐）
    │
    ├─ UI/E2E 测试
    │   └─ 浏览器自动化 → Playwright
    │
    ├─ Java 项目
    │   ├─ 使用 Maven → Maven
    │   └─ 使用 Gradle → Gradle
    │
    └─ 不确定 → 默认推荐 PyRes
```

## 注意事项

1. **始终使用 AskUserQuestion**：不要假设用户需求，主动询问以确保准确性
2. **环境变量命名**：使用大写字母和下划线（如 `API_BASE_URL`）
3. **Relay 变量**：需要在 Testany 平台配置为 `output` 类型
4. **ZIP 结构**：确保文件路径与 trigger 配置匹配

## 参考文档

详细的模板和代码示例请参考 references/ 目录下的文档。
