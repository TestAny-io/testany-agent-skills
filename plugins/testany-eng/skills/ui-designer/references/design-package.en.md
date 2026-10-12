# Design Package Template

ui-designer generates the design package from this template. In repository mode it lives in the sandbox `_design/`; in standalone mode it lives in the output directory. In formal mode, reference an existing PRD/Journey instead of copying it.

---

## File 1: `design-brief.md`

### Basic Information

| Item | Content |
|---|---|
| Output mode | [repository mode: repository path, sandbox directory, route prefix / standalone mode: output directory] |
| Input mode | [formal / partial / standalone] |
| Requirements baseline | [PRD and Journey paths / the inferred requirements card in this file] |
| Original request | [the user's words or a summary, plus locations of screenshots, references and brand material] |
| Design authority | [user direction, brand guidelines, repository design system and token sources, references; inherit/extend/establish] |
| Created/updated | YYYY-MM-DD |

### Inferred Requirements Card

Write “not applicable” in formal mode. Source: `stated` / `inferred` / `assumed`. Inference only adds the steps and states needed to reach the user's goal.

| ID | Type | Content | Source | Priority |
|---|---|---|---|---|
| IR-01 | Users and context | [who, where, how often, which device] | [source] | — |
| IR-02 | Task | [task name; steps S1 → S2 → S3] | [source] | [P0/P1/P2] |
| IR-03 | Business entity | [entity and key fields] | [source] | — |
| IR-04 | Key state | [empty/error/boundary cases and recovery] | [source] | [P0/P1] |
| IR-05 | Out of scope | [what this round explicitly does not cover] | [source] | — |

### Design Reading

**Summary**: [one paragraph: what the product is, for whom, to accomplish what in which context; therefore the visual personality (2–3 words), density and motion stance]

| Decision | Choice | Evidence (source location) | Confidence |
|---|---|---|---|
| Visual personality | [2–3 personality words] | [at least one product-specific signal] | [explicit/inferred/assumed] |
| Domain convention | [core layout kept, e.g. resources as columns, time running down; task rationale if departing] | [evidence] | [confidence] |
| Scenario action (one row per P0 task) | [the least effortful way to finish it in this context] | [context constraints] | [confidence] |
| [track, density, motion, key components, primary color, etc.] | [choice] | [evidence] | [confidence] |

The reading uses `explicit/inferred/assumed` for confidence; the card uses `stated/inferred/assumed` for source. Do not mix them.

### Direction Decision

Write “not applicable — inheriting [authority]” when direction is already set. When direction is open, build the first screen of the same representative page in both directions. Fill in the composition, visual language and trade-off columns before building; add the screenshot and measurement columns once the direction pages exist.

| Direction | Composition and interaction language | Visual language highlights | What it gives up | Screenshot (in `evidence/`) | Measurement summary |
|---|---|---|---|---|---|
| A | [must differ by more than color] | [type, color, material] | [cost] | [screenshot path] | [largest block share, accent, first-viewport information units] |
| B | [meaningfully different from A; at least one avoids the default skeleton] | [highlights] | [cost] | [screenshot path] | [summary] |

- **Recommendation**: [A/B and the reason, based on the design reading]
- **User choice**: [A / B / mix (describe the combination) / user unavailable, recommendation adopted]
- **Formal page for the chosen direction**: [renamed file or route]; code for the rejected direction is removed and its screenshots stay in `evidence/`

### Page Design Decisions

| Page/route | Track (secondary) | Content protagonist | Composition (supporting) | Axes V/M/D | Axis evidence: departures from convention, first-viewport information units, motion type | Signature moments |
|---|---|---|---|---|---|---|
| [page] | [track] | [first visual priority] | [composition; rationale when identical to an adjacent page] | [x/x/x] | [evidence] | [1-3] |

**Direction statements**:

- [page]: [audience + task + content protagonist + composition + visual/interaction language + anti-goals]

### Template Default Declarations

[generated defaults this round genuinely needs, with task rationale; source when a brand or design system mandates them; repeated skeletons, colors, materials or motion to avoid. Undeclared defaults should not appear on any page]

### Verification Scope

[target viewport width×height, themes, key states; exclusions and reasons; cross-project de-duplication: enabled (log location) / not enabled]

### Remaining Assumptions

[items still marked assumed in the card and the reading, plus decisions made on the user's behalf while they were unavailable; ask the user to confirm at delivery]

---

## File 2: `design-language.md`

### Six-layer Visual Language

| Layer | Rules and roles | Rationale / cost of each technique and how it is handled |
|---|---|---|
| Composition | [grid, alignment axes, breakpoints, scroll rhythm] | [rationale] |
| Typography | [font roles, scale ratio, voice contrast, numerals/code, language fallbacks] | [rationale] |
| Color | [background, surfaces, text, primary actions, statuses; where the accent lands and roughly how much area] | [rationale] |
| Shape/material | [main logic for radii, borders, shadows, icons, imagery] | [rationale] |
| Content/imagery | [what carries visual priority; asset sources] | [rationale] |
| Motion | [main role; durations and curves; reduced-motion strategy] | [rationale] |

### Tokens

| Token | Value | Role | Source (existing in repository / new this round) |
|---|---|---|---|
| `--color-surface` | [value] | [use] | [source] |
| `--font-size-title` | [value] | [use] | [source] |
| `--space-4` | [value] | [use] | [source] |
| `--motion-panel` | [duration and curve] | [use] | [source] |

### Component Specifications

| Component | Source | Task role and hierarchy | Content anatomy | Variant/density | Applicable states | Continuity after trigger |
|---|---|---|---|---|---|---|
| [component] | [repository mode: existing component path and variant, or `[DESIGN]` new design / standalone mode: new design] | [role] | [required/optional fields, length limits] | [variant] | [applicable default/focus-visible/pressed/...] | [in place/expand/overlay/navigate; return and focus] |

In repository mode, for each `[DESIGN]` component, also record the corresponding production component, why the existing one cannot express the design, and the suggested component-library improvement.

### Interaction Choreography

**Full choreography** (1-3 signature moments per page, plus submission, deletion/undo, dragging and cross-layer navigation):

| Page / step | Trigger / input | Immediate feedback | Transition / continuity | Result | Recovery / context | Focus / announcement | Reduced motion |
|---|---|---|---|---|---|---|---|
| [page / IR-02 S1] | [input; drag thresholds] | [feedback] | [where it comes from, how it changes, where it goes] | [result] | [cancel/retry/undo; preserved context] | [focus, keyboard equivalent, announcement] | [how meaning remains] |

**One-line choreography**:

- [page / step] [trigger] → [visible result] → [return/recovery and focus]

### Handoff

- **Token mapping**: [how tokens map to the repository's styling approach or the implementation]
- **Component mapping**: [`[DESIGN]` components, their production counterparts and suggested improvements]
- **Unconfirmed assumptions**: [items still marked assumed in the reading or the card / none]
- **Suggested next step**: [hand to prototype-designer to complete flows and states / hand to developers / further iteration]

---

## Evidence: `evidence/`

Screenshots live in `evidence/`; everything else goes in a single `evidence/evidence.md` with the sections below, not in several cross-referencing files.

- **Screenshot list**: every page and key state at the target viewport; both representative pages from the direction comparison. Note the actual URL and viewport for each.
- **Measurement evidence**:

| Page/viewport | Largest block share; ratio to second largest | Accent placement and area | First-viewport information units | Departures from convention | Font-size/radius/shadow variants | Method | Consistent with axes/direction statement |
|---|---|---|---|---|---|---|---|
| [page width×height] | [e.g. 52%; 2.6×] | [placement; ~3%] | [e.g. 9] | [itemized] | [e.g. 6/2/1] | [script/screenshot measurement/estimate] | [consistent / inconsistent and resolution] |

- **Self-check record**: results for the applicable quality-checklist dimensions (verified / defect found / unverified / not applicable with reason), interactions actually exercised, accessibility method, fixes and rechecks.
- **Design failure samples**: template-like output, novelty that hurt usability, axes contradicting measurements, broken motion and similar cases seen this round, with how each was handled; none if none.
