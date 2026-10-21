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

- Start with the complete proposed grouping in review order, using the format below. Get the
  developer's explicit agreement, or iterate on the grouping, before presenting the first group.
  Group one feature at a time; combine features only when each is required to review the other.
  Projects and Dependencies and Sidecars normally belong in separate groups.
- Organize large reviews into functional feature sets containing review groups. Include each
  specification with its first related implementation group; keep design-only specifications with
  related planning. Give each feature set and group a brief cognitive overview of its contribution.
  For language changes, follow the feature-set overview with minimal Tao usage snippets, preferably
  single-line with unrelated parts replaced by `...`; label design-only syntax explicitly.
- Count remaining changed files and Git diff hunks against the reviewed branch, including saved
  pending edits. A diff means one `@@` hunk using normal three-line context. Count only the hunks
  assigned to that group; account for shared files explicitly without counting the same hunk twice.
  Folder counts use distinct folder entries shown in the proposal; do not sum overlapping group
  folders for a feature-set total. Show binary changes separately from
  textual hunk counts rather than inventing hunks.
- At review start, freeze the original change inventory, baseline and source snapshot in the session
  notes. Record its file/hunk totals and review units: one per original diff hunk, plus one per binary
  or zero-hunk change. Keep this denominator fixed throughout the review.
- Track completed original units from explicit developer approvals, mapping renames, splits and
  replacements back to their original changes without double counting. Partial approvals earn only
  the corresponding original units. Added fixes, tests and refactors are additional completed work,
  not additional review units; they must not enlarge the denominator or reduce earned progress.
- Present `X% done` before the remaining-groups list whenever introducing the next group, calculated
  as completed original units divided by frozen original units. Retain earned credit when corrections
  reopen accepted content; track pending corrections and rechecks separately. Reaching 100% of the
  original review does not declare those follow-ups complete. Preserve the inventory and credited
  units across interruptions; never recalculate progress from the growing current diff.
- Present each agreed group using the format below, with clickable absolute file links and useful
  starting lines. Use a selected line range only when the editor/tool supports it; otherwise use
  a starting line and describe the relevant range or functionality. Never invent range-link syntax.
  Order files for understanding and nest them by folder or functional part. Explain partial-file
  scope in one succinct sentence, at most two. End the presentation immediately after the file list.
- Number file entries consecutively within each presented review group, including across folder
  or conceptual subgroups, so the developer can approve files by number. Keep the displayed
  number-to-path mapping stable until that group is completed or explicitly revised.
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
- Track implementation subagents alongside review progress. When one is ready for integration,
  end each message with `subagent <name> ready to be merged` until it is merged or the developer
  acknowledges postponing it. This readiness footer is the exception to ending at the file list.
  Retain postponed work and remind the developer periodically during review (about every three
  groups, or sooner when its integration affects the current group).
- Merge subagent work only when the reviewing developer explicitly says they are ready for that
  integration; completion and passing checks do not authorize merging.
- Leave corrections pending for inspection until approved. Apply root Git authorization rules:
  the developer controls the review worktree's index; content approval authorizes recording it on
  the separate reviewed branch, not staging or committing pending source edits. Staging is never
  approval. Verify intermittently
  in proportion to changed behavior. Focused checks may replace the full pre-commit gate for
  this workflow's checkpoints; run full verification before readiness to land. Do not keep a
  detailed test ledger or rerun application tests for acceptance-only transfers.

## Presentation formats

Initial proposal (repeat feature sets and their groups; counts and descriptions stay separate):

```text
- Feature set: **<Title>**
  - X folders, Y files, Z diffs
  - <Brief functional overview.>
  - <Minimal Tao usage example, if language is affected.>
  - <Review group title>
    - X folders, Y files, Z diffs
    - <Even briefer overview of this group's contribution.>
  - ...
```

Ask for agreement after the complete proposal; do not begin a group before agreement.

Shortened example of the agreed format (replace count placeholders with current diff counts):

```text
- Feature set: **Projects, sessions and storage**
  - X folders, Y files, Z diffs
  - Gives projects an identity, owns editing sessions and keeps generated state separate.
  - `project { ... }`
  - Project initialization and discovery
    - X folders, Y files, Z diffs
    - Finds project roots and establishes their identity; includes the project specification.
  - ...
- Feature set: **Dependencies and source modules**
  - X folders, Y files, Z diffs
  - Resolves required projects and makes their declarations available to imports.
  - In `project`: `requires github://example/name version 1.2.3`
  - Source modules and dependency resolution
    - X folders, Y files, Z diffs
    - Resolves dependency sources and module names.
  - ...
...
```

Each turn presents remaining groups for the current feature set, then only the next group:

```text
### <Feature set, when applicable>

**X% done** — <completed>/<frozen total> original review units.

Remaining groups:
- **Next: <Review group>**
- <Later group>
- ...

**<One-line summary of what we are reviewing.>**

<Particular complexity or dependencies to keep in mind, only if needed.>

- <Review group / folder / conceptual chunk> - X folders, Y files, Z diffs
  1. <Clickable file path:starting line> - X diffs
  2. <Clickable file path:starting line> - X diffs (<Brief partial-file scope, if applicable.>)
- <Another chunk, when useful> - X folders, Y files, Z diffs
  3. <Clickable file path:starting line> - X diffs
```

Omit the feature-set heading when there is no feature set. Nothing follows the file list except
an outstanding subagent-readiness footer: no recap, approval question, next steps or closing sentence.

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
