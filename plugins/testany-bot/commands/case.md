---
description: Testany Case, 创建/配置/更新测试用例，上传脚本
argument-hint: <操作> <描述>，如：创建 API 测试、更新脚本、配置环境变量
---

# Testany 测试用例管理

管理 Testany 测试用例：创建、配置、更新、上传脚本。

## 使用方式

$ARGUMENTS

## 支持的操作

- **创建用例**：创建新的测试用例，选择 executor，配置触发方式
- **更新配置**：修改用例的 executor、环境变量、可见性等
- **上传脚本**：上传或更新测试脚本 ZIP 包
- **查看用例**：获取用例详情和配置
- **管理标签**：为用例添加分类标签

## 示例

```
/case 创建一个 Python API 测试
/case 更新 A1B2C3D4 的环境变量
/case 上传脚本到 A1B2C3D4
/case 给 A1B2C3D4 添加 regression 标签
```

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
