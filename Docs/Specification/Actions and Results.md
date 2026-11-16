# Actions and Results WIP

The agreed MVP action inspection surface matches aggregate activity through `when ACTION` or first-match rendering through `pick ACTION`; the design below is not yet implemented.

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

#### Event actions

In an action-expected event binding, `-> ...` is shorthand for an anonymous `action() { ... }`. An existing action can also be registered directly:

```tao
view Editor {
   state Message = "Before"

   action Rename() {
      set Message = "After"
   }

   render Col {
      Text(Message)
      Button("Rename") { on press -> do Rename() }
      Button("Rename directly") { on press Rename }
   }
}
```

Registration does not execute the action during rendering. The direct reference retains the existing action's identity; the anonymous wrapper has its own identity and delegates to that action when invoked. The registered action must satisfy the event's handler signature. In pure callback positions, arrows retain the pure-function rules in [Inline Functions](Inline%20Functions.md). These event forms are agreed future syntax.

#### Returned values

Binding `let Chosen = do PickFiles()` yields the declared return value after successful execution, not an operation wrapper. Starting an action again with `do` creates a new invocation rather than retrying a previous submission.

#### Failure presentation

Inspection does not consume failures. Explicit handlers own presentation; default recovery UI covers otherwise unhandled failures. A newer aggregate outcome does not itself acknowledge an older failure. Matching evaluates conditions against a single snapshot before branch effects run. A failure branch can bind its payload as `failed -> Failure { ... }`. Detailed invocation handling and retention remain deferred.

#### Disabled interaction

`[disabled Condition]` is available on a rendered view or container. The condition is `yes`, `no`, or a name that refers to a boolean value. A disabled container disables its descendant controls. A child with `[disabled no]` remains disabled until its ancestors are enabled.

Tao controls expose their disabled state to the platform and suppress user input and activation. Timers, reactive work and programmatic calls continue. Sidecars composing Tao controls inherit the state automatically. Raw controls follow the [TypeScript runtime contract](Runtime%20TypeScript%20API.md#disabled-interaction).

The current implementation shares this context within one compiled runtime. A control from a separately bundled Tao library does not yet inherit another library's disabled context. Cross-library inheritance is scheduled with the [package/runtime layout work](../Roadmap/TypeScript%20Library%20Decisions%20and%20PoC.md#cross-library-disabled-inheritance).

The proposed ActionButton's exact implementation must respect the reduced MVP inspection surface, without introducing individual execution inspection.

#### Deferred execution features

[Advanced Action Execution](../Roadmap/Advanced%20Action%20Execution.md) preserves prior decisions and open questions about status handles, invocation history, result retention, cancellation targeting, progress, concurrency and retry. These are not prerequisites for MVP aggregate matching.

#### Guards

An action-level `check` ends the action normally when the check fails. A render guard ends its current render block. Optional booleans are valid. Test presence explicitly when checking for a supplied value, or test affirmatively when checking for true.
