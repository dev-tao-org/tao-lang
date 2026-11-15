# Reactive Expressions WIP

In the agreed expression model, expressions depend on their input values and propagate changes only when their resulting values change.

```tao
let Total = Price * Quantity
```

#### Expression inputs

`Total` depends on `Price` and `Quantity`. A changed input causes the dependent expression to re-evaluate. If the resulting value is unchanged, that evaluation does not trigger downstream dependents.

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

This records agreed behavior; it does not establish implementation or verification status.
