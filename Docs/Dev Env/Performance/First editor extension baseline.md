# First editor extension baseline

Historical checkpoint: the fixture and implementation have evolved. See the [performance guide](README.md)
for current commands; reproducing these figures requires the recorded revision and inputs.

Run `./agent performance extension` after setup. The driver uses the same WASM document session as the extension, with Kitchen Sink as its fixture. It alternates a text edit inside a TSX injection, performs 20 unrecorded warmups, then records 100 incremental updates. Every measured result must have highlight captures and no syntax diagnostics.

This is the first baseline for the new path, based on the dirty implementation over `c7b57deef`. It is not a comparison against the old extension. The October 17, 2026 run used macOS ARM64, Bun 1.4.2, Tree-sitter CLI 0.26.13, web-tree-sitter 0.26.6 and tree-sitter-typescript 0.23.2 on the shared developer host. OS and runtime caches were warm; editor rendering and WASM initialization are excluded.

| Phase                       | Median   | p95      | Samples |
| --------------------------- | -------- | -------- | ------- |
| Complete editor-core update | 0.257 ms | 0.425 ms | 100     |
| Incremental Tao parse       | 0.005 ms | 0.009 ms | 100     |
| Individual TSX parse        | 0.011 ms | 0.021 ms | 500     |
| Individual highlight query  | 0.014 ms | 0.028 ms | 600     |

Raw report: `.artifacts/logs/performance/extension-fe9eedfb-b3d8-4e3c-8615-d2f40b2c2cff.json`. A preceding run measured complete updates at 0.272 ms median / 0.545 ms p95. Reports retain phase samples, the fixture hash, system information and commit/dirty state.

Each update includes source differencing, incremental Tao parsing, syntax diagnostics, full parsing of five embedded TSX blocks, six highlight queries, and capture normalization. Per-call phase statistics are not additive percentiles. VS Code token encoding, scheduling and visible recoloring have not been measured; these results do not establish keystroke-to-paint or preview-refresh latency.

The first implementation keeps full TSX parsing and complete query passes for simplicity. Costs are small for this fixture, so no further caching or incremental injection reuse was added. Larger documents and real editor timing are follow-up measurements. The standalone VSIX loads under Node with the editor API stubbed; interactive installation and visual acceptance remain separate.
