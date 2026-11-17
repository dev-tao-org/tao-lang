# TypeScript Library Decisions and PoC

The [TypeScript Libraries specification](../Specification/TypeScript%20Libraries.md) describes the current API. The original PoC and its evidence remain below for reference.

## Generated source packages

`tao compile --ts-lib <Declaration> --out <directory>` emits a source package into a fresh directory under the selected session lock. Its root `package.json` selects TypeScript facades in `ts/`, which also contains the portable `tsconfig.json`, the shared app/library module organization under `ts/packages/` and `ts/dependencies/`, and reachable sidecars. Add an explicit distribution build when the JavaScript and declaration targets are defined.

Importing a library facade automatically initializes one shared scope per loaded library. Top-level state is singular, as for an app. View-local state belongs to each mount. Generated libraries use the independently installed `@tao/runtime` peer. Shutdown and development reload details remain open.

Generated library configuration maps published packages by project-local identities such as `@editor`. Captured sidecars use these identities and resolve to the generated facade. A general resolver for authored sidecars remains separate. Declaration kinds without a TypeScript representation need an explicit bridge design.

Tao source project distribution uses project-source plus local package identity, without an authored npm publication name. Generated TypeScript artifacts are a separate distribution boundary: an installed artifact's package name prefixes its exported Tao package subpaths. Metadata ownership for packaging that artifact remains open; do not conflate it with naming the Tao source package.

Individually published declarations use named root exports. A selected local package exposes its package-visible views through artifact-qualified subpaths, such as `<library-path>/@editor` and `<library-path>/@editor/tools`. Each export has one canonical address. Package manifest ownership and local addressing are recorded in [Tao Language Design Decisions](Tao%20Language%20Design%20Decisions.md). Local development linking across separate projects is deferred until after MVP.

## Original PoC contract

This records the original JS bundle, explicit provider and component subpath design. The generated source package contract above supersedes it.

- `ts-library` declares a reusable unit with explicit comma-separated `publish` lists; a trailing comma is allowed.
- Publish only selected public definitions owned by the library project. Dependencies remain internal; a dependency may separately publish its own library.
- Support a default library import and default imports from published subpaths.
- Existing compilation generates Tao declaration implementations. Library generation adds initialization, typed exports and wrappers.
- The generated library consumes `@tao/ts-api`, a runtime-only bridge to React and the existing Tao runtime. Compilation and packaging remain with existing owners; the bridge does not parse or generate Tao.
- Target Expo/React Native and React Native Web initially. Missing target capabilities fail compilation; there are no runtime bridges or silent fallbacks.
- React consumers use named typed JSX props. No TS-side argument-matching helper; Tao-authored calls retain Tao matching rules.
- Instantiate explicitly and mount `<library.Provider>`. The library declares datasource bindings and design selection; its provider supplies both.
- Instances close resources they create and borrow supplied resources without closing them. A provider borrowing an explicit instance does not independently dispose it.
- Designs are static declarations whose conditions resolve against environment and interaction state. Apply Tao designs only to Tao elements.
- Exported views accept ordinary React children. Events map to camel-case callbacks such as `onSaved`; await async callbacks and propagate failures.

## Future data and action contract

- `Note` denotes a live entity. `Draft(Note)` produces an editable detached `Draft<Note>`; parameter contracts accept drafts only explicitly.
- Datasource selection is established at compilation or instantiation, rather than chosen for each operation.
- External consumers may read and observe live entities, edit detached drafts, and invoke published actions. They cannot directly mutate persisted data or define new actions.
- Only library-defined published actions expose persisted mutations. They establish their owning action context automatically and work from React handlers/effects or headless TS, never during rendering.
- Direct external `Note.create`, `note.update` and field mutation examples from earlier exploration are superseded by published actions. No consumer `useAction` or generic `runAction` API is planned initially.
- Use `Tao.useValue(expression)` and a proposed selector overload, not `expression.useValue()`.
- Production `draft <DataDef>` implementation is deferred until the human-review branch merges.
- Comma separation for equivalent existing grammar lists remains deferred; design blocks are excluded.

## Original PoC authorization

