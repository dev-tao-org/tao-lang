# Actions and Results WIP

Actions run explicitly in response to an event or a `do` call.

```tao
use tao@ui Button, Col, Text

view Editor {
  state Message = "Before"

  action Rename() {
    set Message = "After"
  }

  render Col {
    Text(Message)
    Button("Rename") { on press Rename }
    Button("Rename too") { on press -> do Rename() }
  }
}
```

#### `action Rename() { ... }`

Declare an action in a view before `render`. It can read the view’s values, write visible state, and call other visible actions, including from a private nested view. A view instance owns its actions and state. Actions accept text parameters and run synchronously. `do Rename()` runs the action before the caller continues.

#### `on press Rename`

Bind a parameterless action to the standard `Button(Label)` to run it on press. `on press -> do Rename()` creates an anonymous action that calls `Rename` when pressed. Use `on press -> { ... }` for several statements. Registering a handler does not run it, and changes to values it reads do not trigger it.

#### `on press -> do Rename()`

An unbraced handler contains one `do` call or one `set` statement. Write `do`, the action name and the opening `(` on the same line as `->`. Arguments can continue on later lines. For `set`, put the keyword, the state name, `=` and the start of the value on the arrow line. A braced handler can open with `{` on a later line.

#### Planned action inspection

The agreed MVP design below uses `when ACTION` to inspect aggregate activity and `pick ACTION` for first-match rendering. Inspection, returned results, failure handling and guards are not implemented.

```tao
when Save {
   pending -> Text("Saving…")
   failed -> Text("The last save failed.")
   completed -> Text("The last save completed.")
}
```

#### `when ACTION`

MVP inspection supports only direct matching on an action. It does not expose individual executions, public actionStatus handles, history collections or retained-result selectors. Richer predicates and inspection forms are deferred in [Advanced Action Execution](../Roadmap/Advanced%20Action%20Execution.md).

View-local actions belong to individual view instances, with ownership stable across ordinary re-renders. Inspecting an action does not invoke it. Pending is true while any invocation remains pending. Failure or successful completion reflects the most recently concluded execution by completion order, not start order. Pending can coexist with the previous terminal outcome.

The `completed` branch has no return-value payload; action code captures ordinary returned values explicitly. An `otherwise` branch runs only if none of the listed cases in that `when` match. Slow reporting has a default threshold of three seconds, overridable on the action; it reports delay without stopping or repeating execution.

The active vocabulary is `idle`, `pending`, `slow`, `completed`, `failed` and `concluded`. Idle means no invocation has started. Slow concerns an executing invocation exceeding its threshold. Concluded means a terminal outcome exists and no invocation remains pending. Cancellation and its previously chosen `cancelling`/`cancelled` statuses are deferred post-MVP in full.

#### `pick ACTION` in rendering

`when` renders every matching branch. `pick` renders only the first matching branch in source order. An `otherwise` branch supplies the fallback when no preceding case matches. Both inspect aggregate action activity without invoking it.

```tao
pick Save {
   pending -> Button("Saving…") [disabled yes]
   failed -> Button("Try again") { on press Save }
   otherwise -> Button("Save") { on press Save }
}
```

Here pending takes precedence over a previous failure, so the two buttons never render together. This selection does not change the underlying activity or acknowledge failures.

#### Returned values

Binding `let Chosen = do PickFiles()` yields the declared return value after successful execution, not an operation wrapper. Starting an action again with `do` creates a new invocation rather than retrying a previous submission.

#### Failure presentation

Inspection does not consume failures. Explicit handlers own presentation; default recovery UI covers otherwise unhandled failures. A newer aggregate outcome does not itself acknowledge an older failure. Matching evaluates conditions against a single snapshot before branch effects run. A failure branch can bind its payload as `failed -> Failure { ... }`. Detailed invocation handling and retention remain deferred.

#### Disabled interaction

Disabled interaction is future behavior planned with the [layout and style bracket system](../Roadmap/Immediate%20Implementation%20Queue.md). A disabled container suppresses user interaction in descendant controls. Descendants cannot override a disabled ancestor. Timers, reactive work and programmatic actions continue. Standard controls honor the inherited state, and raw custom controls follow the [TypeScript runtime contract](Runtime%20TypeScript%20API.md#disabled-interaction).

The proposed ActionButton uses aggregate action inspection. Its exact implementation will be designed with the controls that consume this behavior.

#### Deferred execution features

[Advanced Action Execution](../Roadmap/Advanced%20Action%20Execution.md) preserves prior decisions and open questions about status handles, invocation history, result retention, cancellation targeting, progress, concurrency and retry. These are not prerequisites for MVP aggregate matching.

#### Guards

An action-level `check` ends the action normally when the check fails. A render guard ends its current render block. Optional booleans are valid. Test presence explicitly when checking for a supplied value, or test affirmatively when checking for true.
