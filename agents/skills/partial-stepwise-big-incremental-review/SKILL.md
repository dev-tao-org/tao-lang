---
name: partial-stepwise-big-incremental-review
description: >-
  Guide a developer through a large branch review in small chunks, track explicitly accepted
  files or changes on a separate review branch, implement requested corrections, and resume
  without losing pending work. Use for piecemeal or incremental human-led review and requests
  such as "mark X reviewed" or "approve feature X" within that workflow. Agent-led reviews
  remain with code-review.
---

# Partial Stepwise Big Incremental Review

## Guide the review

- Agree on a rough review order, then guide small groups of related files with terse purpose,
  dependencies and clickable absolute file/line links. Accept content outside the current group.
  Keep the developer in their implementation checkout; the separate agent-owned review branch
  records accepted content and need not build independently. Only the implementation branch lands.
- Default to responsive guidance with selective [critique](../critique-mode/SKILL.md). Propose deeper
  critical discussion for consequential decisions or substantial accumulated corrections. Do not
  switch models or weaken scrutiny silently. Use [repository guidance](references/repo-guide.md)
  when entering a new area; refresh relevant instructions when they change.
- Answer questions directly. Investigate whether a requested correction applies elsewhere in the
  review diff and affected contracts. Apply clear equivalents and necessary supporting changes;
  explain expanded scope briefly and ask before semantic changes or unrelated cleanup.
- Leave corrections pending for inspection until approved; preserve the developer's staging
  choices. Staging is an optional inspection/selection tool, never approval. Verify intermittently
  in proportion to changed behavior. Focused checks may replace the full pre-commit gate for
  this workflow's checkpoints; run full verification before readiness to land. Do not keep a
  detailed test ledger or rerun application tests for acceptance-only transfers.

## Interpret approval

- "Mark file X reviewed" approves its saved disk contents, including pending edits. "Approve
  changes X" approves only those changes. Resolve semantic requests such as "approve the new error
  messages" to the narrowest sound content using the conversation and current diff.
- Execute unambiguous approvals promptly. If scope is materially ambiguous or requires additional
  unreviewed context, show short exact excerpts and links to the proposed sections, recommend a
  boundary, and ask one focused question. Use [decision rounds](../decision-rounds/SKILL.md) only
  when an actual design discussion is needed. Never broaden approval because copying a whole file
  or applying a three-way merge would be easier.
- If a concrete concern warrants independent scrutiny, propose its scope and ask permission before
  launching a read-only [reviewer](../code-review/SKILL.md). Run it in the background and continue
  elsewhere. Track its approval request and exact snapshot; return with assessed findings. A clean
  review completes the original approval only if scope and contents are unchanged; changed content
  needs renewed assessment. Findings do not authorize accepting additional code.
- Track specific accepted files requiring a semantic recheck after shared behavior changes, with a
  concrete reason. Unchanged file contents do not prove unchanged correctness. Resolve these flags
  with the developer before claiming the review complete.

## Execute and resume

- Use the path-based `./agent skill-script` runner for [the review script](scripts/review.ts).
  Follow [script operations](references/operations.md) for exact commands and partial selections.
  Whole-file approval has a single fast script call; do not repeat planning or tests for it.
- Keep executable mechanics in `ts/CLIs/CLIs-src/agent-skills/incremental-review/`; the skill's
  script is a thin relative-import entry. Tests live in the sibling `incremental-review-test/`.
- Scripts own exact snapshots, literal path expansion, isolated commits, preservation of other
  edits and staging, and interrupted-transfer recovery. They do not interpret natural language,
  decide review quality or grant approval. Do not substitute stash/reset/copy shell sequences.
- Preserve the current group, suggested order, pending approval questions, background reviews and
  semantic rechecks in the retained session checkpoint. On resume, reconcile it with script status
  and committed acceptance receipts; never infer approval from the agent's memory alone.
- In GitLens use Search & Compare's overall Files Changed between the reviewed branch and the
  implementation Working Tree to include pending corrections. Use direct tree comparisons, not
  merge-base/Ahead/Behind comparisons. Refresh after acceptance. Staging alone does not shrink
  that comparison; accepted content committed to the review branch does.
- Report acceptance tersely: scope and any pending concern. At completion, report remaining diff,
  unresolved rechecks and verification failures. Keep review branches and checkpoints until the
  developer requests cleanup. Review completion does not authorize landing, publication or a new
  autonomous review.
