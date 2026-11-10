---
name: implementation-slicing
description: >-
  Append an implementation structure to an existing plan: small reviewable slices,
  effort shares, duration ranges, dependency order, group totals and elapsed-time
  checkpoints. Use when asked to break a plan into implementation chunks, estimate
  when pieces will be ready, or show likely progress after one or three hours.
---

# Implementation Slicing

Keep the plan's minimal behavior specification and architecture separate from its execution
structure. Append a section, or a linked companion when the plan would become unwieldy;
preserve the existing decisions and scope. Slicing a plan does not authorize implementation,
dependencies, delegation, reviews, publication or landing.

## Bound the estimate

- Name the stopping point, scope, staffing and readiness assumptions. Default to one executing
  agent unless parallel work is authorized and credible; state any shared integration owner.
- Check the plan's required capabilities against cheap current evidence before assigning execution
  windows: available language/platform behavior, APIs, tools and dependencies. Classify prerequisites
  as available, missing or unverified, citing the evidence or gap. Put missing capability work and
  bounded discovery gates before dependent slices; do not hide an unknown feature implementation
  inside an otherwise ready 10-minute task. Keep this check scoped to scheduling readiness.
- Separate unsettled decisions and research from implementation. Give research a bounded output
  and a decision gate; mark dependent implementation estimates provisional rather than treating
  an unknown result as a settled design. Ask only for decisions that materially change the plan.
- Use measured durations for comparable gates when available; identify the evidence and its
  applicability. Otherwise label ranges as estimates and name their main assumptions. Do not
  manufacture historical measurements or precise completion promises.
- Express the schedule as cumulative offsets `T+...` from actual execution start, not from when
  the plan was written. Exclude approval, blocked and other external waits explicitly; include
  ordinary execution, machine waits and handoffs. Calendar times require a known start and remain
  conditional forecasts.

## Define useful slices

- Group slices by coherent capability or integration milestone, with a short explanation of each
  group's contribution. Trace every slice to a plan section and give it a stable ID, dependency
  IDs and an observable acceptance output.
- Target roughly 5–15 minutes per slice when credible; simple work may take 3–5 minutes. Split
  work expected to exceed 15 minutes at a meaningful acceptance boundary, or explain an
  irreducible gate's longer duration. Avoid fragments such as opening files or writing an isolated
  helper that cannot be understood or checked as a useful result.
- Include the necessary tests and local validation within the slice that establishes behavior.
  Account separately for bounded integration and final verification. Include review effort only
  within authorized scope; show an external developer review as a gate with its wait excluded.
- Reserve explicit contingency for named uncertainty, with a bounded budget and a re-estimation
  trigger. Keep known work in its own slice; do not hide it in contingency or count the same risk
  both in inflated slice ranges and an additional reserve.

## Calculate effort and elapsed time

- Allocate each slice a share of total expected active person/agent effort, summing to 100% across
  the stated scope, including active integration, verification and contingency work. Give group
  subtotals. These shares express work allocation, not elapsed progress or a count of slices.
- Give each slice a duration range in elapsed minutes and distinguish active effort from machine
  waits when that difference matters. A 20-minute unattended gate may consume little active
  effort; two concurrent 10-minute tasks consume two agents' effort but roughly 10 minutes of
  elapsed time, plus integration.
- For sequential work, accumulate duration bounds through the dependencies. For authorized
  parallel work, show lanes and calculate starts from dependency completion and lane availability;
  calculate total elapsed time from the critical path, including integration and contention.
  Do not sum overlapping windows as though they were sequential.
- Show every slice's expected start and finish offsets as ranges, plus each group's start,
  finish, effort subtotal and elapsed duration range. Explain conditional ordering where a gate
  prevents a reliable schedule; avoid presenting mutually incompatible best-case starts and
  worst-case finishes as one execution trace.
- Add checkpoint forecasts at `T+1h` and `T+3h` when relevant to the horizon, and at the expected
  finish. State the likely accepted outputs, in-flight slice and uncertainty at each checkpoint.
  If completion is expected earlier, say so; never stretch work to fill a checkpoint or equate
  a time offset with an effort percentage.

## Suggested appended section

Use compact tables; repeat the slice table per group when that improves scanning. Replace all
placeholders with plan-specific content, and omit columns only when their information stays clear.

```markdown
## Implementation structure

Estimate basis: <scope and stopping point>; <staffing>; <readiness and timing evidence>.
Clock: T+0 is actual execution start. Excludes <approval/blocked/external waits>.
Effort shares describe active person/agent work; elapsed ranges include <machine gates>.
Uncertainty: <named risk, reserve budget, and when to re-estimate>.

| Group | Contribution | Effort | Elapsed duration | Start     | Finish    |
| ----- | ------------ | ------ | ---------------- | --------- | --------- |
| G1    | <capability> | <%>    | <range>          | <T+range> | <T+range> |

| ID | Plan section; acceptance output       | Depends on    | Effort | Duration | Start → finish      |
| -- | ------------------------------------- | ------------- | ------ | -------- | ------------------- |
| S1 | <link>; <observable result and check> | <IDs or none> | <%>    | <range>  | <T+range → T+range> |

Totals: 100% effort; <elapsed range> to <stopping point>, under <key assumption>.

| Checkpoint                 | Likely accepted outputs   | In flight / uncertainty                |
| -------------------------- | ------------------------- | -------------------------------------- |
| T+1h                       | <slice IDs and result>    | <slice or completion range>            |
| T+3h                       | <slice IDs and result>    | <slice or expected earlier completion> |
| Expected finish: T+<range> | <final acceptance output> | <remaining external gate, if any>      |
```

[Progress Report](../progress-report/SKILL.md) owns the execution ledger and ongoing live status.
When execution becomes authorized and ready, use it rather than treating this forecast as recorded
progress. Its wall-clock progress weights are distinct from this structure's active-effort shares;
derive those weights from the execution schedule rather than copying these percentages.
