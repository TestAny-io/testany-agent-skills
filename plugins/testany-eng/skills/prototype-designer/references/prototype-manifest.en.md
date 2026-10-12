# Prototype Manifest template

After Phase 1.6 is completed, `_prototype-manifest.md` must be generated in the sandbox directory according to this template.

---

## Prototype Manifest

### Basic Information

| Project | Content |
|------|------|
| Input mode | [formal (PRD + Journey) / partial (PRD only or Journey only) / standalone (spoken request, screenshots or scattered material)] |
| PRD source | [PRD file path / none] |
| User Journey source | [Journey file path / none] |
| Original request | [partial/standalone: the user's words or a summary, plus locations of screenshots or material / not applicable in formal mode] |
| Frontend repository | [Repository root path] |
| sandbox directory | [sandbox directory path] |
| Routing prefix | [/prototype/] |
| Creation time | YYYY-MM-DD |

### Prototype Budget

| Item | Quantity |
|------|------|
| P0 Journey / task | X |
| P1 Journey / task | Y (placeholder) |
| Total number of pages | N |
| Prototype budget trigger | [Not triggered / Triggered - user confirms the reduction scope] |

### Inferred Requirements Card (partial/standalone mode)

Write “not applicable” in formal mode. Source: `stated` (the user's words or source material) / `inferred` (reasonably derived from what was stated) / `assumed` (provisional, lacking evidence). Inference only adds the steps and states needed to reach the user's stated goal.

| ID | Type | Content | Source | Priority |
|---|---|---|---|---|
| IR-01 | Users and context | [who, where, how often, which device] | [stated/inferred/assumed] | — |
| IR-02 | Task | [task name; steps S1 → S2 → S3] | [source] | [P0/P1/P2] |
| IR-03 | Business entity | [entity and key fields] | [source] | — |
| IR-04 | Key state | [empty/error/boundary cases and recovery] | [source] | [P0/P1] |
| IR-05 | Out of scope | [what this round explicitly does not cover] | [source] | — |

### Design Reading

**Summary**: [one paragraph: what the product is, for whom, to accomplish what in which context; therefore the visual personality (2–3 words), density and motion stance]

| Decision | Choice | Evidence (source location) | Confidence |
|---|---|---|---|
| Visual personality | [2–3 personality words] | [requirement item, Journey step, PRD field or the user's words; at least one product-specific signal] | [explicit/inferred/assumed] |
| Domain convention | [core layout kept; task rationale if departing] | [evidence] | [confidence] |
| Scenario action (one row per P0 task) | [the least effortful way to finish it in this context] | [context constraints] | [confidence] |
| [track, density, motion, key components, primary color, etc.] | [choice] | [evidence] | [confidence] |

> The design reading is shown as assumptions in Phase 1.5, not as an item-by-item approval. When the user changes a condition, recompute only the affected decisions and update this section.

### Visual Brief

This section records what the whole prototype shares; each page's track, composition and axes go in “Page design decisions” below.

- **Design package**: [location of the ui-designer design package (e.g. `_design/`) / none]. When one exists, write “see design package” for the six-layer language, direction decision, design reading and already designed pages; record only additional pages and deviations from the package with reasons
- **Audience and task**: [primary task, usage frequency, language, devices]
- **Fidelity**: [high fidelity by default / explicitly requested wireframe]
- **Authority and scope**: [user direction, existing brand/system, reference links or screenshots; inherit/extend/establish a baseline]
- **Design signatures**: [1-3 visual/interaction identifiers tied to product meaning]
- **Template default declarations**: [generated defaults this round genuinely needs, with task rationale; source when a brand or design system mandates them; repeated skeletons, colors, materials or motion from earlier prototypes in this repository to avoid / not applicable when none exist. Undeclared defaults should not appear on any page]
- **Cross-project de-duplication**: [direction log provided by the user and what this round avoids / not enabled]
- **Representative page**: [page/route and rationale]
- **Verification scope**: [target viewport width×height, themes, key states; exclusions and reasons]

| Six-layer visual language (shared by the prototype) | Token/rule and role | Source or new decision with rationale |
|---|---|---|
| Composition | [shared grid, alignment axes, breakpoints, scroll rhythm principles; page compositions live in page design decisions] | [actual path or sandbox addition] |
| Typography | [font roles and scale ratio, deliberate voice contrast if any, numerals/code, language fallbacks] | [source/decision] |
| Color | [background, surfaces, text, primary actions, statuses; which elements carry the accent and roughly how much area] | [source/decision] |
| Shape/material | [radii, borders, shadows, icons, imagery/glass/noise as applicable; cost of each technique and how it is handled] | [source/decision] |
| Content/imagery | [how real assets, data, charts or copy become the protagonist] | [source/decision] |
| Motion | [feedback, spatial, direct manipulation or narrative as the main role; reduced-motion strategy] | [source/decision] |

**Direction decision** (write “not applicable — inheriting [authority]” when direction is already established; do not invent alternatives. When direction is open, at least one candidate must avoid the track's default skeleton):

| Candidate | Composition and interaction language | Supporting/opposing evidence and trade-off | Decision |
|---|---|---|---|
| A | [must differ by more than color] | [task, brand, content, component evidence; what it gives up] | [selected/rejected and why] |
| B | [meaningfully different from A] | [evidence; what it gives up] | [selected/rejected and why] |

**Page exceptions and open decisions**: [pages departing from the baseline and reasons / none; no unauthorized brand or production component changes]

### Page design decisions

One row per page; comparing rows shows whether pages are copying the same skeleton. Axes express relative intent, not a quality score.

| Page/route | Track (secondary) | Content protagonist | Composition (supporting) | Axes V/M/D | Axis evidence: departures from convention, first-viewport information units, motion type | Signature moments |
|---|---|---|---|---|---|---|
| [page] | [data/monitoring (operation/configuration)] | [what gets first visual priority] | [horizontal bands (main area + side rail); rationale when identical to an adjacent page] | [3/3/8] | [departure: left-aligned headings over centered data; ~14 blocks; state feedback only] | [1-3] |

**Direction statements** (one per page: audience + task + content protagonist + composition + visual/interaction language + anti-goals):

- [page]: [direction statement]

### Page ↔ Journey ↔ PRD Traceability Table

| # | Pages | Routes | Journey | Journey Steps | PRD Requirements | State Coverage |
|---|------|------|---------|-------------|---------|---------|
| 1 | [Page Name] | /prototype/[Path] | [Journey Name] | [S1/S2/...] | [REQ-*] | Normal/Loading/Empty/Error/Boundary |
| 2 | ... | ... | ... | ... | ... | ... |

> Partial/standalone mode: fill the “Journey” and “Journey Steps” columns with task IDs and steps from the inferred card (e.g. `IR-02 / S1`) and the “PRD Requirements” column with the matching card item IDs; parts covered by an existing PRD/Journey keep their original IDs.

### Page State and Interaction Matrix

| Page/route | State | Journey Step / Edge Case ID | Trigger | Visible outcome/primary action | Recovery (as defined by the requirements baseline) | Responsive changes |
|---|---|---|---|---|---|---|
| [page] | [normal/loading/empty/error/boundary] | [S1 / EC-01; identify generic additions] | [URL/demo control/actual action] | [display and behavior] | [retry/clear filters/go back etc.] | [reflow/scrolling etc.] |

> Every declared state must be demonstrable without editing code. Focus destinations and keyboard equivalents are recorded in the interaction choreography; hover/focus-visible/pressed and other control states are listed in the component list. Do not turn the business state matrix into a style inventory.

### P0 Interaction Choreography

**Full choreography**: 1-3 signature moments per page, plus P0 actions involving submission, deletion/undo, dragging or cross-layer navigation.

| Journey / Step | Trigger / input | Immediate feedback | Transition / continuity | Result | Recovery / context | Focus / announcement | Reduced motion |
|---|---|---|---|---|---|---|---|
| [J1 / S1] | [click/keyboard/drag/scroll/system event; drag thresholds] | [feedback that input was received] | [where the object comes from, how it changes, where it goes] | [final data/selection/navigation state] | [cancel/retry/undo; preserved input/filter/scroll; related EC ID] | [focus destination, keyboard equivalent, announcement] | [how meaning remains without large motion] |

**One-line choreography**: all other P0 steps.

- [J1 / S2] [trigger] → [visible result] → [return/recovery and focus]

> The state matrix answers “which states exist”; this section answers “how states connect.” Full choreography must demonstrate its trigger, completion and at least one applicable recovery path; one-line choreography must demonstrate at least the trigger, result and return.

### Navigation relationship table

| Source page | Target page | Trigger conditions | Journey jump |
|---------|---------|---------|-------------|
| [Page A] | [Page B] | [User Action] | [Journey X S1→S2] |
| [Page B] | [Page C] | [Conditional judgment] | [Journey X→Y across Journey] |
| ... | ... | ... | ... |

### Component usage list

| Component | Source | Task role and public variant/density | Applicable states | Usage page |
|------|------|---------|---------|---------|
| [Button] | Existing repository component (src/components/ui/Button) | [primary/secondary/destructive action; variant/size] | [default/focus-visible/pressed/disabled/loading] | Page A, Page B |
| [Form] | Existing repository component (src/components/Form) | [input/validation; compact/default] | [focus-visible/error/disabled] | Page C |
| [PROTOTYPE] AddressPicker | New in sandbox | [address selection; reason for gap] | [default/focus-visible/expanded/selected] | Page C |
| ... | ... | ... | ... | ... |

> “Applicable states” lists only control states that actually exist and is verified on the page; concrete feedback belongs in the interaction choreography, not a separate style-state table.

### Mock data list

| Data file | Corresponding business entity (PRD or inferred card) | Usage page | Contains status | Fields undefined by requirements |
|---------|-------------|---------|---------|----------------|
| mock/products.ts | Products | Product list, product details | Normal (10 items), empty (0 items), border (100 items) | `createdAt` (required for list sorting) |
| mock/order.ts | Order | Settlement page | Normal, error (abnormal amount) | — |
| ... | ... | ... | ... | ... |

> **"Fields undefined by requirements" column**: records the data fields found to be needed during UI interaction but not clearly defined by the PRD or the inferred requirements card. These fields are the prototype's input to the downstream API Contract - helping the API Writer complete the data model. Fill in `—` to indicate no additional fields.
