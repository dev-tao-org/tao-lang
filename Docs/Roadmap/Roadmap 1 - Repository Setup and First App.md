# Roadmap 1 - Repository Setup and First App

Use the process described in `AGENTS.md`. Remaining work continues in [Roadmap 2](Roadmap%202%20-%20Incremental%20Compilation%20and%20Interactive%20Apps.md).

## Goal 1 — Repository and runnable reference

- [x] Establish the independent TypeScript workspace and pinned developer commands.
- [x] Restore the previous implementation under `.x-tao-old-v1/`.
- [x] Make its defaults a focused language/Studio reference lane, retaining broader maintenance commands. See [Reference Verification](../Dev%20Env/Reference%20Verification.md).

## Goal 2 — First end-to-end app

- [x] Implement the Tree-sitter parser, CST-to-AST transformation and AST-to-code generation.
- [x] Support ordinary view declarations/renders and injected TypeScript.
- [x] Build a readable Expo runtime with app-side refresh instrumentation.
- [x] Run Hello World on headless web and verify its rendered output.
- [x] Measure source edits through compilation, publication, Metro completion and matching React commits in two frame sizes.

The canonical performance fixture is [Performance.tao](../../ts/repo-analysis/performance-fixtures/Performance/Performance.tao). [Preview Workflow](../Dev%20Env/Preview%20Workflow.md) describes the persistent developer loop, changed-file publication and measurement boundaries. Native acceptance and CI work moved to Roadmap 2.

## Goal 3 — Language and developer-tooling foundations

- [x] Use stateless AST construction and split compiler functions by responsibility.
- [x] Implement lexical lets and scopes, module imports/resolution/visibility and standard UI views.
- [x] Run tagged Tao app journeys through `tao test`, with parallel repository test workers.
- [x] Format and fix current Tao syntax, including embedded TSX, import organization and warnings that retain unused code.
- [x] Build a self-contained Tree-sitter editor extension with incremental syntax highlighting, syntax diagnostics and format-on-save.
- [x] Build/install the extension into Cursor and VS Code through Cmd+Shift+B.
- [x] Record parser, editor, formatter and preview measurements.
- [x] Compare the original branch baseline with the final preview pipeline. See [preview comparison](../Dev%20Env/Performance/Roadmap%201%20preview%20comparison.md).
- [x] Keep local main current after authorized landings and require branch-wide performance comparisons before landing.

See [Tests](../Specification/Tests.md), [Formatting and Fixing](../Specification/Formatting%20and%20Fixing.md), and [Performance](../Dev%20Env/Performance/README.md) for implemented behavior and evidence. All outstanding implementation and acceptance TODOs are consolidated in Roadmap 2.
