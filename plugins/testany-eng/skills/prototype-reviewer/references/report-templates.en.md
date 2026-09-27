# Review report and Approval Certificate Template

Every report and certificate must bind the reviewed object/version, scope, criteria, review mode (initial/delta/closeout), checked and unchecked coverage, and actual evidence. Keep stable issue IDs and separate kind (defect/evidence_gap/scope_decision/optional), severity, and approval impact. A pass requires no open P0/P1 and sufficient required evidence; P2 count does not block. Read [review assurance](../../../references/review-assurance.md).

This document defines the output format template of prototype-reviewer.

---

## Review Report (Changes Required or Evidence Pending)

```markdown
# Prototype review report

- Review binding: [object/version/digest if available; scope; criteria/version; initial/delta/closeout]
- Coverage: [checked; unchecked; reused evidence and validity]
- Approval impact: [kind, stable issue IDs and closure evidence]

## Basic Information

| Project | Content |
|------|------|
| sandbox directory | [path] |
| PRD source | [path] |
| User Journey Source | [Path] |
| Delivery Summary | [path / missing: evidence_gap and affected conclusions; scoped review stays scoped] |
| Visual Brief | [location, fidelity, visual authority, target viewports/themes] |
| Change baseline | [commit range / worktree + ownership confirmation] |
| Review time | YYYY-MM-DD |
| Review Rounds | Round N |
| Review conclusion | [changes required / evidence pending, not approved / scoped result, no full approval] |

## Gate 1: Upstream Alignment

### Requirements coverage table

| REQ-* | Requirement Description | Manifest Page | Journey Steps | Status | Description |
|-------|---------|-------------|-------------|------|------|
| REQ-01 | [Description] | [Page Name] | [S1/S2] | ✅/⚠️/❌ | [Reason for Not Covered/Partially Covered] |

- Journey step coverage: X / Y (Z%)
- Gate 1 conclusion: [assessed result / evidence gap and unreviewed scope]; continue independent checks even when this gate cannot pass. A missing delivery summary is not automatically P1; a scoped isolation review does not require completing Gate 4.

## Gate 2: Prototype Experience and Completeness

- P0 Journey Happy Path: [actually exercised / breakpoints / unverified with reason]
- State matrix coverage: M covered / total T (Z%)
- Navigation: [actually exercised / missing paths / unverified with reason]
- Visual quality: [hierarchy, type, color, density, details, page/state consistency and adaptation against Brief]
- Usability: [actual keyboard/focus/contrast/forms/recovery results as applicable]
- Evidence coverage: [current implementation binding; inspected screenshots and executed actions; valid reuse; unchecked scope]

| Evidence ID | Page/state/viewport | Screenshot/runtime record | Observation/action and expected → actual | Source and validity | Issue/recheck |
|---|---|---|---|---|---|
| EV-01 | [route, state, width×height/theme] | [real path] | [specific observation/result] | [independent run/valid reuse; implementation binding] | [stable ID / none; recheck] |

> Screenshots do not prove behavior; code checks do not prove appearance. Missing evidence is an evidence_gap, not automatically a product P1.

## Gate 3: Engineering Isolation

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

| ID | kind | Severity | Gate | Issue and impact | Evidence | Suggested fix | Status and closure evidence |
|---|---|---|---|---|---|---|---|
| VIS-01 | [defect/evidence_gap/scope_decision/optional] | [P0/P1/P2/not applicable] | Gate 2 | [specific impact] | [route/viewport/EV-* or file:line] | [minimal fix] | [open/closed; evidence] |

## Approval Decision

| P0 | P1 | P2 | Conclusion |
|----|----|----|----|
| X | Y | Z | [changes required / evidence pending, not approved; evidence/scope decision status] |

## Next step

1. [List issues to be fixed in order of priority]
2. After the repair is completed, execute `/testany-eng:prototype-reviewer` to review
```

---

## Certificate of Approval (Passed)

Use only after full applicable scope has no open P0/P1, required evidence is sufficient, and valid approval criteria are met. Template text is not proof that checks passed.

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
| Approval date | YYYY-MM-DD |
| Review Rounds | Round N |
| Review Conclusion | **Passed** |

## Upstream alignment confirmation

- PRD requirement coverage: [actual value and scope]
- Journey step coverage: X / Y (Z%)

## Prototype Experience and Completeness

- P0 Happy Path: [actual coverage and evidence]
- State coverage: M/T (Z%)
- Navigation: [actual results and evidence]
- Visual/interaction: [Brief and current implementation binding; screenshots, viewports, states, actions, rechecks and coverage]
- Unverified scope: [none / explain; missing required evidence prevents full approval]

## Project isolation confirmation

- Zero violations in the sandbox
- Zero dependency added
- Zero unauthorized changes
- [Controlled exceptions: none / verified (file path)]

## Downstream availability confirmation

- API Contract input: specific
- HLD input: specific

## Confirmation of passing the threshold

| P0 | P1 | P2 |
|----|----|----|
| 0 | 0 | [actual count; does not block] |

## Review Process

| Round | Date | P0 | P1 | P2 | Conclusion |
|------|------|----|----|----|------|
| 1 | YYYY-MM-DD | X | Y | Z | Fail |
| 2 | YYYY-MM-DD | 0 | 0 | N | Pass |

## Reviewer

prototype-reviewer

## Approval Confirmation

You can enter the API Contract / HLD stage:
- `/testany-eng:api-writer`
- `/testany-eng:hld-writer`

## Approved signature

`PASSED-{YYYYMMDD}-{The first 6 digits of the sandbox directory name hash}`
```
