# 权限管理参考

## 前置条件

- 用户已确认团队组成（开发、QA、产品等）
- 用户已确认是否有外部协作需求
- 用户已确认项目类型

## 权限方案层次

Jira 权限分为三个层次：

| 层次 | 说明 | 影响范围 |
|------|------|---------|
| 全局权限 | Jira 系统级权限 | 所有项目和用户 |
| 项目权限 | 项目级权限 | 单个项目 |
| 角色权限 | 项目内角色权限 | 单个项目内的特定角色 |

## 标准角色定义

### 敏捷团队角色

| 角色 | 权限范围 | 典型成员 |
|------|---------|---------|
| Administrators | 项目所有权限 | 项目负责人、Scrum Master |
| Developers | 创建、分配、编辑 Issue | 开发团队 |
| Product Owners | 创建、规划、优先级管理 | 产品经理 |
| QA | 创建 Bug、验证结果 | 测试团队 |
| Reporters | 仅查看和创建 Issue | 外部协作人员 |

### 支持团队角色

| 角色 | 权限范围 | 典型成员 |
|------|---------|---------|
| Support Agents | 创建、分配、编辑 Bug、创建评论 | 客服团队 |
| Developers | 查看 Bug、添加评论 | 开发团队 |
| Customers | 仅查看和创建 Bug | 外部客户 |

### 外部协作角色

| 角色 | 权限范围 | 典型成员 |
|------|---------|---------|
| Partners | 仅查看 Issue、添加评论 | 合作伙伴、供应商 |
| Contractors | 创建、分配 Issue（限分配给自己） | 外包人员 |

## 权限矩阵

### Scrum 项目权限矩阵

| 权限 | Administrators | Developers | Product Owners | QA | Reporters |
|------|--------------|-------------|----------------|-----|-----------|
| 浏览项目 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 创建 Issue | ✅ | ✅ | ✅ | ✅ | ✅ |
| 编辑 Issue | ✅ | ✅ | ✅ | ✅ | ❌ |
| 分配 Issue | ✅ | ✅ | ✅ | ❌ | ❌ |
| 移除 Issue | ✅ | ✅ | ✅ | ❌ | ❌ |
| 创建评论 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 编辑所有评论 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 编辑自己的评论 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 删除 Issue | ✅ | ❌ | ❌ | ❌ | ❌ |

### Kanban 项目权限矩阵

| 权限 | Administrators | Developers | QA | Reporters |
|------|--------------|-------------|-----|-----------|
| 浏览项目 | ✅ | ✅ | ✅ | ✅ |
| 创建 Issue | ✅ | ✅ | ✅ | ✅ |
| 编辑 Issue | ✅ | ✅ | ✅ | ❌ |
| 分配 Issue | ✅ | ✅ | ❌ | ❌ |
| 移除 Issue | ✅ | ✅ | ❌ | ❌ |
| 创建评论 | ✅ | ✅ | ✅ | ✅ |
| 编辑所有评论 | ✅ | ✅ | ❌ | ❌ |
| 编辑自己的评论 | ✅ | ✅ | ✅ | ✅ |
| 删除 Issue | ✅ | ❌ | ❌ | ❌ |

## 配置步骤

### 1. 创建角色

使用 MCP 工具：`jira_create_role`

```json
{
  "name": "Developers",
  "description": "开发团队，可以创建、分配、编辑 Issue"
}
```

### 2. 配置权限方案

使用 MCP 工具：`jira_create_permission_scheme`

```json
{
  "name": "Scrum Team Permission Scheme",
  "permissions": [
    {
      "permission": "BROWSE_PROJECTS",
      "roles": ["Administrators", "Developers", "Product Owners", "QA", "Reporters"]
    },
    {
      "permission": "CREATE_ISSUES",
      "roles": ["Administrators", "Developers", "Product Owners", "QA", "Reporters"]
    },
    {
      "permission": "EDIT_ISSUES",
      "roles": ["Administrators", "Developers", "Product Owners", "QA"]
    },
    {
      "permission": "ASSIGN_ISSUES",
      "roles": ["Administrators", "Developers", "Product Owners"]
    },
    {
      "permission": "DELETE_ISSUES",
      "roles": ["Administrators"]
    }
  ]
}
```

### 3. 分配用户到角色

使用 MCP 工具：`jira_add_user_to_role`

```json
{
  "project_key": "PROJ",
  "role": "Developers",
  "users": ["user1@example.com", "user2@example.com"]
}
```

### 4. 应用权限方案到项目

使用 MCP 工具：`jira_apply_permission_scheme`

```json
{
  "project_key": "PROJ",
  "permission_scheme_name": "Scrum Team Permission Scheme"
}
```

## 跨团队协作权限

### 共享项目权限

**场景**：多个团队共享同一个项目

| 配置项 | 配置值 | 说明 |
|--------|---------|------|
| 角色粒度 | 按团队划分 | Team A Developers, Team B Developers |
| Issue 访问 | 基于角色 + 团队标签 | 使用标签过滤可见性 |
| 权限继承 | 继承全局权限 | 确保基础权限一致 |

### 外部协作权限

**场景**：与外部合作伙伴协作

| 配置项 | 配置值 | 说明 |
|--------|---------|------|
| 外部角色 | Partners, Contractors | 仅查看和创建 Issue |
| 敏感字段 | 隐藏 | 不对外部显示如"成本"、"客户信息" |
| 评论权限 | 仅编辑自己的 | 外部人员无法编辑他人评论 |

## 验证检查

- [ ] 所有角色都已创建
- [ ] 权限矩阵配置正确
- [ ] 没有权限过度授予
- [ ] 敏感字段已保护
- [ ] 外部协作权限已限制
- [ ] 测试用户登录并验证权限

## 最佳实践

1. **最小权限原则**：只授予完成任务所需的最小权限
2. **基于角色的访问控制（RBAC）**：使用角色而非直接授予用户权限
3. **定期审查权限**：每季度审查一次权限，清理不再需要的权限
4. **敏感字段保护**：对敏感字段（如成本、客户信息）限制访问
5. **外部协作隔离**：外部人员使用独立角色，权限严格限制
6. **权限审计**：记录重要权限变更，定期审计
