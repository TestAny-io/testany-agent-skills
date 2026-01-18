# 自动化配置参考

## 前置条件

- 用户已明确自动化场景
- 用户已确认触发条件
- 用户已明确自动化范围

## 自动化规则模板

### 自动分配规则

**场景**：Issue 创建后自动分配给指定人员或团队

```json
{
  "name": "Bug 自动分配给 QA",
  "trigger": "Issue Created",
  "condition": "issuetype = Bug",
  "actions": [
    {
      "type": "Assign Issue",
      "assignee": "qa-team@company.com"
    }
  ]
}
```

### 状态变更通知

**场景**：Issue 状态变更后通知相关人员

```json
{
  "name": "In Review 通知审查者",
  "trigger": "Issue Transitioned",
  "condition": "status = \"In Review\"",
  "actions": [
    {
      "type": "Send Email",
      "recipients": ["reviewer@company.com"],
      "subject": "代码审查待处理：{{issue.key}}",
      "body": "{{issue.summary}}\n\n请审查代码：{{issue.url}}"
    }
  ]
}
```

### SLA 违规提醒

**场景**：Issue 超过 SLA 时间未解决

```json
{
  "name": "高优先级 Bug SLA 提醒",
  "trigger": "Scheduled",
  "schedule": "0 0 * * *",
  "condition": "issuetype = Bug AND priority in (\"Highest\", \"High\") AND status != \"Done\" AND created >= -24h",
  "actions": [
    {
      "type": "Comment on Issue",
      "comment": "⚠️ 高优先级 Bug 已超过 24 小时未解决，请尽快处理"
    },
    {
      "type": "Transition Issue",
      "transition": "Escalated"
    }
  ]
}
```

### Sprint 结束自动处理

**场景**：Sprint 结束后自动移动未完成 Issue

```json
{
  "name": "Sprint 结束处理",
  "trigger": "Sprint Completed",
  "actions": [
    {
      "type": "Transition Issue",
      "transition": "To Backlog",
      "condition": "status IN (\"To Do\", \"In Progress\")"
    },
    {
      "type": "Send Email",
      "recipients": ["team@company.com"],
      "subject": "Sprint {{sprint.name}} 总结",
      "body": "完成率：{{completionRate}}\n\n未完成 Issue 已移至 Backlog"
    }
  ]
}
```

### 自动创建子任务

**场景**：Story 创建后自动创建标准子任务

```json
{
  "name": "Story 自动创建子任务",
  "trigger": "Issue Created",
  "condition": "issuetype = Story",
  "actions": [
    {
      "type": "Create Issue",
      "fields": {
        "project": "{{issue.project}}",
        "issuetype": "Sub-task",
        "summary": "开发",
        "parent": "{{issue.key}}"
      }
    },
    {
      "type": "Create Issue",
      "fields": {
        "project": "{{issue.project}}",
        "issuetype": "Sub-task",
        "summary": "测试",
        "parent": "{{issue.key}}"
      }
    }
  ]
}
```

### Git Commit 集成

**场景**：Git Commit Message 包含 Issue Key 时自动更新 Issue

```json
{
  "name": "Git Commit 集成",
  "trigger": "Webhook",
  "webhook": "https://git.company.com/webhook/jira",
  "condition": "commitMessage contains \"PROJ-\"",
  "actions": [
    {
      "type": "Comment on Issue",
      "comment": "Git Commit: {{commitMessage}}\nAuthor: {{author}}\n{{commitUrl}}"
    },
    {
      "type": "Transition Issue",
      "transition": "In Review",
      "condition": "branch = \"main\" OR branch = \"master\""
    }
  ]
}
```

## 常用触发器

| 触发器 | 说明 | 配置示例 |
|--------|------|---------|
| Issue Created | Issue 创建时 | `{"trigger": "Issue Created"}` |
| Issue Transitioned | Issue 状态变更 | `{"trigger": "Issue Transitioned", "to": "In Review"}` |
| Issue Updated | Issue 更新时 | `{"trigger": "Issue Updated"}` |
| Issue Commented | Issue 添加评论 | `{"trigger": "Issue Commented"}` |
| Scheduled | 定时触发 | `{"trigger": "Scheduled", "schedule": "0 0 * * *"}` |
| Sprint Started | Sprint 开始 | `{"trigger": "Sprint Started"}` |
| Sprint Completed | Sprint 结束 | `{"trigger": "Sprint Completed"}` |
| Webhook | 外部 Webhook | `{"trigger": "Webhook", "webhook": "..."}` |

## 常用操作

| 操作 | 说明 | 配置示例 |
|------|------|---------|
| Assign Issue | 分配 Issue | `{"type": "Assign Issue", "assignee": "user@example.com"}` |
| Comment on Issue | 添加评论 | `{"type": "Comment on Issue", "comment": "..."}` |
| Transition Issue | 状态变更 | `{"type": "Transition Issue", "transition": "In Progress"}` |
| Create Issue | 创建 Issue | `{"type": "Create Issue", "fields": {...}}` |
| Edit Issue | 编辑 Issue | `{"type": "Edit Issue", "fields": {...}}` |
| Send Email | 发送邮件 | `{"type": "Send Email", "recipients": [...], "subject": "...", "body": "..."}` |
| Add Comment | 添加评论 | `{"type": "Add Comment", "comment": "..."}` |

## 配置步骤

### 1. 创建自动化规则

使用 MCP 工具：`jira_create_automation_rule`

```json
{
  "name": "Bug 自动分配",
  "trigger": {
    "type": "Issue Created"
  },
  "condition": {
    "field": "issuetype",
    "operator": "=",
    "value": "Bug"
  },
  "actions": [
    {
      "type": "Assign Issue",
      "assignee": "qa-team@company.com"
    }
  ]
}
```

### 2. 测试自动化规则

使用 MCP 工具：`jira_test_automation_rule`

```json
{
  "rule_id": 12345,
  "test_issue": {
    "issuetype": "Bug",
    "priority": "High",
    "summary": "测试 Bug"
  }
}
```

### 3. 启用/禁用规则

使用 MCP 工具：`jira_enable_automation_rule`

```json
{
  "rule_id": 12345,
  "enabled": true
}
```

## 验证检查

- [ ] 触发器配置正确
- [ ] 条件逻辑合理
- [ ] 操作可执行
- [ ] 智能变量使用正确（{{issue.key}} 等）
- [ ] 测试通过
- [ ] 日志记录正常

## 最佳实践

1. **避免循环触发**：规则之间避免互相触发
2. **合理设置优先级**：高优先级规则先执行
3. **测试先行**：先在测试环境测试规则
4. **记录日志**：启用规则执行日志，方便排查问题
5. **定期审查**：每季度审查自动化规则，清理不再需要的规则
6. **命名规范**：规则名称清晰描述功能和触发条件