Compile a real Tao library with one published submodule into a local JS/declaration package consumed by an ordinary TS React application. Demonstrate a greeting with two required text arguments, a panel rendering React children through existing injection functionality, a nested/private helper, and internal stdlib dependencies that are not published.

Add minimal executable `ts-library` and `publish` grammar and a module-level publication list. Require commas and allow a trailing comma. Reuse existing module/view compilation and initialization ordering; the library path must not require an app root. Generated public components use precise props, stable identities and matching library provider context. Reject unsupported signatures rather than weakening them to `any`.

Create one runtime-only workspace package at `ts/ts-api`, with handwritten `ts-api.ts`, `Library.tsx` and `ViewComponent.tsx` under `ts-api-src`, and sibling `ts-api-test` tests. Existing compiler, runtime and workspace/CLI owners retain generation, semantics and packaging. The bridge must not import parser, compiler, workspace, filesystem or Expo startup machinery.

The original PoC used `compile-library <entry> --out <directory> --name <package-name>` and `.artifacts` output. The later standalone-app decision below supersedes that command with unified `tao compile` and configured project-local output. Emit JS, declarations and explicit package exports; normal consumer package resolution must work without preview-only aliases or repository TypeScript paths. Share bridge/runtime identity across root and subpath imports. Document implemented syntax and retain a runnable Kitchen Sink app with a minimal library demonstration.

Do not implement data, designs, actions, drafts, selector hooks, native backends or a general capability framework in this slice. Do not present simulated TS versions as compiled Tao functionality. The fixture uses existing web-supported functionality; unsupported imports fail its build.

## Original PoC acceptance and evidence

- One real TS-consumer/browser journey compiles authored Tao and renders through React Native Web.
- Assert both text arguments, a React-driven prop update, nested Tao output, React children, two independent library instances and one instance unmounting without disrupting the other.
- Type-check actual consumer imports and JSX. Reject missing/wrong props and unpublished/private/dependency paths.
- Cover new syntax, publication diagnostics and formatting with focused proofs for gaps the browser cannot cover.
- Run focused tests, formatting, full verification and relevant preview-performance checks; preserve normal app compilation.
- Reuse installed/pinned compiler, React, React Native Web, Expo, TypeScript and browser tooling. No new third-party dependency is planned.

Implementation baseline: `8240f24f733c12a84c1832a870d5b0b60e8ab95f`. No code review is recorded for this task. Existing uncommitted Roadmap 2 TODOs must be preserved. One GPT-6.1 Sol subagent at medium reasoning owns implementation. No review, commit, push or landing is authorized. Return exact compile/demo commands, verification and package/type evidence, implemented/deferred boundaries, and unresolved complications.

## Historical implementation evidence

The PoC compiles real Tao module/view bodies through shared app/library initialization, with the runtime-only `ts/ts-api` bridge. Unified `tao compile` now emits library JS, precise declarations and explicit package paths. The isolated consumer resolves emitted package files through ordinary imports without repository TypeScript paths or consumer aliases. Grammar, aliases, module publication lists, text props, React children and instance isolation are implemented; the future data/action/design contracts above remain deferred.

- Demo compile: from `Apps/TS Lib App`, run `../../tao compile Demo --package src/ts` or `just compile`.
- The original `TsApi.LibraryBrowser` proof exercised the JS-bundle PoC. The current browser journey lives in `Apps/TS Lib App/src/ts/test`.
- Final full verification after the compiler path-sharing change passed: 504 TypeScript tests, six authored Tao headless journeys, zero errors. Native behavior is not verified.
- Final warm preview comparison (eight samples each) measured median/p95 58.70/66.70 ms against baseline 53.85/63.40 ms. The residual observed +4.85 ms median is not performance parity; compiler-phase medians were 0.321/0.305 ms. Baseline primary results were complete, but its existing CLI summary printer failed on an extra secondary reload. Attribution remains uncertain in this small sample.
- Source drafting preceded an executable failing journey while setup was blocked; the first executable package proof was green. This deviates from journey-first red/green TDD.

Frozen dependency setup succeeded through the authorized host route. The lockfile changes contain only the new internal workspace metadata; no third-party version changes were made. The earlier protected-metadata and browser sandbox boundaries are resolved.

