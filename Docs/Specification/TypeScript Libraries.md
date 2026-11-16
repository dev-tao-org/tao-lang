# TypeScript Libraries WIP

A TypeScript library publishes selected Tao views as typed React components.

```tao
use tao@ui Text
use package ./cards as Cards

ts-library Demo {
   publish { Greeting, Cards, }
}

public
view Greeting(First text, Second text) {
   render Text(First)
}
```

#### `publish { Greeting, Cards, }`

Publish lists require commas and allow a trailing comma. Publication aliases are not supported. Select public definitions from the library's own project. Imported dependencies and private helpers remain internal. A selected module declares one `publish { Caption, }` list across its source files; the list may live in a separate file. Other public definitions remain unselected. This example exposes the selected view at `Cards/Caption`.

#### Typed React components

Published text parameters become named string props and follow Tao’s uppercase-initial declaration rule. A published `Children` parameter is a string prop. Components accept React children separately.

Keep the consumer's package and dependencies in `src/ts`, with Tao sources in `src/tao`. Configure paths relative to `src/ts/package.json`:

```json
{
  "name": "demo-consumer",
  "private": true,
  "tao": {
    "compile": {
      "entry": "../tao/Library.tao",
      "name": "@example/demo"
    },
    "run": {
      "entry": "Consumer.tsx",
      "name": "Demo consumer"
    }
  }
}
```

From the project root, run `tao compile Demo --package src/ts` to select the library by declaration name. Omit `Demo` when the entry has one target. Compilation emits JavaScript, declarations and explicit package exports into `.tao/cache/sessions/.cli/libraries/Demo/`. This is a Tao-managed destination: repeated compilation replaces its real directory and rejects symlinks or paths escaping the session's library directory. Do not put authored files there. Add `"@example/demo": "file:../../.tao/cache/sessions/.cli/libraries/Demo"` to the consumer's dependencies, then install them with its normal package manager.

Use `--session <name>` to build into a separate session. `tao run --package src/ts --session <name>` compiles and resolves that session's library without changing another session's output or the authored dependency links. Do not configure `tao.compile.out`; the selected session owns the destination. Build files remain after command exit; explicit cleanup can remove inactive sessions.

```tsx
import library from '@example/demo'
import Greeting from '@example/demo/Greeting'

const instance = library.instantiate()

export default function Example() {
  return (
    <library.Provider instance={instance}>
      <Greeting First="Ada" Second="Lovelace" />
    </library.Provider>
  )
}
```

Each view resolves the nearest provider for its library. Instances initialize their own Tao module scopes; imported component identities stay stable across React renders. A provider borrows its explicit instance. Call `instance.dispose()` after its consumers have unmounted.

#### Running the consumer

`tao run --package src/ts --web` compiles the configured library and starts Expo. The generated bootstrap registers the default component selected by `tao.run.entry`. Tao creates the Expo host, Metro/app configuration and Expo state beneath `.tao/cache/sessions/<session>/expo`; its dependency link uses the authored package's existing `node_modules`. No second install is created. `--session` selects an independent session, and `--port` selects the server port. Expo prints the URL and its interactive commands; Ctrl+C stops the host.

`tao run <entry.tao> --web` runs a Tao app in the same generated host layout. Authored React edits use Expo refresh; rerun the consumer command to recompile changed library sources.

#### Starting a project

Run `tao init <existing-directory> --library` to scaffold a Tao library and React consumer. Initialization creates `src/tao`, the authored package in `src/ts`, a local Justfile, and Tao project metadata. It preserves existing files, rejects collisions and nested projects, and does not install dependencies.

#### Agreed future export addressing

Individually published top-level declarations will be named exports from the generated library's
root module. Published packages retain package subpaths: a consumer imports from
`<library-path>/@editor`, where the prefix identifies the installed compiled artifact, not its
original Tao source project. Local installation and npm installation use the same export structure.
Package imports preserve subfolder paths. Each declaration has one canonical public address.
The default lifecycle object and component subpaths shown above describe the currently implemented
API; the generated layout for the new export structure remains under design.

Ordinary React consumers will receive automatic initialization of one shared scope per loaded
TypeScript library. Top-level state is singular for that library, as for an app; view-local state
remains independent per mount. MVP consumers will not need manual `instantiate()` calls or a
provider. Unmounting one consumer must not discard state still owned by the library. Runtime
shutdown and development reload lifecycle details remain under design.

#### Supported subset

Published views currently support required `text` and `boolean` parameters as named string and boolean props, plus ordinary React children. Use a boolean prop in a [disabled condition](Actions%20and%20Results.md#disabled-interaction) to update a rendered subtree's disabled state without remounting it. Injections can render captured `@@children`. Private Tao views and the current standard web views run through the same compiler and runtime as app views. Unsupported published signatures and unresolved imports fail compilation.

The initial target is Expo and React Native Web. Data, designs, actions, drafts, selector hooks and native acceptance remain future work.
