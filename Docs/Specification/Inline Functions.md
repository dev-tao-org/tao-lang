# Inline Functions WIP

The agreed future inline function expression gives a pure callback a parameter and a returned expression.

```tao
Attachment -> Attachment.Name
```

#### `Parameter -> expression`

The receiving function supplies the expected parameter type. The expression determines the callback's return type. A named pure function can be supplied in the same position.

#### Filtering and narrowing

When a filtering predicate proves a more specific type for retained elements, the output collection has that narrower element type. For example, `Failure -> Failure is Conflict` retains conflicts and gives the output collection the `Conflict` element type. A predicate returning an ordinary boolean remains valid without narrowing when the compiler cannot establish that proof.

#### Named predicates

Extracting a proven refinement predicate into a named pure function preserves its narrowing behavior. Compiled Tao exports retain that refinement in the function contract, including across package boundaries. An opaque sidecar declaring only a boolean result does not establish a refinement.

#### Block bodies

Use `Parameter -> { ... return Expression }` for a multi-statement pure inline function. The block follows the same rules as a named pure function: local calculations and branching are allowed, while mutations and action invocations are not. A block requires an explicit return; its last statement is not implicitly returned.

#### Reactive inputs

Values read through inline functions participate in the enclosing calculation's dependencies. See [Reactive Expressions](Reactive%20Expressions.md) for the general re-evaluation rule.

#### Availability

This is agreed future behavior, not implemented syntax.
