# Goal 2 parser planning

Working notes; settled decisions are recorded below. Starting point: landed `0770b50a`.
The first unfinished roadmap item is the basic Tree-sitter parser. CST-to-AST transformation,
code generation, Expo runtime, platform e2e tests and the testing framework follow in that order.
The complete Goal 2 success criteria remain unchanged.

## Preparation

- Root TDD guidance now limits tests to main functionality and regressions when changes break existing behavior.
- Source-size checks stay silent above the 250-line guidance target; the 350-line hard limit remains enforced.
- Doctor no longer probes branches, GitHub transport/credential helpers or Git hooks, per developer instruction.
- Portable profile reuse no longer prints the repeated reuse and identity lines.
- Codex environment setup, generated Codex/Claude session hooks, Cursor worktree setup and Worktrunk
  call root `./agent setup --frozen-lockfile`. Root setup installs TypeScript workspace dependencies.
  Harness generation remains the explicit `./agent agent-config` command.
- Fresh worktree dependencies were missing; an approved frozen install restored the pinned TypeScript 5.9.3.
  No manifest or lockfile change was needed. Full verification passes 48 tests and 216 assertions;
  doctor reports pass. New worktree lifecycle and Linux hosted execution have not been exercised.

## Library research

A read-only research subagent compared the official bindings. No parser dependency was installed.

