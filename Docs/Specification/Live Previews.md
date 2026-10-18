# Live Previews

A `previews { ... }` block declares live previews and their shared setup. Give the group an optional
label with `previews "Label of previews" { ... }`. Referenced apps, views, data types and datasource
implementations are declared elsewhere.

```tao
previews "Widget workspace" {
  let SampleData = InMemory(action {
    let First = create Widget { Name "Notebook" }
    let Second = create Widget { Name "Calendar" }
    create Collection { Name "Desk", Widgets [First, Second] }
  })

  let EmptyData = InMemory(action {})
  let LiveData = AppDevDatasourceForLiveRealData

  display Tablet {
    width 768px
    height 1024px
    appearance light
    locale "en-GB"
    dataSource SampleData
  }

  let DarkDesktop = Tablet with {
    appearance dark
    width 1800px
  }

  preview(Label "Whole app", Tablet, WidgetApp)

  query Widgets from SampleData
  preview(Label "Browse", Tablet, WidgetList(Widgets))
  preview(Label "Edit shared data", DarkDesktop, WidgetEditor(Widgets))

  preview(Label "Empty", Tablet, EmptyData, WidgetList())
  preview(Label "Live data", DarkDesktop, LiveData, WidgetBrowser())

  preview(Label "Administrator sign-in", Tablet, LoginForm(Admin yes) {
    state Username = "admin"
  })

  preview LoginForm(Admin no) in DarkDesktop {
    state Username = "guest"
  }
}
```

`preview(...)` accepts an app or configured view, a display, an optional datasource override, and an
optional `Label "Foo bar"`. Arguments follow ordinary type matching; their order is not significant.
The short form `preview View(...) in Display` uses the display's datasource default.

A display supplies frame dimensions and platform inputs, including appearance, accessibility,
locale and time. `with` copies its configuration while preserving referenced instances. An explicit
preview datasource overrides the display's default without modifying the display.

Datasource values are instances: previews referencing `SampleData` share data and observe each other's
changes. `InMemory(...)` constructs one instance and runs its initialization action against it;
another call constructs another instance. Rerendering a preview does not rerun that setup.

Specifications inside a rendered view's body configure that instance. `state Username = "admin"`
replaces the declared state's default initializer before the first render; subsequent rerenders do
not reset it. This works in ordinary `render` statements as well as previews.
