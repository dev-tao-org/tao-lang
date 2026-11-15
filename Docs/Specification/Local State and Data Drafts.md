# Local State and Data Drafts WIP

The agreed future design uses detached drafts to edit datasource values before explicitly saving them.

```tao
state Draft = draft Item
```

#### Detached edits

Editing the draft changes a local value. An explicit create or update submits changes to the datasource.

`draft Item` constructs detached editing data; `state Draft = draft Item` creates and retains its writable storage. Draft construction alone does not allocate retained state. Writable fields within that state can be supplied to sidecar parameters declared with `state`.

Ordinary re-renders and datasource query updates do not reinitialize retained draft state or overwrite its unsaved edits. Use `set` to replace a draft explicitly.

#### Persistence

State is in memory by default. The initial persistence feature requires an explicit stable key. Automatic-key shorthand is deferred to a follow-up.

#### Replacement

`set` replaces a slot's value. To submit a change, the operation captures the inputs it needs. See [Data Access and Validation](Data%20Access%20and%20Validation.md#revision-checks) for revision rejection. Language-level retry is deferred in [Advanced Action Execution](../Roadmap/Advanced%20Action%20Execution.md#retry-directions-retained-for-later-implementation).
