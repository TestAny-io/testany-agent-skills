# Pipeline YAML 语法

## 基本结构

```yaml
kind: rule/v1.2
spec:
  rules:
    - run: 'A1B2C3D4'           # 第一个 case（无依赖）
    - run: 'E5F6A7B8'
      whenPassed: 'A1B2C3D4'    # 仅当 A1B2C3D4 通过时执行
      relay:
        - key: AUTH_TOKEN       # 本 case 中接收变量名
          refKey: A1B2C3D4/TOKEN  # 来源：case_key/变量名
          nonSecret: true
```

---

## Rule 字段说明

| 字段 | 必填 | 说明 |
|------|-----|------|
| `run` | 是 | Case Key（8 位大写十六进制） |
| `whenPassed` | 否 | 前置 case 必须通过才执行 |
| `whenFailed` | 否 | 前置 case 必须失败才执行（与 whenPassed 互斥） |
| `expect` | 否 | 设为 `fail` 可反转结果判定 |
| `relay` | 否 | 变量传递配置 |

---

## 依赖规则

1. **互斥约束**：`whenPassed` 和 `whenFailed` 不能同时出现
2. **DAG 约束**：被引用的 case 必须在 rules 数组中**之前**定义
3. **单依赖约束**：每个 rule 只能依赖一个 case

---

## Relay（变量传递）

### Relay 字段

| 字段 | 必填 | 说明 |
|------|-----|------|
| `key` | 是 | 目标变量名（接收 case 中的变量） |
| `refKey` | 是 | 源引用，格式：`{case_key}/{variable_name}` |
| `nonSecret` | 否 | `true` 时值在日志中明文显示 |

### Relay 约束（重要）

配置 relay 时，**必须先查询 case 定义**来验证环境变量：

```
验证流程:
1. testany_get_case 获取 run 对应的 case
   → 检查 case_meta.environment_variables
   → relay.key 必须存在且 type='env'

2. testany_get_case 获取 refKey 中的源 case
   → 检查 case_meta.environment_variables
   → refKey 中的变量必须存在且 type='output'
```

| 约束 | 要求 |
|------|------|
| `relay.key` | 必须在 **run** case 中定义，`type='env'` |
| `relay.refKey` | 变量必须在 **源** case 中定义，`type='output'` |
| 依赖顺序 | 引用的 case 必须在 rules 数组中**之前**定义 |

---

## 常见编排模式

### 顺序执行（无依赖）

```yaml
rules:
  - run: 'A1B2C3D4'
  - run: 'E5F6A7B8'
  - run: 'C9D0E1F2'
```

### 链式依赖

```yaml
rules:
  - run: 'A1B2C3D4'  # Login
  - run: 'E5F6A7B8'
    whenPassed: 'A1B2C3D4'  # Get Profile（需要登录成功）
  - run: 'C9D0E1F2'
    whenPassed: 'E5F6A7B8'  # Update Profile（需要获取成功）
```

### 带 Relay 的链式

**Case A (04E41DDE)** 的 environment_variables:
```json
[{ "name": "TOKEN", "type": "output", "value": "" }]
```

**Case B (FAFC249A)** 的 environment_variables:
```json
[{ "name": "AUTH_TOKEN", "type": "env", "value": "" }]
```

**Pipeline YAML**:
```yaml
rules:
  - run: '04E41DDE'  # Login → 输出 TOKEN
  - run: 'FAFC249A'
    whenPassed: '04E41DDE'
    relay:
      - key: AUTH_TOKEN        # ✓ FAFC249A 中 type='env'
        refKey: 04E41DDE/TOKEN # ✓ 04E41DDE 中 type='output'
        nonSecret: true
```

### 失败后执行（清理场景）

```yaml
rules:
  - run: 'A1B2C3D4'  # Main test
  - run: 'CLEANUP01'
    whenFailed: 'A1B2C3D4'  # 仅当主测试失败时执行清理
```

---

## Schema Reference

在创建或更新 pipeline 前，读取 MCP Resource 获取完整 schema：

```
URI: testany://schema/pipeline
Method: resources/read
```
