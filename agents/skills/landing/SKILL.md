---
name: landing
description: >-
  Land a branch on main. Use when asked to land, merge a branch into main, open or finish a pull
  request, run open-pr, merge-pr, land, or land-fix, write or refresh the merge message, check
  whether a branch landed, land finished work mid-task (/merge-progress), cycle a personal dev
  branch, or clean up after a landing; also before proposing a landing. Fleet pacing stays with
  agent-coordinator.
---

# Landing

This skill owns the one route a `feat/<name>` branch takes onto `main`, and the judgment around it. `./agent help` and each command's `--help` print the flags. `git-workflow` owns branches, worktrees, and history; `verification-lanes` owns lanes, a red lane or failed partition, and CI contention; `agent-coordinator` owns pacing many landings at once.

## New implementation

Before entering the landing route, complete `git-workflow`'s
[branch evidence preservation](../git-workflow/references/branch-evidence.md), including research
and review evidence as well as timing records. The landing command's timing publication is not a
substitute for this inventory and durable handoff.

Root commands outside `.x-tao-old-v1/` expose three routes, with the same names in `./dev` and
`./agent unsandboxed`:

- `merge-main` fetches and integrates `origin/main` into a clean feature branch without publishing.
  Review any integrated changes before continuing.
- `land` owns integration, verification, performance archive publication/pinning, PR checks and
  the squash merge. Use it only with explicit Developer authorization for the slice. Prepare and
  review `.artifacts/merge/<branch>.msg`, commit source changes, and use `performance record`
  before landing. Resolve missing or failed per-commit measurements rather than silently skipping
  them. Source commits remain the history identities after a data-only Gitlink commit.
- `landed [branch]` checks authoritative merged-PR and remote-main evidence. Authentication or
  remote-query errors are not evidence that a branch did not land.

Use [Merge Progress](references/merge-progress.md) for a mid-task landing and its continuation.

Rerun `land` to resume after a reported review or recovery stop. Review newly integrated changes
and exact archive/source references before retrying; a retry is not a substitute for that review.
The command must push and confirm archive data before publishing Tao's pointer, and pin the PR
merge to the checked head. Never bypass a failed gate with a direct push or merge.

These commands do not imply permission to run `land` while implementing or testing them. Use
recording command fixtures for mutation tests; actual publication and merging require the
Developer's landing instruction.

## Retained implementation reference

The sections below describe the separate `.x-tao-old-v1/` implementation, including its commands
that the new CLI does not expose. Do not use those tools to implement a new-workspace landing.

## Authorization

- Land only with the Developer's explicit yes for the named slice. It lasts for the rest of the thread, through every retry, until the Developer revokes it; when the Developer told a coordinator to land or release a queue, that coordinator's GO carries it.
- Without a yes, a ready branch waits and you propose it (below). Plain `./agent unsandboxed open-pr` without `--auto-merge` is the one way to get CI feedback before then; it refuses a pull request whose auto-merge is already on, and you do not change another task's setting to make it proceed. Authorization to test is not authorization to land.
- Only the repository's landing commands merge a pull request or push `main`; never `git push` to `main` yourself.

## Propose it as ready, or as needing eyes first

What you ask for turns on whether the gates prove the change, not on its size.

- **Ready to land** when the gates that ran green cover the change: documentation, roadmap, agent instructions, developer tooling, and test-only changes always; product code whose behavior the suites actually exercise.
- **Needs the Developer's eyes first** when the change reaches what no gate proves: Studio's or an app's visible behavior, a language surface the Developer has not seen, native or device paths, or anything covered only by lanes a person runs (`./dev studio-manual-checks`, a device install, everything in `VERIFY_FULL_SKIPPED`). Say exactly what needs looking at and why.
- A green `Verify` is not by itself the answer: a change can pass every gate and still be the thing the Developer is designing. When the two pull against each other, say so.
- Mid-task, a finished slice is worth proposing on its own; `references/merge-progress.md` owns when, how to cut it, and the checkpoint.

## Before the route

- Complete `pipeline-performance`'s [preview history](../pipeline-performance/references/preview-history.md)
  branch-start-to-final comparison and publication/pointer workflow before landing; report
  significant changes and carry the comparison, measured source SHAs and archive references into
  the reviewed merge message.
- The branch is a clean `feat/<name>` with the exact reviewed task paths committed, instructed documentation edits complete and the `.artifacts` ledger current: an edit after `Verify` starts changes the head it proves.
- The merge message at `.artifacts/merge/<branch>.msg` is written and reviewed (below).
- Maintained native bindings need no manual step: `open-pr --auto-merge` regenerates them before the push and refuses if that fails or changes the worktree.
- Run no broad local lane and no `finalize` first; the route is the proof. Until `Verify` is green on the current head, call the branch awaiting CI, not verified.

## The route

