# Tests WIP

A `tests { ... }` block groups independent app journeys that exercise controls and assert visible results.

```tao
tests "App interactions" {
  test(Label "Edit and save") {
    run UIInteractions
    expect text "Ready"
    expect #name input value "Original"
    type "Hello World" into #name
    press #save
    expect text "Saved"
    expect #name input value "Hello World"
  }
}
```

#### `run UIInteractions`

Each case launches an app declared in the same source or imported into it, in a fresh isolated
session. The same steps run on headless web, iOS Simulator and Android Emulator.
[Forms.test.tao](../../Apps/Tests/UI%20Interactions/Forms.test.tao) is a runnable example.
The current runner requires `run <app>`. Direct rendering, state overrides, authored devices and
datasource arguments below are agreed future behavior.

#### `test(Label "Edit and save")`

Labels are optional; unnamed cases are reported by file and line.

#### `type "Hello World" into #name`

Typing replaces the input's existing value; cursor-position specifiers are deferred.
`press #save` activates the selected control.

#### `expect text "Saved"`

Text assertions match exact visible text; `expect #name input value "..."` checks input contents.
Assertions wait for their condition within a bounded timeout.

#### Direct rendering and supplied setup — proposed

These examples specify future behavior; referenced views, data types and datasources are declared
elsewhere.

```tao
tests "Sign-in" {
  test(Label "Administrator signs in") {
    render LoginForm(Admin yes) {
      state Username = "admin"
    }

    type "Foo" into #username
    expect #username input value "Foo"

    type "Bar" into #password
    press #login
    expect text "Logged in"
  }

  device NarrowWeb {
    platform web
    width 320px
    height 640px
    appearance dark
    locale "en-GB"
  }

  let SharedData = InMemory(action {})

  test(SharedData, NarrowWeb, Label "Narrow sign-in") {
    render LoginForm(Admin no)
    expect text "Log in"
  }
}
```

#### `test(SharedData, NarrowWeb, Label "Narrow sign-in")` — proposed

A case accepts an optional label, datasource instance and device using ordinary type matching;
argument order is insignificant. An unconfigured case can use `test { ... }`.

#### `render LoginForm(Admin yes) { ... }` — proposed

Each case starts with a fresh render and, by default, a fresh in-memory datasource. Explicitly
reusing a datasource shares its data. Render-body state specifications replace initializers before
the first render; rerenders do not reapply them, as in [live previews](Live%20Previews.md).

#### `device NarrowWeb { ... }` — proposed

Tests use `Device`; previews use `Display`. Devices specify platform, dimensions and environment
inputs, including appearance, accessibility, locale and time. They can be declared directly or
constructed with `WebDevice(...)`, `IOSDevice(...)` and `AndroidDevice(...)`.

#### Default devices — proposed

Without an explicit device, tests use the configured default set, initially headless web only.
Omitting a platform selects headless web. Unavailable platforms are skipped rather than passed.
