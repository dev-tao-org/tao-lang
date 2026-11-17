# Structural Interfaces WIP

The agreed future interface declaration describes behavior a type can provide through its associated methods.

```tao
interface DisplayText {
   func ToText() -> text
}

type DeliveryRoute is { Origin text, Destination text } with {
   func ToText() -> text {
      return "{ DeliveryRoute.Origin } → { DeliveryRoute.Destination }"
   }
}

func Caption(Value DisplayText) -> text { return Value.ToText() }

let Route = DeliveryRoute { Origin: "Chicago", Destination: "Boston" }
let Title = Caption(Route) // "Chicago → Boston"
```

#### Inferred conformance

Tao checks the associated methods when a value is used at an interface type. Conformance is inferred from methods declared on the type and inherited methods. Inside an associated method, the owning type name refers to the receiver. For example, `DeliveryRoute.Origin` reads the route supplied to `ToText()`.

#### Compatible signatures

A method can return a more specific type than the interface requires. A read-only input can accept a broader type than the interface promises to pass. When a method writes back through a parameter, the values it can write must fit the interface's write type, and it must have the required write authority. Signature matching uses type compatibility without invoking converters.

Callers use the interface's parameter names as argument labels. For conformance, ordinary parameter names can differ when Tao finds a unique mapping by type. Matching names can distinguish parameters of the same type. Explicit roles constrain the mapping, and ambiguous mappings are errors.

#### Functions, actions and views

An interface can require `func`, `action`, and `view` members. Each requirement is satisfied by the same kind of associated member. Call actions with `do` and use views in render position. A view reached through an interface keeps its normal rendering and lifecycle behavior.

```tao
type InvoiceNumber is text
type InvoiceTitle is text

interface InvoiceSummary {
   func Heading(Number InvoiceNumber) -> text
   action Export() -> text
   view Summary()
}

type Invoice is text with {
   func Heading(Value text) -> InvoiceTitle { return InvoiceTitle "Invoice { Value }" }
   action Export() -> text { return "Invoice { Invoice }" }
   view Summary() { render "Invoice { Invoice }" }
}

type PriorityInvoice is Invoice

let Current = PriorityInvoice "A-42"
let Item = Current as InvoiceSummary
let Title = Item.Heading(Number: InvoiceNumber "A-42") // text "Invoice A-42"

action ExportCurrent() -> text {
   let Contents = do Item.Export()
   return Contents
}

view Card {
   render Item.Summary()
}
```

`PriorityInvoice` inherits all three implementations. The interface's `Number` argument maps to `Value`, which accepts `text`. The result widens from `InvoiceTitle` to `text`.

#### Availability

This is agreed future behavior. General structural interfaces are post-MVP.
