# Projects and Dependencies

Initialize a project at its root before using project-scoped imports or dependency commands:

```sh
tao init ./Calendar
tao prepare ./Calendar/Calendar.tao --yes
```

`tao init <directory>` creates `.tao/` and a stable project identity. It rejects an already
initialized ancestor, including across Git boundaries, or a nested `.tao/` project found beneath the requested directory. The scan
does not follow directory symlinks and skips known dependency and repository directories, including
`node_modules`, `Pods`, `.git`, and `.gradle`. Project discovery walks upward from the requested file or directory and stops at a
Git repository boundary. Tao commands accept paths from the caller's current directory and resolve
them to the owning project.

The project root contains its direct source dependency declarations:

```tao
requires github:acme/widgets version v1.2.0 as widgets
requires file:../shared-widgets as shared
requires bundled:tao
```

GitHub dependencies require a version token, which may name a tag, branch, or commit. Preparation
resolves that token to an immutable commit and records it in `.tao/store/dependencies.lock.json`.
`file:` dependencies are live paths relative to the declaring project or dependency; their optional
version token is descriptive and defaults to `live`. Bundled dependencies use Tao's bundled source
tree. Aliases default from the source name when `as` is omitted and must be unique in that
declaration scope.

An alias imports the dependency's local module. A module may import its own dependency through the
same alias:

```tao
use Button from widgets@ui/controls
```

Here `widgets` is the dependency alias, `ui` is the package, and `controls` selects a subdirectory.
The selected directory contributes its direct `.tao` files; omitting the subdirectory selects the
package tree. A local package is addressed directly by its `@name`:

```tao
use Badge from @widgets/ui
```

Local `@module` imports discover named folders within the owning project, including modules beneath
ordinary subfolders. A dependency alias searches the dependency's project in the same way. Duplicate
module names are an error. Relative imports cannot cross a named module boundary. Tao checks
declaration visibility: importing another project exposes its public declarations.

The built-in `tao` alias supplies standard-library views without a dependency declaration:

```tao
use Text, Row, Col, Input from tao@ui
```

These are the currently implemented standard UI views. The standard library is itself a Tao
project with an ordinary `@ui` module. Tao supplies its bundled project as the `tao` dependency
automatically; another project cannot reuse that alias. The standard project follows the same
module discovery and visibility rules as other dependencies.

During source development, imports read the live standard-library project and watched previews
observe its source edits. A packaged CLI materializes its embedded standard project in Tao's
versioned cache before resolving it through the same project mechanism.
The source lock does not record that machine-specific bundled-project location.

The durable source lock belongs to the project whose requirements it records. It also references
the exact npm graphs retained under `.tao/store/npm/`. Routine compilation
uses that lock without resolving newer refs. Update selected direct dependencies explicitly:

```sh
tao update widgets --yes
tao update --yes
```

The first command refreshes the `widgets` pin; the second refreshes all direct source pins. The
updated lock records immutable commits while preserving unrelated pins. Preparation and updates
hold project session and dependency locks; a busy session fails immediately with a retryable message.
Ordinary source edits do not check remote versions or reinstall dependencies. Missing or changed
dependencies require explicit preparation; after installation, retry the original command.

`tao add @widgets --npm date-fns --yes` resolves an exact npm version, writes an exact
`requires npm:date-fns version ...` declaration to the local module, then prepares its reachable
dependency graph. Scoped npm package names are supported. Direct npm requirements need exact
semantic versions. Runtime package conflicts are reported rather than silently overridden.

Tao writes a durable project identity and dependency locks under `.tao/store/`. Generated caches
and session data live under `.tao/cache/`; `.tao/.gitignore` excludes cache and session-lock state
while retaining the store. `tao clean` removes inactive project caches and sessions, preserving
active or uncertain sessions. `tao clean --wipe` also asks the platform cache to remove shared Tao
cache data; it preserves that cache while active consumers hold leases.
Stable lock files remain after release so that concurrent processes always lock the same file.

Session identifiers supplied to CLI commands must match `[a-z0-9][a-z0-9_-]*`. `.cli` and `.studio`
are reserved internal identifiers. They share the same stable native lock mechanism as other
project sessions. `.studio` is reserved session infrastructure; it does not mean a Studio
application is included in this implementation. These workflows prepare source projects; they do
not define a published-app dependency installation or distribution format.

```text
.tao/
  store/                 # durable identity and dependency locks
  locks/                 # stable OS-backed lock files
  cache/sessions/.cli/    # generated CLI output, retained between runs
```
