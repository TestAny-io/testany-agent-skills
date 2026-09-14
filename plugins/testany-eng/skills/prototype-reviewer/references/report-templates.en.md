# Review report and Approval Certificate Template

Every report and certificate must bind the reviewed object/version, scope, criteria, review mode (initial/delta/closeout), checked and unchecked coverage, and actual evidence. Keep stable issue IDs and separate kind (defect/evidence_gap/scope_decision/optional), severity, and approval impact. A pass requires no open P0/P1 and sufficient required evidence; P2 count does not block. Read [review assurance](../../../references/review-assurance.md).

This document defines the output format template of prototype-reviewer.

---

## Review report (failed)

```markdown
#Prototype review report

## Basic Information

| Project | Content |
|------|------|
| sandbox directory | [path] |
| PRD source | [path] |
| User Journey Source | [Path] |
| Delivery Summary | [Path / Missing (P1)] |
| Change baseline | [commit range / worktree + ownership confirmation] |
| Review time | YYYY-MM-DD |
| Review Rounds | Round N |
| Review conclusion | **Failed** |

## Gate 1: Upstream Alignment

### Requirements coverage table

| REQ-* | Requirement Description | Manifest Page | Journey Steps | Status | Description |
|-------|---------|-------------|-------------|------|------|
| REQ-01 | [Description] | [Page Name] | [S1/S2] | ✅/⚠️/❌ | [Reason for Not Covered/Partially Covered] |

- Journey step coverage: X / Y (Z%)
- Gate 1 conclusion: [assessed result / evidence gap and unreviewed scope]; continue independent checks even when this gate cannot pass. A missing delivery summary is not automatically P1; a scoped isolation review does not require completing Gate 4.

## Gate 2: Prototype Integrity

- P0 Journey Happy Path Reachability: [All Access/Breakpoint List]
- State matrix coverage: M covered / total T (Z%)
- Navigation Completeness: [All Access / Missing List]

## Door Three: Engineering Isolation

| Check items | Results |
|--------|------|
| All prototype files are in the sandbox | ✅/❌ |
| Change baseline determined | ✅ [commit range] / ✅ [Confirmation of ownership] |
| Zero unauthorized changes outside the sandbox | ✅/❌ |
| Controlled exception logged | ✅/❌/N/A |
| Prototype routing under exclusive prefix | ✅/❌ |
| package.json unmodified | ✅/❌ |
| Production components/pages/routes have not been modified | ✅/❌ |

## Gate 4: Downstream availability

- API Contract input evaluation: [Specific/General/Missing]
- HLD input assessment: [Specific/General/Missing]
- Delivery summary and actual consistency: [Consistency / Deviation]

## Question list

| # | Level | Gate | Problem description | Evidence location | Suggested changes |
|---|------|-----|---------|---------|---------|
| 1 | P0 | Gate 3 | [Description] | [File: Line number] | [Modification suggestions] |
| 2 | P1 | Gate 1 | [Description] | [PRD:REQ-XX] | [Modification Suggestions] |

## Release decision

| P0 | P1 | P2 | Conclusion |
|----|----|----|----|
| X pieces | Y pieces | Z pieces | **Failed** |

## Next step

1. [List issues to be fixed in order of priority]
2. After the repair is completed, execute `/testany-eng:prototype-reviewer` to review
```

---

## Certificate of approval (passed)

```markdown
# Prototype approval certificate

- Review binding: [object/version/digest if available; scope; criteria/version; initial/delta/closeout]
- Coverage: [checked; unchecked; reused evidence and validity]
- Approval impact: [defect / evidence_gap / scope_decision / optional; stable IDs and closure evidence]

## Basic Information

| Project | Content |
|------|------|
| sandbox directory | [path] |
| PRD source | [path] |
| User Journey Source | [Path] |
| Exact departure time | YYYY-MM-DD |
| Review Rounds | Round N |
| Review Conclusion | **Passed** |

## Upstream alignment confirmation

- PRD demand coverage: 100% (within the scope of this round)
- Journey step coverage: X / Y (Z%)

## Prototype integrity confirmation

- P0 Happy Path: All access
- State coverage: M/T (Z%)
- Navigation integrity: All access

## Project isolation confirmation

- Zero violations in the sandbox
- Zero dependency added
- Zero unauthorized changes
-[ControlledExceptions:None/Verified(filepath)]

## Downstream availability confirmation

- API Contract input: specific
- HLD input: specific

## Confirmation of passing the threshold

| P0 | P1 | P2 |
|----|----|----|
| 0 | 0 | ≤ 2 |

## Review Process

| Round | Date | P0 | P1 | P2 | Conclusion |
|------|------|----|----|----|------|
| 1 | YYYY-MM-DD | X | Y | Z | Fail |
| 2 | YYYY-MM-DD | 0 | 0 | N | Pass |

## Reviewer

prototype-reviewer

## Confirmation of accurate departure

You can enter the API Contract / HLD stage:
- `/testany-eng:api-writer`
- `/testany-eng:hld-writer`

## Approved signature

`PASSED-{YYYYMMDD}-{The first 6 digits of the sandbox directory name hash}`
```
