---
name: git-workflow
description: >-
  Manage Tao Git branches, commits, worktrees, and checkout ownership. Use for branch inspection,
  worktree creation or cleanup, committing, pushing a branch, squashing, rebasing, history
  rewriting, dirty checkouts, commit-all, merge conflicts, or bringing main into a branch; after
  integrating main, inspect what arrived.
---

# Git Workflow

Before finishing a branch, preparing a merge handoff, landing, or retiring its worktree/task,
complete [evidence preservation](references/branch-evidence.md). Include ignored files and
submodule contents; a clean parent status is not a preservation receipt.

Root `AGENTS.md` owns branch and index constraints and dependency approval. Integration does not
waive approval for dependency installations or updates. The warn-only Git hooks
`./agent unsandboxed setup` installs speak up on a detached HEAD, an unnamed branch, or an attribution trailer.
`landing` owns merging a branch into `main`, the merge message, and the cleanup after it. Non-main
branch pushes through the guarded route are authorized; other publication needs the Developer's authorization.

## Guarded branch pushes

- Use `./agent unsandboxed push <remote> <branch>` to publish the matching local branch. For a
  different destination, use `--source <local-branch>`, such as
  `./agent unsandboxed push origin backup/feat/work --source feat/work`.
- Keep raw `git push` outside the generic host allowlist. Force pushes, remote deletions and
  landing still need separate explicit authorization; this command does not perform them.

## Backup pushes

- Use the guarded push command above for backups and `./agent unsandboxed git <operation>` for other supported Git mutations; the harness must grant host execution. Keep ordinary read-only Git inspection sandboxed. Do not install machine-local Git filesystem grants as a prerequisite.

- Before ending any round of work that created commits, push those commits to `origin` through
  the guarded route without opening a PR or asking for separate push approval. Batch the round's
  commits into one backup push. Confirm the remote destination contains the committed tip;
  report a failed backup and retain it as an unresolved task complication.
- Backup pushes must not trigger CI unless the Developer requests CI for that push. Check current
  workflow triggers and open pull requests before choosing a destination. With the current
  workflows, pushing a feature branch without an open PR does not start CI; updating an open PR does.
- If the working branch has an open PR, push the committed snapshot to a dedicated
  `backup/<working-branch>` ref without an open PR instead. Confirm that destination is outside
  automatic CI triggers; do not open a PR or dispatch a workflow for a backup. If no CI-free
  destination is available, retain the backup as pending and explain the constraint.
- Use an ordinary fast-forward push, set upstream only for the actual working branch, and never
  force-push, push `main`, rewrite commit messages to skip CI, or weaken workflow gates for a backup.
  A backup is not landing authorization or verification evidence.

## Worktree ownership

`git worktree list` routinely shows fifteen or more checkouts sharing one object store, worked in concurrently by other agents and the Developer.

- Create a fresh `feat/*` branch only when the Developer instructs branch or worktree creation;
  permission to edit code alone does not authorize changing branches.
  If the sandbox blocks Git metadata writes, use
  `./agent unsandboxed git switch -c <new-branch> <base>` with harness approval; never force a
  switch, replace an existing branch, or discard dirty work under this authorization.
- A sandboxed Git metadata denial does not by itself require another Developer decision. For an already-authorized operation, prepare the pinned environment if needed, then invoke the supported `./agent unsandboxed git <operation>` route with the harness's command-scoped approval mechanism. The wrapper name alone does not grant host access. Ask the Developer only if that route receives an approval rejection, is unavailable, or requires authorization not already given; identify the actual failing boundary. Keep the chat restricted and do not add machine-local Git grants or broaden permissions to work around the denial.
- Read `git worktree list` before any operation that moves a ref. A branch checked out elsewhere is not yours to move, and never write to another worktree's files, index, or branch.
- In a linked worktree, `./agent` reuses the primary checkout's pinned devenv profile (run
  root `./enter-tao-dev-env.sh` (legacy: `./enter-tao-dev-env`) in that worktree when it reports no shared profile), and remove a
  worktree you created once its branch is merged or abandoned.
- After authoritatively confirming a landing, fetch remote `main` and fast-forward local `main`.
  If local `main` is checked out in another worktree, have its owner update that checkout rather
  than moving its branch ref behind it. Preserve local commits and dirty work; never reset them.
- Before reclaiming a worktree, use `./agent reclaim` and follow
  `references/reclaim-task-associations.md` for agent task ownership that local metadata cannot prove.
