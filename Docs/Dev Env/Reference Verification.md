# Reference Verification

The previous implementation is kept runnable for language examples and Studio exploration. Its default checks cover representative behavior rather than maintaining the entire retired developer toolchain.

Run these commands from `.x-tao-old-v1/`:

```sh
./agent check
./agent unsandboxed test
./agent unsandboxed verify
```

`check` regenerates the parser when necessary, compiles WordFlower, and checks the selected Tao sources. `test` runs those Tao journeys and proves that the Studio command starts a usable session and cleans up its processes. `verify` combines both. Studio needs the host route; it does not open a visible window.

The selected journeys cover:

- Language Core: expressions, scopes, state, actions and effect outcomes.
- Data MVP: queries, writes, validation and enum fields.
- Forms and Interaction MVP: reactive inputs and form interactions.
- Packages: imports, visibility and component aliases.
- Basic Navigation and Sheet Presentation: moving between views and presenting a sheet.

Explicit targets still work: `./agent test-file packages/language/parser/parser-tests/dialect.test.ts`, or `./agent test "Apps/Test Apps/Language Core"`. A name passed to `test` filters the reference journeys.

## Deferred maintenance

These checks remain available through `./agent test-all`, `./agent unsandboxed verify-full`, or their existing focused commands. They are not required for everyday reference use, and a reference pass does not imply they pass.

| Deferred checks                                                                        | Why they are outside the default                                                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Broad parser, validator, formatter, compiler and runtime unit matrices                 | Representative Tao journeys exercise the public behavior; reopen detailed suites when consulting a specific implementation. |
| Project-tooling receipt, cache, watcher and race matrices                              | Internal optimization and infrastructure maintenance beyond running a reference app.                                        |
| Git, worktree, agent configuration, scheduler and verification self-tests              | Developer automation for the retired workspace.                                                                             |
| IDE packaging, bundle/distribution proofs and native acceptance                        | Retired release workflows; use focused checks if those products are needed again.                                           |
| Hosted CRUD and external-service integration                                           | Not needed for the in-memory reference journeys.                                                                            |
| Repository-wide TypeScript, lint, formatting, dead-export and doctor gates             | Whole-repository maintenance, including generated mappings unrelated to the selected executable examples.                   |
| Expanded Studio browser drags, network simulation, native canary and keyboard matrices | Studio launch/readiness/cleanup remains covered; deeper acceptance is explicit.                                             |
| Performance suites and the complete app corpus                                         | Run when investigating a relevant subsystem or comparing its behavior.                                                      |

The contributor Linux VM test suite is disabled entirely. It tests retired distribution automation and its migrated guest fixture could write Git metadata outside its own directory. Its source is retained for historical reference.

The maintenance lane currently has known generated TypeScript mapping/quantity-bridge failures; these are not a verdict on the executable reference journeys. Reference and maintenance results use distinct lane names and cache keys.
