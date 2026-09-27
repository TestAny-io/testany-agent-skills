# Prototype Manifest template

After Phase 1.6 is completed, `_prototype-manifest.md` must be generated in the sandbox directory according to this template.

---

## Prototype Manifest

### Basic Information

| Project | Content |
|------|------|
| PRD source | [PRD file path] |
| User Journey source | [Journey file path] |
| Frontend repository | [Repository root path] |
| sandbox directory | [sandbox directory path] |
| Routing prefix | [/prototype/] |
| Creation time | YYYY-MM-DD |

### Prototype Budget

| Item | Quantity |
|------|------|
| P0 Journey | X |
| P1 Journey | Y (placeholder) |
| Total number of pages | N |
| Prototype budget trigger | [Not triggered / Triggered - user confirms the reduction scope] |

### Visual Brief

- **Audience and task**: [primary task, usage frequency, language, devices]
- **Fidelity and direction**: [high fidelity by default / explicitly requested wireframe; visual character expressed as concrete choices]
- **Authority and scope**: [user direction, existing brand/system, reference links or screenshots; inherit/extend/establish a baseline]
- **Density and hierarchy**: [primary information/actions, grouping and spacing strategy with reasons]
- **Representative page**: [page/route and rationale]
- **Verification scope**: [target viewport width×height, themes, key states; exclusions and reasons]

| Design dimension | Token/value and role | Source or new decision with rationale |
|---|---|---|
| Color | [background, surfaces, text, primary actions, statuses] | [actual path or sandbox addition] |
| Typography | [headings, body, labels, supporting text, fallbacks] | [source/decision] |
| Layout/spacing/density | [widths, breakpoints, spacing scale, control density] | [source/decision] |
| Details/motion | [radii, borders, shadows, icons, applicable motion] | [source/decision] |

**Page exceptions and open decisions**: [pages departing from the baseline and reasons / none; no unauthorized brand or production component changes]

### Page ↔ Journey ↔ PRD Traceability Table

| # | Pages | Routes | Journey | Journey Steps | PRD Requirements | State Coverage |
|---|------|------|---------|-------------|---------|---------|
| 1 | [Page Name] | /prototype/[Path] | [Journey Name] | [S1/S2/...] | [REQ-*] | Normal/Loading/Empty/Error/Boundary |
| 2 | ... | ... | ... | ... | ... | ... |

### Page State and Interaction Matrix

| Page/route | State | Journey Step / Edge Case ID | Trigger | Visible outcome/primary action | Recovery/focus destination | Responsive changes |
|---|---|---|---|---|---|---|
| [page] | [normal/loading/empty/error/boundary] | [S1 / EC-01; identify generic additions] | [URL/demo control/actual action] | [display and behavior] | [recovery and focus] | [reflow/scrolling etc.] |

> Every declared state must be demonstrable without editing code. Verify applicable hover/focus/pressed/disabled control states with the page; do not turn the business state matrix into a style inventory.

### Navigation relationship table

| Source page | Target page | Trigger conditions | Journey jump |
|---------|---------|---------|-------------|
| [Page A] | [Page B] | [User Action] | [Journey X S1→S2] |
| [Page B] | [Page C] | [Conditional judgment] | [Journey X→Y across Journey] |
| ... | ... | ... | ... |

### Component usage list

| Components | Source | Usage Page |
|------|------|---------|
| [Button] | The warehouse already exists (src/components/ui/Button) | Page A, Page B |
| [Form] | The warehouse already exists (src/components/Form) | Page C |
| [PROTOTYPE] AddressPicker | Sandbox New | Page C |
| ... | ... | ... |

### Mock data list

| Data file | Corresponding PRD entity | Usage page | Contains status | PRD undefined fields |
|---------|-------------|---------|---------|----------------|
| mock/products.ts | Products | Product list, product details | Normal (10 items), empty (0 items), border (100 items) | `createdAt` (required for list sorting) |
| mock/order.ts | Order | Settlement page | Normal, error (abnormal amount) | — |
| ... | ... | ... | ... | ... |

> **"PRD undefined fields" column**: records the data fields found to be needed during UI interaction but not clearly defined by PRD. These fields are the prototype's input to the downstream API Contract - helping the API Writer complete the data model. Fill in `—` to indicate no additional fields.
