# Delivery Summary Template

Upon completion of Phase 3.6, a delivery summary must be output according to this template.

---

## Prototype Delivery Summary

### Basic Information

| Project | Content |
|------|------|
| PRD | [path] |
| User Journey | [path] |
| sandbox directory | [path] |
| Routing prefix | [/prototype/] |
| Startup command | [Specific commands, including package manager and workspace location] |
| Entry route | [/prototype/ or /prototype/index] |
| Implementation binding | [commit / current diff or file digests; evidence capture time] |
| Visual Brief | [Manifest location; fidelity, representative page, target viewports/themes] |
| Delivery status | [self-check complete / draft, experience validation incomplete; reason] |

### Coverage Statistics

| Indicators | Values ​​|
|------|-----|
| P0 Journey Coverage | X / Y (Z%) |
| P1 Journey Coverage | X / Y (Z%) (placement pages count) |
| Total number of pages | N |
| State coverage rate | Covered M / Total number of state matrices T (Z%) |

### Page State Verification

| Page | Normal state | Loading state | Empty state | Error state | Boundary state |
|------|-------|-------|------|-------|-------|
| [Page 1] | [verified/failed/unverified] | [result] | [result/not applicable with reason] | [result] | [result] |
| ... | ... | ... | ... | ... | ... |

### Component usage statistics

| Category | Quantity |
|------|------|
| Reused repository components | M |
| Prototype new component [PROTOTYPE] | K pieces |

### Isolated Verification

| Check items | Results |
|--------|------|
| All new files are in the sandbox | ✅/❌ |
| Zero file changes outside the sandbox | ✅/❌ |
| Description of exception changes outside the sandbox | None / Approved: `<file path>`:`<line number>` — [Change content, such as "Add prototype-only routing entry"] |
| Prototype routing under exclusive prefix | ✅/❌ |
| Unmodified package.json | ✅/❌ |
| lint check passed | ✅/❌ |
| Type check passed (if applicable) | ✅/❌ |

### Quality check results

Record all five dimensions from `references/quality-checklist.md`. Use “verified / defect found / unverified / not applicable with reason”; do not prefill success. Separate visual and behavioral evidence. Missing required evidence is not a pass.

| Dimension | Result | Evidence summary |
|---|---|---|
| Accessibility | [actual result] | [keyboard/focus/semantics; contrast measurement method/results; unchecked items] |
| Mock data quality | [actual result] | [normal/empty/boundary data; fields not defined by PRD] |
| Component discipline | [actual result] | [reused/new components; style/token scope] |
| Visual quality and consistency | [actual result] | [hierarchy, type, color, density, details, adaptation against Brief; new projects also checked] |
| UX walkthrough | [actual result] | [actual Journey, submit/recovery, return, dialog/keyboard results] |

### Visual and Interaction Evidence

Bind evidence to the implementation above. Recheck changes and update affected screenshots. Saving an image does not mean inspecting it; a static screenshot does not prove behavior.

| Evidence ID | Page/route | State | Viewport width×height/theme | Trigger/action | Screenshot/runtime record and observation | Expected → actual | Issue/recheck |
|---|---|---|---|---|---|---|---|
| EV-01 | [route] | [state] | [size/theme] | [actual action] | [real path; specific observation] | [expected and observed] | [issue ID / none; result after fix] |

- **Coverage**: [observed pages/states/viewports and executed behavior; list placeholders separately]
- **Unverified scope and reasons**: [capability gaps, failed commands, affected conclusions; none if complete]
- **Visual refinement**: [specific issue → adjustment → recheck; explain observations when no changes were needed]

### Issues and Suggestions

| ID | kind | Severity | Page/state/viewport and evidence | Issue and impact | Fix suggestion/downstream input | Status and closure evidence |
|---|---|---|---|---|---|---|
| VIS-01 | [defect/evidence_gap/scope_decision/optional] | [P0/P1/P2/not applicable] | [location and EV-*] | [specific impact] | [suggestion] | [open/closed; recheck] |

Grade defects by impact; missing evidence is not automatically a product defect. Pure preferences and minor polish are P2 and do not block by count. Open P0/P1 or missing required evidence means experience validation is incomplete. Self-check is not independent approval.

### Input to downstream

**For API Contract**:
- [Data requirements exposed by the prototype - which pages require what data and what structure]
- [Paging/filtering/sorting and other list requirements]
- [Real-time requirements (if WebSocket is required)]

**To HLD**:
- [State management complexity (sharing state across pages?)]
- [Caching requirements (what data needs to be cached?)]
- [Performance sensitive points (large data pages, high-frequency interactions)]

### Recommend next step

1. The team inspects the prototype and collects interactive feedback
2. Iterate the prototype based on feedback (re-execute `/testany-eng:prototype-designer`)
3. Run `/testany-eng:prototype-reviewer` with complete evidence; list outstanding items for drafts
4. After prototype approval, proceed to `/testany-eng:api-writer`, then HLD according to the workflow
