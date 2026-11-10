# Partial review continuation

Continue the human-led review in a separate implementation worktree while preserving the prior accepted tree.

## Branch setup

- Create `feat/metro-memory-preview-review` from the committed tip of `feat/metro-memory-preview` in a new worktree.
- Use the partial-stepwise-big-incremental-review skill. In the new worktree, let its `continue` operation create `feat/metro-memory-preview-review-incremental-review-approved` from the prior accepted session; do not pre-create that target branch.
- The original implementation checkout contains the session for `feat/projects-sessions-review-fixes-incremental-review-approved`:

```sh
./agent skill-script agents/skills/partial-stepwise-big-incremental-review/scripts/review.ts -- continue --from /Users/ro/.codex/worktrees/aea4/tao-lang --branch feat/metro-memory-preview-review-incremental-review-approved
```

The new accepted tree must initially equal the prior accepted tree. Never merge the implementation into the accepted branch. Compare direct trees, including saved working edits, rather than merge-base diffs.

## Historical records

Read the old session and its receipts before recording any further approval:

- Original records: `/Users/ro/.codex/worktrees/aea4/tao-lang/.artifacts/notes/incremental-review/`.
- Retained copy: `/Users/ro/.codex/worktrees/7076/tao-lang/.artifacts/notes/source-aea4-retained/notes/incremental-review/`.
- Important records: `progress.json`, `current-group.md`, `grouping-proposal.md`, `completed-name-resolution.md`, `process-feedback.md`, and `active/session.json` plus completed transaction receipts.

These paths are local evidence, not files that travel with a Git branch. The continuation operation retains historical evidence in the new session; inspect its provenance and verify agreement with the actual old approved tip. Do not treat a stale archive as authoritative. Preserve the original files, branches and index; the tool uses a temporary coordination lock while taking its snapshot.

Preserve original review units, earned credit, pending questions and semantic rechecks in the continuation checkpoint. New preview/planning changes form additional review scope, not an enlarged original denominator. The tool carries forward the acceptance registry, notes and rechecks; the agent still interprets the inherited grouping and progress records.

Do not copy the old active session over the new session: paths, ownership IDs and journal refer to the old worktrees. The continuation operation assigns new ownership while preserving the original pre-review baseline, so `reopen` works for inherited approvals as well as new approvals. It refuses an interrupted source transaction; resolve that in its owning session before continuing.

## Review boundaries

Restore the current group and propose the reconciled remaining groups before continuing. Only explicit human approval moves content to the accepted tree. Corrections belong on the review implementation branch, with commits governed by the review skill; integration back into other development branches and landing remain separate decisions. Hold incoming compiler/language work until the developer requests its integration.

The deferred [Studio roadmap](../Roadmap/Studio%20Canvas.md) is planning content for review, not an instruction to implement Studio during this session.
