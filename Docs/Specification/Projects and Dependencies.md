# Projects and Dependencies WIP

A Tao project owns its source modules, dependency declarations, durable pins and isolated working sessions.

```tao
requires github:acme/widgets version v1.2.0 as widgets
requires file:../shared-widgets as shared

...

use Button from widgets@ui/controls
use Badge from @widgets/ui
use Text, Row, Col, Input from tao@ui
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

#### `requires github:acme/widgets version v1.2.0 as widgets`

Project-root declarations select direct source dependencies. GitHub versions may name tags,
branches or commits; preparation records immutable commits in `.tao/store/dependencies.lock.json`.
Aliases default from the source name and must be unique in their declaration scope.

#### `requires file:../shared-widgets as shared`

File dependencies are live paths relative to the declaring project or dependency. Their optional
version is descriptive and defaults to `live`. `requires bundled:tao` selects bundled source.

#### `use Button from widgets@ui/controls`

The alias selects a dependency project, `ui` selects its named module, and `controls` selects a
subdirectory's direct Tao files. Omitting the subdirectory selects the module tree. Modules can
use their own project's dependency aliases; imports expose public declarations across projects.

#### `use Badge from @widgets/ui`

Local imports discover named module folders, including beneath ordinary subfolders. Duplicate
module names are errors; relative imports cannot cross named module boundaries. Dependency
projects follow the same discovery rules.

#### `use Text, Row, Col, Input from tao@ui`

The automatically supplied `tao` alias exposes these standard views from an ordinary bundled
project with an `@ui` module; another dependency cannot reuse the alias. Development uses its live
source and watches edits. Packaged tools materialize the versioned bundled project without
recording its machine-specific location in the source lock.

#### `tao setup` and `tao update`

Compilation, developer web preview and tests check their requirements and offer missing setup,
defaulting to Yes, then continue automatically. Noninteractive setup requires `--yes`.
Ordinary preview edits reuse ready session inputs; dependency changes preserve the last working
preview, request setup approval, and restart in a fresh session, which resets running app state.
Routine setup uses durable locks without resolving newer refs or reinstalling unchanged dependencies.
`tao update widgets --yes` refreshes that direct source pin; `tao update --yes` refreshes all direct
source pins while preserving unrelated pins. Source locks also reference exact npm graphs in
`.tao/store/npm/`.

#### `tao add @widgets --npm date-fns --yes`

Adding resolves an exact npm version, writes `requires npm:date-fns version ...` in the local
module, and prepares its reachable dependency graph. Scoped names are supported; direct npm
requirements need exact semantic versions. Runtime conflicts are reported rather than overridden.

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
