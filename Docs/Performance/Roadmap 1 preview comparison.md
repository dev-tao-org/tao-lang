# Roadmap 1 preview comparison

Measured on 2026-10-18: original branch baseline `c7f53bd5c515cac219c0feb2806fd585b38ac7d7` versus final implementation `b693b62c4abd563d265839407738b3181c403f20`.

Five runs per implementation followed one excluded warmup each. Run order alternated baseline/final and final/baseline; no verification or other benchmark ran concurrently. Each run started a new isolated Expo session against warm build/toolchain caches and checked the resulting DOM without screenshots.

Both implementations used the baseline's self-contained Hello World source (SHA-256 `d18a39fd1cbfd2a86a83b659754eaf2788daa40d922ffb0f185c69ba13bdb494`), Chrome `155.0.8059.80`, iframe interiors `380×756` and `899×756`, and `EXPO_UNSTABLE_HEADLESS=1`. The final diagnostic reports retain `modified: true` because of that deliberate fixture substitution; the authored fixture was restored afterward. All baseline reports are clean.

## Results

Durations begin at watcher observation and end when both frames acknowledge the matching React commit. They do not measure physical paint or time before the watcher observes the save.

| Scenario         | Baseline median (range), ms | Final median (range), ms |
| ---------------- | --------------------------: | -----------------------: |
| Text replacement |         134.7 (111.5–138.0) |      126.3 (114.1–137.4) |
| Add Text view    |         121.2 (112.4–138.5) |      121.4 (115.2–125.9) |
| Column to row    |         124.1 (122.0–134.3) |      110.3 (106.9–131.9) |

Metro update-done medians were respectively `101.7/87.7/91.0 ms` at baseline and `94.0/88.8/78.2 ms` at final. App receipts followed roughly 33 ms later. Startup medians were `1381.7 ms` and `1364.2 ms`; startup includes compilation, Expo/browser startup and initial render, excluding CLI bootstrap.

No significant preview slowdown was observed. The overlapping ranges and five samples per scenario do not establish a reliable speedup. The sub-100 ms end-to-end target remains unmet. The final harness also passed reset at `119.0 ms` median (`107.3–129.4 ms`); reset has no baseline counterpart and is excluded from the comparison.

Module discovery/loading/linking adds work absent from the baseline. On text edits, final module-load median was `0.330 ms` (including discovery); code generation changed from `0.085` to `0.107 ms`. Those sub-millisecond costs do not explain the roughly 110–135 ms total. The dominant remaining interval is publication through Metro, followed by the app receipt. Formatter/fixer work remains outside this path.

Raw unmodified reports, fixture bytes, run order and phase summaries are retained under `.artifacts/notes/branch-preview-comparison/`. Individual source-commit records are retained separately for publication by the authorized landing workflow. See [Preview Workflow](../Specification/Preview%20Workflow.md) for measurement definitions.
