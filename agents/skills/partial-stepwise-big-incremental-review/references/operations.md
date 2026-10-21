# Review operations

Run the repository-owned TypeScript entry through the generic runner:

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- <operation> <arguments>
```

The skill entry imports [the implementation](../../../../ts/CLIs/CLIs-src/agent-skills/incremental-review/incremental-review.ts).
Implementation and sibling `incremental-review-test/` tests live inside the TypeScript workspace;
normal workspace aliases and checks apply without a runner-specific tsconfig override.

The runner supplies pinned tooling and preserves argument boundaries; it does not grant host
permissions. Do not put this generic executor on the unrestricted host-operation allowlist. A
restricted harness may require its normal permission flow for repository Git writes.

## Establish a session

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- start --base main --branch feat/projects-incremental-review-approved
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- status
```

Use `--repo <absolute-checkout>` for an explicitly selected repository. Start creates its own
review worktree and fixes the baseline commit. It must not switch the implementation checkout or
reuse a foreign or dirty review worktree. Do not advance main or the reviewed baseline mid-review.

Use `<working-branch>-incremental-review-approved` for the approved-content branch. If it does not
exist, report that before proceeding; creation needs an explicit developer instruction. The
editor derives that name automatically and never creates it. After an explicitly requested rename,
update the branch and retained session together:

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- rename --branch feat/projects-incremental-review-approved
```

Keep the implementation checkout open in Cursor. In GitLens Search & Compare compare the reviewed
branch directly with Working Tree, then use the overall Files Changed tree. This includes pending
corrections; comparing with implementation HEAD omits uncommitted edits. Staged versus unstaged
selection is independent of this comparison. Commit-to-commit views may need refreshing.

## Accept whole files

An unambiguous whole-file request takes one call:

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- accept --files 'Docs/Specification/Sidecars.md'
```

Multiple literal files or folders are supported. A folder means all selected descendants, including
deletions; do not substitute a broad parent for specifically approved files. For a rename, select
both old and new paths or the agreed containing folder. Whole-file approval includes all saved
edits to those paths; unsaved editor buffers are not filesystem contents.

Already committed contents need only a review checkpoint. Selected pending corrections also need
an implementation commit, which requires an explicit developer instruction to commit. Content
approval alone does not grant that instruction: retain the approval as pending and explain the
required source commit before running a transfer that would create it. Other edits and staging
selections must remain intact. Do not run full
verification merely to copy previously committed approved contents. For implementation corrections,
choose proportionate intermittent checks and retain actionable failures.

## Accept agreed portions

First resolve the developer's request into explicit content. Show exact short excerpts and file/line
links for uncertain boundaries; a feature name is not permission to silently copy its whole files.
Build separate binary-capable patches for the selected implementation edits and the approved review
content, since their starting trees differ. Omit the source patch for already committed code.
Pending corrections included in the reviewed patch must also be included in the source patch.

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- plan --files path/to/file.ts --source-patch /absolute/fix.patch --reviewed-patch /absolute/accepted.patch --out /absolute/selection.json
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- accept --selection /absolute/selection.json
```

`plan` freezes the candidates and source/index observations. Treat its output as evidence of scope,
not permission. Never fabricate tree IDs or edit the frozen selection to force acceptance. If the
content changes before acceptance, regenerate the proposal and reassess approval. If a patch needs
unreviewed context or staging overlap cannot be preserved, ask whether to include the smallest
additional content or defer. Do not use fuzzy or three-way application to accept more content.
Git content filters, working-tree encodings and ident expansion are refused; ordinary text/EOL
normalization uses Git's canonical content. Implementation worktree bytes remain untouched.

## Reopen, track and recover

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- reopen --files path/to/file.ts
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- recheck --files path/to/caller.ts --state pending
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- recheck --files path/to/caller.ts --state clear
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- note --text 'Current chunk: project lifecycle; pending: confirm cleanup message scope.'
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- recover
```

Reopening removes acceptance for selected content while preserving implementation files. Record
semantic recheck requests separately when contents are unchanged: identify the file, reason, and
what decision will clear the concern. Keep the jointly planned order and background review snapshot,
scope and approval request in the session checkpoint. A reviewer result is stale if those inputs
changed; a clean unchanged result may complete the original approval.

If an acceptance operation fails, read its journal/status and use recovery. Do not reset either
checkout, pop arbitrary stashes, recreate the session or delete state to hide an incomplete transfer.
Recovery must refuse foreign changes and preserve pending content. Retained receipts identify the
implementation snapshot and reviewed commit, so accepted contents can be reconciled after resuming.

Transfer mechanics are confined to the owned session: candidates are prepared before publication,
branch updates compare the expected old refs, and the real implementation index remains locked
through its exact reconciliation. The journal records prepared commits and index hashes for recovery.
This is not permission for ad-hoc ref movement behind another checkout's index. Review receipts use
Git plumbing to preserve the frozen candidates rather than running arbitrary commit hooks; repository
checks remain the coordinator's intermittent responsibility.

Completion means no unacknowledged remaining content, unresolved rechecks or pending approvals;
explain intentionally unreviewed areas rather than treating them as reviewed. Full verification is
required before readiness to land. Do not merge, publish, remove the review branch/worktree or start
another review without the developer's instruction.
