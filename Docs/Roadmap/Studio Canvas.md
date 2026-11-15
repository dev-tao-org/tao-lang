# Studio Canvas — deferred implementation roadmap

Build a Tao-authored Studio with synchronized datasource-definition text, source code and editable live canvases. Resume from reviewed `main`, not from the historical development worktree.

## Resume gate

1. Finish the existing partial review and review subsequent preview/compiler changes separately. Landing requires the developer's explicit instruction.
2. Ensure this roadmap and its linked documents have reached `main` through that review. Start a fresh feature branch from current `main` only when implementation is requested.
3. Verify the externally implemented language prerequisites: structured values/expressions, state/reactivity, actions/callbacks, conditional/repeated rendering, rich foreign parameters and the required content/slot contracts. Do not replace missing Tao behavior with a TypeScript-owned Studio UI.
4. Verify nested private views, readable per-input generated modules and memory-backed preview publication against the actual merged code. These were separate workstreams, not completed prerequisites established by this roadmap.
5. Reconcile the documents below with current code, resolve remaining decisions, research libraries, prove isolation, and re-estimate before implementation.

Historical starting point: `feat/metro-memory-preview`, October 26, 2026. Its local artifacts and other branches are evidence only; they are not dependencies of the eventual Studio implementation.

## Document map

- [Canvas behavior](../Specification/Canvas.md): minimal author-facing contract; proposed syntax remains illustrative.
- [Terminology](../Specification/Terminology.md): current, WIP and legacy concepts.
- [Architecture](../Dev%20Env/Canvas%20Architecture.md): workspace, compiler, runtime and Studio ownership.
- [Implementation plan](../Dev%20Env/Canvas%20Implementation%20Plan.md): delivery order and acceptance boundaries.
- [Implementation structure](../Dev%20Env/Canvas%20Implementation%20Structure.md): 45 provisional slices and checkpoints; re-estimate after prerequisite audit. Its 8h30–12h55 range is an unvalidated planning scenario, not a delivery commitment.
- [Implementation slicing](../../agents/skills/implementation-slicing/SKILL.md): maintain small, testable slices as the actual contracts become known.

## Milestones

The agreed [app developer overlay](App%20Developer%20Overlay.md) adds an in-app entry point for inspection, debugging captures and on-screen editing. Integrate its editing with the working-copy/source-edit ownership below; capture and overlay delivery are tracked separately.

| Milestone                              | Reviewable outcome                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Research and contracts                 | Compare editor/source-edit and canvas/drag options after reading the proposed architecture; choose dependencies and settle syntax/isolation with the developer.     |
| Workspace working copies               | Whole-file versions retain their logical path and scope; durable local persistence, shared ownership, undo, Apply and recovery work independently of Studio.        |
| Canvas documents and isolated previews | One target view per canvas, multiple configured previews, local/project canvas discovery; app and attached runtimes remain unchanged until Apply.                   |
| Source-aware editing                   | Visible runtime occurrences map to legal content/slot insertion locations inside the edited definition; unsupported mappings are disabled.                          |
| Tao Studio and draft composition       | Datasource-definition, code and canvas panes; insert presets, draft composition, fixed drop map, hover placeholders, basic properties and one-gesture undo.         |
| Acceptance                             | Demonstrate isolation, state identity, restart recovery, conflicts and realistic edit latency; preserve raw serial timings and identify unverified device behavior. |

## Decisions to preserve

- A canvas references one view. Previews supply dimensions/environment/inputs; a lifted preview starts at the rendered view's measured size.
- Draft bounds are drafting space, not authored layout dimensions. Drop consumes the draft and inserts its render expression; Shift preserves dimensions and displays the size/lock hint.
- Cmd reveals the fixed insertion map and active region. The chosen container remains outlined. Placeholder reflow does not change target regions during the gesture.
- Completed edits affect the canvas working copy; transient hover affects only the hovered preview. Apply publishes project source to ordinary app runtimes.
- Working copies preserve original declaration identity and file scope. Same-file canvases share one copy; no public renamed clone definitions.
- Dirty files are owned by their working session. Unexpected external divergence preserves recoverable local work and adopts project source through an explicit recovery action; no timestamp winner or merge algorithm.
- Tao owns application composition and state/actions. Sidecars remain appropriate for CodeMirror, pointer/geometry processing and host transport.

## Open work and exclusions

### Retained preview findings

Historical October 23 measurements on the memory-preview implementation (40 edits per case, serialized runs) measured warm click-to-last-React-receipt median/p95: one preview 29.3/33.7 ms; two previews 31.6/35.5 ms; two previews plus 500 additional compiled but unmounted view definitions 456.3/496.4 ms. These are React receipts, not physical paint, and include Metro/Refresh timer changes as well as memory delivery. They are not current measurements of the later split-output compiler.

Virtualizing a long list reduces mounted work; it cannot fix the observed compilation/module-volume cost because those 500 definitions were already unmounted. Before claiming realistic fast redraw, measure three separate workloads: many rows reusing one view, a dense mounted screen, and many source definitions. Retest after output splitting; no split-output speedup was established here.

The preview implementation also left a development-time race between rebuilding runtime resources and managed setup, which can change profile identity during installation. Exclusive execution passed but did not fix the race. Changed sidecar snapshots require preview-session restart. Native/device/network delivery, advanced debugger mapping and arbitrary async sidecar lifecycles were not established by the browser tests. Recheck these boundaries against merged code before promising them in Studio.

Detailed historical evidence remains in the original workspace's `.artifacts/notes/radical-preview/implementation-result.md`, `implementation-timings.md` and `final-measurements/`. These local artifacts do not travel with a Git branch; preserve them before deleting that worktree. Their old uncommitted-status wording describes the measurement date, not the later committed branch.

Finalize concrete canvas syntax, named-slot anchors, stable render identities, preview isolation boundaries, placeholder heuristics and dependency choices before their slices. The research phase may change the architecture or split large tasks; do not force unknown subsystems into 15-minute estimates.

Animation, loupe/precision targeting, advanced design-token editing, external IDE working-copy integration and conflict merging are later work. Implementing the missing language itself belongs to the external prerequisite workstream. This document does not authorize implementation, new integrations or landing.
