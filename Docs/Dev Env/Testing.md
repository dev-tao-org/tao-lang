# Repository testing

The [Tests specification](../Specification/Tests.md) explains Tao journey syntax. Run `./agent test`
for the repository TypeScript suite and Tao app journeys; `./tao test Apps` selects Tao journeys only.

Full verification includes web, iOS Simulator and Android Emulator. On macOS, set
`TAO_IOS_EXPO_GO` to the SDK-matched simulator app directory and `TAO_ANDROID_EXPO_GO` to the
matching emulator APK before running `./agent unsandboxed verify --yes`. Use `verify --web-only`
for the portable verification subset. The hosted Verify check requires the web and TypeScript
job and both native jobs. The iOS job uses Xcode on macOS. The Android job uses an API 36
emulator and hardware acceleration on Linux.

To run only one native platform or one authored file, use the same test discovery and select
an Expo Go binary for that target.

```sh
./agent unsandboxed test --platform ios --expo-go "/path/to/Expo Go.app" --yes
./agent unsandboxed test "Apps/Tests/UI Interactions/Disabled Controls.test.tao" \
  --platform android --expo-go "/path/to/Expo Go.apk" --yes
```

Each suite creates and deletes its own device, drives the React Native UI with Appium, and launches
a fresh app for each journey case. Close the Simulator viewer before a local iOS run. The Android
SDK needs the API 36 Google APIs system image for the host architecture. A full native suite also
opens the ordinary React Native consumer of the compiled Tao library. Logs are retained under
`.artifacts/logs/native-journeys/`. CI verifies the pinned Expo Go download by digest, restores tool
and dependency caches, and keys the iOS WebDriverAgent build cache on the Xcode and workspace lock
identity.

With authorization to run hosted CI, push the feature branch and run `./agent unsandboxed verify-ci`
from its checkout. The command checks that the pushed revision matches the current branch and
dispatches the required Verify workflow. Use `verify-ci --status` to find the run for that commit.

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
the first error produces a terminal notice. Completion reports warning/error message counts and
then lists compact warning details, including source locations when available. Slow-test warnings
put the absolute source-file path first; full messages remain in the log. Warnings do not change
the exit status.

Workspace tests supply change notifications and control debounce turns while keeping file reads
and compilation real. They check Tao's response to changes without depending on native watcher
timing. Preview performance runs exercise the real disk-save, watcher and refresh path.
