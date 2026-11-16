# Repository test apps

- Keep a small set of apps organized by the contract they prove. Extend an existing app with a feature component and a focused journey before considering another app.
- Give each app a directory named after it and a small same-named `.tao` entrypoint. Put feature components in separate, concern-named `.tao` files and journeys in sibling `<Feature>.test.tao` files. Split by meaningful feature, not automatically by declaration. Keep component-private declarations with their owner.
- Compose independent feature examples under the app root. Scope journeys to the relevant feature using stable tags or distinct visible controls; a new feature must not change unrelated scenarios' initial state. Reuse these authored components for refresh and host integration tests.
- Keep fixtures deterministic and reset state between journeys. A different initial value, viewport or scenario normally belongs in the same app; it does not justify another app.
- Create another app only when it proves a distinct app-level contract outside the catalog below, or requires incompatible project, dependency, datasource, environment or lifecycle setup. File length, a new language feature and convenient source rewriting do not qualify; split feature files instead. Record the reason in task notes and update this catalog with its scope and verification lane in the same change.
- Keep negative syntax/type/visibility cases in the owning package tests; runnable apps demonstrate valid observable behavior. Kitchen Sink remains the broad demonstration and is not a substitute for focused coverage.
- Reserved apps describe intended ownership, not implemented behavior. Create their files only when a feature needs them. Add or revise categories when a concrete contract warrants it rather than treating this list as a permanent cap.

| App                      | Status   | Scope                                                                                                                           | Verification                                                                                                                             |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Language                 | Active   | Lexical scopes, parameters, private views, captures and immutable value snapshots; future functions and conditional composition | `Scopes.test.tao`, `PrivateViews.test.tao`, `ImmutableValues.test.tao`; workspace refresh integration reuses its private-view components |
| UI Interactions          | Active   | Editable controls, actions, local state and instance lifecycle; future forms and stateful lists                                 | `Forms.test.tao`                                                                                                                         |
| Modules and Dependencies | Active   | Imports, visibility, folder/package boundaries and dependency ownership; future external TypeScript interop                     | `Imports.test.tao`; module-loader package tests                                                                                          |
| Data and Queries         | Reserved | Queries, relations, writes, reactive results and detached drafts with controlled datasource setup                               | Add a journey lane and isolated datasource lifecycle when implemented                                                                    |
| Navigation and Scenes    | Reserved | Presentation, history, dismissal, scene arguments and navigation-owned state                                                    | Add journeys when implemented                                                                                                            |
| Layout and Environment   | Reserved | Sizing, scrolling, responsive layout, appearance and accessibility inputs                                                       | Add observable layout/environment assertions when implemented                                                                            |

Run a focused journey with `./agent test "<path>/<Feature>.test.tao"`; `./agent verify --yes`
includes all active correctness apps.

## Current files

- **Language**: `Language/Language.tao` composes `Scopes.tao`, `PrivateViews.tao` and `ImmutableValues.tao`; each feature has a matching `.test.tao` journey. Nested declarations stay inside their owning feature file.
- **UI Interactions**: `UI Interactions/UI Interactions.tao` selects the form in `Forms.tao`; `Forms.test.tao` covers control interaction and fresh state for each case.
- **Modules and Dependencies**: `Modules and Dependencies/Modules and Dependencies.tao` selects `Imports.tao`; `Imports.test.tao` covers the visible result. `Nearby.tao`, `Public/Caption.tao`, `@cards/Card.tao`, `@cards/Captions.tao` and `@cards/Data/Caption.tao` intentionally exercise sibling, wildcard and package boundaries.

## Performance

- Owner: `ts/repo-analysis/performance-fixtures/Performance/`. Future performance sections get their own named workload files and drivers rather than another correctness app.
- **Preview**: `Performance.tao` declares the Performance app and its named Preview view. Keep the generated module graph and mounted render steps stable between comparable runs. Verification: `./agent unsandboxed performance preview`; measurement and acceptance policy belong to `pipeline-performance`.

`Apps/Dev/Kitchen Sink/` demonstrates implemented features together; `Apps/Dev/Preview/` supports
the interactive developer preview loop. Neither is a new correctness-test category.
