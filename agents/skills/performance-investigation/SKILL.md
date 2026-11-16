---
name: performance-investigation
description: >-
  Investigate performance changes across branch checkpoints, locate significant speedups or
  slowdowns, and test their causes. Use for performance bifurcation, commit scans, baseline/main
  comparisons, timing over existing SSH access, or running and reporting a preview speed test.
---

# Performance investigation

- Use [pipeline-performance](../pipeline-performance/SKILL.md) for measurement boundaries and
  retained evidence. This skill owns checkpoint selection, isolated execution and causal investigation.
- Reuse the Developer's existing account, SSH configuration and authentication. A requested
  investigation authorizes its ordinary remote jobs and transfers on the selected machine; do not
  introduce separate Tao authentication, keys, users or a network listener. New infrastructure or
  dependency installation still needs its normal authorization.
- Use the helpers through `./agent skill-script agents/skills/performance-investigation/scripts/performance.ts --`.
  Read [operations](references/operations.md) for snapshot, SSH, transfer, runner and summary commands;
  read its remote section only when measuring on another computer.

## Select source and checkpoints

- Prefer an explicit host, then an established task/default host. Offer discovery to a human when
  the target is missing or unreachable. Agents run `hosts` only when requested; a missing or invalid host must not silently
  trigger discovery, substitute a target or change SSH trust settings.
- Resolve the comparison baseline once and freeze its full SHA in the task checkpoint. Honor a
  recorded branch parent/start before inferring one. Otherwise rank plausible branch fork points
  by distance from current HEAD; exclude this branch, identical-tip copies, backup refs and internal
  review/evidence branches. Show the selected branch and fork SHA; surface equally plausible parents.
- With an explicit comparison branch such as main, use its merge base with HEAD. An explicitly
  requested exact baseline uses that commit instead. Diagnostic parent comparisons do not replace
  the original branch-start comparison required by pipeline-performance.
- List the first-parent checkpoints from baseline to HEAD. Start with baseline, midpoint and tip;
  include the captured saved-source snapshot as a separate tip when it differs from HEAD. Record
  merged work as a merge boundary, and inspect its merged ancestry if that boundary changes timings.
- Capture the controller's saved source with `snapshot`; preserve its real HEAD, index, staged and
  unstaged selections. Include nonignored untracked source. Treat declared submodule pins separately;
  dirty submodules need their own capture. Never stage, stash or switch the controller to benchmark.
- Adaptive sampling cannot rule out an internal slowdown followed by recovery. Disclose measured
  checkpoints. If asked to scan every commit, measure the complete requested history, including
  merged commits when requested, and report unbuildable checkpoints as gaps.

## Measure comparable workloads

- Prepare each candidate in a new owned clone. Choose one canonical fixture supported by all
  candidates and freeze its bytes/hash. Separate the fixed investigation tooling from candidate
  code; retain every instrumentation change and do not attribute it to the historical source commit.
- Use the runner helper to serialize jobs across checkouts of the same runner account. Keep other
  verification, builds and interactive use off that host while timing; the helper lock does not
  exclude unrelated processes or other users. Record observed load, power mode and thermal conditions.
- Freeze browser, pinned toolchain, fixture, frame sizes, edit count and relevant environment.
  Setup, transfer and dependency preparation finish before measurement. Distinguish first use,
  startup and warm refresh; do not equate React-applied receipts with physical paint.
- Start with five balanced rounds across the selected checkpoints, one independent runner session
  per checkpoint per round. Alternate/reverse checkpoint order between rounds to expose drift.
  Use the default 24 edits, excluding the first complete cycle from warm analysis, unless the task needs another
  recorded workload. Compare scenario medians within sessions, then independent session distributions.
- The summary helper reports values and conditions, not statistical significance. Compare startup,
  first edit and warm scenarios separately. Verify conditions across jobs as well as within each job;
  changing browser/toolchain/configuration invalidates attribution until remeasured consistently.
- Apply existing executable budgets where available. For preview latency, otherwise use a provisional
  materiality floor of both 5% and 2 ms, alongside independent-run variability; thresholds alone do not prove a change.
  Repeat promising differences in a separate balanced confirmation batch and report uncertainty.
  Retain outliers and contaminated runs with reasons instead of silently dropping them.

## Hone in until the cause is established

- Investigate significant speedups as well as slowdowns immediately. Split every suspicious
  interval and measure additional checkpoints until repeated parent/child comparisons identify a
  responsible commit or the smallest testable interval. Do not assume changes are monotonic or
  use a single good/bad binary search when there may be several transitions or recoveries.
- Inspect scenario and phase changes, then the relevant diff and execution path. A commit label
  is a location, not a causal explanation. Profile implicated phases or use deterministic work counts
  when end-to-end noise obscures the mechanism; confirm the final explanation end to end.
- Test the suspected cause through a minimal intervention in an owned experimental clone, such as
  reversing the relevant change or restoring an earlier calculation. Capture that intervention as
  another immutable snapshot with its patch and parent identity, and run a matched comparison.
  Keep unrelated fixes, controller changes and publication out of the investigation.
- Continue through every detected transition, including gradual accumulated changes visible only
  in the baseline-to-final comparison. Stop with an inconclusive explanation only when concrete
  evidence limits progress: incompatible history/workload, unavailable host, persistent uncontrolled
  noise, or a required Developer decision. State what was established and the exact remaining gap.
- Retain raw reports, fixture, snapshot manifests, run order, host/toolchain conditions and
  failed/interrupted jobs under task
  `.artifacts/notes/`. Follow pipeline-performance and git-workflow for durable evidence at handoff;
  investigation does not authorize committing, merging or changing human review acceptance.

## Report each speed run

- Put the verdict and a compact table in the reply after every requested speed run. Say what
  improved, slowed down or remained inconclusive. Name the measured revisions, workloads,
  independent session counts and measurement endpoint.
- Put **Change**, **This run** and **Baseline** first in comparison tables, in that order. Use
  signed percentages alone in Change. Include startup, first edit, typical and slow warm edits,
  session variation, warm edits over budget and observed frame restarts when measured. Use counts
  with denominators for reliability rows and show unavailable evidence explicitly.
- Explain noteworthy changes in milliseconds and give the pair agreement or repeat evidence that
  determines the verdict. Include implicated phases and experiment outcomes when established.
  Link the full report for per-edit and phase details.
