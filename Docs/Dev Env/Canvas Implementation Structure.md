# Canvas implementation structure — provisional

Execution companion to the [plan](Canvas%20Implementation%20Plan.md), using [Implementation Slicing](../../agents/skills/implementation-slicing/SKILL.md). This is a first forecast, not implementation authorization or a measured completion promise.

## Readiness and estimate basis

- **Selected route:** Tao owns Studio's application composition and interactive state/actions once the missing primitives arrive from other work. TypeScript sidecars own editor, pointer/geometry and host-service integration; they do not substitute for the missing language work.
- **Available today:** app/view composition, text/name expressions, ordinary children, foreign views, TypeScript reactive hooks, memory publication. Foreign parameters currently accept only text; Tao state/actions/loops/conditions and structured expression support are missing. Evidence: [grammar](../../ts/1-grammar/grammar-src/treesitter-grammar.js), [view compiler](../../ts/6-compile/compile-src/ViewsCompiler.ts), [runtime API](../../ts/7-runtime/runtime-src/client/TaoRuntimeAPI.ts).
- **External gate:** merge and validate required language primitives and the separate nested-view/generated-module work before implementation. Exact delivered contracts, library choices and canvas syntax remain unverified; revisit this forecast when known.
- **Staffing:** one executing agent, sequential work; necessary local checks are included. External implementation, human decision/review waits and unrelated host contention are excluded; this is not a calendar ETA.
- **Clock:** T+0 starts the listed work after external readiness. Offsets below are elapsed minutes; start/finish ranges describe optimistic and slower sequential trajectories, not one mixed schedule.
- **Stop:** locally verified first canvas workflow ready for developer review; no publication or landing. Illustrative durations are engineering estimates, not historical measurements.
- **Effort:** each ordinary slice receives 2% of expected active effort; 45 slices total 90%, with 10% reserved for bounded repair. This coarse allocation assumes comparable active work, not identical machine-wait time.

## Group schedule

| Group | Result / original plan section          | Effort | Duration       | Start                  | Finish              |
| ----- | --------------------------------------- | ------ | -------------- | ---------------------- | ------------------- |
| A     | Research and contract decisions / 1     | 10%    | 50–75m         | T+0                    | T+50–75             |
| B     | Source override and working edits / 2   | 10%    | 50–75m         | T+50–75                | T+100–150           |
| C     | Durable ownership and Apply / 2         | 10%    | 50–75m         | T+100–150              | T+150–225           |
| D     | Canvas documents and configurations / 3 | 10%    | 50–75m         | T+150–225              | T+200–300           |
| E     | Working and hover preview isolation / 4 | 10%    | 50–75m         | T+200–300              | T+250–375           |
| F     | Source destinations and drop map / 5    | 10%    | 50–75m         | T+250–375              | T+300–450           |
| G     | Tao Studio shell and code panes / 6     | 10%    | 50–75m         | T+300–450              | T+350–525           |
| H     | Draft interaction and properties / 7–8  | 10%    | 50–75m         | T+350–525              | T+400–600           |
| I     | Integrated acceptance / 9               | 10%    | 60–100m        | T+400–600              | T+460–700           |
| R     | Named-risk repair allowance             | 10%    | 50–75m if used | At affected checkpoint | Finish by T+510–775 |

**Forecast including reserve: 8h30–12h55 of scheduled work after readiness.** This low-confidence estimate must be replaced after A, using the actual merged APIs and selected libraries; it excludes all missing-language development. It is not a promise that every unknown can be resolved inside the reserve.

## Slices

Each row includes its focused validation. Dependencies form a sequential baseline; additional dependency IDs identify important contracts if work is later parallelized. Start/finish offsets exclude reserve usage; spent reserve shifts subsequent windows.

### A — Research and contracts

| ID | Acceptance output                                                                                            | Depends on    | Effort | Duration | Start → finish  |
| -- | ------------------------------------------------------------------------------------------------------------ | ------------- | ------ | -------- | --------------- |
| A1 | Required language/compiler capabilities exercised in a small Studio-shaped fixture; missing contracts listed | External gate | 2%     | 10–15m   | T+0 → 10–15     |
| A2 | Editor/source-edit integration candidates compared against actual language-service APIs                      | A1            | 2%     | 10–15m   | T+10–15 → 20–30 |
| A3 | Canvas/drag libraries and relevant existing editors compared against our source ownership model              | A2            | 2%     | 10–15m   | T+20–30 → 30–45 |
| A4 | Minimal preview isolation experiment establishes chosen runtime/graph boundary or a specific blocker         | A3            | 2%     | 10–15m   | T+30–45 → 40–60 |
| A5 | Canvas syntax, dependencies and API contracts ready for approval; forecast revised                           | A4            | 2%     | 10–15m   | T+40–60 → 50–75 |

A2–A4 are bounded investigations, not claims of complete research or successful PoCs in 15 minutes. An unresolved result stops dependent implementation for rescoping; approval wait is excluded.

