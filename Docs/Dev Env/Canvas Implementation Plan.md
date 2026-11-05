# Canvas implementation plan — draft

Build against the [behavior spec](../Specification/Canvas.md) and [architecture proposal](Canvas%20Architecture.md). This is a review outline, not authorization to begin Studio implementation.

## Sequence

| Slice                  | Deliverable                                                                  | Acceptance focus                                                                           |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Research and choose | Compare relevant libraries and existing implementations against the proposal | Resolve syntax, isolation and dependency choices; record tradeoffs                         |
| 2. File working copies | Workspace-owned source snapshots, durable local storage, ownership and Apply | Restart recovery; helpers retain scope; external changes cannot be overwritten silently    |
| 3. Canvas documents    | Agreed Tao representation, target view, previews, displays and drafts        | Open a project canvas or resume a local one; multiple canvases share one file copy         |
| 4. Isolated previews   | Working and hover candidates delivered to the correct runtimes               | Phone/app unchanged until Apply; hover changes only its preview                            |
| 5. Source destinations | Stable source/render mapping, content and slot contracts                     | Private definitions remain untouched; visible loop/branch mappings are unambiguous         |
| 6. Studio shell        | Datasource-definition text, code and canvas panes; Design/Interact           | Source errors retain marked last-good output; source feedback identifies the intended edit |
| 7. Draft composition   | Insert menu, draft bounds, drop map, placeholder, Shift sizing               | Compose drafts and consume them through one undoable insertion                             |
| 8. Basic properties    | Initial layout/appearance controls and source synchronization                | One gesture produces one edit; bounds remain separate from authored sizing                 |
| 9. Acceptance          | Representative authoring journeys and serialized performance runs            | State retention, recovery, multi-preview isolation and edit-to-preview latency             |

## Dependency gates

- Language-first: the required Tao primitives will be implemented elsewhere and merged before Studio implementation starts; a TypeScript-owned replacement UI is not the selected fallback.
- Verify structured values and expressions, state/reactivity, actions/callbacks, conditional/repeated rendering, rich foreign parameters and the content/slot contracts used by the chosen UI. Missing capabilities remain explicit blockers, not tasks hidden inside UI slices.
- Consume and validate the separate compiler branch's generated-module work; do not assume it has completed.
- Content, slots, branches, loops and other missing language features need explicitly scoped compiler slices before their UI destinations are enabled.
- Finalize the canvas syntax and working-copy/runtime isolation proof before building the full interaction surface.

## Development toggles

Keep targeting and placeholder strategies interchangeable during evaluation. Choose defaults from measured behavior; unsupported mappings can remain disabled without changing the source-edit model.

## Working agreement

Use the spec for observable behavior, the architecture for ownership/contracts, and this plan for sequencing and evidence. Update the relevant document when a decision changes; add detail only when a slice needs it.

Detailed tasks, execution progress and raw measurements belong in `.artifacts/`, not in the behavior spec. Future scope includes animation, precision loupe, advanced token/style editing, external IDE sessions and conflict merging.

## Implementation structure

The [sliced forecast](Canvas%20Implementation%20Structure.md) applies the [implementation-slicing skill](../../agents/skills/implementation-slicing/SKILL.md): small acceptance slices, effort allocation, duration ranges and cumulative checkpoints. Estimates are conditional on the language/compiler prerequisites arriving; their external implementation time is not included.
