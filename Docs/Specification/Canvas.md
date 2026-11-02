# Canvas WIP

A canvas edits one view through live previews and loose UI drafts; the behavior below is agreed design, not implemented functionality.

```tao
// Illustrative shape; the canvas body syntax remains to be designed.
canvas Foo {
   // Target: ViewFoo
   // Previews: narrow/light and wide/dark
   // Canvas Drafts: loose render trees awaiting insertion
}
```

#### Canvas, Preview and Display

A **Canvas** targets one view definition and contains multiple **Previews** of it, plus **Canvas Drafts**. A canvas declaration may live in any Tao source file and can be reopened in canvas mode.

A Preview supplies inputs and a [Display](Live%20Previews.md), including dimensions and environment. Lifting a rendered view creates a preview at its measured size, retaining ordinary input values and live datasource/entity references; missing entities remain explicitly unavailable.

#### Canvas Draft

A Canvas Draft is a loose render tree with independent position and drafting dimensions. The Insert menu supplies supported views and their defaults; drafts can be composed by dropping into eligible draft containers.

Draft bounds do not impose dimensions on the inserted render expression. Shift-drop applies those dimensions explicitly and shows a lock with width and height while dragging.

#### Working copy and Apply

Canvas edits update a durable local file working copy; canvases editing the same file share that copy. Helpers elsewhere in the file may also be edited, while project source and attached app runtimes remain unchanged until **Apply**.

**Autosave** preserves local work; **Apply** publishes the file and establishes a new baseline without closing the canvas. **Undo** edits only the working copy; **Revert** discards its pending edits and returns to project source.

#### Source ownership and recovery

Workspace editors block other edits to a file owned by an unapplied canvas working copy, offering Open canvas or Cancel. An unexpected external change blocks Apply: project source stays authoritative, and reopening from project preserves the old canvas work as a recovery snapshot; no automatic merging occurs.

#### Drop destinations

A drop inserts into the canvas target definition only; it never creates a new view definition or edits a called view's private implementation. Ordinary destinations accept caller content; named render slots accept slot fills, with occupied single-fill slots replaced through an undoable edit.

Active branch and loop bodies use the same source insertion operation; loop-body insertion affects every iteration. Inactive branches, empty loops and destinations without reliable source mapping have no spatial drop target initially.

#### Drag feedback

A precomputed **Drop map** selects source destinations independently of temporary layout changes. Cmd reveals its regions and the active region; otherwise both are invisible, while the selected container remains outlined.

A layout-aware **Placeholder** appears only in the hovered preview; completed drops update all previews sharing the working copy. Runtime updates continue during dragging, but an invalidated destination cannot silently become another destination.

#### Source and visual editing

Studio presents datasource definitions as text, the working source, and the canvas; Design and Interact modes separate authoring from app actions. Code feedback identifies the selected source body and proposed insertion; invalid code retains an outdated last-good preview with visual editing paused.

#### Initial scope and deferred details

Start with basic layout and appearance controls, with advanced styling edited in code. Canvas syntax, crowded-target selection and precision zoom remain open; animation, token/style editors, external-editor coordination and merging are deferred.

Terms: [Terminology](Terminology.md). Contributor design: [architecture](../Dev%20Env/Canvas%20Architecture.md) and [implementation plan](../Dev%20Env/Canvas%20Implementation%20Plan.md).