### B — Source working copies

| ID | Acceptance output                                                                 | Depends on | Effort | Duration | Start → finish     |
| -- | --------------------------------------------------------------------------------- | ---------- | ------ | -------- | ------------------ |
| B1 | Versioned source-read API substitutes text while retaining original logical paths | A5         | 2%     | 10–15m   | T+50–75 → 60–90    |
| B2 | Overridden imported file retains relative imports and file-private bindings       | B1         | 2%     | 10–15m   | T+60–90 → 70–105   |
| B3 | Working-copy edits produce immutable revisions without changing project source    | B2         | 2%     | 10–15m   | T+70–105 → 80–120  |
| B4 | Same-file canvases share one authoritative working copy                           | B3         | 2%     | 10–15m   | T+80–120 → 90–135  |
| B5 | Undo/redo restores a whole working-copy transaction without publishing            | B4         | 2%     | 10–15m   | T+90–135 → 100–150 |

### C — Persistence and ownership

| ID | Acceptance output                                                                                | Depends on | Effort | Duration | Start → finish      |
| -- | ------------------------------------------------------------------------------------------------ | ---------- | ------ | -------- | ------------------- |
| C1 | Local source/baseline/metadata restore after restart; ordinary cleanup preserves them            | B5         | 2%     | 10–15m   | T+100–150 → 110–165 |
| C2 | Debounced serialized autosave cannot replace newer work with an older revision                   | C1         | 2%     | 10–15m   | T+110–165 → 120–180 |
| C3 | Workspace edit ownership survives reopening; competing managed edits return actionable status    | C2         | 2%     | 10–15m   | T+120–180 → 130–195 |
| C4 | Apply validates baseline, publishes one file and advances the open session baseline              | C3         | 2%     | 10–15m   | T+130–195 → 140–210 |
| C5 | External divergence preserves recovery work; Revert/reopen adopts project source without merging | C4         | 2%     | 10–15m   | T+140–210 → 150–225 |

### D — Canvas documents

| ID | Acceptance output                                                                       | Depends on | Effort | Duration | Start → finish      |
| -- | --------------------------------------------------------------------------------------- | ---------- | ------ | -------- | ------------------- |
| D1 | Agreed minimal canvas syntax parses and yields one target-view reference                | C5, A5     | 2%     | 10–15m   | T+150–225 → 160–240 |
| D2 | Canvas validation rejects unresolved targets and invalid preview/draft configurations   | D1         | 2%     | 10–15m   | T+160–240 → 170–255 |
| D3 | Local/project-owned canvas discovery and explicit save preserve document identity       | D2         | 2%     | 10–15m   | T+170–255 → 180–270 |
| D4 | Lifted preview stores measured dimensions, environment and supported input references   | D3         | 2%     | 10–15m   | T+180–270 → 190–285 |
| D5 | Preview duplication and draft-bounds edits persist without invalidating app compilation | D4         | 2%     | 10–15m   | T+190–285 → 200–300 |

D1–D2 assume agreed display/preview/expression contracts exist after the external gate; they do not include implementing those missing languages from scratch.

### E — Preview isolation

| ID | Acceptance output                                                                                 | Depends on | Effort | Duration | Start → finish      |
| -- | ------------------------------------------------------------------------------------------------- | ---------- | ------ | -------- | ------------------- |
| E1 | Canvas compilation consumes working source while ordinary app consumes project source             | D5, B2     | 2%     | 10–15m   | T+200–300 → 210–315 |
| E2 | Preview host renders the selected target with its display and inputs                              | E1         | 2%     | 10–15m   | T+210–315 → 220–330 |
| E3 | Preview identity routes a hover candidate only to its recipient                                   | E2         | 2%     | 10–15m   | T+220–330 → 230–345 |
| E4 | Rapid candidates coalesce; stale completion cannot replace a newer candidate                      | E3         | 2%     | 10–15m   | T+230–345 → 240–360 |
| E5 | Cancel restores working render; invalid source retains last-good output and disables visual edits | E4         | 2%     | 10–15m   | T+240–360 → 250–375 |

### F — Destinations and targeting

| ID | Acceptance output                                                                              | Depends on | Effort | Duration | Start → finish      |
| -- | ---------------------------------------------------------------------------------------------- | ---------- | ------ | -------- | ------------------- |
| F1 | Runtime occurrence reports include stable source identity and geometry                         | E5         | 2%     | 10–15m   | T+250–375 → 260–390 |
| F2 | Content-capable bodies expose insertion gaps without entering another definition               | F1         | 2%     | 10–15m   | T+260–390 → 270–405 |
| F3 | Named-slot anchors identify empty/fill/replace destinations                                    | F2         | 2%     | 10–15m   | T+270–405 → 280–420 |
| F4 | Active loop/branch occurrences map to authored bodies; ambiguous cases are disabled            | F3         | 2%     | 10–15m   | T+280–420 → 290–435 |
| F5 | Fixed drop regions remain unchanged by placeholder reflow; vanished targets become unavailable | F4         | 2%     | 10–15m   | T+290–435 → 300–450 |

