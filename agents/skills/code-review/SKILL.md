---
name: code-review
description: >-
  Review and repair branch changes in bounded rounds with read-only subagents. Use when the Developer explicitly
  requests a review, including correctness, style, conformance, file-layout and organizational-health reviews.
---

# Code Review

Root `AGENTS.md` owns review authorization. Invoking this skill requests a bounded review-and-fix
loop within the Developer's stated scope, unless the request is read-only or findings-only.
Reviewers remain read-only; the assigning agent owns authorized repairs and commits them locally
in coherent chunks as part of the write-authorized review-and-fix flow, unless the Developer
explicitly requests otherwise. Findings-only or read-only requests authorize neither repairs nor
commits. Other Git operations, publication, landing and dependencies retain their authorization
requirements.

## Bounded review rounds

- Plan an initial review and at least one follow-up after substantive fixes. Usually one or two follow-ups suffice. Count the initial review, including one already completed for the same request, toward the five-round limit.
- Use at least one independent read-only subagent per round. Run reviewers in parallel when distinct functional responsibilities justify it; explicitly assign every changed file, conformance coverage and cross-scope seam. Several reviewers inspecting one pinned snapshot count as one round.
- Choose model and effort for each assignment under `delegation`, within the same-or-lower reviewer ceiling. A standard reviewer at medium effort is a useful first pass; a fast reviewer at high effort can check straightforward repairs while a standard reviewer at high effort independently probes intricate compiler, concurrency or lifecycle seams. These are defaults to adapt, not mandatory model combinations. Do not repeatedly pay for broad high-effort reviews of settled code.
- Pin each round's commit and dirty snapshot. Pause writes to any checkout reviewers are reading. Separately authorized work can continue outside that snapshot. Follow-ups cover every change since the last reviewed snapshot, reopened findings, affected callers and regression tests. Retain the original branch scope and independently check the risky integrated behavior.
- Reconcile findings before changing code. In a write-authorized cycle, fix confirmed P0–P2 issues and required instruction violations, add the smallest credible regression proof and run relevant verification. Low-priority suggestions alone do not require speculative refactoring. Findings-only requests stop at the report and do not enter a repair phase.
- Commit validated repairs as the work progresses, before the next review round or final report. Group coupled fixes with their regression tests; keep independent repairs in separate self-contained commits. Follow root formatting/verification policy and `git-workflow`, preserve unrelated edits and index selections, and record each commit with its findings and validation. Do not accumulate completed repairs as an uncommitted final handoff unless the Developer requests it; a commit does not imply that its follow-up review has passed.
- After meaningful repairs, run another independent review round. Finish when the reviewed state has no P0–P2 findings or required instruction violations; report any remaining low-priority findings and coverage limits. Do not launch a redundant round solely to reach a planned count when the first pass needs no substantive repairs.
- At the five-round cap, stop before starting a sixth round or making another repair batch that would need it. Report remaining findings, repeated root causes and the next work needed. Never describe unreviewed repairs or an interrupted round as clean.
- Record each round's reviewers/models/effort, snapshot, findings, fixes, verification and remaining risks in the task checkpoint. Keep the last fully reviewed commit and any reviewed dirty snapshot distinct.

## Pause for a Developer decision

Pause the review cycle in any round when the evidence supports any of these conditions.

- A fix would expand the agreed scope by adding product behavior, implementing a missing prerequisite, or substantially redesigning an existing component.
- Resolving a finding requires a decision about materially different behaviors or an established contract that the agreed scope leaves open.
- Successive repairs reopen the same failure, move it between callers, or reveal a growing chain of required changes, and the evidence points to a shared cause without a focused fix in scope.

Continue through independent findings and ordinary follow-up repairs while each has a focused, verifiable fix within the agreed scope.

On pause, stop repairs and reviewer dispatch. Record the last fully reviewed snapshot, unreviewed changes, verification results and unresolved findings. Show the Developer the concrete failure, what prevents a focused repair, and the smallest viable options. Recommend a next step and ask for the decision needed to proceed. Resume only after the Developer gives direction.

## Requested organizational review

