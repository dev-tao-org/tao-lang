# Goal 2 parser planning

Working notes, not an approved implementation plan. Starting point: landed `0770b50a`.
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

Initial decision ledger: 0% settled. Grammar scope 30 points (25 initial, 5 follow-up), binding/tools
40 points (30 initial, 10 compatibility/pins follow-up), folders/generated lifecycle 20 points,
test and performance acceptance 10 points. These are rough decision-work weights, not implementation progress.

Do not implement the parser before agreement, install new dependencies without approval, or land without instruction.