Local [evidence inventory](../../.artifacts/notes/ts-library-poc-evidence/README.md) retains passing/failing logs, actual consumer/package files, screenshot, raw baseline/final timings, provenance and hashes. Storage archive publication and commits remain pending authorization; retain the worktree. The unresolved performance summary-printer issue and timing uncertainty are recorded in the [task checkpoint](../../.artifacts/checkpoint/ts-library-poc.md).

## Standalone consumer app

`Apps/TS Lib App` contains an ordinary Expo React consumer, positive/negative JSX type cases, Tao library and local ungrouped Justfile. Its first recipe is `help`, so `just` and `just help` list actions. `just compile` calls `../../tao compile Demo --package src/ts`. `just run` calls the public Tao runner, which compiles first and starts Expo with its normal web URL and shortcuts; Ctrl+C stops it. `just check` uses local TypeScript; `just test` uses local Bun and Playwright. No app operation depends on dev, agent, repository imports or preview aliases beyond the explicit Tao executable.

Authored TypeScript, package/configuration and dependency installation live in `src/ts`; Tao library declarations and submodules live in `src/tao`. Browser drivers and type fixtures live in `src/ts/test`. Generated Expo package/bootstrap/Metro/app configuration and `.expo` state live in `.tao/cache/sessions/<session>/expo`, linked to the authored package's sole dependency installation. The prior root `.expo` state is retained under `.tao/cache/retained-expo-state-20261101`. Project cache/lock ignores live in `.tao/.gitignore`.

The browser proof reads these actual authored files. Final follow-up verification passed 505 TypeScript tests and six Tao journeys, zero errors. Actual local Justfile compilation was exercised twice with both outputs preserved, and the server returned HTTP 200 before normal shutdown. [Follow-up evidence](../../.artifacts/notes/ts-lib-standalone-evidence/README.md) and [checkpoint](../../.artifacts/checkpoint/ts-lib-standalone.md) retain details. This dev/test/example follow-up does not change the shared refresh path; the performance limitation above remains open.

By explicit user request, this app has its own package.json and tsconfig.json for VS Code, overriding the former no-manifests-under-Apps policy. Its `tao.compile` manifest configuration supplies entry and package name. `tao compile Demo --package src/ts` selects a declaration; omitting Demo infers a sole target; explicit app entry paths remain supported.

The accepted session-isolation follow-up replaces shared output with `.tao/cache/sessions/<session>/libraries/Demo`. Publication replaces a real directory within that Tao-managed namespace, rejecting symlinks and paths escaping the session boundary. Direct library compilation outside publication requires a fresh output directory. The ordinary standalone consumer selects `.cli`; managed consumers select their own session's generated package through Metro's package resolver. Installed dependencies for apps, sidecars and imported projects remain shared with their existing resolution. Generated packages and mutable build output belong to the session. Dependency installation per session, source mirroring and a custom dependency-link graph are not required by this design.

The review-build workflow uses ordinary compilation to retain output for both example projects. See [Generated Output](../Dev%20Env/Generated%20Output.md) for paths and exclusions.

`tao init <existing-directory> --library` creates a nonnested library/React starter without installing dependencies or overwriting existing files. Its generic Justfile uses an installed `tao` by default. The separate static starter copy was removed in favor of `Apps/TS Lib App`, whose Justfile defaults to the checkout CLI resolved from its folder and permits a `TAO` override. The permanent initializer acceptance test still generates, compiles, typechecks and renders a fresh consumer with its compiled Tao prop. Current managed-host evidence and limitations are retained in [the checkpoint](../../.artifacts/checkpoint/managed-expo-host.md); earlier editor and standalone receipts remain historical.

## Cross-library disabled inheritance

When the layout and style bracket system adds [disabled interaction](../Specification/Actions%20and%20Results.md#disabled-interaction), controls from independently compiled Tao libraries must inherit interaction state from an enclosing Tao container. Coordinate that requirement with the package/runtime layout so both libraries use a shared interaction context.

- [ ] Establish shared interaction context across compiled libraries when implementing disabled interaction.
- [ ] Prove it through an ordinary TypeScript consumer composing two independently compiled libraries: inherited disabling, a child unable to override it, re-enabling with state retained, and an enabled sibling remaining interactive.
