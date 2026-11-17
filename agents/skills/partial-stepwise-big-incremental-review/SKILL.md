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

- Apply the [standing auto-approval policy](references/operations.md#auto-approval) before
  proposing the remaining groups. List what was auto-approved and why.
  Requests to start or continue authorize the first or next display. Ask when the Developer
  wants a proposal only or the order needs a decision. Keep related changes in small feature
  groups. Normally separate Projects, Dependencies and Sidecars.
- Review authored changes to in-repo Tao apps and their journeys first so concrete usage and
  behavior guide the rest of the review.
- For large reviews, organize groups into feature sets. Place specifications with their first
  related implementation group and design-only specifications with planning. Summarize each set
  and group. Show minimal Tao usage for language changes, preferably one line with `...` for
  unrelated details. Label design-only syntax.
- Count remaining changed files and Git diff hunks against the reviewed branch, including saved
  pending edits. A diff means one `@@` hunk using normal three-line context. Count only the hunks
  assigned to that group; account for shared files explicitly without counting the same hunk twice.
  Folder counts use distinct folder entries shown in the proposal; do not sum overlapping group
  folders for a feature-set total. Show binary changes separately from
  textual hunk counts rather than inventing hunks.
- At review start, freeze the original change inventory, baseline and source snapshot in the session
  notes. Record its file/hunk totals and review units: one per original diff hunk, plus one per binary
  or zero-hunk change. Keep this denominator fixed throughout the review.
- Track completed original units from approvals, including auto-approvals. Map
  renames, splits and replacements to original changes without double counting. Partial approvals earn only
  the corresponding original units. Added fixes, tests and refactors are additional completed work,
  not additional review units; they must not enlarge the denominator or reduce earned progress.
- Present `X% done` before the remaining-groups list whenever introducing the next group, calculated
  as completed original units divided by frozen original units. Retain earned credit when corrections
  reopen accepted content; track pending corrections and rechecks separately. Reaching 100% of the
  original review does not declare those follow-ups complete. Preserve the inventory and credited
  units across interruptions. Keep queued snapshots out of the active progress total.
- Use absolute file links without default line anchors. Label each file with its owning package,
  app, or repository scope. Show `(+N −M)` beside each file: Git
  additions/deletions against the approved-content tree, including saved untracked files. Show
  `binary` for binary changes. Add a line anchor only when a particular location is useful.
  Present at least three whole groups totaling at least ten files, or all remaining files if fewer.
  Honor explicit overrides. Keep group boundaries and list later titles.
  Explain partial-file scope in at most two sentences. End the group display after the file list.
- Assign stable file IDs consecutively and retain them across displays and resumes. Explain intentional
  ID gaps briefly. Number positions from 1 across the displayed groups and keep them until the next
  set. Use `F<number> New:` for paths absent from the approved tree and `F<number>:` for the rest.
- After handling approvals or corrections, reprint clickable links for every remaining displayed
  file with its stable ID; if complete, present the next agreed set of groups. Pause only at the developer's
  request or a blocking decision; a recap alone is insufficient.
- Present requested groups promptly while [continuing authorized work](references/operations.md#work-during-review).
- On request, [open all displayed groups](references/operations.md#open-displayed-groups) in one
  shell command. Opening files never grants approval.
- Accept content outside the current group.
  Keep the developer in their implementation checkout; the separate agent-owned review branch
  records accepted content and need not build independently. Only the implementation branch lands.
- Name the approved-content branch `<working-branch>-incremental-review-approved`, for example
  `feat/topic-incremental-review-approved` alongside `feat/topic`. If it is missing, tell the
  developer; do not create it without an explicit review-session or branch-creation instruction.
  Keep the working branch unchanged. Use the review script's rename operation when an authorized
  rename must update an existing session.
- Default to responsive guidance with selective [critique](../critique-mode/SKILL.md). Propose deeper
  critical discussion for consequential decisions or substantial accumulated corrections. Do not
  switch models or weaken scrutiny silently. Use [repository guidance](references/repo-guide.md)
  when entering a new area; refresh relevant instructions when they change.
- Answer questions directly. Investigate whether a requested correction applies elsewhere in the
  review diff and affected contracts. Apply clear equivalents and necessary supporting changes;
  explain expanded scope briefly and ask before semantic changes or unrelated cleanup.
- “Clarify X” means named functions, with comments when those explain better.
- Use [review-learning](../review-learning/SKILL.md) for meaningful correction capture and the
  required learning pass when a review group closes with substantive corrections unprocessed.
  Check each human acceptance for an associated lesson, but approval alone is not a general rule.
  Propagated edits remain pending until the developer reviews them, and this workflow does not
  authorize an unrelated review.
- During an active review, pin and [queue incoming work](references/operations.md#integrate-incoming-work).
  Ask before importing the next snapshot at completion. Import during the review only when the
  Developer explicitly asks to bypass the queue.
- Commit validated requested corrections, including subagent work, in coherent chunks under this
  workflow's standing developer authorization; preserve unrelated edits and index selections.
  Apply the same acceptance policy to corrections. Commits, staging and tests do not grant
  acceptance. Verify proportionately: focused checks may cover checkpoints, with full
  verification before readiness to land. Omit detailed test ledgers and application reruns for
  acceptance-only transfers.

## Presentation

Use indented lists. Nest proposed groups under feature sets and numbered files under their groups.
Whenever the Developer asks to print review groups, list every ready recheck in a **Ready rechecks**
section before any group titles or files. Include each recheck's file link and reason. Show the section
even when no groups remain or the request limits the number of groups.
List remaining group titles before the current groups and omit unused headings.

```text
**X% done** — <completed>/<frozen total> original review units.

- **Ready rechecks**
  - <Absolute file link> · <Reason for recheck>

- **<Current group and summary>** — X folders, Y files, Z hunks
  1. F43 New: <Absolute file link> · <Package> (+24 −0)
  2. F50: <Absolute file link> · <Package> (+8 −3)
```

## Interpret approval

- Automatically accept authored TypeScript `.test.ts` / `.test.tsx` files; no per-file developer
  approval is needed. Keep test runners and reusable utilities outside test files, shared where
  appropriate and subject to developer approval. See [test scope](references/operations.md#automatic-test-acceptance).
- `F<number>` references a stable file ID; a plain number references the current list position.
  Neither alone is approval. `A 1 2` approves those positions; `A F43` approves that stable file.
  `<number>y` approves the current position's saved contents. Preserve stable IDs.
- "Mark file X reviewed" approves its saved disk contents, including pending edits. "Approve
  changes X" approves only those changes. Resolve semantic requests such as "approve the new error
  messages" to the narrowest sound content using the conversation and current diff.
- Execute unambiguous approvals promptly. If scope is materially ambiguous or requires additional
  unreviewed context, show short exact excerpts and links to the proposed sections, recommend a
  boundary, and ask one focused question. Use
  [dialogue decision design conversation](../dialogue-decision-design-conversation/SKILL.md) only
  when an actual design discussion is needed. Never broaden approval because copying a whole file
  or applying a three-way merge would be easier.
- Ask permission before launching a read-only [reviewer](../code-review/SKILL.md) for a concrete
  concern. Continue elsewhere; track scope and snapshot, then assess findings. A clean unchanged
  review may complete the original approval; changed content needs renewed assessment. Findings
  do not authorize additional acceptance.
- Track specific accepted files requiring a semantic recheck after shared behavior changes, with a
  concrete reason. Unchanged file contents do not prove unchanged correctness. Resolve these flags
  with the developer before claiming the review complete.
- Keep correction rechecks out of review groups until all required checks pass. Then explicitly
  confirm those checks passed and propose reviewing the changes since approval before presenting them.

## Execute and resume

- Use the path-based `./agent skill-script` runner for [the review script](scripts/review.ts).
  Follow [script operations](references/operations.md) for exact commands and partial selections.
  Whole-file approval has a single fast script call; do not repeat planning or tests for it.
- Keep executable mechanics in `ts/CLIs/CLIs-src/agent-skills/incremental-review/`; the skill's
  script is a thin relative-import entry.
- Scripts own exact snapshots, literal path expansion, isolated commits, preservation of other
  edits and staging, and interrupted-transfer recovery. They do not interpret natural language,
  decide review quality or grant approval. Do not substitute stash/reset/copy shell sequences.
- Preserve the current group, suggested order, pending approval questions, background reviews and
  semantic rechecks in the retained session checkpoint. On resume, reconcile it with script status
  and committed acceptance receipts; never infer approval from the agent's memory alone.
- For a worktree move on the same baseline, use `continue` and retain the frozen progress
  denominator. After landing, keep the chat and follow
  [Continue after a landing](references/operations.md#continue-after-a-landing).
- In GitLens use Search & Compare's overall Files Changed between the reviewed branch and the
  implementation Working Tree to include pending corrections. Use direct tree comparisons, not
  merge-base/Ahead/Behind comparisons. Refresh after acceptance. Staging alone does not shrink
  that comparison; accepted content committed to the review branch does.
- Report acceptance tersely: scope and any pending concern. At completion, report remaining diff,
  unresolved rechecks and verification failures. Keep review branches and checkpoints until the
  developer requests cleanup. Review completion does not authorize landing, publication or a new
  autonomous review.
