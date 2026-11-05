# Generated output

Each Tao input owns a main TypeScript module and any nonempty category modules. `Screen.tao` produces `Screen.ts` for typed lexical bindings and initialization, and `Screen.views.tsx` for React components. Private nested views stay in the same input's component module, with stable full owner-path names. Components receive their instance's lexical environment through runtime view descriptors.

`App.tsx` coordinates all scopes, lazy aliases and view registrations before initializing values in the linker's global dependency order. It alone carries the publication revision. Component modules export components and import lexical binding types without a runtime dependency on their owning main module.

The category policy reserves `Screen.design.ts` for design, `Screen.data.ts` for data and datasources, and `Screen.previews.tsx` for development preview declarations. These categories have no handlers in the current grammar/compiler and emit no files. Adding one requires its language implementation and an explicit declaration handler; empty categories are always omitted.

Open the generated `build` folder as a TypeScript project. It includes a project configuration and links to the pinned runtime dependencies. Standard-library generated sources live under `tao/`; other inputs retain their file boundaries under `source/` or a separate module directory. Typed lazy projections preserve standard TypeScript definition navigation through renamed and namespaced imports. Original Tao navigation remains future IDE work.

Live Metro publication consumes one complete memory revision. The disk inspection mirror switches between complete revision snapshots after acceptance, retaining the current and previous snapshots. It does not publish a second Metro update. Source generation does not run a formatter on each edit; emitters produce the readable layout directly.
