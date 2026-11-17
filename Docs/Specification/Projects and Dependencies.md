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
stopping at a Git boundary. Initialize the project before using project-scoped imports or
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

The alias selects a dependency project, `ui` selects its named module, and `controls` selects a
subdirectory's direct Tao files. Omitting the subdirectory selects the module tree. Modules can
use their own project's dependency aliases; imports expose public declarations across projects.

#### `use @widgets/ui Badge`

Local imports discover named module folders, including beneath ordinary subfolders. Duplicate
module names are errors; relative imports cannot cross named module boundaries. Dependency
projects follow the same discovery rules.

#### `use tao@ui Text, Row, Col, Input`

The automatically supplied `tao` alias exposes these standard views from an ordinary bundled
project with an `@ui` module; another dependency cannot reuse the alias. Development uses its live
source and watches edits. Packaged tools materialize the versioned bundled project without
recording its machine-specific location in the source lock.

#### `use LanguageFeatures`

A bare import selects declarations by name without choosing a source file. Outside a named module,
it searches the other Tao files in the same folder; inside a named module, it searches that module's
tree. `use LanguageFeatures, Caption as Heading` can select names from different files. File-private
declarations remain inaccessible, and multiple visible matches are an ambiguity error.

Declarations marked `folder` are also available implicitly to sibling files, without a `use`.

#### `use package ./cards as Cards`

Import the visible declarations under a namespace, accessed as `Cards.Caption` rather than
`Caption`. Without `as Cards`, the namespace keeps the spelling derived from the source path,
as in `cards.Caption` after `use package ./cards`. The import `use ./cards Caption, Card as Panel`
selects individual local names; `use ./cards all` imports
all public declarations as local names. All forms retain their visibility and ownership boundaries.

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

#### Agreed package addressing and generated manifests

A folder named `@editor` establishes a local package boundary without a package declaration.
Bare `@editor/subpath` addressing is reserved for packages in the current project and remains
subject to ordinary declaration visibility. External dependencies use an explicit source provider
and a declared alias; they do not occupy the bare local-package lookup.

In the agreed future design, packages have no separately declared name. An external Tao package
is addressed by its project source and `@folder` name, independently of that folder's position
within the project. Tao projects are not published to or installed from npm; `npm:` remains
available for consuming JavaScript dependencies.

Tao owns package manifest generation for Tao-managed projects and modules; authors declare
dependencies in Tao rather than editing generated `package.json` files. Generation is idempotent.
Tool-required generated JavaScript package metadata does not establish a public Tao distribution
name. Exact dependency-block ownership remains under design.

Local checkout overrides for dependencies from separate projects are deferred until after MVP.

Tao source distribution requires no separate project publication list: a project is made available
at a supported source location, such as GitHub. Package visibility determines its accessible API.
A `ts-library` declaration separately selects the API of a generated TypeScript build; it is not
a prerequisite for consuming the project from Tao.

Future imports explicitly name declarations; namespace imports (`use package`) and wildcard
imports (`use ... all`) will be removed. Future visibility consists of `file` (the default),
`folder`, and `package`. File declarations stay within their file; folder declarations are shared
within their folder; package declarations are accessible through the package's address, including
externally through an available project source. This replaces the current `project` and `public` levels.

Bare imports search the same folder. Relative imports select folders within the same package.
Package addresses preserve subfolder paths: `use @cards/details Caption` selects a package-visible
declaration in that folder, not a declaration flattened into the package root. For external consumers,
the package address is qualified by its project source; bare `@cards` remains project-local.

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
