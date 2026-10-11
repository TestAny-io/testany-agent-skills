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
- **Primary page track**: [brand/conversion, data/monitoring, operation/configuration, browse/discovery, reading/understanding, mobile quick action; primary and local secondary tracks]
- **Fidelity and direction statement**: [high fidelity by default / explicitly requested wireframe; an executable sentence covering audience, task, content protagonist, composition, visual/interaction language and anti-goals]
- **Authority and scope**: [user direction, existing brand/system, reference links or screenshots; inherit/extend/establish a baseline]
- **Content protagonist and composition**: [first visual priority; chosen composition family and rationale]
- **Design signatures**: [1-3 visual/interaction identifiers tied to product meaning]
- **Template collisions**: [unsupported repeated skeletons, colors, materials or motion to avoid; rationale for any retained common pattern]
- **Representative page**: [page/route and rationale]
- **Verification scope**: [target viewport width×height, themes, key states; exclusions and reasons]

| Calibration axis (1-10, not a quality score) | Value | Concrete meaning and task rationale |
|---|---:|---|
| `design_variance` | [1-10] | [how closely it follows convention or departs from it, and why] |
| `motion_intensity` | [1-10] | [feedback-led or narrative motion intensity, and why] |
| `visual_density` | [1-10] | [information per viewport and whitespace strategy, and why] |

| Six-layer visual language | Token/rule and role | Source or new decision with rationale |
|---|---|---|
| Composition | [first-viewport allocation, grid/columns, alignment axes, scroll rhythm, breakpoints] | [actual path or sandbox addition] |
| Typography | [headings, body, labels, numerals/code, language fallbacks] | [source/decision] |
| Color | [background, surfaces, text, primary actions, statuses, accent allocation] | [source/decision] |
| Shape/material | [radii, borders, shadows, icons, imagery/glass/noise as applicable] | [source/decision] |
| Content/imagery | [how real assets, data, charts or copy become the protagonist] | [source/decision] |
| Motion | [feedback/spatial/direct manipulation/narrative; 1-3 signature moments and reduced motion] | [source/decision] |

**Direction decision** (write “not applicable — inheriting [authority]” when direction is already established; do not invent alternatives):

| Candidate | Composition and interaction language | Supporting/opposing evidence | Decision |
|---|---|---|---|
| A | [must differ by more than color] | [task, brand, content, component evidence] | [selected/rejected and why] |
| B | [meaningfully different from A] | [evidence] | [selected/rejected and why] |

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

> Every declared state must be demonstrable without editing code. Verify applicable hover/focus-visible/pressed/selected/disabled/loading control states with the page; do not turn the business state matrix into a style inventory.

### P0 Interaction Choreography

| Journey / Step | Trigger / input | Immediate feedback | Transition / continuity | Result | Recovery / context | Focus / announcement | Reduced motion |
|---|---|---|---|---|---|---|---|
| [J1 / S1] | [click/keyboard/drag/scroll/system event] | [feedback that input was received] | [where the object comes from, how it changes, where it goes] | [final data/selection/navigation state] | [cancel/retry/undo; preserved input/filter/scroll] | [focus destination, keyboard equivalent, announcement] | [how meaning remains without large motion] |

> The state matrix answers “which states exist”; this table answers “how states connect.” Every P0 choreography must demonstrate its trigger, completion and at least one applicable recovery path.

### Component State Contract

| Component/page | Applicable states | Visual and behavioral feedback | Keyboard/touch equivalent | Data/layout stability |
|---|---|---|---|---|
| [Button / Page A] | [applicable default/focus-visible/pressed/disabled/loading/success/error states] | [specific changes] | [keyboard and target size] | [duplicate prevention and width/content stability] |
| [Row / Page B] | [hover/focus-visible/selected/expanded] | [specific changes] | [Enter/arrows/touch] | [list/detail context] |

### Navigation relationship table

| Source page | Target page | Trigger conditions | Journey jump |
|---------|---------|---------|-------------|
| [Page A] | [Page B] | [User Action] | [Journey X S1→S2] |
| [Page B] | [Page C] | [Conditional judgment] | [Journey X→Y across Journey] |
| ... | ... | ... | ... |

### Component usage list

| Component | Source | Task role and public variant/density | Usage page |
|------|------|---------|---------|
| [Button] | Existing repository component (src/components/ui/Button) | [primary/secondary/destructive action; variant/size] | Page A, Page B |
| [Form] | Existing repository component (src/components/Form) | [input/validation; compact/default] | Page C |
| [PROTOTYPE] AddressPicker | New in sandbox | [address selection; reason for gap] | Page C |
| ... | ... | ... | ... |

### Mock data list

| Data file | Corresponding PRD entity | Usage page | Contains status | PRD undefined fields |
|---------|-------------|---------|---------|----------------|
| mock/products.ts | Products | Product list, product details | Normal (10 items), empty (0 items), border (100 items) | `createdAt` (required for list sorting) |
| mock/order.ts | Order | Settlement page | Normal, error (abnormal amount) | — |
| ... | ... | ... | ... | ... |

> **"PRD undefined fields" column**: records the data fields found to be needed during UI interaction but not clearly defined by PRD. These fields are the prototype's input to the downstream API Contract - helping the API Writer complete the data model. Fill in `—` to indicate no additional fields.
