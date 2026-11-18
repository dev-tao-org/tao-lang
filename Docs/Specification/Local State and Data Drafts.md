# Local State and Data Drafts WIP

Use local state to retain a text or numeric value for the life of a view instance.

```tao
use tao@ui Button

view SaveButton {
  state Caption = "Save"
  render Button(Caption) {
    on press -> set Caption = "Saved"
  }
}
```

#### `state Caption = "Save"`

Declare state inside a view before `render`. Tao infers `text` from `"Save"`. Each instance initializes its own state when mounted and retains it across renders, even when an input used to initialize it later changes.

Use `state Name = Value as Type` to widen an initializer. `state Type Name = Value` is shorthand for the same conversion. Its result type sets the state type for later writes. See [Type Conversions](Type%20Conversions.md).

#### `set Caption = "Saved"`

Use `set` inside an [action](Actions%20and%20Results.md) to replace the nearest visible state binding. Its value must fit the type inferred from the initializer. An equal replacement leaves dependent views unchanged. Unmounting a view discards its local state.

#### Planned detached drafts

The agreed future design uses detached drafts to edit datasource values before explicitly saving them.

```tao
state Draft = draft Item
```

#### Detached edits

Editing the draft changes a local value. An explicit create or update submits changes to the datasource.

`draft Item` constructs detached editing data; `state Draft = draft Item` creates and retains its writable storage. Draft construction alone does not allocate retained state. Writable fields within that state can be supplied to sidecar parameters declared with `state`.

Ordinary re-renders and datasource query updates do not reinitialize retained draft state or overwrite its unsaved edits. Use `set` to replace a draft explicitly.

#### Live fields and conflicts

A draft tracks an existing or not-yet-created entity and a baseline for each field. Untouched fields follow live source changes immediately and advance their baselines. Locally edited fields retain their edits. A field conflicts when the local and source values both differ from its baseline and from each other. Equal local and source values do not conflict.

Choosing the source version adopts only conflicted fields, preserving unrelated local edits. Choosing the local version submits the local patch. The conflict branch receives the live entity; the exact inspection and selection syntax, related-entity behavior, and protection against a source change during selection remain open.

The agreed conflict choices use ordinary updates: `update Draft with Item` adopts the source's conflicted fields locally; `update Item with Draft` submits the draft's changed fields to the datasource. No separate `resolve` or `force` operation is required. This conflict-resolution behavior does not establish general draft-update semantics outside that context.

Choosing the source version reads its latest values at button activation, rather than retaining the version previously displayed. Only fields currently conflicted are adopted; unrelated local edits remain.

#### Submission and confirmation

`create DATA with DRAFT` and `update DATA with DRAFT` explicitly submit to the selected provider. Updates capture only locally changed fields at submission. Later edits remain in the draft while the submission proceeds.

After authoritative creation confirmation, the draft binds to the created entity and preserves newer edits. Local acceptance, an optimistic query value, or a lost acknowledgement is not authoritative confirmation. Providers own queueing, overlapping-write handling and acknowledgement recovery. The public API for distinguishing local and remote acceptance remains open; it does not require general individual-action inspection.

An optimistic echo does not discard submitted edits or their recovery baseline. Matching draft and source values can remove a visible conflict while recovery information remains until authoritative confirmation. If the provider rolls back a rejected write, the draft retains the user's edits. An older confirmation must not erase newer edits.

If a provider cannot confirm the remote outcome, retain the recovery information until confirmation arrives or the draft is explicitly discarded. Lack of confirmation capability does not prevent using editable drafts.

If the source entity is deleted while editing, retain the draft. Saving must not silently recreate the entity. The app may offer explicit creation from the retained draft, with a new provider-assigned identity.

#### Persistence

State is in memory by default. Persist a draft with an explicit stable key:

```tao
state Draft = draft Note (persist "note-editor { Note.Id }")
```

Automatic-key shorthand is deferred to a follow-up.

The agreed future storage schema comes from the initializer's type, including when Tao infers it. For example, `state SidebarWidth = 280 (persist "sidebar-width")` has a `number` schema. Use `as` when the intended schema is wider than the initial value's type.

#### Sign-out

Signing out clears all local app state, including persisted state and drafts. Unsaved edits are discarded and are not restored on a later sign-in. This lifecycle boundary also ends the retention of draft recovery information described above.

App sign-out also signs out of the connected provider. The provider handles clearing its own local state through its logout lifecycle; Tao clears the app state and drafts it owns. Tao does not introduce a separate provider queue-cleanup policy.

#### Draft submission inputs

To submit a change, the operation captures the inputs it needs. See [Data Access and Validation](Data%20Access%20and%20Validation.md#revision-checks) for revision rejection. Language-level retry is deferred in [Advanced Action Execution](../Roadmap/Advanced%20Action%20Execution.md#retry-directions-retained-for-later-implementation).
