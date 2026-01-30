---
name: gatekeeper
description: Gatekeeper quality gates in Testany - automated deployment controls based on test results
---

# Testany Gatekeeper (Quality Gates)

## What is a Gatekeeper?

A **Gatekeeper** in Testany is an automated quality gate that:
- Blocks deployments when tests fail
- Integrates with CI/CD pipelines
- Enforces quality standards before releases
- Provides pass/fail signals to deployment systems

## Gatekeeper Workflow

```
Code Change → CI Pipeline → Run Tests → Gatekeeper Check → Deploy/Block
                                              │
                                    ┌─────────┴─────────┐
                                    │                   │
                                  PASS               FAIL
                                    │                   │
                              Deploy allowed      Deploy blocked
```

## Gatekeeper Structure

```
Gatekeeper: Production Deploy Gate
├── Pipeline: Full Regression Suite
├── Pass Threshold: 95%
├── Status: Enabled
└── Webhook: https://ci.example.com/gate
```

## Gatekeeper Operations

### Listing Gatekeepers

Use `testany_list_gatekeepers` with filters:

| Filter | Description |
|--------|-------------|
| `workspace` | Filter by workspace key |
| `keyword` | Search in gatekeeper name |
| `status` | Filter by status (enabled/disabled) |

### Getting Gatekeeper Details

Use `testany_get_gatekeeper` to retrieve:
- Associated pipeline
- Pass/fail threshold
- Current status
- Integration configuration
- Recent gate decisions

## Creating Gatekeepers

Use `testany_create_gatekeeper`:

```json
{
  "name": "Staging Deploy Gate",
  "pipeline_key": "pl-smoke-tests",
  "workspace_key": "ws-devops",
  "pass_threshold": 100,
  "webhook_url": "https://ci.example.com/gates/staging"
}
```

### Threshold Configuration

| Threshold | Meaning |
|-----------|---------|
| `100` | All tests must pass |
| `95` | 95% of tests must pass |
| `0` | Advisory only (never blocks) |

## Managing Gatekeepers

### Enabling/Disabling

Toggle gatekeeper enforcement:
- `testany_enable_gatekeeper` - Activate blocking
- `testany_disable_gatekeeper` - Pause without deleting (deploys always allowed)

### Updating Configuration

Use `testany_update_gatekeeper` to modify:
- Associated pipeline
- Pass threshold
- Webhook configuration
- Name and description

### Deleting Gatekeepers

Use `testany_delete_gatekeeper`:
- Removes gate definition
- CI/CD integration stops working
- Historical decisions remain

## Integration with CI/CD

### Typical Integration Flow

1. CI pipeline triggers test execution via API
2. Tests run against gatekeeper's pipeline
3. Gatekeeper evaluates pass rate
4. Result sent to webhook (pass/fail)
5. CI pipeline proceeds or blocks based on result

### Webhook Payload (Example)

```json
{
  "gatekeeper": "production-gate",
  "decision": "PASS",
  "pass_rate": 98.5,
  "threshold": 95,
  "execution_id": "exec-12345",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Common Workflows

### 1. Set Up Deployment Gate

```
testany_list_pipelines → Find or create test pipeline
testany_create_gatekeeper → Create quality gate
testany_enable_gatekeeper → Activate enforcement
# Configure CI/CD to call gatekeeper
```

### 2. Temporary Bypass for Hotfix

```
testany_list_gatekeepers → Find blocking gate
testany_disable_gatekeeper → Temporarily disable
# Deploy hotfix
testany_enable_gatekeeper → Re-enable gate
```

### 3. Adjust Quality Threshold

```
testany_get_gatekeeper → Check current threshold
testany_update_gatekeeper → Update pass_threshold
```

### 4. Investigate Gate Failure

```
testany_get_gatekeeper → Get recent decisions
testany_get_execution → Check failed execution
testany_get_execution_case → Find failing test case
```

## Best Practices

1. **Threshold Strategy**:
   - Production: 100% (critical path must pass)
   - Staging: 95-100% (allow minor flakiness)
   - Dev: 80-90% (faster iteration)

2. **Pipeline Selection**:
   - Use smoke tests for fast feedback
   - Use full regression for production gates
   - Keep gate tests reliable (no flaky tests)

3. **Naming Convention**:
   - `[env]-deploy-gate`: `staging-deploy-gate`, `prod-deploy-gate`
   - `[service]-gate`: `api-gate`, `frontend-gate`

4. **Monitoring**:
   - Track gate pass/fail rates
   - Alert on repeated failures
   - Review threshold effectiveness

5. **Bypass Procedures**:
   - Document emergency bypass process
   - Log all bypass decisions
   - Require approval for production bypass

## Gatekeeper Status

| Status | Behavior |
|--------|----------|
| **Enabled** | Evaluates tests, sends pass/fail |
| **Disabled** | Always returns pass (bypass mode) |

## Gatekeeper vs Plan

| Aspect | Gatekeeper | Plan |
|--------|------------|------|
| Trigger | CI/CD integration | Time-based schedule |
| Purpose | Block/allow deployments | Continuous testing |
| Output | Pass/fail decision | Execution results |
| Use case | Release gates | Monitoring |

## Related Tools

| Tool | Purpose |
|------|---------|
| `testany_list_gatekeepers` | Search and filter gatekeepers |
| `testany_get_gatekeeper` | Get gatekeeper details |
| `testany_create_gatekeeper` | Create new gatekeeper |
| `testany_update_gatekeeper` | Modify gatekeeper |
| `testany_delete_gatekeeper` | Remove gatekeeper |
| `testany_enable_gatekeeper` | Activate gate enforcement |
| `testany_disable_gatekeeper` | Pause gate (always pass) |
| `testany_get_execution` | Check gate execution results |
