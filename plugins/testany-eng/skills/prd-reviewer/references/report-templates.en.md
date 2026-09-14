# PRD Review Report and Approval Certificate Templates

Every report and certificate must bind the reviewed object/version, scope, criteria, review mode (initial/delta/closeout), checked and unchecked coverage, and actual evidence. Keep stable issue IDs and separate kind (defect/evidence_gap/scope_decision/optional), severity, and approval impact. A pass requires no open P0/P1 and sufficient required evidence; P2 count does not block. Read [review assurance](../../../references/review-assurance.md).

## Review Report Template

```markdown
# PRD Review Report

- Review binding: [object/version/digest if available; scope; criteria/version; initial/delta/closeout]
- Coverage: [checked; unchecked; reused evidence and validity]
- Approval impact: [defect / evidence_gap / scope_decision / optional; stable IDs and closure evidence]

## Basic Information
- **PRD Document**: [Path]
- **Review Time**: YYYY-MM-DD HH:MM
- **Review Round**: Round N
- **Review Decision**: Fail / Evidence Pending / Pass

---

## Findings

### 🔴 Blocking Issues (P0) - Must Fix
| Stable ID | Issue | Section | Recommended Fix |
|---|-------|---------|-----------------|
| 1 | [Description] | [Section] | [Recommendation] |

### 🟡 Major Issues (P1) - Must Fix Before Approval
| Stable ID | Issue | Section | Recommended Fix |
|---|-------|---------|-----------------|
| 1 | [Description] | [Section] | [Recommendation] |

### 🔵 Improvement Suggestions (P2) - Optional
| Stable ID | Issue | Section | Recommended Fix |
|---|-------|---------|-----------------|
| 1 | [Description] | [Section] | [Recommendation] |

---

## Dimension Scores

| Review Dimension | Score | Notes |
|------------------|-------|-------|
| Structural Completeness | ⭐⭐⭐⭐⭐ | [Notes] |
| Business Logic (PM Perspective) | ⭐⭐⭐⭐☆ | [Notes] |
| Requirement Clarity (Engineering Perspective) | ⭐⭐⭐☆☆ | [Notes] |
| Testability (QA Perspective) | ⭐⭐⭐⭐☆ | [Notes] |
| Business Stakeholder Perspective | ⭐⭐⭐⭐⭐ | [Notes] |
| Scope Boundaries | ⭐⭐⭐⭐⭐ | [Notes] |
| Evidence Traceability | ⭐⭐⭐☆☆ | [Notes] |
| Consistency | ⭐⭐⭐⭐☆ | [Notes] |
| Traceability Metadata | ⭐⭐⭐⭐☆ | [Notes] |

---

## Next Actions

[Provide specific follow-up actions based on the review decision]
```

## Approval Certificate Template

```markdown
# ✅ PRD Approval Certificate

- Review binding: [object/version/digest if available; scope; criteria/version; initial/delta/closeout]
- Coverage: [checked; unchecked; reused evidence and validity]
- Approval impact: [defect / evidence_gap / scope_decision / optional; stable IDs and closure evidence]

## Basic Information
- **PRD Document**: [Path]
- **Approval Time**: YYYY-MM-DD HH:MM
- **Review Round**: Total N rounds
- **Review Decision**: 🟢 Pass

---

## Review History
| Round | Date | Issue Counts | Decision |
|-------|------|--------------|----------|
| 1 | YYYY-MM-DD | P0: X, P1: Y, P2: Z | Fail |
| 2 | YYYY-MM-DD | P0: 0, P1: 0, P2: Z | Pass |

---

## Residual Suggestions (P2)
[List non-blocking issues that can be optimized later]

---

## Approval Confirmation

This PRD has passed the review and meets the release criteria. It may proceed to the HLD phase.

**Reviewer**: `prd-reviewer`
```
