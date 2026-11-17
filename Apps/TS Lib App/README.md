# TS Lib App

This is the repository's Tao library example and ordinary React consumer. Run commands from this folder:

- `just check` compiles the library and checks the consumer's real JSX types, including expected invalid props and hidden exports.
- `just run` compiles and starts the managed Expo web host. Ctrl+C stops it.
- `just test` runs the local type checks and headless browser journey in `src/ts/test`.

The Justfile defaults to this checkout's `../../tao`, resolved from the Justfile location. Set `TAO` to an absolute executable path or an installed command name to use another Tao CLI. In a fresh copy, run `just compile` first to create the local library and prepare the shared runtime, then install the dependencies declared in `src/ts/package.json` with its package manager. Tests require Google Chrome.

`just test` uses the app's local Bun/Playwright suite and the public Tao CLI. It does not call repository verification or import repository test utilities. `tao test` runs Tao app journeys, rather than TypeScript library-consumer tests, so it is not a replacement for this command.

The library demonstrates the currently executable language surface through published components:

| Example                        | Features                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tao/Library.tao`          | Named library exports, required text parameters, private nested views, React children and mount-local writable/computed values                        |
| `src/tao/LanguageFeatures.tao` | Named and aliased imports, typed file lets, lexical shadowing, escaped text, aliased injection captures, standard input and a TypeScript foreign view |
| `src/tao/ValueSnapshots.tao`   | Runtime-owned list and record snapshots, equal computed results and ordered list updates                                                              |
| `src/tao/ScopeExamples.tao`    | Folder, package and project visibility across files                                                                                                   |
| `src/tao/@cards`               | Published package views, a preserved `details` subpath and an internal project-scoped view                                                            |
| `src/ts/Consumer.tsx`          | Ordinary package and subpath imports, React prop updates, children and independent component mounts                                                   |

The browser journey asserts the rendered examples, edits the input, updates state and props, and unmounts one component while the other remains interactive.

`tao init <directory> --library` remains the way to generate the smaller starter. Its separate static copy was removed from this repository; initializer acceptance still generates and tests a fresh project.
