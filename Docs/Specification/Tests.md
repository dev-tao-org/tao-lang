# Tests

A `tests { ... }` block groups independent app journeys. Labels are optional; unnamed cases are
reported by file and line. Launch an app declared in the same source or imported into it:

```tao
tests "App interactions" {
  test(Label "Edit and save") {
    run Interactions
    expect text "Ready"
    expect #name input value "Original"
    type "Hello World" into #name
    press #save
    expect text "Saved"
    expect #name input value "Hello World"
  }
}
```

See [Interactions.tao](../../Apps/Tests/Interactions.tao) for the complete runnable example. Each
case starts a fresh isolated headless web session. The current runner requires `run <app>`;
direct view rendering, state overrides, devices and datasources are agreed future behavior below.

`type` replaces an input's existing value. Cursor-position specifiers are deferred. `press` activates
the selected control. `expect text` matches exact visible text; input contents are checked with
`expect #name input value "..."`. Assertions wait for their condition within a bounded timeout.

## Agreed future extensions

The following syntax is a design specification; it is not yet executable. It extends the same
journeys with direct view rendering, supplied initial state, datasource instances and devices.
Referenced views, data types and datasource implementations are declared elsewhere.

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

`test(...)` accepts an optional label, datasource instance and device. Arguments follow ordinary
type matching; their order is not significant. An unconfigured case can be written `test { ... }`.
Unnamed cases are reported by file and line.

Each case starts with a fresh render and, unless supplied explicitly, a fresh in-memory datasource.
Passing the same datasource instance to multiple cases explicitly shares their data. Render-body
state specifications initialize the rendered view's declared state before its first render, as in
[live previews](Live%20Previews.md); rerenders do not reapply them.

Tests use `Device`, not `Display`. A device specifies the execution platform, frame dimensions and
environment settings such as appearance, accessibility, locale and time. Devices can be declared
directly or constructed with helpers such as `WebDevice(...)`, `IOSDevice(...)` and
`AndroidDevice(...)`.

Tests run against the configured default device set unless a device is supplied. The initial default
set contains only headless web; omitting a platform also selects headless web. Unavailable platforms
are reported as skipped, rather than passed.
