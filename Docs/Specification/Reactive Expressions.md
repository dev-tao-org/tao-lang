# Reactive Expressions WIP

Expressions depend on the values they read and pass changes on only when their result changes.

```tao
use tao@ui Button

view SaveButton {
  state Status = "Ready"
  let Caption = "Save: { Status }"
  render Button(Caption) {
    on press -> set Status = "Saved"
  }
}
```

#### `"Save: { Status }"`

Place a text expression inside braces to insert its value into surrounding text. Leave spaces inside the braces. Use `\{` for a literal opening brace. Interpolation works in text arguments and in `let` values; within an action it reads the values current when the action runs.

Here `Caption` depends on `Status`. When the status changes, the button reads the updated caption. If inputs change and the assembled text is equal, views that read only the caption receive no update.

#### Conditional dependencies

Dependencies follow the inputs actually read during evaluation. An inactive branch's inputs do not trigger recomputation. Each evaluation refreshes its dependency set; when a condition selects another branch, that branch reads current values and establishes its dependencies.

#### Function inputs

Inputs read through a callback participate in the enclosing expression's reactive dependencies. Reading surrounding state inside a pure inline function does not hide that dependency.

#### Value equality

Ordinary lists are equal when their lengths, order and corresponding entry values are equal. Ordinary records compare corresponding field values. Primitive values follow their defined Tao equality. Allocation of a fresh but equal list or record does not itself trigger dependents.

Entities and operation handles retain explicit identity semantics. Their changing fields and status remain reactively observable; identity equality must not hide those changes. Comparing an entity does not recursively compare its entire relationship graph.

Ordinary lists and records exposed to sidecars cannot be silently mutated in place. Changes must publish replacement values or use an explicit reactive mutation interface. Sidecar contracts should enforce this boundary where possible and make read versus write authority clear through types and naming.

#### Actions

Actions execute explicitly in response to events through `do`. Changes to their inputs do not re-execute them. Evaluating a reference to an action does not execute its body.

#### Availability

Text interpolation and [pure text function calls](Pure%20Functions.md) are available in Tao apps and compiled TypeScript libraries. The broader expression model, including conditional reads, contextual inline functions and collection values, is agreed future behavior.
