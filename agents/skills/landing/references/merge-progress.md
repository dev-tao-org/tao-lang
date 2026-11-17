# Merge Progress

Land the finished part of a long task on `main` mid-flight and carry the rest on a fresh branch.
Reach for this whenever a long task crosses a slice boundary, not only when the Developer asks to merge what is
done so far, says to bring the work to a good state and merge now, or invokes `/merge-progress`.

A branch that sits un-integrated gets more expensive every hour: `main` moves several times a day
here, and the files a long task most often touches — root `AGENTS.md`, the skills, the developer
environment ledger — are exactly the ones every other branch also edits, so they conflict and
renumber on every round. Landing the finished half early is what keeps that bill small.

The finished part lands on `main` now; the remainder continues on a new branch from that `main`.
Nothing half-done ships: the cut is chosen so every commit that lands is complete on its own terms.
The parent skill owns the route and the message format; this reference owns only the mid-task cut.

## When a slice is worth proposing

Propose a landing only when all four hold, and it is then the Developer's to accept or defer:

- The finished side is independently complete by the cut rule below.
- It is at least two commits, or one that touches a surface other branches also edit: root
  `AGENTS.md`, a skill, `.rulesync/`, a generated harness file, or the developer environment ledger.
- At least half an hour of work has gone into it, or `main` has moved since this branch last matched
  it. Both are reasons the merge gets dearer by waiting.
- You have not proposed a landing in the last half hour. One proposal per boundary, not per commit.

Say in the proposal which of these made it worth asking. Never land on the strength of this section
alone: the parent skill's authorization still applies.

## Choosing the cut

Move the line until every item on the finished side is true on its own: its behavior change is
complete, not a first half; it has the tests it deserves, and they pass; it does not depend on
anything still in progress; and its `.artifacts` checkpoint records the result, with any instructed documentation edits complete. A defect
found but not fixed is not a cut boundary — record it (below) and land the fixes around it. If the
finished side is empty, say so and do not merge.

## Bringing the branch to a good state

Use the exact, clean implementation commit for the approved cut. The approvals branch records
approved content and may be an incomplete tree. When implementation contains work beyond the cut,
prepare the landing on a separate branch and keep the original worktree, branch and approval
receipts. Reconcile documentation and preserve verification evidence under the parent landing skill.
Write or refresh `.artifacts/merge/<branch>.msg` for that cut.

## The merge message for a partial landing

The usual format applies, with two differences: the summary names what landed, never the task
(`Fix the keyboard narrowing gate and its three regressions`, not `September remediation, part one` —
a reader of `main`'s history has no part two to compare it with); and one bullet states what is
deliberately not in this commit and where it continues, naming the follow-up branch.

## Merging and continuing

Before landing, record the implementation fork, exact cut tip and tree, and the remaining
commits or patch ranges. Add the approved-content tip and receipt locations for a human review.
After confirming the landing, record the squash commit on `main` and update local `main` through
[Git workflow](../../git-workflow/SKILL.md). If a shared integration branch still needs
reconciliation, identify its owner and record the resulting base once.

Keep the current chat and continue on a fresh implementation branch and worktree. Use Git
workflow's post-squash rules to carry the recorded remainder. For human-led review, follow
[Continue after a landing](../../partial-stepwise-big-incremental-review/references/operations.md#continue-after-a-landing).
Propose later cuts using the same criteria.

## The checkpoint

`.artifacts/checkpoint/<branch>.md` is what a slice boundary leaves behind, refreshed at every one of
them whether or not a landing is proposed. It exists because the two ways a long task continues —
the Developer compacting the thread, or a fresh thread taking the branch — both destroy conversation and keep
the repository. A model-written summary drops the constraint that mattered; a file does not.

It is ignored by Git and lives only in this worktree, which is the right scope: it carries a branch
across a context boundary. Keep it short enough to stay true: the goal in a sentence; decisions taken and what they rule out;
the evidence already green, with the lane and its timestamp, so the next thread does not re-run it;
paths this branch owns; what is open, each with its next concrete step; and what has been proposed to
the Developer and not yet answered. Replace it rather than appending — a checkpoint is the current state, not a
log — and write it before saying that this is a good point to compact, because after the compaction
it is the only thing that remembers.

## Handing over the rest

Every open item goes in the task's `.artifacts` checkpoint with the exact reproduction, the last
thing tried, why it is still open and the follow-up branch's name. The Developer's reply gets the cut and nothing
else: what landed, what did not, and what runs next.