When requested, include a read-only review of style, conformance,
file layout and organizational health. For a small slice, one reviewer may cover both correctness
and organization; give substantial or cross-package changes a dedicated organizational pass.
Check naming, definition ordering, file cohesion and size, package ownership, shared helpers,
dependency direction, documentation placement and consistency with the agreed architecture.
Assess whether the structure remains suitable for the next agreed slice without requiring
speculative abstractions or implementing deferred features.

Separate demonstrated instruction violations and maintainability problems from optional design
suggestions. Cite the applicable rule or concrete maintenance cost and the smallest useful change;
personal preferences alone are not findings. Report strengths and justified deferrals when they
explain why the current organization should remain. Keep repairs within the requested scope;
optional refactoring and scope expansion need separate authorization.

## Scope and checkpoint

Read the branch's last review record from its task checkpoint or handoff. Verify that the recorded
full commit SHA belongs to the current branch history. Review **all changes since that commit**,
including intervening commits, staged and unstaged edits, and new files. Do not narrow the review to
the latest commit or the assigning agent's own edits. Include affected callers and contracts as needed.

If no verified checkpoint exists, use the branch's fork point with its base branch and say this is
the first recorded review. If the baseline is unknown or no longer an ancestor, establish a
conservative earlier baseline; never silently treat HEAD as reviewed. Pin the target commit and
dirty diff being reviewed so later edits cannot inherit its verdict.

After reconciling the reviews, record the baseline, reviewed target, coverage, findings and remaining
work in `.artifacts/checkpoint/<branch-with-slashes-replaced>.md` (or the existing task checkpoint).
The **last reviewed commit** is the newest full commit SHA whose complete preceding review range
was covered. Uncommitted changes may have a reviewed snapshot, but cannot advance that commit marker
until the committed contents are confirmed to match the snapshot. Record unresolved findings
separately; reviewed does not mean approved or fixed. Partial or interrupted reviews do not advance
the marker. Advance it again only after fixes and later changes receive an authorized review.

## Reviewer selection and brief

Use `delegation` for tools, briefs and model availability. A reviewer may use the **same model level
as its assigning agent or a lower one**, never higher. Choose effort independently: higher effort
is appropriate for important or intricate changes, even when the assigning agent uses lower effort.
State the reason briefly; do not impose a universal medium-effort ceiling on reviews.

Give each reviewer the baseline and target SHA, dirty snapshot if any, its code-tree or functional
scope, relevant requirements, read-only boundaries, and the expected evidence. Across reviewers,
cover the entire range, including tests, documentation, configuration and cross-scope seams. Ask for
actionable findings with severity, file/line, failing scenario and impact; also request coverage
limits and an explicit no-findings result when appropriate.

When using multiple reviewers, the orchestrating agent includes the complete assignment map in
every brief: what that reviewer must review, what each other reviewer is tasked with reviewing,
and any shared files or cross-scope seams. Update affected reviewers when assignments change so
none assumes another agent covers an unassigned responsibility.

Validate findings against the current tree, deduplicate them, resolve confirmed defects within the
authorized scope, and run relevant verification. Keep gaps and unresolved risks visible in the
checkpoint and final report. A passing test run does not replace the independent review.

## Required conformance checks

- Always check **all new code** in the review range for conformance with applicable repository
  instructions and local conventions; distribute this coverage explicitly across reviewers.
- Use `test-quality` and `ts/AGENTS.md` when reviewing tests: check primary journey assertions before reporting a missing package test, require a distinct coverage gap for added package proofs, and assess expensive effects and aggregate cost. Missing per-helper tests are not findings when required behavior is already proved; fast overlapping E2E journeys are acceptable.
- Look for DRY opportunities within the changes and nearby relevant code. Check reasonably for
  existing functions that already do similar work, without exhaustively searching the repository.
  Also identify sufficiently aligned operations that should share a new function; explain the
  concrete common behavior and preserve meaningful differences.
- Root `AGENTS.md` owns the conformity and style rule list. Check both automated and review-only
  rules; assess documentation accuracy and predicate clarity beyond their mechanical checks.

## Implementation handoffs

Every handoff that launches, delegates to, or prints a prompt for another implementation agent must
include the branch's last reviewed full commit SHA, any separately reviewed dirty snapshot, and
outstanding findings or coverage gaps. If there has been no review, state that and include the
intended baseline. `delegation` owns placing this information in the outgoing brief.
