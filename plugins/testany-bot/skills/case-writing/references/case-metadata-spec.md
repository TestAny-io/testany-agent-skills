# Case 元数据规范

本规范定义了 Testany Test Case 元数据的填写标准。遵循此规范可以让后续的 Pipeline 编排（无论是人还是 AI）更加高效准确。

---

## 为什么需要这个规范

Pipeline 编排需要完成三个任务：

| 任务 | 需要的信息 |
|------|-----------|
| **选择 cases** | 这个 case 测试什么功能/场景？关联哪个需求？ |
| **确定顺序** | 这个 case 依赖什么前置条件？ |
| **配置 Relay** | 这个 case 需要什么输入？产生什么输出？ |

如果 case 元数据不完整或不规范，编排者需要猜测或阅读脚本代码，增加工作量和出错概率。

---

## 字段映射规范

### name（名称）

**用途**：简洁描述测试场景

**格式**：`[动作] [对象] [可选：条件/结果]`

**示例**：
```
✅ 订阅 Gallery Item 并验证资源创建
✅ 登录成功并获取 Token
✅ 编辑订阅资源被拒绝（只读约束）

❌ test_001
❌ 测试
❌ US-G006
```

---

### case_labels（标签）

**用途**：结构化分类，支持精确筛选

**必须包含**：
1. **User Story 编号**（如有关联需求）
2. **功能模块**
3. **测试类型**（可选）

**格式**：
```json
["US-G006", "subscription", "gallery", "smoke"]
```

| 位置 | 内容 | 示例 |
|------|------|------|
| 第 1 个 | User Story 编号 | `US-G006`, `US-G007` |
| 第 2-N 个 | 功能模块 | `subscription`, `gallery`, `login`, `payment` |
| 最后 | 测试类型（可选） | `smoke`, `regression`, `e2e` |

**示例**：
```json
✅ ["US-G006", "subscription", "gallery"]
✅ ["US-G001", "gallery", "browse", "smoke"]
✅ ["login", "auth", "regression"]  // 无关联 US 时省略

❌ ["test"]
❌ []
```

---

### description（描述）

**用途**：自然语言描述，包含测试场景和前置条件

**必须包含**：
1. **测试场景**：测试什么、验证什么
2. **前置条件**：依赖什么状态或其他 case

**格式模板**：
```
[一句话描述测试场景]

验证点：
- [验证点 1]
- [验证点 2]
- ...

前置条件：[描述依赖的状态或 case]
```

**示例**：
```
测试用户订阅 Gallery Item 后系统正确创建资源。

验证点：
- 资源创建成功（status 200）
- source = 'subscribed'
- source_gallery_item_id 指向正确的 Gallery Item
- subscribed_version 记录当前版本号

前置条件：需要登录状态（AUTH_TOKEN 来自 LOGIN case）
```

**简化版**（适用于简单 case）：
```
测试用户登录成功并获取认证令牌。

前置条件：无
```

---

### environment_variables（环境变量）

**用途**：定义输入/输出变量及其语义

**必须填写 `description` 字段**，说明：
- 变量的含义
- 对于 `type=env`：数据来源（来自哪个 case）
- 对于 `type=output`：数据用途（供哪些 case 使用）

**格式**：
```json
{
  "name": "VARIABLE_NAME",
  "type": "env | output",
  "value": "",
  "description": "变量语义说明"
}
```

**示例**：

输入变量（type=env）：
```json
{
  "name": "AUTH_TOKEN",
  "type": "env",
  "value": "",
  "description": "登录认证令牌，来自 LOGIN case 的输出"
}
```

输出变量（type=output）：
```json
{
  "name": "RESOURCE_ID",
  "type": "output",
  "value": "",
  "description": "创建的订阅资源 ID，供 READONLY_CHECK 和 INSTRUCTION_CHECK cases 使用"
}
```

**错误示例**：
```json
❌ { "name": "TOKEN", "type": "env", "value": "" }  // 缺少 description
❌ { "name": "X", "type": "output", "value": "", "description": "输出" }  // description 无意义
```

---

## 完整示例

### Case: 订阅 Gallery Item

```yaml
name: 订阅 Gallery Item 并验证资源创建

case_labels:
  - US-G006
  - subscription
  - gallery

description: |
  测试用户订阅 Gallery Item 后系统正确创建资源。

  验证点：
  - 资源创建成功
  - source = 'subscribed'
  - source_gallery_item_id 正确
  - subscribed_version 记录正确

  前置条件：需要登录状态（AUTH_TOKEN 来自 LOGIN case）

environment_variables:
  - name: AUTH_TOKEN
    type: env
    value: ""
    description: 登录认证令牌，来自 LOGIN case 的输出

  - name: GALLERY_ITEM_ID
    type: env
    value: "test-item-001"
    description: 要订阅的 Gallery Item ID

  - name: RESOURCE_ID
    type: output
    value: ""
    description: 创建的订阅资源 ID，供后续 READONLY_CHECK 和 INSTRUCTION_CHECK cases 使用
```

### Case: LOGIN（前置 case）

```yaml
name: 登录成功并获取 Token

case_labels:
  - login
  - auth
  - prerequisite

description: |
  测试用户登录成功并获取认证令牌。

  前置条件：无（这是其他 case 的前置）

environment_variables:
  - name: USERNAME
    type: env
    value: "test@example.com"
    description: 测试账号用户名

  - name: PASSWORD
    type: secret
    value: ""
    description: 测试账号密码，从 Credential Safe 获取

  - name: AUTH_TOKEN
    type: output
    value: ""
    description: 登录成功后的认证令牌，供所有需要登录状态的 case 使用
```

---

## 检查清单

创建或更新 case 时，确认以下内容：

- [ ] `name` 是否清晰描述了测试场景？
- [ ] `case_labels` 是否包含 User Story 编号（如有）和功能模块？
- [ ] `description` 是否包含验证点和前置条件？
- [ ] 每个 `environment_variable` 是否都有 `description`？
- [ ] `type=env` 的变量是否说明了数据来源？
- [ ] `type=output` 的变量是否说明了数据用途？
