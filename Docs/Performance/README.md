# Performance

Performance measurements are part of implementation evaluation. Each slice affecting a hot path must identify that path, establish a baseline where one exists, and run the relevant performance tests against the final changes before landing. New paths establish their first baseline; missing measurements remain unverified.

Compare equivalent inputs and workloads under comparable host and cache conditions. Record repeated samples and their spread, rather than relying on one run. Distinguish cold startup/builds from warm or incremental work, and separate Tao pipeline time from platform bundling, native builds, launch and end-to-end test time.

Investigate measured increases, including whether they reflect noise or additional work. Try reasonable improvements and measure again. Continue until improvements show diminishing returns or further optimization would add too much complexity for the slice. Record any remaining increase, its cause, attempted improvements and the reason for stopping; do not hide regressions by weakening tests or raising budgets.

Keep working measurements in `.artifacts/notes/`; add or update documents here when the developer instructs it. Each measurement record includes:

- Scenario, command, fixture, baseline and candidate commits.
- Platform, tool versions, host conditions and cold/warm definitions.
- Sample count, timings, variability and phase costs where available.
- Observed increases, investigation, optimization attempts and final comparison.
- Remaining costs, stopping rationale and follow-up work.

## First Hello World slice

The [first parser baseline](First%20parser%20baseline.md) records the independent Tree-sitter parser's startup and full-parse measurements. `./agent performance parser` runs directly, in local verify and in TypeScript CI, and now includes full-source AST and code generation. The [first Expo preview baseline](First%20Expo%20preview%20baseline.md) records the two-frame pipeline and both refresh-completion signals.

The [first editor extension baseline](First%20editor%20extension%20baseline.md) records incremental Tao parsing, embedded TSX parsing and highlighting queries. Run it with `./agent performance extension`; it excludes editor rendering.

Measure CST-to-AST transformation and code generation as they arrive, then the complete Tao pipeline and the runtime's granular operations through the two-iframe harness. Record web, headless iOS and headless Android build, launch and test costs separately, including cold and warm runs and total parallel CI wall time. Reuse the generated Tao output across platform jobs while measuring their distinct platform work.
