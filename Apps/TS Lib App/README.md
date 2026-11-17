# TS Lib App

This is the repository's Tao library example and ordinary React consumer. Run commands from this folder:

- `just check` compiles the library and checks the consumer's real JSX types, including expected invalid props and hidden exports.
- `just run` compiles and starts the managed Expo web host. Ctrl+C stops it.
- `just test` runs the local type checks and headless browser journey in `src/ts/test`.

The Justfile defaults to this checkout's `../../tao`, resolved from the Justfile location. Set `TAO` to an absolute executable path or an installed command name to use another Tao CLI. Compile and run prepare the library and prompt before installing missing or changed consumer dependencies. In non-interactive use, pass `--yes` directly to `tao compile --package src/ts` or `tao run --package src/ts` to authorize setup. Tests require Google Chrome.

`just test` uses the app's local Bun/Playwright suite and the public Tao CLI. It does not call repository verification or import repository test utilities. `tao test` runs Tao app journeys, rather than TypeScript library-consumer tests, so it is not a replacement for this command.

The library demonstrates the currently executable language surface through published components:

| Example                        | Features                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tao/Library.tao`          | Named library exports, required text parameters, private nested views, React children and mount-local writable/computed values                             |
| `src/tao/LanguageFeatures.tao` | Named and aliased imports, text and lexical scopes, TypeScript injections and foreign views, standard input, and view-local state with synchronous actions |
| `src/tao/ValueSnapshots.tao`   | Runtime-owned list and record snapshots, equal computed results and ordered list updates                                                                   |
| `src/tao/ScopeExamples.tao`    | Folder and package visibility across files                                                                                                                 |
| `src/tao/@cards`               | Published package views, a preserved `details` subpath and an internal view with folder visibility                                                         |
| `src/ts/Consumer.tsx`          | Ordinary package and subpath imports, React prop updates, children and independent component mounts                                                        |

The browser journey edits the input and presses both kinds of Tao action handler. It confirms that a React prop change preserves local state until an action explicitly reads it, two mounts of the authored stateful view remain independent, and the second greeting stays interactive after the first unmounts.

`tao init <directory> --library` remains the way to generate the smaller starter. Its separate static copy was removed from this repository; initializer acceptance still generates and tests a fresh project.
