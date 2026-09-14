# Review Report Template

Every report and certificate must bind the reviewed object/version, scope, criteria, review mode (initial/delta/closeout), checked and unchecked coverage, and actual evidence. Keep stable issue IDs and separate kind (defect/evidence_gap/scope_decision/optional), severity, and approval impact. A pass requires no open P0/P1 and sufficient required evidence; P2 count does not block. Read [review assurance](../../../references/review-assurance.md).

## Baseline identification results

- Guardrails path:
- Action types: `create_baseline` / `update_impacted_domains` / `restructure` / `no_change`
- Generate modes: `interview_first` / `repository_scan_first` / N/A
- Scope of application:
- Trigger reason:
- Conclusion: Can continue / Evidence pending / Scope decision / Confirmed defect blocks

---

## Review report (failed)

- Conclusion: Failed (P0: x, P1: y, P2: z)
- Guardrails version:
- Action type:
- Build mode:
- Review Gate: Gate1/Gate2/Gate3/Gate4/Gate5

### De facto standards and conflict summary

- Key facts:
- Declarative standards:
- Conflict/drift:
- Adequacy of treatment:

### Summary of Downstream Impacts

- Affected areas:
- Downstream documents/skills that need to be reviewed:
- Blocking suggestions:

| Severity | Gate | Problem | Evidence Location | Impact | Recommended Fix |
|--------|------|------|----------|------|----------|
| P0 | Gate2 |  |  |  |  |

---

## Certificate of approval (passed)

- Conclusion: Passed (P0:0, P1:0, required evidence sufficient; P2 count non-blocking)
- Guardrails version:
- Action type:
- Build mode:
- Reviewer：

### Confirmation of departure

- Trigger judgment established: Yes / No
- Factual criterion sufficient: Yes / No / N/A
- Rule enforceable: Yes / No
- Downstream workflow hooks complete: Yes/No
- Can be used as a project governance baseline for downstream consumption: Yes / No

### Summary of Downstream Impacts

- Affected areas:
- Downstream documents/skills that need to be reviewed:
- Blocking suggestions:
- Residual P2:
