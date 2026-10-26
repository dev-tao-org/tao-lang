---
name: review-learning
description: >-
  Turn meaningful developer corrections into scoped, reusable lessons and safely propagate
  equivalent fixes. Use for $review-learning, requests such as “apply this throughout” or “pause
  learning,” repeated corrections, or human-led review group boundaries with unprocessed corrections.
---

# Review Learning

Capture each meaningful human correction as evidence for a possible reusable rule. A correction
may expose a specific mistake, but accepting content alone does not establish a general rule.
Distinguish one-off preference from repeated behavior, explicit generalization, and a rule already
required by applicable repository guidance.

Use the review-learning CLI described in [operations](references/operations.md) to retain correction
evidence, scan an exact scope, prepare candidate edits and apply only authorized equivalents. The
CLI records and checks changes; it does not decide whether a rule is general or whether an edit is
semantically equivalent. A GPT-6 Sol agent at medium effort derives the rule packet from the human's
reason and source context. A GPT-6 Luna agent at high effort scans the precise pattern; Sol reviews
context and candidate equivalence.

For each candidate lesson, retain the human's reason, concrete before/after evidence, intended
scope, exceptions, and authority: explicit generalization, an existing applicable rule, or an
inference. Default the scope to the current implementation; exclude legacy, generated and vendored
files unless the human or an applicable rule puts them in scope.

Run the learning pass at a review-group boundary whenever a substantive correction remains
unprocessed. An explicit request to apply a correction everywhere starts the pass immediately.
While a pass is active, collect new corrections into one next pending batch; do not start a third
batch until the active one is resolved. During a human-led review, protect the active review group.

Scan only the exact rule and declared scope. GPT-6 Luna at high effort scans the precise pattern;
GPT-6 Sol reviews context and proposes semantically equivalent changes. Resolve affected upcoming
files as part of the proposal, and mark previously accepted affected files for human recheck. Never
mark propagated edits approved or accept them on the developer's behalf.

Apply automatic equivalent fixes only when the human explicitly generalized the correction or an
existing applicable rule requires it. An inferred lesson may be recorded and analyzed, but requires
one concrete developer decision before propagation; once that decision settles the rule, apply it
consistently across the in-scope matches without asking for per-file permission. Do not expand this
workflow into an unrelated code review, and do not launch a review unless the developer requested
one.

After settling a reusable rule, decide how future violations should be prevented: use an executable
check and safe fixer when the rule is mechanically expressible, with positive and negative tests; use
concise scoped guidance and a canonical example when it depends on judgment. Search for duplicate
rule owners and consolidate. Fixing current instances alone does not complete learning. If the rule
does not fit a supported scan shape, retain a scoped analysis and evidence; do not force an incorrect
query or claim the scan is exhaustive.

If the developer says to pause learning, retain the current and queued batches without applying or
discarding them. Resume by reconciling `status` and continue from the active batch.

At each learning checkpoint, report the correction batches and scope, changes proposed/applied,
accepted files needing recheck, and unresolved questions. Include a short tally of encountered
instruction violations and inconsistent implementations of equivalent behavior, grouped by rule or
pattern with counts and resolution status. Keep retained evidence in `.artifacts/notes/` or the
toolkit's task-local state; promote durable policy only through the authorized agent-instructions
workflow.