- Git operations that replace protected paths can half-succeed inside the sandbox: HEAD and most
  files move, but protected paths stay dirty. To bring `main` into a feature branch, run
  `./agent merge-main`, which attempts to fetch `origin/main` before selecting the merge tip;
  when it refuses because `main` writes a protected path, run
  `./agent unsandboxed merge-main`, which makes the same merge on the host. Resolve any conflict it
  leaves, commit the merge, and skim what arrived (`references/after-merging-main.md`). If a direct `git merge` already left `MERGE_HEAD`, use
  `./agent unsandboxed merge-recover` to abort it on the host. If Git left no `MERGE_HEAD`, inspect
  status, reflog, and `ORIG_HEAD`; after the Developer authorizes a reset, run
  `./agent unsandboxed merge-recover --reset-to <full pre-merge SHA>`. That uses `git reset --merge`
  to retain unrelated work where Git can; `--hard` discards tracked edits and needs separate explicit
  authorization. To start a new feature branch from current `origin/main`, run
  `./agent start-branch feat/<name>`; to take over a `feat/*` branch someone already pushed, run
  `./agent take-branch feat/<name>`, which tracks `origin/feat/<name>`. When either refuses its
  fetch or its write probe, run the same command as `./agent unsandboxed …`. Both require a clean
  worktree, and both run `./agent unsandboxed setup` after switching; nothing else reruns setup when a worktree
  changes branch, so run it yourself after any other switch. An authorized
  `./agent unsandboxed land` performs its own integration under the landing lock. For any other
  Git operation that half-succeeded, diagnose the exact state read-only, report the write needed,
  and pause for the Developer's explicit approval.

## Moving a branch ref

Use `git merge --ff-only <ref>` from inside the worktree that has the branch checked out; it moves
the ref, index, and working tree together. `git update-ref` writes the ref alone and is correct only
for a branch no worktree has checked out — using it on a checked-out branch leaves that worktree's
index and tree at the old commit, reported as the whole diff staged and inverted; recover with
`git reset --hard` only after confirming nothing uncommitted was there.

## Commit messages

Ordinary commits: a concise summary, then one bullet per line with no blank lines between bullets
(`references/commit-all-chunks.md` for committing everything outstanding this way).

`git merge --squash` stages its result without writing `MERGE_HEAD`, so **`git merge --abort` does
not undo it** — undo with `git reset --hard HEAD` then `rm -f .git/SQUASH_MSG` after checking
`git status`, since the reset also discards unstaged edits; if the staged tree holds work that exists
nowhere else, capture it first with `git commit-tree $(git write-tree) -p HEAD -m backup` and keep
the SHA. It preserves Git's squash appendix on `main` — summary, bullets, a blank line, then
`Squashed commit of the following:` and each squashed commit's own header and indented body — which
`git log <base>..<head>` reproduces by hand.

## Child branches after a parent squash

- Preserve ancestry when integrating dependent feature branches. Use the landing workflow for
  the final squash onto `main`.
- After a parent squash, use the [recorded landing boundary](../landing/references/merge-progress.md)
  to identify the child's actual inherited base and its remaining work. When content was copied
  earlier, compare the recorded source and destination trees to map that content before choosing
  a replay range. The squash has its own ancestry even when the landed files match.
- Default to a fresh continuation branch from updated `origin/main` and replay only the verified
  child changes. An explicitly authorized rebase of a private child can replay the same range.
- When a shared integration branch has live dependents and both histories must remain intact,
  appoint one integration owner to reconcile the branches in a single merge. Use the recorded
  pre-squash boundary to resolve duplicate changes and preserve both sides' additional work.
- Retain the original refs or recoverable checkpoints. Confirm that the final diff against
  updated `main` contains only the intended additional changes and rerun affected validation
  before presenting it for review or landing.

## Rebuilding history

When collapsing a chain of branches into per-branch squash commits, do not chain `git merge --squash`
— after the first squash its only ancestor is the base, so every later merge-base is that base and
Git re-applies the whole cumulative diff onto content that already holds part of it. Instead, since
each boundary ref's tree is already the desired result, set it directly:

```
git read-tree --reset -u <boundary-ref>
git commit -F <message-file>
```

`read-tree --reset -u` overwrites tracked files unconditionally — run it only in a worktree created
for the rewrite. Assert after each commit that its tree equals the boundary ref's tree, and that the
final branch diffs empty against the original tip before merging. Keep the original branches, or tag
them, until the Developer confirms the rewrite, and resolve any document that cites a commit hash leaving
`main`'s history.
