# Repo Setup

These agent notes are non-authoritative historical observations. Later entries may supersede earlier evidence.

## Current follow-up

The roadmap's implementation log was moved here at the developer's request. Keep the roadmap succinct.
`TERMINAL_OUTPUT=1 ./agent ...` selects terminal output; the agent default is file logging.
Developer tests log by default, with an explicit terminal override available. Output routing and log setup
are configured at CLI entrypoints; commands no longer request a separate log mode. The log-failure latch,
fallback path and IO configuration test were removed at the developer's request.
Agent configuration uses Rulesync 16.18.0 for hooks and subagents. Unsupported settings are maintained
natively in Codex, Claude Code and Cursor files; equivalent rule changes must be synchronized manually.
Cursor auto-run prose cannot grant an OS sandbox escape. Root host commands use
`.config/agent-host-commands.json`; retained legacy commands keep their separate allowlist.
The Git-permission installer and direct smol-toml dependency were removed by request.
A dedicated new-workspace CI lane is added; hosted execution is unverified.
Local verification passes 61 tests and 319 assertions. Adapter regeneration preserves native settings;
no home configuration changes, branch switching or services were invoked. `my-branch` only switches
to an existing developer branch; `my-sync` and the synchronization machinery were removed by request.
The developer requested a final review of the entire branch from its fork point, followed by landing.

## Earlier implementation notes

Run legacy commands from `old-tao-v1/`: `just setup-tools` builds its pinned tool profile,
and `just test-all` runs the ordinary package, runtime, Tao app, and language performance tests.
Shared formatter dependencies live in `ts/`; install them with `just setup` from the Git root
(or `just setup-ts` from the PoC).
Repository agent configuration stays at the Git root.
Generated artifacts share the root `.artifacts/` directory. The PoC's `.artifacts` is a compatibility
link; its `.devenv` links to root `.devenv/old-tao-v1/`, keeping its reference environment separate
from the new workspace without another generated directory inside the PoC.

The complete final-layout ordinary suite passes: 36 suites, 10,527 passing tests, zero failures,
and 18 existing skipped/todo tests. Run: `./agent test-all --max-lines 35` inside `old-tao-v1/`.
Evidence: `.artifacts/logs/dev-test/2026-10-17T16-15-00-487Z-63720-4dbddb24/summary.json`.
Root workspace tests pass (`./agent test ./`); root `./agent check` runs new workspace
types, comments, unused API exports and formatting without tests. Legacy TypeScript checking passed from its own folder. Root frozen setup
also passes with the committed dependency manifest and lockfile.

