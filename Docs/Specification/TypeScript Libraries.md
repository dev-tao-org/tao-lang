# TypeScript Libraries WIP

A TypeScript library publishes selected Tao views as typed React components.

```tao
use tao@ui Text

ts-library Demo {
   publish { Greeting, @cards, }
}

public
view Greeting(First text, Second text) {
   render Text(First)
}
```

#### `publish { Greeting, @cards, }`

A `ts-library` declares one `publish` block. Separate its entries with commas. A trailing comma is optional. An individual public view becomes a named root export. A local `@cards` package exposes its public views from the corresponding `@cards` subpath. A view in `@cards/details` is exported from `@cards/details`. Private helpers and dependencies remain internal.

#### Compiling the library

Given an authored TypeScript package that configures `tao.compile.entry` and `tao.compile.name`, run:

```sh
tao compile --ts-lib Demo --package src/ts --out ./demo-library
```

Choose a new output directory. The library has a root `package.json` and a `ts/` folder containing its TypeScript configuration, generated code and required TypeScript sidecars. Pass a Tao entry file as a positional argument to compile without package configuration. The declaration name in lowercase supplies the generated package name when `tao.compile.name` is absent.

Install the generated package as a regular dependency of the consumer. Install the matching shared `@tao/runtime` package alongside it. Tao prepares that runtime package at `.tao/cache/runtime-package/` in the source project. When moving a library to another project, copy or install the runtime package independently. The library and runtime use ordinary package resolution.

#### Using published components

```tsx
import { Greeting } from '@example/demo'
import { Caption } from '@example/demo/@cards'
import { DetailedCard } from '@example/demo/@cards/details'

export default function Example() {
  return (
    <>
      <Greeting First="Ada" Second="Lovelace" />
      <Caption Value="Package view" />
      <DetailedCard Value="View in a subfolder" />
    </>
  )
}
```

Published text parameters become required string props. A published `Children` parameter is a string prop. Components accept React children independently.

Importing any public entry initializes one shared scope for that library. All of its published views use that scope. Tao keeps view-local state for each mount and retains the shared scope when a view unmounts.

#### Running a local consumer

`tao compile Demo --package src/ts` publishes the configured package in `.tao/cache/sessions/.cli/libraries/Demo/`. A local consumer can install it from that directory and the runtime from `.tao/cache/runtime-package/`. Use `--session <name>` for an independent build session. Tao replaces the selected session's compiled output on each build.

`tao run --package src/ts --web` compiles the configured library and starts Expo. Tao creates the host under the selected session and resolves the compiled library there. The Expo host uses the consumer's existing dependency installation. `--port` selects the web server port, and Ctrl+C stops the host.

Run `tao init <existing-directory> --library` to scaffold a Tao library and React consumer. Initialization creates `src/tao`, `src/ts`, a local Justfile, and Tao project metadata. Install the scaffold's dependencies after its first compilation.

#### Supported subset

The current target is Expo and React Native Web. Published views support `text` parameters and ordinary React children. Published datasource, action and typed calculation contracts, explicit distribution builds, and runtime shutdown remain future work.
