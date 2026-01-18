# JQL 查询参考

## 前置条件

- 用户已明确查询目标（按状态、分配人、时间等）
- 用户已明确项目范围
- 用户已明确 Issue 类型

## JQL 基础语法

### 基本查询

```sql
project = "PROJ"
```

```sql
project = "PROJ" AND status = "In Progress"
```

```sql
project = "PROJ" AND (assignee = currentUser() OR reporter = currentUser())
```

### 运算符

| 运算符 | 说明 | 示例 |
|--------|------|------|
| = | 等于 | status = "Done" |
| != | 不等于 | status != "Done" |
| > | 大于 | priority > "Medium" |
| >= | 大于等于 | priority >= "High" |
| < | 小于 | priority < "High" |
| <= | 小于等于 | priority <= "High" |
| IN | 在列表中 | status IN ("To Do", "In Progress") |
| NOT IN | 不在列表中 | status NOT IN ("Done", "Closed") |
| IS | 为空 | assignee IS EMPTY |
| IS NOT | 不为空 | assignee IS NOT EMPTY |
| ~ | 模糊匹配 | summary ~ "bug" |
| !~ | 不模糊匹配 | summary !~ "bug" |

### 逻辑运算符

```sql
project = "PROJ" AND status = "In Progress" AND assignee = currentUser()
```

```sql
project = "PROJ" AND (status = "In Progress" OR status = "In Review")
```

```sql
project = "PROJ" AND status != "Done" AND (assignee = currentUser() OR reporter = currentUser())
```

## 常用查询模板

### 我的任务

```sql
assignee = currentUser() AND status in ("To Do", "In Progress")
```

### 我报告的 Issue

```sql
reporter = currentUser() AND status != "Done"
```

### 本 Sprint 的 Issue

```sql
project = "PROJ" AND sprint in openSprints()
```

### 已完成的 Issue

```sql
project = "PROJ" AND status = "Done" AND resolved >= -1w
```

### 超期任务

```sql
project = "PROJ" AND status != "Done" AND duedate < -1d
```

### 高优先级 Bug

```sql
project = "PROJ" AND issuetype = Bug AND priority in ("Highest", "High") AND status != "Done"
```

### Epic 下的所有 Story

```sql
project = "PROJ" AND issuetype = Story AND "Epic Link" = PROJ-123
```

### 代码审查队列

```sql
project = "PROJ" AND status = "In Review" AND assignee != currentUser()
```

### 本周创建的 Issue

```sql
project = "PROJ" AND created >= -1w
```

### 本月关闭的 Issue

```sql
project = "PROJ" AND status = "Done" AND resolved >= -1m
```

## 高级查询技巧

### 时间函数

```sql
-- 7 天前
created >= -7d
-- 本周
created >= -1w
-- 本月
created >= -1m
-- 本季度
created >= -3m
-- 上周
created >= -2w AND created <= -1w
```

### 用户函数

```sql
-- 当前用户
assignee = currentUser()
-- 特定用户
assignee = "user@example.com"
-- 用户组
assignee in membersOf("developers")
```

### 子查询

```sql
-- Epic 下的所有子任务
issueFunction in subtasksOf("key = PROJ-123")

-- 没有关联 Epic 的 Story
issuetype = Story AND "Epic Link" is EMPTY

-- 关联了 Bug 的 Story
issuetype = Story AND issueFunction in linkedIssuesOf("type in (is duplicated by)", "Bug")
```

### 排序

```sql
project = "PROJ" ORDER BY priority DESC, created ASC
```

### 限制数量

```sql
project = "PROJ" ORDER BY created DESC LIMIT 10
```

## 复杂查询示例

### 多条件组合

```sql
project = "PROJ"
AND status in ("In Progress", "In Review")
AND priority in ("Highest", "High")
AND (assignee = currentUser() OR reporter = currentUser())
AND duedate <= +3d
```

### 时间范围查询

```sql
project = "PROJ"
AND created >= -2w
AND created <= -1w
AND status = "Done"
```

### 跨项目查询

```sql
project in ("PROJ-A", "PROJ-B", "PROJ-C")
AND status = "In Progress"
AND assignee = currentUser()
```

### 复杂状态组合

```sql
project = "PROJ"
AND (
  (issuetype = Story AND status in ("To Do", "In Progress"))
  OR
  (issuetype = Bug AND status in ("To Do", "In Progress", "In Review"))
)
```

## 验证检查

- [ ] 查询语法正确
- [ ] 项目 Key 正确
- [ ] 状态名称准确
- [ ] 字段名称正确
- [ ] 时间格式正确（-1w, -1m 等）
- [ ] 逻辑运算符使用正确
- [ ] 测试查询结果符合预期

## 最佳实践

1. **使用 Filter**：常用查询保存为 Filter，方便复用
2. **避免 OR 嵌套**：复杂查询使用 IN 代替多层 OR
3. **优化查询性能**：优先使用 indexed 字段（project, status, assignee）
4. **命名规范**：Filter 名称清晰描述查询内容
5. **共享 Filter**：团队共享常用 Filter
6. **定期清理**：删除不再使用的 Filter
