# Partial review continuation

Continue the human-led review in a separate implementation worktree while preserving the prior accepted tree.

## Branch setup

- Create `feat/metro-memory-preview-review` from the committed tip of `feat/metro-memory-preview` in a new worktree.
- Use the partial-stepwise-big-incremental-review skill. In the new worktree, let its `start` operation create `feat/metro-memory-preview-review-incremental-review-approved` from the prior accepted tip; do not pre-create that target branch.
- Resolve and record the current tip of `feat/projects-sessions-review-fixes-incremental-review-approved` before starting, then pass that immutable SHA as `--base`:

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- start --base <prior-approved-SHA> --branch feat/metro-memory-preview-review-incremental-review-approved
```

The new accepted tree must initially equal the prior accepted tree. Never merge the implementation into the accepted branch. Compare direct trees, including saved working edits, rather than merge-base diffs.

## Historical records

Read the old session and its receipts before recording any further approval:

- Original records: `/Users/ro/.codex/worktrees/aea4/tao-lang/.artifacts/notes/incremental-review/`.
- Retained copy: `/Users/ro/.codex/worktrees/7076/tao-lang/.artifacts/notes/source-aea4-retained/notes/incremental-review/`.
- Important records: `progress.json`, `current-group.md`, `grouping-proposal.md`, `completed-name-resolution.md`, `process-feedback.md`, and `active/session.json` plus completed transaction receipts.

These paths are local evidence, not files that travel with a Git branch. Copy the relevant records into the new worktree's retained notes as historical evidence. Verify their agreement with the actual old approved tip; do not treat a stale archive as authoritative. Keep both source worktrees read-only.

Preserve original review units, earned credit, pending questions and semantic rechecks in the continuation checkpoint. New preview/planning changes form additional review scope, not an enlarged original denominator. A new script session starts with an empty acceptance registry: explicitly record inherited approvals/rechecks in its notes and checkpoint; do not infer that an empty registry means the old accepted tree is unapproved.

Do not copy the old active session over the new session: paths, ownership IDs and journal refer to the old worktrees. The existing `start` API has no session-fork operation. Its new baseline is the prior accepted tip, so `reopen` cannot remove inherited acceptance by restoring the original pre-review baseline. If inherited content needs reopening, stop that transfer and resolve a precise original-baseline patch or an explicitly scoped tooling change; never silently mark the changed content approved.

## Review boundaries

Restore the current group and propose the reconciled remaining groups before continuing. Only explicit human approval moves content to the accepted tree. Corrections belong on the review implementation branch, with commits governed by the review skill; integration back into other development branches and landing remain separate decisions. Hold incoming compiler/language work until the developer requests its integration.

The deferred [Studio roadmap](../Roadmap/Studio%20Canvas.md) is planning content for review, not an instruction to implement Studio during this session.
