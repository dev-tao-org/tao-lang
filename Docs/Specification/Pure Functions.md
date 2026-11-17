# Pure Functions WIP

A pure function calculates a value from the inputs it reads and does not cause effects.

```tao
package
func Greeting(Value text) {
  return "Hello { Value }"
}

let Message = Greeting("Ada")
```

#### `func Greeting(Value text)`

A text function is declared at file scope and returns a text expression. Tao infers its result type; `-> text` checks an explicit annotation. The body has one `return` and cannot set state or call actions.

#### Argument roles

An unlabelled text argument matches a single remaining text parameter. If more than one role remains, label the arguments by name. In `Join(Right: "b", Left: "a")`, order does not determine which values bind to `Left` and `Right`.

#### Reactive calls

View calculations re-evaluate when values read by a call change. An equal result does not propagate further. See [Reactive Expressions](Reactive%20Expressions.md).

#### TypeScript

A published package-visible text function accepts named arguments, such as `Greeting({ Value: 'Ada' })`, and returns a string synchronously. See [TypeScript Libraries](TypeScript%20Libraries.md).

#### Availability

Text functions are available. Other input and return types, contextual inline functions and larger function bodies remain future work.
