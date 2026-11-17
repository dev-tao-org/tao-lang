# Projects and Dependencies WIP

A Tao project owns its source modules, dependency declarations, durable pins and isolated working sessions.

```tao
requires github:acme/widgets version v1.2.0 as Widgets
requires file:../shared-widgets as Shared

...

use Widgets@ui/controls Button
use @widgets/ui Badge
use tao@ui Text, Row, Col, Input
```

#### `tao init ./Calendar`

Create a new project, name "Calendar". It ensures that the folder doesn't already exist, and that it isn't nested within another tao project.

#### `.tao` folder

A project contains a `.tao` folder at its root. The folder contains project configuration, metadata, caches, builds, and so on. Some of its contents are gitignored, and some is tracked and should be committed.

#### Project discovery

Commands resolve paths from the caller's directory and discover the owning project upward,
stopping at a Git boundary. Initialize the project before using package imports or
dependency commands. Running an app offers any required setup and continues after approval;
`tao setup ./Calendar/Calendar.tao --yes` can perform that setup explicitly.

#### `requires github:acme/widgets version v1.2.0 as Widgets`

Project-root declarations select direct source dependencies. GitHub versions may name tags,
branches or commits; preparation records immutable commits in `.tao/store/dependencies.lock.json`.
Explicit aliases start with an uppercase letter. Omitted aliases default from the source name.
Aliases must be unique in their declaration scope.

#### `requires file:../shared-widgets as Shared`

File dependencies are live paths relative to the declaring project or dependency. Their optional
version is descriptive and defaults to `live`. `requires bundled:tao` selects bundled source.

#### `use Widgets@ui/controls Button`

The alias selects a dependency project. The rest of the path selects the `controls` folder
in its `@ui` package. Each package can use its own project's dependency aliases. Across projects,
only declarations marked `package` can be imported.

#### `use @widgets/ui Badge`

An `@name` folder establishes a package without a declaration. Its name is unique within the
project, even when the folder sits beneath another folder. A bare `@name` looks only in the
current project. Both local and external package addresses select the direct Tao files in the
named folder. For example, `@widgets` and `@widgets/ui` address different folders.

#### `use tao@ui Text, Row, Col, Input`

The automatically supplied `tao` alias exposes these standard views from an ordinary bundled
project with an `@ui` module; another dependency cannot reuse the alias. Development uses its live
source and watches edits. Packaged tools materialize the versioned bundled project without
recording its machine-specific location in the source lock.

#### `use LanguageFeatures`

A bare import searches other Tao files in the current folder. Imports name individual declarations.
`use LanguageFeatures, Caption as Heading` can select names from different files and bind `Caption`
locally as `Heading`. More than one visible match is an error.

#### `use ./cards Caption, Card as Panel`

Relative imports address folders within the same package. A `file` declaration, the default, is
private to its file. A `folder` declaration is visible to sibling files and can also be referenced
there without a `use`. A `package` declaration can be imported from another folder, package or
project through its source address.

#### `tao setup` and `tao update`

Compilation, developer web preview and tests check their requirements and offer missing setup,
defaulting to Yes, then continue automatically. Noninteractive setup requires `--yes`.
Ordinary preview edits reuse ready session inputs; dependency changes preserve the last working
preview, request setup approval, and restart in a fresh session, which resets running app state.
Routine setup uses durable locks without resolving newer refs or reinstalling unchanged dependencies.
`tao update Widgets --yes` refreshes that direct source pin; `tao update --yes` refreshes all direct
source pins while preserving unrelated pins. Source locks also reference exact npm graphs in
`.tao/store/npm/`.

#### `tao add @widgets --npm date-fns --yes`

Adding resolves an exact npm version, writes `requires npm:date-fns version ...` in the local
module, and prepares its reachable dependency graph. Scoped names are supported; direct npm
requirements need exact semantic versions. Runtime conflicts are reported rather than overridden.

#### Tao source distribution and generated manifests

A Tao source project is made available at a supported source location, such as GitHub.
Its `package` declarations define its addressable API. A `ts-library` publication separately
selects the exports of a generated TypeScript build. Use `npm:` for JavaScript dependencies.

Tao owns package manifest generation for Tao-managed projects and modules; authors declare
dependencies in Tao rather than editing generated `package.json` files. Generation is idempotent.
Tool-required generated JavaScript package metadata does not establish a public Tao distribution
name. Exact dependency-block ownership remains under design.

Local checkout overrides for dependencies from separate projects are deferred until after MVP.

In the agreed future design, TypeScript files in a Tao-managed project can import the same local
package identities, such as `import { Editor } from '@editor'`. Tao generates the TypeScript and
runtime resolver configuration; authors do not maintain matching manifests or path mappings.
Both languages must preserve the same visibility restrictions. The representation of declaration
kinds beyond currently published views remains under design.

#### Store, cache and sessions

`.tao/store/` retains identity, locks and `dependencies.initialized`; keep these in version control.
The marker prevents a deleted source lock from silently resolving new pins: restore the lock instead.
`.tao/cache/` holds generated state, including reusable
`sessions/.cli/` output. `.tao/.gitignore` excludes caches and session locks, retaining the store.
Session names match `[a-z0-9][a-z0-9_-]*`; `.cli` and `.studio` are reserved. Preparation and updates
hold session and dependency locks; contention fails immediately with a retryable message.

#### `tao clean`

Cleaning removes inactive caches and sessions, preserving active or uncertain sessions and durable
store data. `--wipe` also requests shared platform-cache cleanup, which preserves caches with
active leases. Stable lock files remain after release; temporary leases are removed or reclaimed
after a crash. Uninspectable leases preserve the cache and report the blocked path and failure.
Corrupt module-tooling metadata is preserved with a warning while other safe caches are cleaned.

#### Scope

The reserved `.studio` session does not supply a Studio application. Project preparation does
not define published-app dependency installation or distribution.
