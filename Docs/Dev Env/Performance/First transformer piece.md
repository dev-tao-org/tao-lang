# First transformer piece

Historical checkpoint: these app-only workloads describe earlier revisions. The current
`./agent performance parser` command measures full-app transformation and code generation;
see [First Expo preview baseline](First%20Expo%20preview%20baseline.md) for the later pipeline.
The command below reproduces the described workload only at its recorded historical revision.

This records a review checkpoint before completion of the CST-to-AST slice.

The measured input is only the app declaration from `Apps/Tests/Hello World.tao`.
At this checkpoint, views, render calls, injections, code generation and preview refresh were unimplemented.
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
Full-app transformation and Expo measurements followed later; see the linked preview baseline.

## Consolidated-file checkpoint

After grouping the transformer into `AST.ts` and `Transform.ts`, rerun the same app-only
scenario with unchanged input and sample definitions. Base revision is `f870e4838` plus the
consolidation changes. At that revision the constructor declared its handlers as ordinary class methods.

| Run                                                   | Transform median / p95 | Parse-to-AST median / p95 |
| ----------------------------------------------------- | ---------------------: | ------------------------: |
| Alongside verification                                |       0.007 / 0.020 ms |          0.011 / 0.025 ms |
| Unchanged rerun without concurrent agent verification |       0.005 / 0.011 ms |          0.008 / 0.017 ms |

Raw reports are `parser-cb61d743-c843-49fb-af9c-713074c2aaab.json` and
`parser-b638f0d7-339c-4165-8f4d-9255b275f45a.json` under `.artifacts/logs/performance/`.
The second run's combined median matches the first-piece baseline. These short runs do not
establish a speedup or attribute microsecond differences to the refactor; further optimization
is deferred while the structure is under review.

## Generic grammar and Switch dispatch

On base `a40716668` plus the grammar review changes, the same authored fixtures now parse
through PascalCase rules and generic `ViewRender` nodes. Dispatch at that revision used `Switch.on` with
handlers bound once per constructor. Keep the original fixture bytes and sample definitions;
the grammar and CST shape changed, so this measures the integrated review changes.

Warm full-app parsing medians range from 0.003 to 0.004 ms (p95 0.004 to 0.007 ms).
App-only transformation records median 0.005 / p95 0.012 ms; app-only parse-to-AST records
median 0.008 / p95 0.016 ms. Each phase has 100 retained samples after 20 warmups.
Raw report: `.artifacts/logs/performance/parser-5c697566-430d-472c-8cbb-e6defffda1ad.json`.
No concurrent agent verification ran during measurement. The app-only combined median is
unchanged at the reported precision; full view transformation and preview measurements were still pending.
