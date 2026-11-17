# Type Conversions WIP

Use `as` to widen a value from a nominal scalar type to one of its ancestors.

````tao
type Score is number
type Total = number

view Scores {
  state Points = Score 2 as Total

  action Update() { set Points = 7 }

  render inject Points ```ts
    return <Tao.Text>{String(Points)}</Tao.Text>
  ```
}
````

#### `Value as Type`

Tao resolves the conversion from the operand's static type and the requested type. The same expression has the same meaning in a `let`, a `state`, or an argument. A literal and a variable with the same static type qualify for the same conversions. A `let` or `state` infers the result type of its initializer. A state keeps that type for later writes.

#### File-local scalar types

`type Score is number` declares a distinct type backed by `number`. `type Total = number` and `type Points = Total` share the identity of `number`. File-local types can derive from `text`, `number`, or another file-local type. Use `Score 2` to construct a nominal scalar, or `Score (Value)` for a grouped input. Number literals support finite decimal and scientific-notation values.

#### Declared converters

Declared converters are agreed future behavior. When a converter applies, it runs before fallback widening.

Either the source or the target type can declare the converter in its `with` body. The source type name binds the operand inside that body. The converter's result type is its declared target. Converters follow the rules for pure functions.

Tao considers converters whose declared target has the requested type identity and whose declared source is the operand's type or one of its nominal ancestors. A transparent alias shares its target's identity. The closest declared source wins, starting with the operand's own type. If two candidates are equally close, Tao reports an ambiguity at the conversion and identifies both declarations. A selected converter runs once for each evaluation of the expression. If it fails, the failure propagates.

The following example chooses `OrderNumber as PublicCode` over the declaration on `NumberCode`. Both converters are declared on a source type. The target-owned `OrderNumber as ExportCode` is also available.

```tao
type PublicCode is text

type NumberCode is number with {
   NumberCode as PublicCode { return PublicCode "Code { NumberCode }" }
}

type OrderNumber is NumberCode with {
   OrderNumber as PublicCode { return PublicCode "Order { OrderNumber }" }
}

type PriorityOrder is OrderNumber

type ExportCode is text with {
   OrderNumber as ExportCode { return ExportCode "export-{ OrderNumber }" }
}

let Order = PriorityOrder 42
let PublicResult = Order as PublicCode // PublicCode "Order 42"
let Exported = Order as ExportCode // ExportCode "export-42"
let Label = (Order as PublicCode) as text // text "Order 42"
// let Direct = Order as text // Error: no converter declares text as its target.
```

Write each conversion when going through an intermediate type. Ordinary argument matching uses compatible types directly. A function taking `text` can receive `PublicResult` without another `as`.

Replacing the `PublicCode` declaration with the following makes `Order as PublicCode` ambiguous. Both matching converters declare `OrderNumber` as their source.

```tao
type PublicCode is text with {
   OrderNumber as PublicCode { return PublicCode "Public { OrderNumber }" }
}
```

#### Widening and named unions

In the agreed future design, when there is no matching converter, `as` accepts an operand whose entire static type already fits the target without constructing a new value. In addition to implemented nominal widening, this includes unions, optionals, and [structural interfaces](Structural%20Interfaces.md) when available. Tao preserves the existing value. Use `or` to declare a union and use the union's name as the `as` target.

```tao
type Product is { Name text }
type Category is { Title text }
type PreviewItem is Product or Category

let Featured = Product { Name: "Notebook" }
let Stationery = Category { Title: "Stationery" }

view Catalog {
   state Preview = Featured as PreviewItem

   action ShowStationery() { set Preview = Stationery }

   render "Catalog"
}
```

`Preview` starts with `Featured` and can later hold a `Category`. A union-to-member conversion needs a converter or a value whose type has already been narrowed.

```tao
type ProductID is text

view ProductPicker {
   state Selected = none as ProductID?

   action SelectProduct(ID ProductID) { set Selected = ID }
   action ClearSelection() { set Selected = none }

   render "Choose a product"
}
```

`Selected` starts empty and can later hold a `ProductID`.

#### Construction and diagnostics

`Label "start"` constructs a `Label`. Both `"start" as Label` and `Raw as Label`, where `Raw` is `text`, are rejected by widening. In the future converter design they require a declared converter.

Tao rejects `Original as Label` when `Original` already has type `Label`, with the diagnostic ``Original is already `Label` ``. The future converter syntax also rejects same-type converter declarations.

```tao
type Label is text

let Raw = "start"
let Original = Label "start"
// let FromLiteral = "start" as Label // Error: missing converter.
// let FromVariable = Raw as Label // Error: missing converter.
// let Same = Original as Label // Error: Original is already `Label`.
```

#### Grouping

`as` groups after construction. Parentheses can put the conversion inside the constructor argument. The agreed future arithmetic grammar groups arithmetic before `as`.

```tao
type Score is number

let Points = Score 2 as number // (Score 2) as number, yielding number 2.
let Input = Score 2
let Rebuilt = Score (Input as number) // Converts Input to number, then constructs Score 2.
```

#### Availability

The conversion expression replaces the explicit `let Name is Type = Value` and `state Name is Type = Value` forms. Initializers with the intended type already can use `let Name = Value` or `state Name = Value`. Declared converters, unions, and optionals are future behavior.
