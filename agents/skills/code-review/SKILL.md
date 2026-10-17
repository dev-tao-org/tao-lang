---
name: code-review
description: >-
  Review branch changes with one or more read-only subagents. Use for implementation reviews,
  requested changeset reviews, and review checkpoints before handing work over.
---

# Code Review

Use at least one read-only subagent; one is the usual choice. Add reviewers when distinct parts of
the code tree or functional responsibilities justify separate attention. Functional scopes may
intersect files; make ownership of each review question clear and reconcile overlapping findings.
Reviewing does not authorize implementation, publication, or landing.

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
the marker. Re-review fixes and later changes before advancing it again.

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
- Look for DRY opportunities within the changes and nearby relevant code. Check reasonably for
  existing functions that already do similar work, without exhaustively searching the repository.
  Also identify sufficiently aligned operations that should share a new function; explain the
  concrete common behavior and preserve meaningful differences.
- Exported functions must have JSDoc. Comments on non-exported implementation code use `//`,
  not JSDoc; add private comments only when useful.
- Extract logical conditions combining **three or more checks** into a named predicate function.
  Extract two-check conditions too when their meaning is not clear. The named predicate may hold
  the compound expression; choose a name that explains its intent.

## Implementation handoffs

Every handoff that launches, delegates to, or prints a prompt for another implementation agent must
include the branch's last reviewed full commit SHA, any separately reviewed dirty snapshot, and
outstanding findings or coverage gaps. If there has been no review, state that and include the
intended baseline. `delegation` owns placing this information in the outgoing brief.
