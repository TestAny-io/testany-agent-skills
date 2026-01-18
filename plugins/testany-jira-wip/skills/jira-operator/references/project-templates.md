# 项目模板参考

## 前置条件

- 用户已确认项目类型（Scrum/Kanban/瀑布）
- 用户已确认团队规模
- 用户已确认是否需要跨团队协作

## 标准项目模板

### Scrum 项目模板

**适用场景**：固定周期迭代，Sprint Planning/Daily/Review/Retro

```json
{
  "name": "Scrum Project Template",
  "description": "标准 Scrum 项目模板",
  "project_type": "software",
  "workflow": "Scrum Workflow",
  "issue_types": ["Epic", "Story", "Task", "Bug", "Sub-task"],
  "permission_scheme": "Scrum Team Permission Scheme",
  "notification_scheme": "Scrum Notification Scheme",
  "screens": {
    "default": "Scrum Screen",
    "create": "Scrum Create Screen",
    "edit": "Scrum Edit Screen"
  },
  "fields": {
    "required": ["summary", "issuetype", "priority"],
    "custom": ["Story Points", "Sprint", "Epic Link"]
  }
}
```

**包含的配置**：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 工作流 | Scrum Workflow | 4 个状态：To Do → In Progress → In Review → Done |
| Issue 类型 | Epic, Story, Task, Bug, Sub-task | 标准类型 |
| 权限方案 | Scrum Team Permission Scheme | 敏捷团队权限 |
| 默认面板 | Sprint 面板、燃尽图、待办事项 | Scrum 必需面板 |
| 字段配置 | Story Points, Sprint, Epic Link | 敏捷专用字段 |

### Kanban 项目模板

**适用场景**：持续交付，看板管理，WIP 限制

```json
{
  "name": "Kanban Project Template",
  "description": "标准 Kanban 项目模板",
  "project_type": "software",
  "workflow": "Kanban Workflow",
  "issue_types": ["Epic", "Story", "Task", "Bug", "Sub-task"],
  "permission_scheme": "Kanban Team Permission Scheme",
  "notification_scheme": "Kanban Notification Scheme",
  "screens": {
    "default": "Kanban Screen"
  },
  "fields": {
    "required": ["summary", "issuetype", "priority"],
    "custom": ["Cycle Time", "Lead Time"]
  }
}
```

**包含的配置**：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 工作流 | Kanban Workflow | 6 个状态：Backlog → Ready → In Progress → In Review → Testing → Done |
| Issue 类型 | Epic, Story, Task, Bug, Sub-task | 标准类型 |
| 权限方案 | Kanban Team Permission Scheme | 看板团队权限 |
| 默认面板 | Kanban 面板、累积流图 | Kanban 必需面板 |
| WIP 限制 | In Progress: 5, In Review: 3 | 流动效率优化 |

### 支持项目模板

**适用场景**：客户支持、运维、服务台

```json
{
  "name": "Support Project Template",
  "description": "标准支持项目模板",
  "project_type": "service_desk",
  "workflow": "Support Workflow",
  "issue_types": ["Bug", "Task", "Sub-task", "Request"],
  "permission_scheme": "Support Team Permission Scheme",
  "notification_scheme": "Support Notification Scheme",
  "screens": {
    "default": "Support Screen"
  },
  "fields": {
    "required": ["summary", "issuetype", "priority", "customer_email"],
    "custom": ["SLA", "Customer", "Impact"]
  }
}
```

**包含的配置**：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 工作流 | Support Workflow | Open → Triage → In Progress → Waiting → Resolved → Closed |
| Issue 类型 | Bug, Task, Sub-task, Request | 支持专用类型 |
| 权限方案 | Support Team Permission Scheme | 客服团队权限 |
| SLA 配置 | P1: 4h, P2: 24h, P3: 72h | 服务级别协议 |

## 配置步骤

### 1. 创建项目

使用 MCP 工具：`jira_create_project`

```json
{
  "name": "新项目名称",
  "key": "PROJ",
  "type": "software",
  "lead": "project-lead@company.com",
  "url": "https://company.atlassian.net"
}
```

### 2. 应用工作流

使用 MCP 工具：`jira_apply_workflow`

```json
{
  "project_key": "PROJ",
  "workflow_name": "Scrum Workflow"
}
```

### 3. 应用权限方案

使用 MCP 工具：`jira_apply_permission_scheme`

```json
{
  "project_key": "PROJ",
  "permission_scheme_name": "Scrum Team Permission Scheme"
}
```

### 4. 配置 Issue 类型

使用 MCP 工具：`jira_configure_issue_types`

```json
{
  "project_key": "PROJ",
  "issue_types": ["Epic", "Story", "Task", "Bug", "Sub-task"],
  "default": "Story"
}
```

### 5. 配置字段

使用 MCP 工具：`jira_configure_fields`

```json
{
  "project_key": "PROJ",
  "fields": {
    "required": ["summary", "issuetype", "priority"],
    "custom": [
      {
        "name": "Story Points",
        "type": "number",
        "default": 0
      },
      {
        "name": "Epic Link",
        "type": "select",
        "options": ["Epic A", "Epic B", "Epic C"]
      }
    ]
  }
}
```

## 验证检查

- [ ] 项目创建成功
- [ ] 工作流配置正确
- [ ] 权限方案已应用
- [ ] Issue 类型配置正确
- [ ] 字段配置正确
- [ ] 默认面板已创建
- [ ] 测试用户可以正常使用

## 最佳实践

1. **标准化模板**：为不同类型的项目创建标准化模板
2. **版本控制**：项目模板纳入版本控制，方便追踪变更
3. **定期更新**：根据团队反馈定期更新模板
4. **文档化**：为每个模板编写配置文档
5. **测试先行**：模板更新后先在测试项目验证
6. **用户培训**：新项目使用模板后进行培训
