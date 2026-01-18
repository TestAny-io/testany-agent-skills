# 看板配置参考

## 前置条件

- 用户已确认方法论（Scrum/Kanban）
- 用户已确认团队规模
- 用户已确认是否需要 WIP 限制

## Scrum 看板

### Sprint Backlog

**用途**：Sprint 规划，展示当前 Sprint 的任务

```json
{
  "name": "Sprint Backlog",
  "type": "scrum",
  "filter": "project = PROJ AND sprint in openSprints()",
  "quick_filters": [
    {
      "name": "我的任务",
      "query": "assignee = currentUser()"
    },
    {
      "name": "高优先级",
      "query": "priority in (\"Highest\", \"High\")"
    }
  ],
  "swimlanes": "none",
  "columns": ["To Do", "In Progress", "In Review", "Done"]
}
```

**配置选项**：

| 选项 | 值 | 说明 |
|------|-----|------|
| 快速过滤 | 按分配人、优先级 | 快速筛选 Issue |
| 泳道 | 无 / 按分配人 / 按 Epic | 组织 Issue |
| 排序 | 按优先级 / 按创建时间 | Issue 排序方式 |

### Active Sprint

**用途**：Sprint 执行期间的任务追踪

```json
{
  "name": "Active Sprint",
  "type": "scrum",
  "filter": "project = PROJ AND sprint in openSprints()",
  "quick_filters": [
    {
      "name": "我的任务",
      "query": "assignee = currentUser()"
    }
  ],
  "swimlanes": "assignee",
  "columns": ["To Do", "In Progress", "In Review", "Done"],
  "display_options": {
    "show_estimates": true,
    "show_remaining_time": true
  }
}
```

**显示选项**：

| 选项 | 说明 | 推荐配置 |
|------|------|---------|
| 显示故事点 | 在卡片上显示故事点 | ✅ 开启 |
| 显示剩余时间 | 显示任务剩余工时 | ✅ 开启 |
| 显示优先级 | 在卡片上显示优先级图标 | ✅ 开启 |

## Kanban 看板

### 标准看板

**用途**：持续交付，任务流动管理

```json
{
  "name": "Project Kanban",
  "type": "kanban",
  "filter": "project = PROJ AND status not in (\"Done\", \"Closed\")",
  "quick_filters": [
    {
      "name": "我的任务",
      "query": "assignee = currentUser()"
    }
  ],
  "swimlanes": "priority",
  "columns": [
    {"name": "Backlog", "statuses": ["Backlog"], "limit": -1},
    {"name": "Ready", "statuses": ["Ready"], "limit": -1},
    {"name": "In Progress", "statuses": ["In Progress"], "limit": 5},
    {"name": "In Review", "statuses": ["In Review"], "limit": 3},
    {"name": "Testing", "statuses": ["Testing"], "limit": 10},
    {"name": "Done", "statuses": ["Done"], "limit": -1}
  ]
}
```

### WIP 限制配置

**列 WIP 限制**：

| 列 | WIP 限制 | 依据 |
|----|---------|------|
| In Progress | 团队人数 × 0.75 | 避免并行工作过多 |
| In Review | 2-3 人 | 加速代码审查 |
| Testing | 团队人数 × 0.5 | 根据 QA 团队规模 |
| Done | 无限制 | - |

**WIP 限制计算示例**：

- 8 人开发团队：
  - In Progress: 8 × 0.75 ≈ 6
  - In Review: 2-3
  - Testing: 8 × 0.5 ≈ 4

- 4 人开发团队：
  - In Progress: 4 × 0.75 ≈ 3
  - In Review: 2
  - Testing: 4 × 0.5 ≈ 2

### 泳道配置

**按优先级泳道**：

```json
{
  "swimlanes": {
    "type": "priority",
    "lanes": [
      {"name": "Critical", "value": "Highest"},
      {"name": "High", "value": "High"},
      {"name": "Medium", "value": "Medium"},
      {"name": "Low", "value": ["Low", "Lowest"]}
    ]
  }
}
```

**按分配人泳道**：

```json
{
  "swimlanes": {
    "type": "assignee",
    "lanes": "auto"
  }
}
```

**按 Epic 泳道**：

```json
{
  "swimlanes": {
    "type": "epic",
    "lanes": "auto"
  }
}
```

## 配置步骤

### 1. 创建看板

使用 MCP 工具：`jira_create_board`

```json
{
  "name": "Project Kanban",
  "type": "kanban",
  "filter": "project = PROJ",
  "location": {
    "type": "project",
    "project_key": "PROJ"
  }
}
```

### 2. 配置列

使用 MCP 工具：`jira_configure_columns`

```json
{
  "board_id": 12345,
  "columns": [
    {"name": "Backlog", "statuses": ["Backlog"]},
    {"name": "In Progress", "statuses": ["In Progress"], "limit": 5},
    {"name": "Done", "statuses": ["Done"]}
  ]
}
```

### 3. 配置 WIP 限制

使用 MCP 工具：`jira_configure_wip`

```json
{
  "board_id": 12345,
  "wip_limits": {
    "In Progress": 5,
    "In Review": 3
  }
}
```

### 4. 配置泳道

使用 MCP 工具：`jira_configure_swimlanes`

```json
{
  "board_id": 12345,
  "swimlanes": {
    "type": "assignee"
  }
}
```

## 验证检查

- [ ] 看板创建成功
- [ ] 列配置正确
- [ ] WIP 限制配置合理
- [ ] 泳道配置正确
- [ ] 快速过滤器可用
- [ ] 卡片显示正确
- [ ] 拖拽功能正常

## 最佳实践

1. **WIP 限制合理**：根据团队规模设置合理的 WIP 限制
2. **泳道清晰**：泳道用于组织，不要过于复杂
3. **快速过滤**：配置常用快速过滤器
4. **定期优化**：根据团队反馈定期优化看板配置
5. **可视化指标**：在看板上显示关键指标（Cycle Time, Lead Time）
6. **保持简洁**：避免列过多，保持看板简洁
