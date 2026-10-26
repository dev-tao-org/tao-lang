# Preserve evidence before finishing a branch

Complete this workflow before declaring a branch ready to land, handing it off for merge into
another branch, or retiring/archiving its branch, worktree or task. Preservation is independent of
landing; do not defer it to the receiving agent or to a later merge.

1. Inventory task-owned evidence, including ignored `.artifacts` notes, research, review reports,
   checkpoints, raw measurements and pending records inside submodules. Inspect Git status with
   `--ignore-submodules=none` and inspect each relevant submodule itself. Ordinary clean status,
   a preservation ref or an app's worktree snapshot does not prove ignored evidence is preserved.
2. Select what is needed to reproduce results, understand decisions, resume work or resolve open
   findings. Retain relevant failed runs and measurement provenance as well as successful results.
   Exclude disposable builds/caches, credentials and unrelated user data; do not publish transcripts
   or sensitive material merely because they are in the task folder.
3. Put concise durable conclusions and handoff instructions in the appropriate tracked repository
   documentation. Preserve raw evidence in the storage repository: preview records keep their
   `performance/preview/<source-commit>/` format; other research/review evidence uses an immutable
   `evidence/<source-commit>/<task-id>/` directory. Never overwrite a different existing record.
4. Include an evidence inventory with source branch/commit/tree, original paths, destination paths,
   file hashes, result limitations and unresolved findings. Identify dirty experimental snapshots
   explicitly; do not label them as measured committed source. Link the inventory from the tracked
   handoff document.
5. Commit and push the selected archive records through supported, authorized routes; confirm the
   remote archive commit and the file hashes. Then commit and back up the parent repository's
   archive pointer and handoff document. A local copy, local commit or message containing a path
   is not the durable preservation receipt.
6. Give the receiving agent the source and archive commits, tracked inventory location, review
   checkpoint and unresolved work. Verify the merge target carries the handoff/pointer before
   deleting the source worktree. Until then, report preservation or integration as pending.

Use existing Git/publication authorization; this workflow does not authorize landing, deletion,
force pushes or publication of private data. If authorization or a supported archive route is
missing, name the exact remaining step and keep the source worktree. Do not call the branch
finished, merge-ready or safe to remove. Archiving only the chat is permissible with an explicit
pending-work handoff and retained worktree; it is not evidence that branch completion succeeded.

`pipeline-performance` owns timing formats and measurement proof. This workflow owns when all
task evidence must become durable; one receipt covers both rather than copying competing rules.
