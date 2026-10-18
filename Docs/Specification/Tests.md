# Tests

A `tests { ... }` block groups test cases and their setup. Its label is optional:
`tests "Sign-in" { ... }`. Referenced views, data types and datasource implementations are declared
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

`type` replaces an input's existing value. Cursor-position specifiers are deferred. `press` activates
the selected control. `expect text` matches exact visible text; input contents are checked with
`expect #name input value "..."`. Assertions wait for their condition within a bounded timeout.

Repository TypeScript tests report warnings for slow cases. Set the threshold in seconds for one
invocation, optionally selecting a test file or directory:

```sh
./dev test --slow 0.25
./dev test CLIs/CLIs-src/cli-checks-test/slow-tests.test.ts --slow 0.25
```

`./agent test` accepts the same option. The default is 0.075 seconds; only cases strictly above the
threshold warn. Zero reports every positive case duration. Warnings do not change pass/fail results.
This threshold currently applies to TypeScript test reports; Tao journeys print their durations
without slow-test warnings.

Repository tests run concurrently by default: one Bun process runs TypeScript files with two
internal workers, alongside up to four Tao worker processes. Each Tao worker runs its assigned files in
order; each case still creates and cleans up its own app session. Compiler assets are prepared once
before workers start. Performance measurements stay serial.

```sh
./dev test
./dev test --serial
./dev test --parallel 6 --slow 0.25
./tao test Apps --serial
```

`--parallel` without a number uses the default split. A number sets the total worker budget, keeping
at most two TypeScript workers and assigning the remainder to Tao; a budget of one runs the
TypeScript section before Tao. `--serial` also uses one worker per section
and cannot be combined with `--parallel`. A scoped run uses only its selected section; its default
is two TypeScript workers or up to four Tao workers. Independent failures are collected after all started workers finish.

In an interactive terminal, `./dev` shows a dashboard with one TypeScript column and one column per
Tao worker. Lines wrap within each column; the visible tail is bounded and full output is retained
in the announced log file. Agent and Tao commands use plain output by default, with worker names
prefixing lines. `TERMINAL_UI=1` requests the dashboard, and `TERMINAL_UI=0` requests plain output.
Pipes always use plain output. Agent commands log routine stdout and stderr by default and print
worker verdicts and the final result. `TERMINAL_OUTPUT=1` also streams full output to the terminal;
`TERMINAL_OUTPUT=0` requests concise output for any CLI. Full logs are retained in either mode.
Captured workers cannot start nested dashboards. Interrupting a run stops active workers and
cleans up their app sessions; interrupted or missing worker reports cannot count as success.

Completion lines include each worker's elapsed time. Successful execution ends with a green
`All tests passed in 1.32s` summary; its wall time covers suite execution and reporting after shared
asset preparation. A failed or interrupted run never prints that success summary.

One combined log records `info`, `warn` and `error` messages with their original stream and worker
identity. Ordinary tool stderr is informational unless a Tao adapter explicitly reports a warning
or error. Tao subprocesses preserve these levels. A concise command always announces its log path;
the first warning/error produces a terminal notice, and completion reports warning/error message
counts even when their details stay in the log. Warnings do not change the exit status.

Workspace tests supply change notifications and control debounce turns while keeping file reads
and compilation real. They check Tao's response to changes without depending on native watcher
timing. Preview performance runs exercise the real disk-save, watcher and refresh path.
