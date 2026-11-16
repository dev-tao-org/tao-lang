# Review operations

Run the repository-owned TypeScript entry through the generic runner:

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- <operation> <arguments>
```

The skill entry imports [the implementation](../../../../ts/CLIs/CLIs-src/agent-skills/incremental-review/incremental-review.ts).
Implementation lives inside the TypeScript workspace;
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

## Open displayed groups

Treat “open all” or “open groups” as a request to open every file in the currently displayed review
groups together. Preserve the displayed order and use absolute paths. Use one shell command,
not computer-use clicks or separate launches per file. This action neither approves files nor
advances the review group.

Use the requested editor. On this macOS host the default review editor is Cursor:

```sh
open -g -a Cursor /absolute/first.ts /absolute/second.ts /absolute/third.ts
```

Use the existing application instance and prefer background opening; honor an explicit request to
bring it forward. Respect the editor's existing window preferences and never claim the tabs or
window were verified from a successful shell exit alone. Do not change editor settings or close
existing tabs. A request to open files authorizes this scoped shell launch; no additional approval
question is needed. Do not open future groups automatically.

## Continue in another implementation worktree with the same baseline

After creating the new implementation branch/worktree, continue from the original implementation
checkout's idle review session:

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- continue --from /absolute/previous-implementation-checkout --branch feat/new-topic-incremental-review-approved
```

The operation creates a fresh owned approved-content worktree at the prior approved tip, retaining
the original baseline, accepted registry, notes and rechecks. Inherited approvals can therefore be
reopened against the original baseline. It preserves historical review evidence separately from
the new active session; it does not replay old transaction journals or modify the original branches.
Read the inherited progress/group records and reconcile them before presenting the next group.
New implementation changes are not automatically approved. Do not pre-create the approved branch
or copy the old active session over the new one.

## Continue after a landing

Keep the review chat and prior session. Use the
[landing checkpoint](../../landing/references/merge-progress.md#merging-and-continuing) to pin the
cut and the remaining changes. Use updated `main` as the new implementation base, or the
explicit reconciliation commit when a shared integration branch supplies the intended base.
Replay only the outstanding scope under [Git workflow](../../git-workflow/SKILL.md).

- Start a review session on the new implementation branch with `start --base <new-base-sha>`.
  Ordinary `continue` retains the old baseline and approvals tree.
- If the prior scope all landed, keep the original receipts and begin a fresh scope at the
  new base. The pending diff starts empty before incoming work.
- When part of the scope remains, carry forward the original inventory, stable IDs, earned
  credit and receipts. Record surviving approved content on the new approvals branch through
  the usual acceptance operations when the original approval still covers its exact content
  and meaning. Hold conflict resolutions and changes to shared behavior for recheck.
- Verify that the new pending diff contains the outstanding review scope, including rechecks,
  before presenting groups. Keep the prior session and landing boundary available for resuming.

## Accept whole files

An unambiguous whole-file request takes one call:

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- accept --files 'Docs/Specification/Sidecars.md'
```

Multiple literal files or folders are supported. A folder means all selected descendants, including
deletions; do not substitute a broad parent for specifically approved files. For a rename, select
both old and new paths or the agreed containing folder. Whole-file approval includes all saved
edits to those paths; unsaved editor buffers are not filesystem contents.

Already committed contents need only a review checkpoint. Commit requested implementation
corrections in coherent chunks as they are completed, including delegated changes, using this
workflow's standing developer authorization. Source commits remain unapproved until explicit
acceptance or the standing authored-test policy applies. Preserve unrelated edits and index
selections; checkpoint source corrections before transferring accepted contents. Do not run full
verification merely to copy previously committed approved contents. For implementation corrections,
choose proportionate intermittent checks and retain actionable failures.

## Recommend auto-approval

With each group proposal, list candidates by file or stable ID and give a short reason for each.
Report any files already accepted under standing authorization separately. A recommendation needs
developer approval unless standing authorization already covers the change.

Recommend straightforward tests and changes to fixtures or helpers whose callers are exclusively
tests. Trace usage and check that the changes preserve meaningful coverage. Keep shared runners,
execution infrastructure, and fixtures that define substantial expected behavior available for
manual review. Recommend Markdown changes that accurately document verified implementation or
make editorial corrections. Keep changes that introduce architectural decisions, unimplemented
behavior, or new contracts in their review groups.

## Automatic test acceptance

Authored TypeScript `.test.ts` and `.test.tsx` files are automatically approved under this skill's
standing developer authorization, including test cases, assertions and local test fixtures.
Record their exact saved snapshots with the normal whole-file acceptance command and receipts;
include both paths for renames and deleted test files. Do not request individual approvals or
rerun tests merely to transfer acceptance. Later changes to these files receive the same treatment.

Test runners, execution infrastructure and reusable utility implementations still require developer
approval. Keep them in separate non-test files and share equivalent behavior where appropriate;
being inside a test folder does not make a helper automatically accepted. If a test file contains
such infrastructure, separate it or accept only its authored tests rather than approving the mixed
file wholesale. Local fixtures for particular cases need not become shared infrastructure.

Count only previously uncredited original test units toward the frozen denominator. New tests
and later regression coverage are additional accepted scope, never additional original units.
Automatic test acceptance does not approve the production behavior being tested, clear production
semantic rechecks, imply verification success or authorize landing.

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
