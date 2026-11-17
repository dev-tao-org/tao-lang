# Generated output

Each Tao input owns a main TypeScript module and any nonempty category modules. `Screen.tao` produces `Screen.ts` for typed lexical bindings and initialization, and `Screen.views.tsx` for React components. Private nested views stay in the same input's component module, with stable full owner-path names. Components receive their instance's lexical environment through runtime view descriptors.

`App.tsx` coordinates all scopes, lazy aliases and view registrations before initializing values in the linker's global dependency order. It alone carries the publication revision. Component modules export components and import lexical binding types without a runtime dependency on their owning main module.

The category policy reserves `Screen.design.ts` for design, `Screen.data.ts` for data and datasources, and `Screen.previews.tsx` for development preview declarations. These categories have no handlers in the current grammar/compiler and emit no files. Adding one requires its language implementation and an explicit declaration handler; empty categories are always omitted.

Open the generated `build` folder as a TypeScript project. It includes a project configuration and links to the pinned runtime dependencies. Standard-library generated sources live under `tao/`; other inputs retain their file boundaries under `source/` or a separate module directory. Typed lazy projections preserve standard TypeScript definition navigation through renamed and namespaced imports. Original Tao navigation remains future IDE work.

Live Metro publication consumes one complete memory revision. After acceptance, the disk inspection mirror replaces its real output directory with the completed build, restoring the previous directory if replacement fails. It does not publish a second Metro update. Source generation does not run a formatter on each edit; emitters produce the readable layout directly.

`./agent verify` compiles Kitchen Sink and Demo in the ordinary named session `review-build`.
It runs the pinned TypeScript compiler on each generated project's own `tsconfig.json` before
continuing to workspace checks and tests. Generated projects allow unused locals and parameters.
Kitchen Sink writes `Apps/Dev/.tao/cache/sessions/review-build/build/`. Demo writes
`Apps/TS Lib App/.tao/cache/sessions/review-build/libraries/Demo/`, including generated sources under `source/`.
The tracked Demo package includes its manifest, JavaScript and declarations. It resolves its
dependencies through the package manifest. The Kitchen Sink build and Demo's inspection sources
resolve sidecars and toolchain files from the checkout that generated them, so Git ignores those
trees. Run `./agent verify` to regenerate and typecheck them in the current checkout. The formatter
excludes all `.tao/` output.

There is no separate tracking compiler or output comparison step in `check`. Studio uses a separate
session. App output, library packages, sidecar snapshots and runtime hosts belong to their session;
prepared dependencies and toolchain caches remain shared. Library consumers resolve the package
from their own session without changing the authored package's dependency links. The default CLI
session is `.cli`; `tao.compile.out` is no longer supported.

Session isolation does not create independent dependency installations. Installed packages used by
the app, sidecars and imported projects retain their existing dependency resolution. Only generated
Tao package locations differ between sessions. Metro resolves those packages against the selected
session using its own package-export and platform rules; it does not pre-resolve them through Node.
Generated library source includes a TypeScript configuration for inspecting that session's output.
The authored standalone consumer's ordinary file dependency selects `.cli` explicitly.

Compilation respects session ownership and reports a busy session when that same session is active.
Outputs remain after commands exit. Explicit project cleanup removes inactive session outputs;
the next build recreates them. No session name has special retention behavior.
