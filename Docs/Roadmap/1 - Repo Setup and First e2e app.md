# 1 - Repo Setup and First e2e app

Use the process described in `AGENTS.md` to implement the goals.

## Goal 1

Get the `old-tao-v1/` PoC working again:

- [x] Get tests running inside of `old-tao-v1/` folder again.
- [x] Changes outside of that folder should be minimal.

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
types, comments and formatting without tests. Legacy TypeScript checking passed from its own folder. Root frozen setup
also passes with the committed dependency manifest and lockfile.

Root `./agent check` and `./agent fmt` reuse the dev CLI's command registration.
Command modules default-export shared registrations with inline actions and centralized error rendering;
the action executor alone assigns process exit status from thrown failures. Actions and workflow
steps return void; variadic `runSteps` awaits each step and stops on failure.
setup uses the same boundary before Commander is installed. Formatting uses
the repository config and repository-relative arguments. Dependency-only formatter, compiler,
installer, package-loader, clock and Commander presentation tests were removed at the developer's request.
Shared `Try` handles synchronous and asynchronous recovery and cleanup, normalizes propagated failures,
and preserves original failure context for finalization. The new implementation uses capitalized
`Errors.ThrowX` helpers with private error constructors; ordering and cleanup-failure regressions are covered.
All current Just workflows are registered. Root `fix` and `fmt` format the new workspace and shared
repository files, excluding the legacy implementation. Tao source fixes await the new parser/tooling.
Root `check`, `test` and `verify` operate on the new workspace; `check` never runs
tests. Legacy paths are rejected by root formatting/testing, including existing symlink aliases.
Run legacy workflows from `old-tao-v1/`; agents check/test it only when its files have changed.
Secrets, diagnostics and InstantDB lifecycle retain their existing reference tools; cleanup removes
only the new workspace's dependencies and preserves shared artifacts and legacy dependencies.
Command comments identify parser, app, IDE, runtime and shell-setup steps awaiting new equivalents.
The shared formatter excludes relocated archives, native build output and storage captures.
Root lifecycle hooks reach their retained implementations and distinguish root setup/configuration
from the legacy tool profile. `./dev agent-config` regenerates the adapters. There is no root `gates`
command; invoke the retained gate runner from `old-tao-v1/` when legacy changes require it.
Knip uses its root configuration when analyzing the legacy workspace from its own folder.
The branch review skill records the reviewed commit, covers changes since the prior review, and
requires independent conformance, DRY, documentation and compound-condition checks.
Root `just setup-github` preserves the legacy HTTPS URL rewrites, login when required, GitHub
protocol and credential helper configuration, origin normalization, and verification of `main`.
Config-mutating GitHub setup tests were removed at the developer's request; setup is no longer exercised by the ordinary test suite.
`runCommand` prefers simple space-separated strings, retaining argument arrays for values containing spaces, and reports command start
and elapsed time. Agent entrypoints set `TAO_AGENT=1`: IO messages and child stdout go to root
`.artifacts/logs/agent/`, while stderr is mirrored to the terminal and log, including suppressed probes.
Developer IO remains on the terminal except test-command output, which logs to `.artifacts/logs/dev/`
and mirrors stderr. Each logging process announces its repo-relative log directory once at startup.
An unavailable command log reports once and falls back to terminal output while preserving the verdict.
Tests retain Tao-owned logging, error normalization, source conformance and utility transformations.
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
Multiline runtime literals use the universal `S` tag, which trims blank boundary lines and common
indentation while preserving relative indentation, including interpolated source. Conformance
requires the tag, indented content on new lines, and an aligned closing delimiter. Surviving
multiline fixtures follow this pattern. Tests must not mutate developer state outside the repository.
Root `AGENTS.md` lists both automated and review-only conformity rules in one compact section.
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

## Goal 2

Implement a first e2e Hello World app:

- [ ] Implement basic treesitter parser
- [ ] Implement basic treesitter CST to AST transformer
- [ ] Implement basic AST to code generator
- [ ] Implement basic expo runtime
- [ ] Write a basic test that checks "Hello World" is showing in the app
- [ ] Implement basic testing framework

### Minimal first app

```tao
app HelloWorld {
    Root RootView
}

view RootView {
    render Col {
        Text("Hello World")
    }
}
```
