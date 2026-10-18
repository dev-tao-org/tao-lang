# 1 - Repo Setup and First e2e app

Use the process described in `AGENTS.md` to implement the goals.

## Goal 1

Get the `.x-tao-old-v1/` PoC working again:

- [x] Get tests running inside of `.x-tao-old-v1/` folder again.
- [x] Changes outside of that folder should be minimal.

## Goal 2

Implement a first e2e Hello World app:

- [x] Implement basic treesitter parser
  - [x] Extend the first-app grammar with generic view declarations/renders and TypeScript injection; define Text, Col and Row in the app source.
- [x] Implement basic treesitter CST to AST transformer
- [x] Implement basic AST to code generator
- [x] Implement basic expo runtime
  - [x] Create a TypeScript runtime folder owning the handwritten code included in compiled Tao app scaffolds, with app-side performance instrumentation exposed to the harness.
- [x] Write a basic web test that checks "Hello World" is showing in the app
- [ ] Implement basic testing framework
- [x] Implement a minimal preview-refresh performance package and automated harness, using the runtime's granular app-side measurements.

### Preview-refresh performance

- Provide `tao compile <app-entry-file>` and a shared in-process compiler API. The performance web server calls that API directly, then saves generated Expo modules for normal refresh.
- The performance package owns a minimal TypeScript webapp and automated runner using the canonical Tao fixture. Start Expo once and display the same compiled app in two iframes of different sizes.
- A button sends a command to save the opened Tao source file. Workspace owns file observation and recompiles when it detects the change; the button never calls the compiler directly. Performance tests use the same save/watch path with an isolated source fixture, preserving the canonical app.
- Measure text replacement and a structural sequence that adds a Text view, then changes Col to Row. Record each edit step separately in both previews.
- Establish reusable timing support and place measurements at the actual workflow boundaries: source update, parsing, CST-to-AST transformation, code generation, generated-file publication and preview refresh.
- Report both the actual Metro `update-done` event and the runtime's React post-commit `preview-applied` event, plus granular binding/rendering spans. Correlate messages by session, iframe, document boot and source revision; reject stale messages. Automation also checks the resulting text and row layout. No screenshots or physical-paint claims.
- Attribute results to the source revision, edit scenario and iframe size. Use local monotonic durations, epoch-relative timestamps under the agreed same-host clock assumption, and the parent clock for click-to-receipt totals. Save structured results and repeated samples under [Performance](../Performance/README.md).
- `just dev` watches the existing canonical app, writes generated output under `.artifacts/dev/hello-world/`, opens the two-preview URL and retains the session until Ctrl-C. It does not copy the authored Tao file.
- Compiler and reload output report observation-to-read, source read, queue, parse, AST, codegen and output-write spans, followed by publication-to-Metro and Metro-to-applied intervals per preview.
- Keep this first baseline to full recompilation and the minimal app. Studio integration and partial recompilation follow later.

### Minimal first app

The canonical source is [Apps/Tests/Hello World.tao](../../Apps/Tests/Hello%20World.tao).

### Developer-requested editor slice

- [x] Build a self-contained VS Code extension using the Tao WASM grammar and `web-tree-sitter`, with incremental per-document syntax highlighting and syntax diagnostics, including embedded TSX through upstream grammar queries.
- [x] Provide Cmd+Shift+B / `just install-ide-extension` to build once and install into Cursor and VS Code; keep generated output in `.artifacts/ide-extension`.
- [x] Measure the editor core on Kitchen Sink; record the baseline under [Performance](../Performance/First%20editor%20extension%20baseline.md).
- Interactive editor acceptance remains unverified. Typechecking, completion, navigation and formatting follow their language-service implementations.

### Success criteria

- The minimal Tao app passes through parsing, CST-to-AST transformation and code generation into the Expo runtime.
- End-to-end tests confirm that "Hello World" appears on web, headless iOS Simulator and headless Android Emulator.
- CI runs all three platforms by default, sharing the generated Tao output and running platform jobs in parallel. Each platform still needs its own bundle and native build where applicable.
- Local tests can select a platform for fast iteration. Record cold and warm CI timings before adding further build infrastructure.
- The compiled app scaffold uses the new handwritten TypeScript runtime; the performance harness automatically measures both refresh signals for the specified edits in both iframe sizes, with granular runtime-operation timings alongside compiler timings and resulting DOM assertions.
- Measure implementation hot paths and run their performance tests before landing. Investigate increases and iterate until diminishing returns or further work would add too much complexity for the slice; record results and remaining costs under [Performance](../Performance/README.md).

## Goal 3

- [ ] Update instructions to always update local main after changes have landed
- [ ] Move away from classes for large blocks of functionality, e.g compiler (it will hit limits). Change CST-to-AST construction to be stateless. Follow compiler pattern for spreading over files.
- [ ] Get basic tao tests working
  - [ ] Get things in snippet below working
  - [ ] Use a default headless target for tests for now
  - [ ] Add render tags, see old impl for reference
  - [ ] Skip `render view` for now, just implement `run app` case
  - [ ] See old impl for reference of how to do these things.
- [ ] Implement `LetDefinition` and scopes
  - [ ] See old impl for reference of runtime scope construction and declarations onto scopes.
- [ ] Get compiled code to be formatted properly
- [ ] Move hello world views into @tao/ui and implement `use` and stdlib
  - [ ] Get single-document recompilation working, with focus on speed
    - [ ] Deduce rules. E.g if a view body changes, only the view's own code needs to be re-parsed and re-compiled.
    - [ ] Consider one file per definition, such that updating a view only outputs that file again
    - [ ] At least make sure that views are compiled such that only react components are in the file, for fa
          st refresh/hmr to work (or whatever the conditions is)

### Basic test snippet of functionality to get working

```tao
tests "Foo" {
  test "Bar" {
    run AppDecl
    expect ...
    press #id-of-render
    type "Hello World" into #id-of-render
    expect {
      ...
    }
  }
}
```

### Proposed CST-to-AST construction

Illustrative, not implemented: expose stateless functions such as `AST.Name(cst)`. Every node is created with its originating CST node and copies its numeric source range; the document owns the path and version. No constructor instance, `this`, or origins map is needed.

```ts
function Name(cst: CST.Identifier): AST.Name {
  return Node(cst, 'Name', { value: cst.text })
}

function Node<const Kind extends AST.Node['kind'], T extends object>(
  cst: CST.Node,
  kind: Kind,
  value: T,
): T & { kind: Kind } & AST.Origin {
  return Object.assign(value, {
    kind,
    start: cst.startIndex,
    end: cst.endIndex,
  })
}
```
