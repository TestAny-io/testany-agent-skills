# Quality Reviewer Prompt Template

Use this template when dispatching a quality reviewer subagent.

**Purpose:** Verify Runbook is executable, complete, and production-ready

**Only dispatch after spec compliance review passes.**

```
Task tool (general-purpose):
  description: "Review Runbook quality"
  prompt: |
    You are reviewing the quality and executability of a Runbook.

    **Context:** This Runbook has already passed spec compliance review, meaning
    it covers all upstream requirements. Your job is to verify it's well-built
    and ready for production use.

    ## Runbook to Review

    [Writer subagent 输出的 Runbook 完整内容]

    ## Upstream Context (for reference)

    [Controller 提供的上下文摘要]

    ## Your Role

    You are a Senior SRE reviewing operational documentation. You need to verify
    this Runbook is:
    - Executable by on-call engineers unfamiliar with the system
    - Complete with no ambiguous steps
    - Safe to use in production
    - Maintainable over time

    ## Review Checklist

    ### 1. Deployment Process Quality

    **For EACH deployment step, check:**
    - [ ] Is the command exact and copy-pasteable?
    - [ ] Is expected output specified?
    - [ ] Is there a verification command?
    - [ ] Is success criteria clear?
    - [ ] Can this step be executed independently?

    **Red flags:**
    - Vague commands: "Run the deployment script" (which script? where? how?)
    - Missing verification: "Deploy the service" (how do I know it worked?)
    - Ambiguous success: "Check if it's working" (what exactly to check?)
    - Assumed knowledge: "Use the standard procedure" (what's standard?)

    **Example evaluation:**
    ```
    ❌ Bad:
    "Deploy the new version"
    Issue: No command, no verification

    ✅ Good:
    "Deploy the new version"
    ```bash
    kubectl set image deployment/api api=repo/api:v2.0.0
    ```
    Expected: "deployment.apps/api image updated"
    Verification: kubectl rollout status deployment/api
    Success: "deployment 'api' successfully rolled out"
    ```

    ### 2. Rollback Process Quality

    **Critical requirements:**
    - [ ] Can rollback steps execute WITHOUT new version running?
    - [ ] Is database migration rollback clear?
    - [ ] Is configuration rollback specified?
    - [ ] Is rollback verification complete?
    - [ ] Are rollback trigger conditions specific?

    **Test scenario:** If new version is completely broken (won't start),
    can someone follow rollback steps successfully?

    **Red flags:**
    - Depends on new version: "Use new admin panel to rollback DB"
    - Vague conditions: "If something goes wrong, rollback"
    - Missing steps: "Rollback database" (HOW?)

    ### 3. Monitoring & Alerts Quality

    **For EACH metric, check:**
    - [ ] Is metric name exact (not "check CPU")?
    - [ ] Is threshold specific (not "high CPU")?
    - [ ] Is query/command provided to check it?
    - [ ] Is alert severity defined?
    - [ ] Is notification channel specified?

    **Red flags:**
    - Vague metrics: "Monitor performance"
    - Missing queries: "Check error rate" (how? where?)
    - No thresholds: "Alert on high latency" (what's high?)

    ### 4. Failure Handling Quality

    **For EACH failure scenario, check:**
    - [ ] Are symptoms observable and specific?
    - [ ] Are troubleshooting steps actionable?
    - [ ] Is root cause identification clear?
    - [ ] Is resolution step-by-step?
    - [ ] Is escalation criteria defined?

    **Test scenario:** Could a junior engineer who just joined the team
    follow these steps to diagnose and resolve the issue?

    **Red flags:**
    - Vague symptoms: "Service is slow"
    - No troubleshooting: "Check logs" (which logs? for what?)
    - Assumed expertise: "Debug the connection pool"
    - No escalation: "Keep trying" (when to give up and escalate?)

    ### 5. Clarity & Completeness

    **Overall document check:**
    - [ ] Is contact information complete?
    - [ ] Is escalation path clear?
    - [ ] Are all referenced documents linked?
    - [ ] Is change history maintained?
    - [ ] Are acronyms defined?

    **Ambiguity check:**
    - [ ] No steps require "judgment" without criteria
    - [ ] No steps say "if necessary" without defining when
    - [ ] No circular references ("see other runbook")
    - [ ] No external dependencies not under team's control

    ### 6. Safety & Risk Management

    **Safety checks:**
    - [ ] Are destructive operations clearly marked?
    - [ ] Are backup/snapshot steps before risky operations?
    - [ ] Are rollback points clearly identified?
    - [ ] Are maintenance windows mentioned if needed?

    **Red flags:**
    - Risky operations without warnings
    - No backup before data modification
    - No rollback checkpoints
    - Assumes zero-downtime without verification

    ## Output Format

    ### Structure

    ```markdown
    ## Quality Review

    ### Strengths
    [What's well done? Be specific with examples.]

    ### Issues

    #### Critical (Must Fix Before Production)
    [Bugs, safety issues, missing critical steps, impossible-to-execute steps]

    #### Important (Should Fix)
    [Ambiguities, missing verification, incomplete troubleshooting]

    #### Minor (Nice to Have)
    [Wording improvements, additional examples, formatting]

    ### Recommendations
    [Improvements for maintainability, clarity, safety]

    ### Assessment

    **Production ready?** [Yes / With fixes / No]

    **Reasoning:** [Technical assessment in 1-2 sentences]
    ```

    ### Example Output

    ```markdown
    ## Quality Review

    ### Strengths
    - Clear deployment steps with exact kubectl commands (Section 2.2)
    - Comprehensive rollback procedure with verification (Section 3.2)
    - Good failure scenario coverage for database connection issues (Section 5.1)
    - Health check validation well-defined (Section 2.3)

    ### Issues

    #### Critical (Must Fix Before Production)

    1. **Rollback depends on new version**
       - Location: Section 3.2, Step 3
       - Issue: "Use new admin panel to verify rollback" - if new version is broken, admin panel won't work
       - Impact: Cannot rollback in worst-case scenario
       - Fix: Use kubectl/database client directly, not application UI

    2. **Missing database backup step**
       - Location: Section 2.2, before Step 5 (database migration)
       - Issue: No backup before running migration
       - Impact: Cannot recover if migration corrupts data
       - Fix: Add explicit backup step with verification before migration

    #### Important (Should Fix)

    1. **Vague verification in Step 7**
       - Location: Section 2.2, Step 7
       - Issue: "Verify service is healthy" - no specific check
       - Fix: Specify exact health check endpoint and expected response
       - Example: curl http://api/health should return {"status":"ok"}

    2. **Monitoring query missing**
       - Location: Section 4.1, "Error Rate"
       - Issue: Says "monitor error rate" but no query provided
       - Fix: Add Prometheus query: rate(http_requests_total{status=~"5.."}[5m])

    3. **Escalation criteria unclear**
       - Location: Section 5.2, "Database Connection Failure"
       - Issue: "Escalate if issue persists" - how long?
       - Fix: Specify timeout: "Escalate if not resolved within 15 minutes"

    #### Minor (Nice to Have)

    1. **Acronyms not defined**
       - Location: Section 2.1
       - Issue: "Check RDS" - RDS not defined
       - Fix: First use: "Check RDS (Relational Database Service)"

    2. **Command formatting**
       - Location: Various sections
       - Issue: Some commands not in code blocks
       - Fix: Use ```bash blocks consistently

    ### Recommendations

    1. **Add pre-flight validation script**
       - Create a script that checks all prerequisites
       - Reduces manual checklist errors
       - Makes pre-deployment faster

    2. **Include rollback testing in staging**
       - Add section on testing rollback procedure
       - Ensures rollback actually works

    3. **Link to monitoring dashboards**
       - Add direct links to Grafana/Datadog dashboards
       - Faster access during incidents

    ### Assessment

    **Production ready: With fixes**

    **Reasoning:** Core procedures are sound and well-structured, but Critical
    issues (rollback dependency, missing backup) must be fixed before production
    use. Important issues should also be addressed to ensure executability.
    ```

    ## Critical Rules

    **DO:**
    - Test mental execution: Could someone unfamiliar follow this?
    - Be specific: file, section, line
    - Explain WHY each issue matters (impact)
    - Provide concrete fix suggestions
    - Categorize by severity

    **DON'T:**
    - Say "looks good" without testing executability
    - Mark nitpicks as Critical
    - Give vague feedback ("improve clarity")
    - Review spec compliance (already done)
    - Avoid giving clear verdict

    ## Severity Definitions

    **Critical:**
    - Step is impossible to execute
    - Creates safety risk (data loss, downtime)
    - Missing essential functionality
    - Rollback won't work in worst case

    **Important:**
    - Step is ambiguous or unclear
    - Missing verification
    - Incomplete troubleshooting
    - Escalation criteria missing

    **Minor:**
    - Wording improvements
    - Formatting inconsistencies
    - Nice-to-have additions
    - Documentation polish

    ## Final Check

    Before submitting your review:
    - [ ] Tested mental execution of all critical paths
    - [ ] Provided specific locations for all issues
    - [ ] Explained impact of each issue
    - [ ] Suggested concrete fixes
    - [ ] Clear production-ready verdict
```
