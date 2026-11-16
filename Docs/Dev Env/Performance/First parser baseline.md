# First parser baseline

Measured on October 17, 2026, against clean commit `65c88c760f3d9a35e04bb2820b37a4d6b6f832ee`.
Starting roadmap baseline: `0770b50a`. This is the first independent parser implementation;
there is no comparable prior new-parser baseline and no speedup claim.

## Workload and reproduction

At the recorded revision, run `./agent setup --frozen-lockfile`, then `./agent performance parser`.
Raw samples and summaries are saved under `.artifacts/logs/performance/`.
Today's commands and automation boundaries are described in the [performance guide](README.md).

The canonical fixture is now [Performance.tao](../../../ts/repo-analysis/performance-fixtures/Performance/Performance.tao);
its current contents have evolved since this measurement.
`Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')` loads it for both correctness and performance consumers. This historical baseline used its former `Apps/Tests/Hello World.tao` path and `HelloWorld` app name.
Measure the initial source, replace its text, add another Text view, then change Col to Row.
Every parse processes the complete snapshot; there is no incremental tree reuse.

Environment: macOS arm64, Darwin 27.0.0, Bun 1.4.2 and Node 24.14.1. Dependencies are
Tree-sitter 0.25.1, generator 0.26.13 targeting ABI 15, node-addon-api 8.5.0 and node-gyp 12.1.0.
The run was sequential locally; unrelated host activity was not excluded. Hosted Linux results
have not been collected, and no browser, Expo server or native device was started.

- Rebuild: one forced grammar generation and native rebuild, with tools and Node headers cached.
  This single build observation is a phase cost, not a build-time distribution.
- Cold: five fresh Bun worker processes after that rebuild. OS/tool caches remain intact; this is
  process-cold, not a pristine machine. Worker module load, grammar load, initialization and first
  parse are separate spans. Parent process wall time also includes spawning, fixture reading,
  CST verification and report serialization. Nested spans overlap and must not be summed.
- Warm: one parser session, 20 unrecorded warmups per scenario followed by 100 measured full parses
  per scenario. CST error/text checks execute outside the parse span. Recording uses monotonic
  clocks identified per process; clock domains are never subtracted from each other.

## Results

All values are milliseconds. The raw report is locally retained as
`.artifacts/logs/performance/parser-10dde2a7-07cb-4a67-9bb2-1f7d5daca397.json`, subject to the normal artifact lifecycle.

| Phase                                                | Samples |  Median |     p95 |
| ---------------------------------------------------- | ------: | ------: | ------: |
| Grammar generation                                   |       1 |  83.157 |       — |
| Native build                                         |       1 | 776.197 |       — |
| Fresh worker: parser module load                     |       5 |   1.589 |   1.741 |
| Fresh worker: native grammar load                    |       5 |   0.398 | 104.701 |
| Fresh worker: initialization, including grammar load |       5 |   0.849 | 105.270 |
| Fresh worker: first parse                            |       5 |   0.080 |   0.116 |
| Fresh worker: process wall time                      |       5 |  18.311 | 124.109 |
| Warm: initial source parse                           |     100 |   0.004 |   0.006 |
| Warm: text replacement parse                         |     100 |   0.003 |   0.006 |
| Warm: added Text parse                               |     100 |   0.003 |   0.006 |
| Warm: Col-to-Row parse                               |     100 |   0.003 |   0.005 |

## Investigation and limits

Earlier measurements showed an unusually expensive first initialization after rebuilding the native
grammar. Adding a native-load span localized that cost to grammar loading: the recorded p95 is
104.701 ms while the median is 0.398 ms. The underlying host/runtime cause is not established.
Repeated runs retained a similarly large first-load sample; these are not interchangeable with a
resident server's warm parser calls. No outlier was discarded or budget raised to hide it.

Build integration reuses the managed Node headers when present and skips rebuilding on unchanged
declared grammar/dependency/toolchain inputs. A deliberately removed generated addon was repaired by
frozen setup. The native build still emits node-gyp's upstream Node 24 `DEP0169` deprecation warning.
These changes establish reproducible setup and phase attribution, not a measured preview speedup.

The tiny fixture's warm parsing cost did not justify adding caches or incremental semantics at this
checkpoint. Transformation, publication, Metro and app-side refresh were not yet measured. Later
end-to-end evidence is in the [Roadmap 1 comparison](Roadmap%201%20preview%20comparison.md).
This parser record alone proves neither the target below 100 ms nor the complete preview behavior.
