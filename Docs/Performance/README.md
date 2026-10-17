# Performance

Performance measurements are part of implementation evaluation. Each slice affecting a hot path must identify that path, establish a baseline where one exists, and run the relevant performance tests against the final changes before landing. New paths establish their first baseline; missing measurements remain unverified.

Compare equivalent inputs and workloads under comparable host and cache conditions. Record repeated samples and their spread, rather than relying on one run. Distinguish cold startup/builds from warm or incremental work, and separate Tao pipeline time from platform bundling, native builds, launch and end-to-end test time.

Investigate measured increases, including whether they reflect noise or additional work. Try reasonable improvements and measure again. Continue until improvements show diminishing returns or further optimization would add too much complexity for the slice. Record any remaining increase, its cause, attempted improvements and the reason for stopping; do not hide regressions by weakening tests or raising budgets.

Keep results in a named document in this directory. Each record includes:

- Scenario, command, fixture, baseline and candidate commits.
- Platform, tool versions, host conditions and cold/warm definitions.
- Sample count, timings, variability and phase costs where available.
- Observed increases, investigation, optimization attempts and final comparison.
- Remaining costs, stopping rationale and follow-up work.

## First Hello World slice

Measure Tao parsing, CST-to-AST transformation and code generation, plus the complete Tao pipeline. Record web, headless iOS and headless Android build, launch and test costs separately, including cold and warm runs and total parallel CI wall time. Reuse the generated Tao output across platform jobs while measuring their distinct platform work. Establish these measurements during implementation; no timings have been established yet.
