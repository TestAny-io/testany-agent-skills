# Review Report Template

Every report and certificate must bind the reviewed object/version, scope, criteria, review mode (initial/delta/closeout), checked and unchecked coverage, and actual evidence. Keep stable issue IDs and separate kind (defect/evidence_gap/scope_decision/optional), severity, and approval impact. A pass requires no open P0/P1 and sufficient required evidence; P2 count does not block. Read [review assurance](../../../references/review-assurance.md).

## Baseline Collection Report

- Contract/Index：
- PRD baseline:
- Boundary/Ownership Confirmation:
- Agreement type:
- Lint/Automation Check: Executed/Not Executed (reason)
- Conclusion: Blocked by Gate 0 / P0

---

## Review report (failed)

- Conclusion: Failed (P0: x, P1: y, P2: z)
- Contract version:
- PRD baseline:
- Gate results: Gate1/2/3/4

| Severity | Problem | Evidence Location | Impact | Recommended Fix |
|--------|------|----------|------|----------|
| P0 |  |  |  |  |

---

## Certificate of approval (passed)

- Conclusion: Passed (P0:0, P1:0, required evidence sufficient; P2 count non-blocking)
- Contract version:
- PRD baseline:
- Gate results: Gate1/2/3/4
- Residual P2:
- Reviewer：
