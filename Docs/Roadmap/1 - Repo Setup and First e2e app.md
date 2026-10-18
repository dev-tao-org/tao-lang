# 1 - Repo Setup and First e2e app

Use the process described in `AGENTS.md` to implement the goals.

## Goal 1

Get the `.x-tao-old-v1/` PoC working again:

- [x] Get tests running inside of `.x-tao-old-v1/` folder again.
- [x] Changes outside of that folder should be minimal.
- [x] Make its defaults a focused language/Studio reference lane; retain broader maintenance commands. See [Reference Verification](../Specification/Reference%20Verification.md).

## Goal 2

Implement a first e2e Hello World app:

- [x] Implement basic treesitter parser
  - [x] Support generic view declarations/renders and TypeScript injection; implement Text, Col and Row as ordinary Tao views.
- [x] Implement basic treesitter CST to AST transformer
- [x] Implement basic AST to code generator
- [x] Implement basic expo runtime
  - [x] Create a TypeScript runtime folder owning the handwritten code included in compiled Tao app scaffolds, with app-side performance instrumentation exposed to the harness.
- [x] Write a basic web test that checks "Hello World" is showing in the app
- [x] Implement basic testing framework
- [x] Implement a minimal preview-refresh performance package and automated harness, using the runtime's granular app-side measurements.

Implemented behavior: [Preview Workflow](../Specification/Preview%20Workflow.md). The canonical performance fixture is [Hello World.tao](../../Apps/Tests/Hello%20World.tao); the persistent developer loop uses `Apps/Dev/Preview`.

### Developer-requested editor slice

- [x] Build a self-contained VS Code extension using the Tao WASM grammar and `web-tree-sitter`, with incremental per-document syntax highlighting and syntax diagnostics, including embedded TSX through upstream grammar queries.
- [x] Provide Cmd+Shift+B / `just install-ide-extension` to build once and install into Cursor and VS Code; keep generated output in `.artifacts/ide-extension`.
- [x] Measure the editor core on Kitchen Sink; record the baseline under [Performance](../Performance/First%20editor%20extension%20baseline.md).
- [x] Support formatting on save through the shared Tao formatter.
- [ ] Complete interactive editor acceptance.
- [ ] Add semantic typechecking, completion and navigation through the language service.

### Success criteria

- [x] Parse, transform, compile and run the minimal app through the handwritten Expo runtime.
- [x] Verify Hello World on headless web and automatically measure both refresh signals in both iframe sizes, with pipeline spans and resulting DOM assertions.
- [ ] Verify Hello World on headless iOS Simulator and Android Emulator.
- [ ] Run all three platforms in CI, sharing generated Tao output and running platform jobs in parallel.
- [ ] Select native platforms locally and record cold/warm CI timings before adding build infrastructure.
- [ ] Complete the original-project-baseline versus final preview comparison before landing, investigating significant changes and retaining the results under [Performance](../Performance/README.md).

## Goal 3

- [x] Update instructions to always update local main after changes have landed
- [x] Move away from classes for large blocks of functionality, e.g compiler (it will hit limits). Change CST-to-AST construction to be stateless. Follow compiler pattern for spreading over files.
- [x] Get basic tao tests working
  - [x] Use a default headless target for tests for now
  - [x] Add render tags, see old impl for reference
  - [x] Implement the `run app` case; direct `render view` testing remains deferred.
- [x] Implement `LetDefinition` and scopes
  - [x] See old impl for reference of runtime scope construction and declarations onto scopes.
- [ ] Get compiled code to be formatted properly
- [x] Move Hello World views into `@tao/ui`; implement `use`, module resolution and visibility.
- [x] Format and fix all current Tao syntax, including injected TSX, import organization and unused-code warnings. See [Formatting and Fixing](../Specification/Formatting%20and%20Fixing.md).
- [ ] Implement incremental recompilation with a focus on preview speed.
  - [ ] Define invalidation rules for changed view bodies and dependencies.
  - [ ] Consider one output file per definition so an edit publishes only affected definitions.
  - [ ] Keep React component output compatible with Fast Refresh.

Test syntax and current execution behavior are described in [Tests](../Specification/Tests.md). [Live Previews](../Specification/Live%20Previews.md) and [Local State and Data Drafts](../Specification/Local%20State%20and%20Data%20Drafts.md) retain explicitly future language proposals.
