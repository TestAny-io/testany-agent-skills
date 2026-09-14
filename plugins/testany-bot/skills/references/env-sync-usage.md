# 环境同步示例与字段约定

## 使用示例

### 示例 1：单 Case 同步

```
/testany-sync-case-env-from-source
→ 选择操作模式：单 Case 操作
→ 输入 case key: B9121897
→ 执行同步流程...
```

### 示例 2：批量 Keys 同步

```
/testany-sync-case-env-from-source
→ 选择操作模式：批量 Keys 操作
→ 输入 case keys（逗号分隔）: B9121897,5C5FF07F,ABC12345
→ 执行同步流程...
```

### 示例 3：搜索批量操作

```
/testany-sync-case-env-from-source
→ 选择操作模式：搜索批量操作
→ 选择搜索条件：按标签搜索
→ 选择标签: swagger-backend
→ 找到 15 个匹配的 case
→ 执行同步流程...
```

### 示例 4：搜索条件组合

```
/testany-sync-case-env-from-source
→ 选择操作模式：搜索批量操作
→ 搜索关键词: importHistory
→ 选择工作空间: demo1
→ 选择标签: swagger-backend
→ 找到 8 个匹配的 case
→ 执行同步流程...
```

---

## 注意事项

### 1. 代码拉取方式
- 默认使用 Git Worktree：在 `/tmp/testany-worktrees/{branch_name}` 创建工作树
- Worktree 会缓存复用，同一分支的多个 case 只需创建一次
- 处理完成后可选择保留或清理缓存

### 2. 批量处理性能
- 不同分支的 case 可以并行处理（每个分支有独立 worktree）
- 同一分支的多个 case 可以快速复用已创建的 worktree
- 建议首次运行前用单 case 测试，确认配置正确

### 3. 搜索结果限制
- `testany_list_cases` 默认返回 20 条结果
- 批量操作建议设置 `page_size=100` 或更高
- 如需处理更多结果，需要分页处理

### 4. 变量命名
- 入参：保持 ENV[...] 中的原始名称
- 出参：保持 relay_request_fields 中的原始名称
- 所有变量名全大写

### 5. 值占位符与实际值
- 入参：从 `integration-test/testany-scripts/env/{目录名}_environment.txt` 文件中读取实际值替换 PLACEHOLDER
  - 如果文件存在且包含该参数，使用文件中的值（如 `ENV_QUERY_KEY_1_00=IXX`）
  - 如果文件不存在或参数未在文件中找到，保留 "PLACEHOLDER"
- 出参：始终保持 "PLACEHOLDER"（出参不需要从文件读取）
- description 字段提供有意义的说明

### 6. 环境变量文件
- 文件格式：`KEY=VALUE`，每行一个变量
- 支持 `#` 开头的注释行（自动忽略）
- 文件路径：`integration-test/testany-scripts/env/{目录名}_environment.txt`
- 目录名提取规则：从 `testany-scripts/` 后的第一个目录名获取
- 文件在同一分支的 worktree 中读取（需要先拉取代码到本地）

### 7. Git 配置
- 确保用户有正确的 Git 认证配置
- 私有仓库需要 SSH 或 HTTPS 认证
- 确保 origin remote 指向正确的仓库

---

## 参考代码结构

OpenAPI 生成的典型测试代码结构：

```python
BASE_STRUCTURES_INFO = {
    "structure": {
        "path": {
            "id": "ENV[ENV_PATH_ID_1_00]"
        },
        "query": {},
        "header": {},
        "body": None
    }
}

# ... 其他代码 ...

relay_request_fields = [
    "NAME",
    "DESCRIPTION",
    "RUNTIME_UUID",
    "SCRIPT_ADDRESS",
    "CASE_META",
    "CASE_LABELS",
    "CASE_VERSION",
    "IS_PRIVATE",
    "WORKSPACE_KEYS",
    "CREDENTIALS",
]

response_fields = [
    # ... 响应字段定义 ...
]
```

---