Root `./agent check` and `./agent fmt` reuse the dev CLI's command registration.
Command modules default-export shared registrations with inline actions that propagate failures.
Global exception/rejection handlers print yellow stacks before red messages/details, mirror agent
diagnostics to terminal and log, and terminate with the structured child status or 1. Actions and workflow
steps return void; variadic `runSteps` awaits each step and stops on failure.
Setup installs the same global handlers before Commander is installed. Formatting uses
the repository config and repository-relative arguments. Dependency-only formatter, compiler,
installer, package-loader, clock and Commander presentation tests were removed at the developer's request.
Shared `Try` handles synchronous and asynchronous recovery and cleanup, normalizes propagated failures,
and preserves original failure context for finalization. The new implementation uses capitalized
`Errors.ThrowX` helpers with private error constructors; ordering and cleanup-failure regressions are covered.
The former per-command message renderers and debug-message switch are removed. Recoverable log
and timing-report failures still warn and preserve the original command outcome. Global failure
reporting passes 51 tests and 269 assertions, including escaped callbacks, child statuses, color
ordering, and log mirroring; a forced-status mutation is rejected by its regression.
Evidence: `.artifacts/logs/agent/2026-10-17T19-40-17.140Z-24924.log`.
All current Just workflows are registered. Root `fix` and `fmt` format the new workspace and shared
repository files, excluding the legacy implementation. Tao source fixes await the new parser/tooling.
Root `check`, `test` and `verify` operate on the new workspace; `check` never runs
tests. Legacy paths are rejected by root formatting/testing, including existing symlink aliases.
Run legacy workflows from `old-tao-v1/`; agents check/test it only when its files have changed.
Secrets, diagnostics and InstantDB lifecycle retain their existing reference tools; cleanup removes
only the new workspace's dependencies and preserves shared artifacts and legacy dependencies.
Command comments identify parser, app, IDE, runtime and shell-setup steps awaiting new equivalents.
Local InstantDB start/stop now use `.config/local-instantdb/` without invoking reference recipes.
Compose health waiting, database seeding, project identity, service URLs and volume-preserving shutdown remain intact.
The shared formatter excludes relocated archives, native build output and storage captures.
Root lifecycle hooks reach their retained implementations and distinguish root setup/configuration
from the legacy tool profile. `./dev agent-config` regenerates the adapters. There is no root `gates`
command; invoke the retained gate runner from `old-tao-v1/` when legacy changes require it.
Knip uses its root configuration when analyzing the legacy workspace from its own folder.
The new workspace independently installs approved Knip 6.34.0 and runs its export/type and unused-file checks
inside `check` and `verify`, using `ts/knip.ts`. Command entrypoints are derived from the CLI's
registration imports, alongside bootstrap and test entries; orphan command files are rejected.
Shared barrels remain analyzable so namespace exports are checked. Tao bindings,
generated native siblings and declaration facades await their new implementations. No legacy
code, dependencies or executables are borrowed to implement this check. Test-only usage counts as usage.
The branch review skill records the reviewed commit, covers changes since the prior review, and
requires independent conformance, DRY, documentation and compound-condition checks.
Root `just setup-github` preserves the legacy HTTPS URL rewrites, login when required, GitHub
protocol and credential helper configuration, origin normalization, and verification of `main`.
Config-mutating GitHub setup tests were removed at the developer's request; setup is no longer exercised by the ordinary test suite.
`runCommand` prefers simple space-separated strings with `variadicArgs` for forwarded arguments,
retaining command arrays for base arguments containing spaces, and reports command start
and elapsed time. Agent entrypoints set `TAO_AGENT=1`: IO messages and child stdout go to root
`.artifacts/logs/agent/`, while stderr is mirrored to the terminal and log, including suppressed probes.
CLI entrypoints read the environment once and call `IO.config` to select output pipes; IO and command execution do not reread agent-mode variables.
Developer IO remains on the terminal except test-command output, which logs to `.artifacts/logs/dev/`
and mirrors stderr. Each logging process announces its repo-relative log directory once at startup.
An unavailable command log reports once and falls back to terminal output while preserving the verdict.
Tests retain error normalization, source conformance, utility transformations and pure doctor/secrets policy.
All tests using `_command-runner`, including its shared subprocess fixtures, were removed at the developer's request;
CLI logging, fatal-handler and registration integration behavior is no longer covered by those tests.
The seven slow workflow/branch integration tests were removed at the developer's request; ordinary
tests no longer prove root command routing, legacy path isolation, validation gating or branch synchronization.
Tests use dots alongside a JUnit timing report in `.artifacts/logs/test/`. After every run, including
failed runs, yellow stderr warnings list tests taking strictly more than 75ms, slowest first.
Missing timing data reports a warning without replacing the test verdict. No XML dependency was added.
`./agent check` includes the installed TypeScript syntax parser to
require name-led descriptive JSDoc on exported API declarations, reject private JSDoc and ordinary
block comments, and require `Try` outside its exact primitive file. Local/default exports, overloads,
values, types and command factories are covered; forwarding exports do not duplicate origin docs.
Public shape members may carry JSDoc. Strings, templates and regular expressions are not comments.
Multiline JSDoc keeps name-led text on the opening line, aligned continuation stars followed by exactly two spaces,
and ` */` after the last text instead of a separate closing line.
These rules run in `check` and `verify` without new dependencies; `check` never runs tests.
Type, comment and style checks remain internal steps of `check`, with no separate public subcheck commands.
Shared utility tests live in `shared-src/universal-test/`, named for their subject: Errors, S,
Switch_TypeSafe and TryCatch. The redundant `shared-tests/` folder and its config include are removed.
After integrating Knip and relocating tests, `./agent verify` passes 52 tests and 252 assertions
across eight files. Temporary unused-file and unused-namespace-export probes both made `check`
fail and were removed. After review, an orphan-command probe also fails `check`; its wildcard
entry exemption was replaced with entries derived from actual CLI imports. Final verification:
`.artifacts/logs/agent/2026-10-17T19-31-37.153Z-19143.log`.
Multiline runtime literals use the universal `S` tag, which trims blank boundary lines and common
indentation while preserving relative indentation, including interpolated source. Conformance
requires the tag, indented content on new lines, and an aligned closing delimiter. Surviving
multiline fixtures follow this pattern. Tests must not mutate developer state outside the repository.
Root `AGENTS.md` lists both automated and review-only conformity rules in one compact section.
Platform implementations live in `ts/shared/shared-src/os/`: environment get/set/is, process/events,
filesystem, path, terminal, streams, formatting and test APIs. All callers, tests and the
Knip config import namespace APIs through `shared-src/os.ts`; the test API loads its runner only when called. Source
conformance rejects builtin imports and direct platform globals outside the exact OS subtree,
including common computed `globalThis` accesses and clock calls, while ignoring string fixtures
and ordinary property names. TypeScript source discovery loads its compiler lazily so fresh setup
still imports only runtime builtins before dependencies are installed. Universal `Time` uses standard browser/Node
clock and timer APIs: monotonic `nowMs`, epoch `now`, wall-clock `date`, and millisecond `sleep`.
Bootstrap now enters `_command-runner.ts` directly; its main-module path loads setup without Commander.
Tests live in sibling `universal-test/` and `cli-kit-test/` folders.
Local start/stop, doctor and secrets no longer execute legacy recipes. Doctor checks the new workspace and emits
a safe fingerprint. Secrets uses the new root encrypted store and approved age dependency, preserving Secure
Enclave setup and store-key wrapping. No real secret decryption, identity setup or Docker lifecycle was exercised.
This historical bridge gap was subsequently resolved with local implementations; root commands no longer use `runLegacyDev`.
Fatal diagnostics now retain long strings/arrays and aggregate members, including cause cycles.
Current `./agent verify`: 56 tests, 306 assertions; `.artifacts/logs/agent/2026-10-17T20-24-53.242Z-56033.log`.
The source gate enforces a 45-line function-body limit and method syntax for object function implementations.
Longer operations, including doctor diagnostics, are split into named parts. Root guidance groups source rules
and review guidance separately; reviews run only on explicit developer request.
`Repo.getWorkspaceRoot()` discovers the current checkout, `getMainWorktreeRoot()` queries Git's primary
worktree, and `resolvePath(...)` resolves checkout paths. Artifact paths and operations go through
`Artifacts`, rooted in the current checkout's shared `.artifacts/`. A read-only doctor run confirms both roots
and writable artifact locations; `.artifacts/logs/agent/2026-10-17T20-24-21.949Z-55426.log`.
Piped diagnostics retain terminal colors on color-capable terminals while respecting explicit color preferences.
Doctor preserves GitHub transport severity, credential-helper validation, hook wiring and individual artifact-directory checks.
Agents run verify at slice completion and fix or fmt before committing.
Root `./agent` and `./dev` enter the checkout's pinned devenv automatically unless that environment
is already active. Root Nix exposes the existing Bun and Node pins plus the developer tools; workspace
executables come from `ts/node_modules/.bin`. Commands invoke `bun` and `tsc` by name. Setup alone
installs dependencies. Prepared portable Linux profiles remain supported when devenv is unavailable;
their locked identity is checked before activation. Local activation and verification pass; the
portable Linux fallback has not been exercised in this slice.
The Linux bootstrap uses the relocated pinned tool definitions for root setup and keeps CI
verification setup in the legacy workspace. Cursor's Linux and macOS dispatch and failure exits
are covered by local fixtures; fresh-host setup and hosted CI have not been exercised.

Compile stamps, disposable test homes, scratch fixtures, VM logs, and Android recovery custody use
the physical shared artifact paths. Starter and encrypted-store mutations use the Git worktree
boundary. Managed-loop evidence accepts the shared root and its compatibility link while rejecting
private loop records, outside paths, and nested symlinks. Filesystem, Jest cache, Firebase, and
process ownership guards remain covered; Darwin zombie-only groups retain complete kernel
inspection after an `EPERM` probe. GitHub workflow path checks pass locally.
