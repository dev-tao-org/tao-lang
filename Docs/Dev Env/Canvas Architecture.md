# Canvas architecture — draft

Original design proposal for the [Canvas spec](../Specification/Canvas.md); library selection and implementation validation remain pending.

## Ownership

| Owner                   | Responsibility                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Workspace authoring API | Canvas documents, file working copies, ownership, autosave, undo, Apply and recovery         |
| Compiler                | Logical source overrides, source identities, insertion contracts and generated variants      |
| Runtime                 | Render occurrences, geometry, active branch/loop mappings and preview outcomes               |
| Studio                  | Tao UI and sidecars presenting code, datasource definitions, canvas and interaction controls |

## Source versions

One working copy contains a complete file, interpreted at its original logical path; only edited files require copies. One compilation snapshot selects exactly one version per path, preserving file-local visibility and relative references without renamed Tao declarations.

The original project feeds attached app runtimes; the working snapshot feeds canvas previews. A temporary drag insertion derives a candidate snapshot without changing either source, and only the hovered preview receives it.

## Local persistence

```text
.tao/store/                      committed project metadata
.tao/local/canvases/<id>/        proposed durable, ignored authoring state
  canvas.tao                    local canvas, or reference to project-owned canvas
  working.tao                   file working copy
  base.tao                      baseline source for Apply comparison
  session.json                  source association and revision metadata
.tao/cache/                     disposable compilation/runtime output
.tao/locks/                     transient coordination
```

Canvases sharing a source file reference one working-copy record; the final storage schema must avoid duplicate authoritative copies. Ordinary cleanup never removes `.tao/local/`; persisted unapplied ownership is distinct from a live process lock.

## Edit transaction

Pointer → fixed Drop map → source destination → temporary insertion → hovered preview. Drop replaces the temporary insertion with the draft expression, consumes the draft, and records one undoable working-copy transaction.

Apply compares project source to the baseline before publishing the file; unexpected divergence preserves both versions and requires recovery rather than merging. A completed Apply advances the baseline and uses the ordinary app delivery path.

## Identity and delivery

Keep source-node identity separate from runtime occurrence identity; loop items add occurrence identity to a shared source destination. Preserve unchanged child keys and stable component functions across insertion edits.

Canvas output must be isolated from ordinary app output, and hover candidates from other previews. Reuse the existing publication protocol with consistent source snapshots, bounded pending work and superseded-result rejection; the concrete graph/runtime isolation needs a PoC.

## Experiments before selection

Compare stable-map versus marker targeting, simple versus layout-aware placeholders, and normal versus enlarged preview interaction. Keep source-edit semantics identical across variants; animation and a loupe are optional later experiments.

## Dependencies and open work

The separate compiler effort supplies categorized generated modules and nested private views. Research editor, canvas/drag, source-editing and preview-hosting options after this proposal is reviewed; no library or new dependency is selected here.

Plan: [implementation slices](Canvas%20Implementation%20Plan.md). Vocabulary: [terminology index](../Specification/Terminology.md).
