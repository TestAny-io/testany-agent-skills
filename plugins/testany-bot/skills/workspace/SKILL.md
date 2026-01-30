---
name: workspace
description: Workspace organization in Testany - manage teams, access control, and resource grouping
---

# Testany Workspace Management

## What is a Workspace?

A **Workspace** in Testany is an organizational unit that:
- Groups related test cases, pipelines, and plans
- Controls access through role-based permissions
- Provides isolation for team-specific resources

## Workspace Roles

| Role | Permissions |
|------|-------------|
| **Owner** | Full control: manage members, delete workspace, all operations |
| **Admin** | Manage resources: create/edit/delete cases, pipelines, plans |
| **Member** | Execute: run tests, view results, limited editing |
| **Viewer** | Read-only: view cases, results, no modifications |

## Getting Workspace Information

### Your Workspaces

Use `testany_get_my_workspaces` to see workspaces you have access to:
- Returns workspace key, name, and your role in each

### Detailed Workspace Info

Use `testany_get_my_workspaces_with_roles` for comprehensive view:
- All workspace details including member counts
- Your specific permissions in each workspace

## Workspace Operations

### Requesting Access

Use `testany_request_workspace` to request joining a workspace:
- Requires workspace key
- Creates a pending request for workspace admin to approve

### User Management

| Operation | MCP Tool | Description |
|-----------|----------|-------------|
| Assign single user | `testany_assign_user_to_workspace` | Add one user with specific role |
| Assign multiple users | `testany_assign_users_to_workspace` | Bulk add users with same role |

### Assignment Example

```json
{
  "workspace_key": "ws-backend-team",
  "user_email": "developer@company.com",
  "role": "member"
}
```

## Workspace and Cases

Private cases are scoped to specific workspaces:

```
Workspace: ws-backend-team
├── Private Case: API Integration Tests
├── Private Case: Database Migration Tests
└── Private Case: Service Health Checks

Workspace: ws-frontend-team
├── Private Case: UI Component Tests
└── Private Case: E2E User Flow Tests

Global Cases (visible to all):
├── Smoke Tests
└── Regression Suite
```

## Common Workflows

### 1. Onboard a New Team Member

```
testany_get_my_workspaces → Identify target workspace
testany_assign_user_to_workspace → Add user with appropriate role
```

### 2. Set Up a New Team

```
1. Create workspace (via UI or admin)
2. testany_assign_users_to_workspace → Add team members
3. testany_create_case → Create private cases for the workspace
```

### 3. Check Your Access

```
testany_get_my_workspaces_with_roles → See all workspaces and your roles
testany_get_user_attributes → Get your user profile and permissions
```

## Best Practices

1. **Workspace Naming**: Use clear, descriptive names
   - By team: `backend-team`, `qa-team`, `mobile-team`
   - By project: `project-alpha`, `project-beta`
   - By environment: `dev-workspace`, `staging-workspace`

2. **Role Assignment**:
   - Start with minimal permissions (Viewer/Member)
   - Escalate to Admin only when needed
   - Reserve Owner for workspace leads

3. **Resource Organization**:
   - Keep related tests in the same workspace
   - Use global cases for cross-team shared tests
   - Use private cases for team-specific logic

4. **Access Reviews**:
   - Periodically review workspace memberships
   - Remove users who no longer need access

## Related Tools

| Tool | Purpose |
|------|---------|
| `testany_get_my_workspaces` | List your workspaces |
| `testany_get_my_workspaces_with_roles` | Detailed workspace info with roles |
| `testany_get_user_attributes` | Get your user profile |
| `testany_assign_user_to_workspace` | Add user to workspace |
| `testany_assign_users_to_workspace` | Bulk add users |
| `testany_request_workspace` | Request workspace access |