F3–F4 depend on working language/runtime contracts from the external gate. Integration failures are blockers rather than silent UI omissions.

### G — Tao Studio shell

| ID | Acceptance output                                                                              | Depends on | Effort | Duration | Start → finish      |
| -- | ---------------------------------------------------------------------------------------------- | ---------- | ------ | -------- | ------------------- |
| G1 | Tao pane composition and shared authoring state access the workspace through a sidecar adapter | F5         | 2%     | 10–15m   | T+300–450 → 310–465 |
| G2 | Editor sidecar edits the working document with session-correct diagnostics/references          | G1         | 2%     | 10–15m   | T+310–465 → 320–480 |
| G3 | Datasource-definition pane presents definitions without becoming a records browser             | G2         | 2%     | 10–15m   | T+320–480 → 330–495 |
| G4 | Canvas shows configured previews/drafts with Design/Interact mode separation                   | G3         | 2%     | 10–15m   | T+330–495 → 340–510 |
| G5 | Apply/Revert/ownership/error UI reflects workspace state; code highlights candidate insertion  | G4         | 2%     | 10–15m   | T+340–510 → 350–525 |

### H — Draft gestures and properties

| ID | Acceptance output                                                                                             | Depends on | Effort | Duration | Start → finish      |
| -- | ------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------- | ------------------- |
| H1 | Insert-menu presets create drafts with separate drafting bounds and render content                            | G5         | 2%     | 10–15m   | T+350–525 → 360–540 |
| H2 | Drag begins/cancels cleanly; Cmd alone reveals map/region and target outline stays visible                    | H1         | 2%     | 10–15m   | T+360–540 → 370–555 |
| H3 | Layout-aware placeholder and simple-spacer toggle use the same destination edit                               | H2         | 2%     | 10–15m   | T+370–555 → 380–570 |
| H4 | Drop composes drafts or inserts into target, consumes draft, and records one undo; Shift transfers dimensions | H3         | 2%     | 10–15m   | T+380–570 → 390–585 |
| H5 | Initial layout/appearance controls create the same source transactions as code editing                        | H4         | 2%     | 10–15m   | T+390–585 → 400–600 |

### I — Acceptance

| ID | Acceptance output                                                                            | Depends on | Effort | Duration | Start → finish      |
| -- | -------------------------------------------------------------------------------------------- | ---------- | ------ | -------- | ------------------- |
| I1 | End-to-end compose/drop/undo/apply/reopen journey passes                                     | H5         | 2%     | 10–15m   | T+400–600 → 410–615 |
| I2 | Different displays, repeated occurrences, sibling state and draft sizing behave consistently | I1         | 2%     | 10–15m   | T+410–615 → 420–630 |
| I3 | App/attached-runtime isolation and restart/external-change recovery are demonstrated         | I2         | 2%     | 10–15m   | T+420–630 → 430–645 |
| I4 | Serialized small/dense fixture timings retained with clear measurement boundaries            | I3         | 2%     | 10–15m   | T+430–645 → 440–660 |
| I5 | Required repository checks and scoped conformance review complete; review-ready handoff      | I4         | 2%     | 20–40m   | T+440–660 → 460–700 |

I5 includes an indivisible machine verification gate, hence the larger duration; no correctness review beyond existing authorization is implied. I3 assumes an available attached runtime, and otherwise reports the outstanding device proof rather than claiming it passed.

## Reserve and re-estimation

R reserves 10% active effort and 50–75 elapsed minutes for integration fixes involving source offsets, library adapters or runtime publication; it is not invented implementation work. Spend it at the affected checkpoint and shift subsequent offsets, rather than pretending it all happens after acceptance.

Stop and revise the plan if a missing prerequisite is found, isolation needs another architecture, an ordinary slice needs a new subsystem, or reserve is exhausted. Repair work is split into its own reviewable slices once understood. Library research and a new type system are not covered by this repair allowance.

## Checkpoint forecast

| Elapsed checkpoint | Expected position without external waits                                 | Uncertainty                                                            |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| T+1h               | A4–B2: research/contract gate finishing or first source override working | No visible Studio expected; research may reveal a blocker              |
| T+3h               | C2–D4: persistence/Apply underway or first configured canvas documents   | A slow path has not reached preview hosting yet                        |
| T+6h               | E4–H2: isolated preview work through early drag interaction              | Broad range; revise after actual integration timings                   |
| T+8h30–12h55       | Review-ready first workflow if prerequisites and contracts held          | Includes reserve; external reviews/device availability remain separate |

The minimal spec stays unchanged; execution detail lives here. [Progress Report](../../agents/skills/progress-report/SKILL.md) takes over actual completion reporting when execution is authorized.
