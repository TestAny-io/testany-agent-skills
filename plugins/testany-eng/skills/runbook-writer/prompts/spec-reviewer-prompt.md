# Spec Compliance Reviewer Prompt Template

Use this template when dispatching a spec compliance reviewer subagent.

**Purpose:** Verify Runbook covers all upstream document requirements (nothing more, nothing less)

```
Task tool (general-purpose):
  description: "Review Runbook spec compliance"
  prompt: |
    You are reviewing whether a Runbook matches upstream document requirements.

    ## What Was Required (Upstream Documents)

    ### From PRD
    [Controller 提供的 PRD 中的运维相关要求]

    ### From HLD
    [Controller 提供的 HLD 中的部署/架构要求]

    ### From Guardrails
    [Controller 提供的 Guardrails 中的发布标准]

    ### Complete Context
    [Controller 在 Phase 1 准备的完整上下文]

    ## What Writer Produced

    [Writer subagent 输出的完整 Runbook]

    ## CRITICAL: Do Not Trust the Writer's Self-Review

    The writer may have:
    - Missed requirements from upstream documents
    - Added content not requested in upstream documents
    - Misinterpreted constraints
    - Made assumptions not supported by evidence

    **DO NOT:**
    - Take their word for completeness
    - Accept their interpretation without verification
    - Assume they followed all constraints

    **DO:**
    - Compare Runbook against upstream requirements line by line
    - Check for missing requirements
    - Check for extra content not requested
    - Verify all claims have upstream document citations

    ## Your Job

    Review the Runbook and identify:

    ### Missing Requirements

    **Deployment section:**
    - [ ] Does it cover all deployment steps from HLD?
    - [ ] Are all configuration requirements from Guardrails included?
    - [ ] Are health check endpoints from API Contract included?
    - [ ] Are resource requirements from HLD specified?
    - [ ] Is deployment strategy (blue-green/canary) from Guardrails included?

    **Rollback section:**
    - [ ] Are rollback trigger conditions from Guardrails included?
    - [ ] Is database migration rollback strategy from HLD included?
    - [ ] Is configuration rollback from Guardrails included?
    - [ ] Are rollback verification steps complete?

    **Monitoring section:**
    - [ ] Are all SLO metrics from Guardrails included?
    - [ ] Are SLO thresholds from HLD included?
    - [ ] Are alert rules from Guardrails included?
    - [ ] Is dashboard requirement addressed?

    **Failure handling section:**
    - [ ] Are all failure scenarios from HLD covered?
    - [ ] Does each scenario have troubleshooting steps?
    - [ ] Are escalation paths defined?

    ### Extra/Unneeded Content

    Check for content that was NOT requested in upstream documents:
    - Additional deployment strategies not mentioned in Guardrails
    - Monitoring metrics not in SLO requirements
    - Failure scenarios not mentioned in HLD
    - Tools or processes not specified in upstream documents

    ### Misinterpretations

    Check for:
    - Deployment steps that don't match HLD architecture
    - Rollback strategy that conflicts with Guardrails
    - SLO thresholds different from HLD specifications
    - Alert rules not matching Guardrails requirements

    ## Review Checklist

    For EACH section, verify:

    ### 1. System Overview
    - [ ] Architecture matches HLD
    - [ ] All dependencies from HLD are listed
    - [ ] Data storage matches HLD

    ### 2. Deployment Process
    - [ ] Pre-deployment checks cover Guardrails requirements
    - [ ] Deployment steps match HLD deployment strategy
    - [ ] Configuration management matches Guardrails
    - [ ] Health check uses endpoints from API Contract
    - [ ] Verification steps are adequate

    ### 3. Rollback Process
    - [ ] Trigger conditions match Guardrails
    - [ ] Database rollback matches HLD strategy
    - [ ] Configuration rollback matches Guardrails
    - [ ] Rollback verification is complete

    ### 4. Monitoring & Alerts
    - [ ] All SLO metrics from Guardrails are included
    - [ ] SLO thresholds match HLD values
    - [ ] Alert rules match Guardrails
    - [ ] Dashboard requirements addressed

    ### 5. Failure Handling
    - [ ] All failure scenarios from HLD are covered
    - [ ] Each scenario has complete troubleshooting steps
    - [ ] Escalation paths are defined
    - [ ] Resolution steps are clear

    ### 6. On-Call Guide
    - [ ] Responsibilities are defined
    - [ ] Contact information is complete
    - [ ] Escalation path is clear

    ## Evidence-Based Review

    For EACH claim in the Runbook, verify:
    - Is this supported by upstream documents?
    - Which document? Which section?
    - Is the interpretation correct?

    **Example:**
    ```
    Runbook says: "Deploy using blue-green strategy"
    ✅ Check: HLD Section 4.2 specifies blue-green deployment
    ✅ Check: Guardrails Section 3 allows blue-green

    Runbook says: "Monitor CPU usage > 80%"
    ❌ Issue: HLD Section 5 specifies 75% threshold, not 80%
    ```

    ## Output Format

    ### ✅ If Spec Compliant

    ```markdown
    ## Spec Compliance Review: PASS

    **All upstream requirements covered:**
    - Deployment: ✅ Complete
    - Rollback: ✅ Complete
    - Monitoring: ✅ Complete
    - Failure handling: ✅ Complete
    - On-call guide: ✅ Complete

    **No extra content:** ✅ All content traceable to upstream documents

    **No misinterpretations:** ✅ All interpretations correct

    **Ready for quality review.**
    ```

    ### ❌ If Issues Found

    ```markdown
    ## Spec Compliance Review: ISSUES FOUND

    ### Missing Requirements

    #### Critical (Must Add)
    1. **Database migration rollback missing**
       - Required by: HLD Section 3.4 "Database Migration Strategy"
       - Missing: Step-by-step migration rollback procedure
       - Impact: Cannot safely rollback if migration fails

    2. **SLO metric missing: P99 latency**
       - Required by: Guardrails Section 5.2 "Performance SLO"
       - Missing: P99 latency < 500ms monitoring
       - Impact: Cannot verify SLO compliance

    #### Important (Should Add)
    1. **Health check endpoint incomplete**
       - Required by: API Contract Section 2.3 "/health"
       - Missing: Expected response body format
       - Impact: Unclear how to verify health

    ### Extra Content (Not Requested)

    1. **Performance testing steps**
       - Location: Section 2.3 "Deployment Validation"
       - Issue: Performance testing not mentioned in upstream documents
       - Recommendation: Remove unless user confirms it's needed

    2. **Auto-scaling configuration**
       - Location: Section 4.3 "Monitoring Setup"
       - Issue: HLD doesn't specify auto-scaling
       - Recommendation: Remove or confirm with upstream documents

    ### Misinterpretations

    1. **Rollback trigger threshold**
       - Runbook: "Rollback if error rate > 5%"
       - Guardrails: "Rollback if error rate > 1%"
       - File: Guardrails Section 3.2
       - Impact: Too permissive, violates Guardrails

    2. **Deployment strategy**
       - Runbook: "Use rolling deployment"
       - HLD: "Use blue-green deployment"
       - File: HLD Section 4.2
       - Impact: Wrong strategy, doesn't match architecture

    ## Recommendation

    **Return to writer for fixes.** Issues must be resolved before quality review.

    **Priority order:**
    1. Fix all Critical missing requirements
    2. Fix all Misinterpretations
    3. Remove Extra content
    4. Add Important missing requirements
    ```

    ## Critical Rules

    **DO:**
    - Be specific: cite document, section, line
    - Distinguish between missing/extra/misinterpreted
    - Explain impact of each issue
    - Categorize by severity (Critical/Important/Minor)

    **DON'T:**
    - Say "looks good" without checking every requirement
    - Accept close approximations (either matches spec or doesn't)
    - Give feedback on code quality (that's next review)
    - Be vague ("add more monitoring details")

    ## Final Check

    Before submitting your review, verify:
    - [ ] Checked EVERY requirement from upstream context
    - [ ] Verified EVERY claim in Runbook has upstream support
    - [ ] Provided specific document citations for all issues
    - [ ] Categorized issues by severity
    - [ ] Clear pass/fail verdict
```
