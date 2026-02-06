# 测试设计原则

## Test Case vs Assertion

| 概念 | 定义 | 粒度 |
|------|------|------|
| **Test Case** | 测试一个完整的用户行为或系统场景 | 粗粒度 |
| **Assertion** | Test Case 内部的单个验证点 | 细粒度 |

**关系**：一个 Test Case 包含多个 Assertions。

```
Test Case: 用户订阅 Gallery Item
├── Assertion 1: 资源创建成功
├── Assertion 2: source = 'subscribed'
├── Assertion 3: source_gallery_item_id 正确
└── Assertion 4: subscribed_version 记录正确
```

---

## 从 PRD 到 Test Case 的设计流程

### 错误做法：Checklist 思维

```
PRD 验收标准 (AC)          Test Cases
─────────────────          ──────────
AC1: 按钮存在       →      Case 1: 验证按钮
AC2: 创建资源       →      Case 2: 验证创建
AC3: source 正确    →      Case 3: 验证 source
AC4: item_id 正确   →      Case 4: 验证 item_id
...                        ...

❌ 每个 AC = 一个 Test Case = 过度拆分
```

### 正确做法：场景思维

```
PRD 验收标准 (AC)          Test Cases
─────────────────          ──────────
AC1: 按钮存在       →      Case 1: UI 验证（独立场景）
AC2: 创建资源       ─┐
AC3: source 正确     ├→    Case 2: 订阅流程（一个场景，多个 assertions）
AC4: item_id 正确    │
AC5: version 正确   ─┘
AC6: 只读约束       →      Case 3: 权限约束（独立场景）
AC7: 信息不可见     →      Case 4: 信息保护（独立场景）

✓ 按用户行为/系统场景划分
```

---

## Test Case 划分原则

### 原则 1: 一个 Test Case = 一个用户行为

**问**：用户做了什么？
- 用户点击订阅按钮 → 一个 Test Case
- 用户尝试编辑订阅资源 → 一个 Test Case
- 用户尝试查看 Instruction → 一个 Test Case

### 原则 2: 相关验证点合并为 Assertions

**问**：这些验证点是同一个行为的结果吗？
- 订阅后资源创建 + source 正确 + version 正确 = 同一行为的多个检查点 → 合并
- 订阅后资源创建 vs 编辑被拒绝 = 不同行为 → 分开

### 原则 3: 独立场景独立 Case

**问**：这个验证需要独立的前置条件或操作吗？
- UI 按钮存在（无需登录）→ 独立 Case
- 只读约束（需要先订阅）→ 独立 Case，依赖订阅 Case

---

## 常见错误模式

### 错误 1: 过度拆分

```
❌ 错误：
- Case 1: 验证 status code = 200
- Case 2: 验证 response 有 token
- Case 3: 验证 token 格式正确

✓ 正确：
- Case 1: 登录成功
  - assert status == 200
  - assert 'token' in response
  - assert token matches pattern
```

### 错误 2: 过度合并

```
❌ 错误：
- Case 1: 测试所有登录场景（成功 + 失败 + 锁定 + ...）

✓ 正确：
- Case 1: 登录成功
- Case 2: 登录失败（无效凭据）
- Case 3: 账户锁定
```

### 错误 3: 混淆 AC 和 Test Case

```
❌ 错误：把 PRD 的每个 AC 编号直接映射为 Test Case

✓ 正确：分析 AC 背后的用户行为，按行为划分 Test Case
```

---

## 实战示例

### 需求：US-G006 订阅 Item

**验收标准**：
1. 详情页提供"订阅"按钮
2. 点击后创建新资源
3. source = 'subscribed'
4. source_gallery_item_id 正确
5. subscribed_version 记录
6. 只读约束
7. Instruction 不可见

**Test Case 设计**：

| Case | 场景 | 包含的 Assertions |
|------|------|------------------|
| `AC1_BTN` | 订阅按钮存在 | AC1 |
| `LOGIN` | 登录（前置） | - |
| `SUBSCRIBE` | 订阅并验证资源创建 | AC2 + AC3 + AC4 + AC5 |
| `READONLY` | 只读约束 | AC6 |
| `HIDE_INST` | Instruction 不可见 | AC7 |

**Pipeline YAML**：

```yaml
kind: rule/v1.2
spec:
  rules:
    - run: 'AC1_BTN'      # 独立 UI 测试
    - run: 'LOGIN'        # 前置
    - run: 'SUBSCRIBE'    # 主流程 + 4 个 assertions
      whenPassed: 'LOGIN'
      relay:
        - key: AUTH_TOKEN
          refKey: LOGIN/AUTH_TOKEN
    - run: 'READONLY'     # 独立行为测试
      whenPassed: 'SUBSCRIBE'
      relay:
        - key: AUTH_TOKEN
          refKey: LOGIN/AUTH_TOKEN
        - key: RESOURCE_ID
          refKey: SUBSCRIBE/RESOURCE_ID
    - run: 'HIDE_INST'    # 独立行为测试
      whenPassed: 'SUBSCRIBE'
      relay:
        - key: AUTH_TOKEN
          refKey: LOGIN/AUTH_TOKEN
        - key: RESOURCE_ID
          refKey: SUBSCRIBE/RESOURCE_ID
```

**结果**：7 个 AC → 5 个 Test Cases（不是 7+ 个）
