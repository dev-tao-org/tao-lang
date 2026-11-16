# Tao Language Support

This VS Code extension incrementally parses Tao source with the repository's Tree-sitter grammar. It reports syntax, statement placement and declaration name errors, highlights Tao syntax, and parses fenced TypeScript injection bodies as TSX so embedded syntax receives diagnostics and highlighting. Embedded tokens use the upstream TypeScript and JavaScript Tree-sitter highlight queries shipped with their grammar packages.

The packaged extension includes the web-tree-sitter runtime, the generated Tao and TSX grammars, and their queries. It does not require a Tao CLI installation. It uses the existing `devtao.tao` identity, replacing the previous implementation. The installer removes the accidental `tao.tao-language` installation when present. Keep `devtao.tao` enabled in the workspace and reload the editor window after replacing the implementation.

From the repository root, Cmd+Shift+B or `just install-ide-extension` builds Tao Language Support and Dev Tao Org and installs both into Cursor and VS Code using their `cursor` and `code` CLI commands. `./dev build-ide-extension` builds both without installing. The language VSIX remains at `.artifacts/ide-extension/tao-language.vsix`; developer tools are at `.artifacts/ide-extensions/dev-tao-org/dev-tao-org.vsix`.

Run `./agent unsandboxed setup` before building. The first WASM build lets the pinned Tree-sitter CLI download its WASI SDK into its cache; later builds reuse it. The extension needs no network access at runtime. `./agent performance extension` records parser, semantic validation and query timings on Kitchen Sink, excluding editor rendering.

Tao trees are retained per document. Embedded TSX blocks are fully parsed and queried on each update in this first slice. The extension checks placement and declaration names in a syntactically complete Tao document. Full typechecking and completion remain future language-service work.