- [Native Node binding](https://github.com/tree-sitter/node-tree-sitter): MIT, Node-API prebuilds with
  a native compilation fallback. Compiler-side use fits the current slice. Bun documents broad
  [Node-API support](https://bun.sh/docs/runtime/node-api), but the actual Tao grammar/addon combination
  needs verification under pinned Bun on macOS and Linux. This is the proposed starting option.
- [WASM binding](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web): official
  alternative avoiding a Node addon. Its runtime WASM and Tao grammar WASM are separate artifacts.
  Current [CLI build documentation](https://tree-sitter.github.io/tree-sitter/cli/build.html) requires
  WASI SDK for grammar WASM and may download it when missing. Such tool additions need approval.
- Both need the official [Tree-sitter generator](https://tree-sitter.github.io/tree-sitter/cli/generate.html).
  Pin released runtime/generator versions with compatible language ABI; final pins are unsettled.
- Ecosystem evidence includes [Neovim](https://github.com/neovim/neovim/blob/master/runtime/doc/treesitter.txt)
  and [Zed](https://github.com/zed-industries/zed/blob/main/docs/src/extensions/languages.md).
  Neither is proof of this repository's Bun integration or a speed comparison between bindings.

## Decisions to discuss

- Minimal grammar: parse the exact app/view/root/render/container/text/string constructs in the roadmap;
  accept identifiers, whitespace and line breaks, and report malformed input through CST errors.
  Broader syntax, semantic name resolution and AST transformation stay with later slices.
- Binding and approved dependencies/tools: native first versus WASM first.
- Proposed ownership: `ts/parser/parser-src/`, sibling `parser-test/`, grammar assets in
  `ts/parser/grammar/`; ignored generated output under `ts/parser/_gen_parser/`. Agree before creation.
- Test scope: one meaningful HelloWorld CST test, one malformed-input case; edit/reparse proof if
  incremental parsing is included. No exhaustive grammar matrix.
- Performance: measure generator/build time separately from fresh-process load and first parse,
  warmed full parse, and an edited HelloWorld reparse compared with fresh parse. Record repeated samples,
  sample counts, spread and environment under `Docs/Performance/`. This new implementation has no
  baseline yet; no parser speed claim is established by the preparation checks.

## Settled in dialogue

- Minimal HelloWorld syntax, native Tree-sitter first, and the proposed `ts/parser/` folders are approved.
- Dependency additions needed for this work are approved; select compatible pinned versions during implementation.
- `tao compile X` takes an app entry file. The performance harness does not invoke that command.
- Establish a minimal performance package, proposed at `ts/perf/`, with an executable TS webapp and automated runner.
  It starts Expo and displays the same Tao app in two differently sized iframes.
- The button commands the performance web server, which calls the compiler in memory/in process.
  Measure refresh automatically through the visible update in both frames, with compile and refresh attribution.
- Exercise text replacement and a structural sequence: add a Text view, then change Col to Row.
  Measure each edit step. Retain full recompilation for this first baseline.
- Preserve roadmap implementation order. The full preview proof becomes runnable after the transformer,
  generator and Expo runtime slices exist. Studio and partial recompilation come later.
- Timing framework and appropriate measurement placement are primary deliverables; parser microbenchmarks
  alone do not prove the requested preview-refresh performance.

Generated Expo modules may be saved after in-process compilation; approved in dialogue.
Goal 2 now explicitly includes a handwritten TypeScript runtime folder for code included in compiled
app scaffolds. The runtime owns granular app-operation instrumentation exposed to the performance harness;
the harness correlates runtime events and verifies the visible preview update. Proposed folder:
`ts/runtime/runtime-src/`, with sibling `runtime-test/`, awaiting folder agreement before creation.

Reference inspection: `.x-tao-old-v1/packages/apps/runtime/TaoRuntime-src/` owns reusable app runtime
behavior; its AGENTS.md separates app-specific generated wiring from reusable runtime behavior.
`.x-tao-old-v1/packages/apps/expo-host/expo-host-src/runtime.ts:137` generates and publishes app modules
under the selected runtime project. Use these ownership boundaries as reference, not the implementation
or dependencies. No legacy code was executed, imported or edited.

Planning is settled: `ts/runtime/runtime-src/` with sibling `runtime-test/` is approved.
The performance package is under `ts/perf/`.

## First parser slice

- Implemented the minimal grammar and native language binding under `ts/parser/`, using independent
  dependencies: `tree-sitter@0.25.1`, `tree-sitter-cli@0.26.13`, `node-addon-api@8.5.0`, `node-gyp@12.1.0`.
  The generator targets ABI 15. The grammar includes the app/root/view/render/Col/Row/Text/string constructs
  needed for the agreed fixture edits. The parser returns positioned CSTs and Tree-sitter recovery nodes;
  AST transformation and semantic name resolution remain later slices.
- `./agent setup` and test preparation build the grammar when declared inputs change or required generated
  output disappears. A frozen setup repaired a deliberately removed owned native addon without changing
  dependencies. Generated code stays ignored under `ts/parser/_gen_parser/`; root clean removes it.
- The pinned tool profiles supply Python/Make and the Linux native compiler. Node-gyp reuses managed Node
  headers when available. An upstream `DEP0169` warning is still emitted by node-gyp on Node 24; native builds pass.
- Shared `Timings` records named synchronous/asynchronous spans, explicit clock domains and failure status.
  Parser calls automatically return their measurement samples; a pipeline can pass a request collector.
  Collectors are request-scoped and discarded with their owner. No new timing library was needed.
- `./agent performance parser` records forced generation/build spans, five fresh-process samples and
  100 warmed full parses for each fixture scenario. Local verify and TypeScript CI run it automatically;
  raw samples and summaries live in `.artifacts/logs/performance/`, inside CI's existing uploaded log tree.
- Focused parser tests prove the HelloWorld CST and malformed-to-repaired parsing. Timing tests preserve
  sync/async results and original failures. A temporary early-completion mutation made both timing tests
  fail, including the async settlement assertion; it was removed. Full verification passes 52 tests.
- Adding the native-load phase localized the large first-after-build startup sample to grammar loading.
  This is attribution, not an established explanation or a speed gain. Warm full parses are microseconds
  for this tiny fixture. The baseline record belongs under `Docs/Performance/`.
- macOS arm64 is verified locally. Hosted Linux execution and the two-iframe Expo repaint proof remain
  unverified. No compiler/Expo/runtime scaffold is claimed by this parser-only slice.

## Follow-up requests

- `Apps/Tests/Hello World.tao` is the canonical app source. The parser test and performance scenarios
  load it with `Tests.readApp('Hello World')`; the roadmap links to it instead of copying its source.
- The shared OS namespace and file are renamed from `Test`/`Test.ts` to `Tests`/`Tests.ts` in the new
  implementation. The reader stays independent of loading Bun's test runner so performance code can use it.
- The grammar is named `treesitter-grammar.js`. Tree-sitter's installed `dsl.d.ts` supplies official
  DSL types, referenced by that file. `allowJs`/`checkJs` include it in normal TypeScript validation.
  A temporary numeric grammar name made `./agent check` fail with TS2322; it was restored afterward.
- Root guidance routes every current/future preview hot-path change through `pipeline-performance`.
  That skill now states the target below 100 ms from keystroke through file outcome, partial compilation,
  publication, Expo HMR/Fast Refresh and visible update, where feasible. Phase timings are supporting
  evidence; this parser slice establishes no end-to-end latency result.

Do not implement the parser before agreement, install new dependencies without approval, or land without instruction.
