# First transformer piece

This is a review checkpoint, not the completed CST-to-AST slice.

The measured input is only the app declaration from `Apps/Tests/Hello World.tao`.
Views, render calls, injections, code generation and preview refresh remain unimplemented.
The AST contains a file, app declaration and two unresolved names; a separate map stores
numeric UTF-16 source origins. Every sample constructs a fresh AST and map.

Run `./agent performance parser` to collect the existing parser scenarios and the additional
app-only transform scenario. After 20 warmups, retain 100 samples in one process using its
monotonic clock. `transformer.transform` includes constructor, AST and origin-map creation;
`transformer.parse-to-ast` additionally includes full parsing and the valid-CST gate.

Measured on 2026-10-17, macOS, base `ea2183706` plus the uncommitted first-piece changes:

| App-only operation |   Median |      p95 | Samples |
| ------------------ | -------: | -------: | ------: |
| Parse              | 0.002 ms | 0.004 ms |     100 |
| Transform          | 0.004 ms | 0.011 ms |     100 |
| Parse to AST       | 0.008 ms | 0.018 ms |     100 |

Raw report: `.artifacts/logs/performance/parser-a8d46e5f-96c9-4cf4-aada-90a41ef71094.json`.
The report records the dirty revision, host, runtimes, fixture hash and all samples.
These tiny warmed measurements do not establish scalability or the sub-100ms preview target.
Full-app transformation and actual Expo-to-visible-update measurements remain pending.
