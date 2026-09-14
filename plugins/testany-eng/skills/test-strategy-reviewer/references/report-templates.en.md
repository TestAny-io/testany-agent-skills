# Test Strategy Review Template

Every report and certificate must bind the reviewed object/version, scope, criteria, review mode (initial/delta/closeout), checked and unchecked coverage, and actual evidence. Keep stable issue IDs and separate kind (defect/evidence_gap/scope_decision/optional), severity, and approval impact. A pass requires no open P0/P1 and sufficient required evidence; P2 count does not block. Read [review assurance](../../../references/review-assurance.md).

## Review Report Template

```markdown
#Test Strategy Review Report

## Basic Information

| Project | Content |
|------|------|
| **Strategy Documentation** | {path} |
| **PRD Baseline** | {path} v{version} |
| **API Contract Baseline** | {path} v{version} |
| **HLD Baseline** | {path} v{version} |
| **Guardrails** | {path} / N/A |
| **Review Round** | Round {N} |
| **Review Conclusion** | 🟢 Pass / 🔴 Fail |

## Script verification summary

| Check | Command | Result | Notes |
|------|------|------|------|
| Lint | `python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json {strategy_path}` | PASS/FAIL | {critical issue/none} |
| RTM aggregation | `python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json {prd_path} {strategy_path}` | PASS / FAIL / NOT RUN / BLOCKED | {critical issue / none} |

## Problem statistics

| Level | Quantity | Threshold | Status |
|------|------|------|------|
| P0 | {n} | = 0 | ✅/❌ |
| P1 | {n} | = 0 | ✅/❌ |
| P2 | {n} | Non-blocking count | Recorded |

## Gate 1: Baseline and Range
- {Conclusion and Evidence}

## Gate 2: Risk coverage and independent test layering
- {Conclusion and Evidence}

## Gate 3: Environment/Data/Dependencies
- {Conclusion and Evidence}

## Gate 4: Access Control and Automation
- {Conclusion and Evidence}

## Question list

### P0
- {Question} (Evidence: {Location})

### P1
- {Question} (Evidence: {Location})
- {Missing staged execution rules / Mistaking subsequent stage access control as current stage failure / Substituting environment for stage definition} (evidence: {location})

### P2
- {Question} (Evidence: {Location})

## Release conclusion

- **Passed**: can be used as a baseline for `test-spec-writer`
or
- **Fail**: Review after repair
```

## Approval Certificate Template

```markdown
#✅ Test Strategy is certified

- **Strategy Documentation**: {path}
- **Baseline**: PRD/API/HLD/Guardrails
- **Review Round**: Round {N}
- **Conclusion**: Passed
- **Script verification**: `trace-lint` passed, `trace-build-rtm` had no build error
- **Phase Description**: The boundary between the exit of the current stage and the environmental-level access control in subsequent stages has been clarified
- **Note**: This test strategy can be used as the baseline for detailed test specifications and test case packages
```
