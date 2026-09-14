---
description: Testany platform case 注册与管理，上传 case package、更新 metadata 与脚本
argument-hint: <操作> <描述>，如：注册这些 case packages、更新脚本、查看 A1B2C3D4
---

# Testany Platform Case 注册与管理

将已准备好的 Testany platform case package 注册到平台，并管理 metadata、脚本和生命周期。

## 使用方式

$ARGUMENTS

按 [整体目标交接](../skills/testany-guide/references/task-handoff.md) 携带真实 key 与验证状态继续已授权的后续目标；注册/上传许可不等于执行许可。

## 核心动作

按 [交付验证](../skills/testany-guide/references/delivery-verification.md) 先检本地包，变更后读回配置和脚本状态；上传失败保留真实 case key，不自动重建或回滚删除。

- **注册 case package**：创建 shell case，补齐 metadata，并上传 ZIP
- **更新配置**：修改 case metadata、可见性、labels、运行配置
- **上传脚本**：上传或更新测试脚本 ZIP 包
- **查看用例**：获取 case 详情和脚本
- **管理标签**：为 case 添加分类标签
- **dry run 验证**：按本轮明确许可执行脚本验证，不从注册、上传或补字段自动推导许可

## 示例

```
/case 把这些 ZIP 和 metadata 注册成 Testany cases
/case 更新 A1B2C3D4 的环境变量
/case 上传脚本到 A1B2C3D4
/case dry run A1B2C3D4
/case 给 A1B2C3D4 添加 regression 标签
```

## 重要边界

- `case` 是 Testany 平台上的**原子自动化步骤包**
- 如果你只有传统测试场景，还没有拆解结果和脚本，请先用 `/case-writing`
- 常规编排执行以 pipeline 为单位；case dry run 是单独的验证入口，不替代编排验证
- 只要求配置就交付配置与「未执行」；明确授权且目标/副作用已知时可直接完成一次验证，不重复确认
- 查询既有 dry run 不新开执行；等待遵守 [有界等待合同](../skills/testany-guide/references/execution-boundaries.md)，超时不等于远程取消，不自动重试

## Case Labels (用例标签)

`case_labels` 用于对测试用例进行分类和过滤。**重要：标签必须在系统中预先存在才能使用。**

### 获取可用标签

在为用例设置标签前，先调用 `testany_list_labels` 获取系统中已有的标签列表：

```
testany_list_labels
testany_list_labels keyword="regression"  # 按关键字过滤
```

### 创建新标签

如果需要的标签不存在，先调用 `testany_create_label` 创建：

```
testany_create_label name="my-new-label"
```

标签命名规则：
- 长度 1-255 字符
- 不能包含特殊字符：`"`, `%`, `/`, `\`, `*`
- 不能使用保留名称：`root`, `testcaselibrary`, `test case library`

### 为用例设置标签

创建或更新用例时，使用 `case_labels` 字段指定标签（必须是已存在的标签）：

```
testany_update_case key="A1B2C3D4" case_labels=["regression", "api-test"]
testany_bulk_update_cases keys=["A1B2C3D4", "B2C3D4E5"] case_labels=["smoke"]
testany_bulk_append_cases keys=["A1B2C3D4"] case_labels=["nightly"]  # 追加标签
```

### 常见工作流

1. **添加新标签到用例**：
   - 先 `testany_list_labels` 检查标签是否存在
   - 如不存在，`testany_create_label` 创建
   - 最后 `testany_update_case` 或 `testany_bulk_append_cases` 设置标签

2. **批量更新标签**：
   - `testany_bulk_update_cases` 会**替换**所有标签
   - `testany_bulk_append_cases` 会**追加**新标签到现有标签
