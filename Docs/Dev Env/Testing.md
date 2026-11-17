# Repository testing

The [Tests specification](../Specification/Tests.md) explains Tao journey syntax. Run `./agent test`
for the repository TypeScript suite and Tao app journeys; `./tao test Apps` selects Tao journeys only.

Repository TypeScript tests report warnings for slow cases. Set the threshold in seconds for one
invocation, optionally selecting a test file or directory:

```sh
./dev test --slow 0.25
./dev test CLIs/test-CLIs/cli-checks.slow-tests.test.ts --slow 0.25
```

`./agent test` accepts the same option. The default is 0.075 seconds; only cases strictly above the
threshold warn. Zero reports every positive case duration. Warnings do not change pass/fail results.
This threshold currently applies to TypeScript test reports; Tao journeys print their durations
without slow-test warnings.

Repository tests run concurrently by default with five TypeScript workers and one Tao worker.
The Tao worker runs its assigned files in order. Each case creates and cleans up its own app session.
Compiler assets are prepared once
before workers start. Performance measurements stay serial.

```sh
./dev test
./dev test --serial
./dev test --parallel 6 --slow 0.25
./tao test Apps --serial
```

`--parallel` without a number uses the default split. When both sections run, a numeric budget
reserves one worker for Tao and assigns the remainder to TypeScript. A budget of one runs the
TypeScript section before Tao. `--serial` also uses one worker per section and cannot be combined
with `--parallel`. A TypeScript-only run can use the entire budget. A Tao-only run uses one worker.
Independent failures are collected after all started workers finish.

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
the first error produces a terminal notice. Completion reports warning/error message counts and
then lists compact warning details, including source locations when available. Slow-test reporting
emits one warning per worker with the number of cases over the threshold, the slowest duration,
and a path to the complete JUnit timing report. Individual timing rows and headings do not count
as separate warnings. Full test output remains in the log. Warnings do not change the exit status.

Workspace tests supply change notifications and control debounce turns while keeping file reads
and compilation real. They check Tao's response to changes without depending on native watcher
timing. Preview performance runs exercise the real disk-save, watcher and refresh path.
