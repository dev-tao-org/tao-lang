# Performance measurements

Use these commands from the repository root after `./agent unsandboxed setup`:

| Command                                   | Measures                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `./agent performance parser`              | Forced grammar/native build, process-cold parsing and warm full-source parser/AST/code-generation phases.      |
| `./agent performance formatter`           | Tao formatting/fixing and embedded TSX formatting on the driver's fixtures.                                    |
| `./agent performance reactivity`          | Reactive graph policies, heap retention, and reused/fresh collection publications with downstream work counts. |
| `./agent performance extension`           | Incremental Tao parsing, embedded TSX parsing and highlight queries; excludes editor paint.                    |
| `./agent unsandboxed performance preview` | Editor save, compiler publication, Metro, and app receipts in two isolated headless previews.                  |
| `./dev performance editor`                | Serves the fixed performance project with a source tree, editor, Save button, and on-demand previews.          |
| `./dev performance preview --baseline`    | Retains five fresh sessions from one clean commit as the checkout's comparison baseline.                       |
| `./agent unsandboxed performance record`  | One immutable preview record for the current clean implementation commit; reuses an existing record.           |
| `just performance`                        | Developer preview measurement command, printing results and retaining the raw report.                          |

The preview host route is required in the macOS agent environment. See
[Preview Workflow](../Preview%20Workflow.md) for the persistent `just dev` loop, output locations and
receipt definitions. App receipts establish a React commit, not physical repaint.

The drivers live in [repository analysis](../../../ts/repo-analysis/repo-analysis-src/Performance)
and share the [authored workload](../../../ts/repo-analysis/performance-fixtures/Performance/Performance.tao).
Each timing record keeps the fixture path and hash at the revision it measured.

The fixed project imports six groups across 24 dependency files. A cycle measures a small text
edit, expanding and shrinking a same-file tree, mounting and expanding a nested imported tree,
editing a mounted dependency, shrinking the imported tree, and resetting. Launch and first and
warm preview opens have separate timers. Each session runs three cycles, allowing the last two to
supply a warm sample for every edit. Percentage changes use each step's own baseline median.

Protocol v4 uses named imports within a folder and keeps the same rendered workload and source file
count. Start a new baseline when comparing with v3, which used filename imports.

Ordinary `verify` and TypeScript CI prepare assets and run correctness checks/tests; they do not run
these benchmark targets automatically. Do not infer a new timing baseline from a passing verify.

The reactivity workload includes 1000-row lists and 1000 publications per sample: reusing an owned
snapshot, submitting fresh equal lists, and changing one field with shared versus fresh rows. It
retains seven samples after two warmups and checks identity retention and downstream work counts.
These timings include list construction, snapshot admission, equality and propagation; they do not
isolate copy cost or measure React rendering, and are not a comparison with the previous runtime.

## Comparing and retaining results

Run comparable workloads without concurrent verification or other benchmarks. Keep fixture bytes,
frame sizes, tool versions and cache conditions aligned; separate cold startup from warm updates.
Record repeated samples and their spread, with baseline/candidate revisions and dirty state.
Phase spans can overlap, so their durations or percentiles cannot simply be summed.

Drivers save raw samples under `.artifacts/logs/performance/`. Keep working comparisons in
`.artifacts/notes/`; ordinary cleanup retains notes but can prune successful raw logs. A filename
in an older document identifies its original report and does not guarantee that report still exists.

The [pipeline-performance skill](../../../agents/skills/pipeline-performance/SKILL.md) owns agent
measurement policy. Its [preview-history workflow](../../../agents/skills/pipeline-performance/references/preview-history.md)
explains per-commit recording, significant-change reporting and the branch-start-to-final comparison.
Records can remain pending under `.artifacts/notes/preview-history/` until the authorized landing
workflow publishes and pins them under `.storage/performance/preview/<commit>/`. Diagnostic
`performance preview` runs do not create immutable commit records.

## Retained measurements

These are historical records, not current speed guarantees. Reproduce an old measurement with its
recorded revision and fixture; running today's command uses today's implementation and inputs.

| Record                                                                      | What it establishes                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [First parser baseline](First%20parser%20baseline.md)                       | Initial native parser startup/build and warm full-parse costs.             |
| [First transformer piece](First%20transformer%20piece.md)                   | App-only CST-to-AST checkpoints before the full compiler existed.          |
| [First Expo preview baseline](First%20Expo%20preview%20baseline.md)         | Initial two-frame refresh path and subsequent real-watcher measurements.   |
| [First editor extension baseline](First%20editor%20extension%20baseline.md) | WASM parsing and highlighting costs, excluding visible recoloring.         |
| [TypeScript checks baseline](TypeScript%20checks%20baseline.md)             | Local observations motivating one incremental TypeScript build invocation. |
| [Roadmap 1 preview comparison](Roadmap%201%20preview%20comparison.md)       | Paired original-baseline/final runs with identical source and frames.      |

The Roadmap 1 comparison found no significant slowdown; its overlapping ranges do not establish a
reliable speedup. The end-to-end target below 100 ms remains unmet. Native iOS/Android measurements
and larger workloads remain roadmap work.