1. Run `./agent unsandboxed open-pr --auto-merge`, always with `--auto-merge`. It waits for admission, pushes, opens or reuses the pull request titled from the reviewed message, and starts hosted `Verify`; GitHub squash-merges the moment `Verify` is green on that head.
2. The same command runs `verify-complement` beside it: the host-only gates hosted `Verify` does not run, derived by `verify-complement` from the catalog and `ci-macos.yml`. It posts `Verify (host)` on the head. `Verify (host)` is not a required check, so GitHub merges on a green `Verify` whether or not the complement has finished; "When the complement fails" covers the aftermath. Never run the sandbox-capable gates locally as merge evidence; hosted `Verify` owns them.
3. `open-pr` returns once GitHub has merged, printing `merged_at`, or once the complement ends, whichever is later. It runs for many minutes: run it in the foreground with a long timeout, or backgrounded under `verification-lanes`' rules for reporting while a lane runs.
4. When it exits before the merge, follow with `./agent unsandboxed pr-checks --wait`. A failed partition is `verification-lanes`' to diagnose; fix, commit, and run `open-pr --auto-merge` again, which restarts both halves.

### Waiting for admission

`WAIT` is the admission queue working, not a failure: two `Verify` runs are in flight, or the one in flight is a pull request that changed a file this branch changes. It polls, prints again when the blocking set changes or every five minutes, and gives up after 90 minutes without pushing. Do nothing to the other runs and say so once on the first wait line. `--jump-queue` is the Developer's, or a coordinator's the Developer told to use it, never a way past a wait you find inconvenient.

### When `open-pr` reports no checks

`No checks appeared … within 180s` exits with auto-merge unarmed; a queued `Verify` run already counts as checks appearing. The message names the cause and its remedy: a conflict with `main` (merge it and relaunch), no check suite on the commit (the push event was lost: push an empty commit and relaunch), or check suites present (GitHub started late: relaunch on the same head once the run exists).

### When the complement fails

- **Before the merge:** `open-pr` cancels `Verify` and turns auto-merge off (`./agent unsandboxed cancel-verify` does the same for a failure found by hand). Read the named log, fix, commit, and relaunch.
- **After GitHub merged:** fix it on the branch, commit, and run `./agent unsandboxed land-fix`. It commits the fix commits made after the merge onto fetched `origin/main` as one commit, pushes `main`, moves the archive, and writes a receipt under `.artifacts/logs/land-fix/`. Before pushing it runs typecheck, lint and the changed suites on the branch and refuses on a failure; it runs no full verification. Report the push with the fix.

### When the pull request conflicts with `main`

GitHub refuses it. Run `./agent merge-main`, or `./agent unsandboxed merge-main` when it refuses on protected paths; resolve, commit, skim what arrived (`git-workflow`), and run `open-pr --auto-merge` again. The new head needs CI again; a merge of `main` does not stale the reviewed message.

### Finishing from wherever it stands

`./agent unsandboxed merge-pr` archives a pull request GitHub already merged, squash-merges one whose `Verify` is green and whose auto-merge is off, pinned to that head, and otherwise turns auto-merge on for this head.

## Did it land

Ask `./agent unsandboxed landed [branch]`; never infer it. A stopped wrapper, a task reported failed because its shell exited non-zero, and a summary read mid-write all look like failure; one branch was landed twice in a session that way. The archive ref is the fact: `merged/<name>` for a feature branch, `merged/<name>/<utc>` for each landing of a personal branch. A failed remote query is an error, never "not landed."

## The merge message

- Write or refresh `.artifacts/merge/<branch>.msg` whenever the branch becomes ready, and again after any later commit of the branch's own.
- Format: a summary of at most 72 characters, a blank line, then contiguous `- ` bullets that may wrap onto indented continuation lines. No hand-written squash appendix and no author attribution; local `land` appends Git's own appendix.
- Both `open-pr` modes use it as the pull request's title and description; to change them, edit it and run `open-pr --auto-merge` again.
- Review and edit it before landing; never hand over a mechanical draft. A partial landing's message follows `references/merge-progress.md`.

## After the landing

- GitHub deletes the remote `feat/<name>`; `merged/<name>` holds its head. A feature branch lands once and is never recreated for more commits: continue on a new branch from the new `main`.
- Review resources without being asked: `./agent unsandboxed resources --json`, plus `.artifacts/resources/after-land.json` after a local `land`. Include sessions this task started as well as stranded resources, and match this task's receipts and external-directory registrations; a checkout path alone does not prove ownership in a shared checkout. Ask the Developer before cleaning the concrete task-owned items, or say briefly that none are eligible.
- The report is discovery, never removal authority. Recheck identities and task activity after approval; use the owned stop and recovery commands, and `worktree-status` before reclaiming any checkout. Preserve unknown ownership, borrowed devices, unrelated processes, reusable caches, and evidence still needed. Never use broad `clean-all` or PID or name matching.
- Register each nonstandard external directory when you create it, with `./agent resources --register-directory /absolute/path --task '<task>' --purpose '<why>' --cleanup-condition '<when>' --json`, so this review can find it.

## Local `land`

A personal `dev/<name>` branch, and a feature branch only while GitHub is unavailable, land with `./agent unsandboxed land`, which integrates, verifies, squashes, and pushes under the machine-wide landing lock; `open-pr` and `merge-pr` reject the `dev/` shape. Read `references/local-land.md` before running it and `references/personal-dev-branch.md` for the personal branch's cycle.
