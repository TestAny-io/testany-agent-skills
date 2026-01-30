---
name: plan
description: Test plan scheduling in Testany - automate recurring test execution with cron-based schedules
---

# Testany Test Plan Scheduling

## What is a Plan?

A **Plan** in Testany is a scheduling unit that:
- Triggers pipeline execution automatically
- Supports cron-based schedules (hourly, daily, weekly, custom)
- Enables continuous testing and monitoring

## Plan Structure

```
Plan: Nightly Regression
├── Schedule: 0 2 * * * (2 AM daily)
├── Pipeline: Full Regression Suite
├── Environment: staging
└── Parameters: { "parallel": true }
```

## Plan Operations

### Listing Plans

Use `testany_list_plans` with filters:

| Filter | Description |
|--------|-------------|
| `workspace` | Filter by workspace key |
| `keyword` | Search in plan name |
| `status` | Filter by status (active/inactive) |

### Getting Plan Details

Use `testany_get_plan` to retrieve:
- Schedule configuration (cron expression)
- Associated pipeline
- Execution parameters
- Next scheduled run
- Recent execution history

## Creating Plans

Use `testany_create_plan`:

```json
{
  "name": "Nightly Smoke Tests",
  "pipeline_key": "pl-smoke-suite",
  "cron_expression": "0 0 * * *",
  "environment": "staging",
  "workspace_keys": ["ws-qa-team"],
  "is_private": true,
  "parameters": {
    "timeout": "60000",
    "retries": "2"
  }
}
```

## Cron Expression Reference

| Expression | Meaning |
|------------|---------|
| `0 * * * *` | Every hour at minute 0 |
| `0 0 * * *` | Daily at midnight |
| `0 2 * * *` | Daily at 2 AM |
| `0 0 * * 1` | Weekly on Monday at midnight |
| `0 0 1 * *` | Monthly on the 1st at midnight |
| `*/15 * * * *` | Every 15 minutes |
| `0 9-17 * * 1-5` | Hourly 9 AM-5 PM, Mon-Fri |

### Cron Format

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *
```

## Managing Plans

### Updating Plans

Use `testany_update_plan` to modify:
- Schedule (cron expression)
- Pipeline reference
- Parameters
- Status (enable/disable)

### Enabling/Disabling Plans

Toggle plan execution:
- `testany_enable_plan` - Activate scheduled execution
- `testany_disable_plan` - Pause without deleting

### Deleting Plans

Use `testany_delete_plan`:
- Removes schedule definition
- Does not affect the associated pipeline
- Historical executions remain

## Plan Visibility

| Type | `is_private` | Visibility |
|------|-------------|------------|
| **Global** | `false` | Organization-wide |
| **Private** | `true` | Specified workspaces only |

## Common Workflows

### 1. Set Up Continuous Testing

```
testany_list_pipelines → Find or create target pipeline
testany_create_plan → Create scheduled plan
testany_enable_plan → Activate schedule
```

### 2. Pause Testing During Maintenance

```
testany_list_plans → Find active plans
testany_disable_plan → Pause execution
# After maintenance
testany_enable_plan → Resume execution
```

### 3. Adjust Schedule Frequency

```
testany_get_plan → Check current schedule
testany_update_plan → Update cron expression
```

### 4. Monitor Scheduled Runs

```
testany_list_plans → See plan list with status
testany_get_plan → Get specific plan with history
testany_get_execution → Check recent execution details
```

## Best Practices

1. **Schedule Timing**:
   - Run heavy tests during off-peak hours
   - Avoid scheduling conflicts with deployments
   - Consider timezone implications

2. **Environment Selection**:
   - Use staging/dev for frequent runs
   - Run production tests less frequently
   - Match schedule to environment stability

3. **Common Schedules**:
   | Type | Suggested Schedule |
   |------|-------------------|
   | Smoke tests | Every 2-4 hours |
   | Regression | Daily (overnight) |
   | Performance | Weekly (low-traffic) |
   | Security scan | Weekly/Monthly |

4. **Plan Naming**:
   - Include frequency: `daily-smoke`, `weekly-regression`
   - Include environment: `staging-nightly`, `prod-hourly`

5. **Alerting**:
   - Configure notifications for failures
   - Set up escalation for repeated failures

## Plan vs Manual Pipeline Execution

| Aspect | Plan (Scheduled) | Manual Execution |
|--------|------------------|------------------|
| Trigger | Automatic (cron) | User-initiated |
| Use case | Continuous testing | Ad-hoc validation |
| Parameters | Predefined | Can override |
| Consistency | Same every run | May vary |

## Related Tools

| Tool | Purpose |
|------|---------|
| `testany_list_plans` | Search and filter plans |
| `testany_get_plan` | Get plan details |
| `testany_create_plan` | Create new plan |
| `testany_update_plan` | Modify plan |
| `testany_delete_plan` | Remove plan |
| `testany_enable_plan` | Activate plan |
| `testany_disable_plan` | Pause plan |
| `testany_execute_pipeline` | Manual pipeline run |
