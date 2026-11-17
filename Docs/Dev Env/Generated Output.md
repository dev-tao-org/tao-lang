# Generated output

Each Tao input owns a main TypeScript module and any nonempty category modules. `Screen.tao` produces `Screen.ts` for typed lexical bindings and initialization, and `Screen.views.tsx` for React components. Private nested views stay in the same input's component module, with stable full owner-path names. Components receive their instance's lexical environment through runtime view descriptors.

`App.tsx` coordinates all scopes, lazy aliases and view registrations before initializing values in the linker's global dependency order. It alone carries the publication revision. Component modules export components and import lexical binding types without a runtime dependency on their owning main module.

The category policy reserves `Screen.design.ts` for design, `Screen.data.ts` for data and datasources, and `Screen.previews.tsx` for development preview declarations. These categories have no handlers in the current grammar/compiler and emit no files. Adding one requires its language implementation and an explicit declaration handler; empty categories are always omitted.

Open the generated `build` folder as a TypeScript project. It includes a project configuration and links to the pinned runtime dependencies. App and library compilation share a module layout. The current project's generated modules preserve their source folders under `ts/packages/`. Generated Tao dependencies preserve their source folders under `ts/dependencies/<alias>/`, including `ts/dependencies/tao/@ui/` for the standard library. Typed lazy projections preserve standard TypeScript definition navigation through renamed and namespaced imports. Original Tao navigation remains future IDE work.

Live Metro publication consumes one complete memory revision. After acceptance, the disk inspection mirror replaces its real output directory with the completed build, restoring the previous directory if replacement fails. It does not publish a second Metro update. Source generation does not run a formatter on each edit; emitters produce the readable layout directly.

`./agent verify` compiles Kitchen Sink and Demo in the ordinary named session `review-build`.
It typechecks the generated Kitchen Sink app before the workspace checks and tests. Workspace tests
typecheck the compiled Demo library in an ordinary TypeScript consumer with its peers installed,
including after relocating the compiled package. Generated projects allow unused locals and parameters.
Kitchen Sink writes `Apps/Dev/.tao/cache/sessions/review-build/build/`. Demo writes
`Apps/TS Lib App/.tao/cache/sessions/review-build/libraries/Demo/`. The package manifest maps the
root to `ts/Library.ts`, published packages to `ts/@package.ts`, and subfolders to
`ts/@package/subfolder.ts`. The facades share the initialization in `ts/LibraryScope.ts`.
The library keeps foreign-view sources and their relative imports under `ts/sidecars/`.
The portable Demo manifest and `ts/` tree are tracked for review, including its `ts/tsconfig.json`.
The Kitchen Sink build still resolves sidecars and toolchain files from the checkout that generated
it, so Git ignores that tree. Dependency links, incremental state and temporary publication
generations remain ignored. Run `./agent verify` to regenerate both outputs and run the app and
library typechecks described above. The formatter excludes all `.tao/` output.

There is no separate tracking compiler or output comparison step in `check`. Studio uses a separate
session. App output, library packages, sidecar snapshots and runtime hosts belong to their session;
prepared dependencies and toolchain caches remain shared. Library consumers resolve the package
from their own session without changing the authored package's dependency links. The default CLI
session is `.cli`. `tao compile --ts-lib Demo --package src/ts --out <directory>` publishes a
standalone artifact from the selected session into a fresh directory.

Session isolation does not create independent dependency installations. Installed packages used by
the app, sidecars and imported projects retain their existing dependency resolution. Only generated
Tao package locations differ between sessions. Metro resolves those packages against the selected
session using its own package-export and platform rules; it does not pre-resolve them through Node.
The shared runtime build also prepares an independent `@tao/runtime` package from its captured
runtime sources. The project links it through `.tao/cache/runtime-package/`. The authored consumer
installs the runtime as a peer and selects `.cli` for its ordinary library file dependency.

Compilation respects session ownership and reports a busy session when that same session is active.
Outputs remain after commands exit. Explicit project cleanup removes inactive session outputs;
the next build recreates them. No session name has special retention behavior.

## Reconciliation of the Studio output experiment

The dirty `feat/tracked-studio-output` checkout at `17c2c529b` experimented with opt-in target
manifests, a second publication from accepted Studio builds, cleanup retention and byte comparison
in `check`. Commit `403bdfb65` established ordinary named-session compilation. Commit
`6861204dc` tracked the resulting examples, and `e7b92c6af` added generated-project typechecking.
Use the named-session workflow above.

Keep the portability result from the experiment. At `bfc14aa2`, generated Kitchen Sink and Demo
foreign-view imports named the checkout that compiled them. The committed layout checkpoint
`c7fab3ec` still showed those imports after moving the modules. The generated package layout
work owns relocation proof. Rebuild and typecheck Kitchen Sink in a separate checkout and
verify its foreign view resolves to the validated sidecar snapshot there. Move the built Demo
artifact independently, then import it and render its foreign view in an ordinary TypeScript
consumer with the authored project unavailable.

The [evidence inventory](../../.artifacts/notes/tracked-output-reconciliation/17c2c529b/README.md)
is local to the reconciliation worktree. It records the dirty snapshot, per-file dispositions,
generated specimens and available test results. Retain the old checkout until the archive is
verified and the receiving branch contains the handoff and archive pointer. Worktree retirement
requires separate authorization.
