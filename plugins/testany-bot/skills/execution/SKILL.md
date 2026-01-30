---
name: execution
description: Test execution monitoring in Testany - view results, analyze failures, and track test runs
---

# Testany Test Execution Management

## What is an Execution?

An **Execution** in Testany represents a single test run that:
- Contains results from one or more test cases
- Tracks status (pending, running, passed, failed)
- Provides detailed logs and metrics
- Links back to the triggering pipeline or plan

## Execution Lifecycle

```
PENDING → RUNNING → COMPLETED
                       │
              ┌────────┴────────┐
              │                 │
           PASSED            FAILED
```

## Execution Structure

```
Execution: exec-12345
├── Status: COMPLETED
├── Result: FAILED
├── Duration: 5m 32s
├── Pipeline: Full Regression Suite
├── Environment: staging
└── Cases:
    ├── Case 1: Login Test - PASSED (12s)
    ├── Case 2: Cart Test - PASSED (45s)
    └── Case 3: Payment Test - FAILED (2m 15s)
```

## Viewing Executions

### List Executions

Use `testany_list_executions` with filters:

| Filter | Description |
|--------|-------------|
| `workspace` | Filter by workspace key |
| `pipeline_key` | Filter by pipeline |
| `status` | Filter by status |
| `date_from` | Start date range |
| `date_to` | End date range |

### Get Execution Details

Use `testany_get_execution` to retrieve:
- Overall status and result
- Duration and timing
- Environment and parameters
- Summary of case results

### Get Individual Case Results

Use `testany_get_execution_case` to retrieve:
- Detailed case execution result
- Logs and output
- Assertions and failures
- Screenshots (if applicable)

## Execution Operations

### Refreshing Execution Status

Use `testany_refresh_execution` to:
- Force status update from executor
- Useful for stuck executions
- Updates cached status

### Typical Result Structure

```json
{
  "execution_id": "exec-12345",
  "status": "COMPLETED",
  "result": "FAILED",
  "started_at": "2024-01-15T10:00:00Z",
  "completed_at": "2024-01-15T10:05:32Z",
  "duration_ms": 332000,
  "pipeline_key": "pl-regression",
  "environment": "staging",
  "cases": [
    {
      "case_key": "case-login",
      "status": "PASSED",
      "duration_ms": 12000
    },
    {
      "case_key": "case-payment",
      "status": "FAILED",
      "duration_ms": 135000,
      "error": "AssertionError: Expected status 200, got 500"
    }
  ]
}
```

## Execution Statuses

| Status | Meaning |
|--------|---------|
| `PENDING` | Execution queued, not started |
| `RUNNING` | Tests currently executing |
| `COMPLETED` | Execution finished (check result) |
| `CANCELLED` | Execution was cancelled |
| `TIMEOUT` | Execution exceeded time limit |

## Execution Results

| Result | Meaning |
|--------|---------|
| `PASSED` | All cases passed |
| `FAILED` | One or more cases failed |
| `ERROR` | Execution error (infrastructure) |
| `SKIPPED` | Execution was skipped |

## Common Workflows

### 1. Monitor Running Execution

```
testany_execute_pipeline → Get execution_id
testany_get_execution → Check status
# Repeat until COMPLETED
testany_get_execution → Get final results
```

### 2. Investigate Failed Execution

```
testany_get_execution → Get execution summary
# Find failed cases
testany_get_execution_case → Get detailed failure info
# Review logs and error messages
```

### 3. Find Recent Failures

```
testany_list_executions → Filter by status=FAILED, recent date
testany_get_execution → Review each failure
```

### 4. Check Pipeline Health

```
testany_list_executions → Filter by pipeline_key, last 7 days
# Calculate pass rate from results
```

### 5. Troubleshoot Stuck Execution

```
testany_get_execution → Check if status is stuck
testany_refresh_execution → Force status update
testany_get_execution → Verify updated status
```

### 6. View Case Execution Logs

**IMPORTANT: When a user asks to "view logs" or "check logs", you MUST fetch and display the actual log content. Do NOT just show the user how to access logs - fetch them yourself!**

To view the raw stdout/stderr logs from a case execution:

```
Step 1: testany_get_execution
        → Get execution details including cases array
        → Extract: runtime_uuid from the failed/target case

Step 2: testany_log_sign
        → Input: executionKey, caseIndex (0-based index of the case)
        → Output: sign (JWT token for log access)

Step 3: Fetch logs using curl (YOU MUST DO THIS STEP!)
        → Use Bash tool with curl to fetch the actual logs
        → URL format: https://{runtime_uuid}.tr.{domain}/api/v2/logproxy/internal/view
        → The {domain} is extracted from your MCP server URL (e.g., if MCP URL is https://dev.testany.com.cn/api/v2/mcp/, then domain is dev.testany.com.cn)
        → The operator ID (X-Operator-Id) is the user's email from context
```

**How to determine the domain:**
- Check the Testany MCP server URL shown in `/mcp` command output
- The URL field shows something like: `https://dev.testany.com.cn/api/v2/mcp/`
- Extract just the host part: `dev.testany.com.cn`
- Common domains:
  - `dev.testany.com.cn` - Development environment
  - `staging.testany.com.cn` - Staging environment
  - `testany.com.cn` - Production environment
- The log proxy URL pattern is: `https://{runtime_uuid}.tr.{domain}/api/v2/logproxy/internal/view`
- **IMPORTANT:** Do NOT use `testany.io` - that is NOT a valid domain for log proxy!

**Complete Example (you must follow all steps):**

```bash
# Step 1: Get execution details (optional - testany_log_sign now includes this)
testany_get_execution("WKS-0601-12345")

# Step 2: Get sign and full log URL
testany_log_sign("WKS-0601-12345", 0)
# Response now includes everything you need:
# {
#   "sign": "eyJhbGciOiJS...",
#   "logUrl": "https://81c91231-1b55-4e0a-ac12-80b3ad3fd372.tr.dev.testany.com.cn/api/v2/logproxy/internal/view",
#   "operatorId": "user@example.com",
#   "curlCommand": "curl -s -H \"X-Sign: ...\" -H \"X-Operator-Id: ...\" \"https://...\""
# }

# Step 3: MUST fetch logs - just copy and run the curlCommand from Step 2!
# The curlCommand is ready to use, just execute it with Bash tool
```

**Critical Rules:**
1. **ALWAYS fetch logs automatically** - never tell the user to do it themselves
2. `testany_log_sign` now returns the complete `curlCommand` - just execute it!
3. The `logUrl` and `operatorId` are already included in the response
4. Display the log content clearly, highlighting errors or failures

## Analyzing Failures

### Failure Categories

| Category | Description | Action |
|----------|-------------|--------|
| **Assertion** | Test logic failure | Review test case code |
| **Timeout** | Execution too slow | Check performance/infrastructure |
| **Error** | Runtime exception | Review logs, check dependencies |
| **Infrastructure** | Environment issue | Check test environment health |

### Debugging Steps

1. **Get execution summary** - `testany_get_execution`
2. **Identify failed cases** - Look at case list
3. **Get case details** - `testany_get_execution_case`
4. **Review error message** - Understand failure type
5. **Check logs** - Look for root cause
6. **Fix and re-run** - Update case, execute again

## Best Practices

1. **Regular Monitoring**:
   - Check daily execution summaries
   - Set up alerts for failures
   - Track pass rate trends

2. **Failure Triage**:
   - Categorize failures by type
   - Prioritize flaky test fixes
   - Document known issues

3. **Execution Naming**:
   - Include timestamp in analysis
   - Track by pipeline for comparison
   - Note environment for context

4. **Result Retention**:
   - Archive important executions
   - Clean up old failed attempts
   - Keep baseline comparisons

5. **Performance Tracking**:
   - Monitor execution duration
   - Identify slow tests
   - Optimize critical path

## Execution Triggers

| Source | Description |
|--------|-------------|
| **Manual** | User-initiated via `testany_execute_pipeline` |
| **Plan** | Scheduled via plan cron |
| **Gatekeeper** | CI/CD integration |
| **API** | External system call |

## Related Tools

| Tool | Purpose |
|------|---------|
| `testany_list_executions` | Search and filter executions |
| `testany_get_execution` | Get execution summary with cases array |
| `testany_get_execution_case` | Get specific case details (index, runtime_uuid) |
| `testany_log_sign` | Get signed token for viewing case logs |
| `testany_refresh_execution` | Force status update |
| `testany_execute_pipeline` | Trigger new execution |
| `testany_get_pipeline` | View pipeline configuration |
