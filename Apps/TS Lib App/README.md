# TS Lib App

This is the repository's Tao library example and ordinary React consumer. Run commands from this folder:

- `just check` compiles the library and checks the consumer's real JSX types, including expected invalid props and hidden exports.
- `just run` compiles and starts the managed Expo web host. Ctrl+C stops it.
- `just test` runs the local type checks and headless browser journey in `src/ts/test`.

The Justfile defaults to this checkout's `../../tao`, resolved from the Justfile location. Set `TAO` to an absolute executable path or an installed command name to use another Tao CLI. In a fresh copy, run `just compile` first to create the consumer's local library dependency, then install the dependencies declared in `src/ts/package.json` with its package manager before using the commands above. Tests require Google Chrome.

`just test` uses the app's local Bun/Playwright suite and the public Tao CLI. It does not call repository verification or import repository test utilities. `tao test` runs Tao app journeys, rather than TypeScript library-consumer tests, so it is not a replacement for this command.

The library demonstrates the currently executable language surface through published components:

| Example                        | Features                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/tao/Library.tao`          | Library publication, module aliases, required text parameters, private nested views, React children and instance-owned writable/computed values        |
| `src/tao/LanguageFeatures.tao` | Imports, lexical shadowing, escaped text, injection captures, foreign views, standard input, and view-local text state with synchronous button actions |
| `src/tao/ValueSnapshots.tao`   | Runtime-owned list and record snapshots, equal computed results and ordered list updates                                                               |
| `src/tao/ScopeExamples.tao`    | Folder, package and project visibility across files                                                                                                    |
| `src/tao/cards`                | Separate module publication list and unselected public declarations                                                                                    |
| `src/ts/Consumer.tsx`          | Ordinary package/subpath imports, React prop updates, children and two isolated library instances                                                      |

The browser journey edits the input, presses both kinds of Tao action handler, and confirms that a React prop change preserves local state until an action explicitly reads it. It verifies that two mounts of the same authored stateful view stay independent and that unmounting one library instance does not disturb the other. App declarations and Tao test controls belong to application journeys, not library exports. Data, asynchronous actions, designs and navigation remain outside this example.

`tao init <directory> --library` remains the way to generate the smaller starter. Its separate static copy was removed from this repository; initializer acceptance still generates and tests a fresh project.
