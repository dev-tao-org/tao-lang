# TypeScript Libraries WIP

A TypeScript library publishes selected Tao views as typed React components.

```tao
use tao@ui Text
use package ./cards as Cards

ts-library Demo {
   publish { Greeting, Cards as Catalog, }
}

public
view Greeting(First text, Second text) {
   render Text(First)
}
```

#### `publish { Greeting, Cards as Catalog, }`

Publish lists require commas and allow a trailing comma. Select public definitions from the library's own project. Imported dependencies and private helpers remain internal. A selected module declares one `publish { Caption as Greeting, }` list across its source files; the list may live in a separate file. Other public definitions remain unselected. This example exposes the selected view at `Catalog/Greeting`.

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
      "out": "../../.tao/cache/libraries/Demo",
      "name": "@example/demo"
    },
    "run": {
      "entry": "Consumer.tsx",
      "name": "Demo consumer"
    }
  }
}
```

From the project root, run `tao compile Demo --package src/ts` to select the library by declaration name. Omit `Demo` when the entry has one target. Compilation emits JavaScript, declarations and explicit package exports. Repeated compilation replaces only its own generated output link; unrelated existing output is preserved and reported as an error. Add `"@example/demo": "file:../../.tao/cache/libraries/Demo"` to the consumer's dependencies, then install them with its normal package manager.

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

#### Supported subset

Published views currently support required `text` parameters as named string props and ordinary React children. Injections can render captured `@@children`. Private Tao views and the current standard web views run through the same compiler and runtime as app views. Unsupported published signatures and unresolved imports fail compilation.

The initial target is Expo and React Native Web. Data, designs, actions, drafts, selector hooks and native acceptance remain future work.
