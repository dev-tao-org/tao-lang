# Type Conversions WIP

The agreed future `as` expression runs a declared converter or uses an existing value at a compatible type.

```tao
type Label is text with {
   Label as text { return "converted" }
}

let Original = Label "start"
let Result = Original as text // text "converted"
state Current = Original as text // text state initially holding "converted"
```

#### `Value as Type`

Tao resolves the conversion from the operand's static type and the requested type. The same expression has the same meaning in a `let`, a `state`, or an argument. A literal and a variable with the same static type qualify for the same conversions. A `let` or `state` infers the result type of its initializer. A state keeps that type for later writes.

#### Declared converters

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

When there is no matching converter, `as` accepts an operand whose entire static type already fits the target without constructing a new value. This includes nominal ancestors, unions, optionals, and [structural interfaces](Structural%20Interfaces.md) when available. Tao preserves the existing value. Use `or` to declare a union and use the union's name as the `as` target.

```tao
type Product is { Name text }
type Category is { Title text }
type PreviewItem is Product or Category

let Featured = Product { Name: "Notebook" }
let Stationery = Category { Title: "Stationery" }

view Catalog {
   state Preview = Featured as PreviewItem

   action ShowStationery() { set Preview = Stationery }
}
```

`Preview` starts with `Featured` and can later hold a `Category`. A union-to-member conversion needs a converter or a value whose type has already been narrowed.

```tao
type ProductID is text

view ProductPicker {
   state Selected = none as ProductID?

   action SelectProduct(ID ProductID) { set Selected = ID }
   action ClearSelection() { set Selected = none }
}
```

`Selected` starts empty and can later hold a `ProductID`.

#### Construction and diagnostics

`Label "start"` constructs a `Label`. Both `"start" as Label` and `Raw as Label`, where `Raw` is `text`, require a declared converter. A missing converter can be reported as ``text would need an `as Label { .. }` converter``.

Tao rejects `Label as Label { ... }` at its declaration. It also rejects `Original as Label` when `Original` already has type `Label`, with the diagnostic ``Original is already `Label` ``.

```tao
type Label is text with {
   // Label as Label { return Label "normalized" } // Error: same-type converter.
}

let Raw = "start"
let Original = Label "start"
// let FromLiteral = "start" as Label // Error: missing converter.
// let FromVariable = Raw as Label // Error: missing converter.
// let Same = Original as Label // Error: Original is already `Label`.
```

#### Grouping

`as` groups after construction and arithmetic. Parentheses can put the conversion inside the constructor argument.

```tao
type Score is number

let Points = Score 2 as number // (Score 2) as number, yielding number 2.
let Input = Score 2
let Rebuilt = Score (Input as number) // Converts Input to number, then constructs Score 2.
// let Total = 1 + 2 as Score // (1 + 2) as Score. Needs a number as Score converter.
```

#### Availability

This is agreed future behavior. The conversion expression replaces the explicit `let Name is Type = Value` and `state Name is Type = Value` forms. Where a converter applies, migrating an annotation to `as` can change the initializer's value.
