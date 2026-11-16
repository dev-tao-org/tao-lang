# Preview timing history

Retain one measured preview run for each implementation commit, including commits outside the
compiler. Timing-data, submodule-pointer and instruction-only follow-up commits reference their
source commit instead of triggering another measurement.

## Capture

- For an implementation commit, use `./agent unsandboxed performance record` (developer equivalent:
  `./dev performance record`). It records current HEAD, loads the fixture from that commit,
  requires unchanged committed implementation inputs, and validates/reuses an existing successful
  record. It writes to the initialized `.storage` submodule or retains pending data under
  `.artifacts/notes/preview-history/<commit-sha>/`; it does not initialize, commit or push the archive.
  Failed, partial or corrupt existing records are retained and reported; they are not overwritten.
- Developer command: `./dev performance preview`. Agents on macOS use the approved host operation
  `./agent unsandboxed performance preview`. This starts isolated headless Expo web previews,
  runs the fixed local and imported render transitions through the performance editor's serialized
  save path, and prints the JSON report path.
- Measure the committed source and fixture. Preserve unrelated developer edits; use an isolated
  committed snapshot when they affect benchmark inputs. Never attribute a dirty implementation
  run to a clean commit merely by replacing the report's commit field.
- Run without concurrent gates or another benchmark. Keep the same fixture, scenarios and frame
  sizes for comparisons; record changes to them as a new benchmark configuration.
- Capture once after creating each implementation commit. Failed or unavailable runs must be
  recorded with their reason; they are missing measurements, never zero durations or passed runs.

## Archive format

Store each source commit under `.storage/performance/preview/<full-source-commit-sha>/`:

- `report.json`: the successful command's complete, unmodified JSON report, including per-frame
  Metro update-done and preview-applied durations, granular pipeline spans and startup duration.
- `record.json`: schema version `1`, full `sourceCommit`, Git `sourceTree`, UTC `capturedAt`,
  `status` (`passed`, `failed` or `unavailable`), benchmark command, fixture path and SHA-256,
  scenario names, report SHA-256 when present, and failure/availability details when applicable.
  Preserve the report's host/browser, frame sizes and dirty-state provenance. If an isolated
  committed snapshot was used, record that fact and its source identity explicitly.

Keep raw samples and the measurement definitions. Preview-applied is the matching React commit
receipt, not proof of physical paint. The save-based clock starts when the compiler process
accepts the edit, before persistence and compilation.
Warm steps within one session are repeated edits. Use independent sessions to assess repeatability.
Do not replace an existing per-commit record with a faster rerun. Diagnostic reruns stay in
`.artifacts` with their conditions; a correction is a separately identified archive addition.

## Comparisons and significant changes

- Check preview performance during implementation, not only when recording commits. Use
  `./agent unsandboxed performance preview` for diagnostic measurements without creating an
  immutable per-commit history entry. Retain raw diagnostic reports and their source/dirty-state
  identities under `.artifacts`; these checks do not replace required commit records.
- Flag significant observed changes promptly to the Developer, whether faster or slower, during
  implementation or final checks. Include absolute latency and percentage changes, affected
  scenarios/phases and source identities. Label an apparent jump as provisional until repeated
  measurements distinguish it from ordinary run-to-run variation; do not wait until landing to
  mention it or silently discard inconvenient samples.
- Always complete a whole-project comparison before final landing: the implementation immediately
  before the branch was created versus the final implementation being landed. Freeze that baseline
  commit when work starts; for existing work, recover and identify the original starting commit.
  Do not substitute the previous implementation commit, a later checkpoint or newly advanced main.
  Preserve the original project's baseline across replacement branches, rebases and history repair.
  Recheck a changed final implementation after integration, keeping the original baseline fixed.
- Compare the same representative workload, edit scenarios, iframe sizes, measurement boundaries,
  browser/toolchain and host conditions without concurrent gates or benchmarks. Use a workload
  supported by both implementations; disclose fixture or environment differences and avoid calling
  incomparable runs a successful comparison. Separate startup, warm refresh, Metro update-done,
  preview-applied and pipeline phases; preserve their actual measurement definitions.
- Use repeated diagnostic runs to assess material changes, reporting sample counts, representative
  latency and variability rather than treating a single scenario sample as a distribution. Apply
  executable performance thresholds where available; otherwise explain significance using the
  absolute/relative change and observed variability. Many small changes can add up to a significant
  branch-wide change even when no adjacent commit showed a clear jump.
- Before landing, retain the baseline/final SHAs, report references, comparison and investigation
  of significant changes in task notes, and summarize the result in the landing report/message.
  Missing baseline evidence or an unresolved significant regression remains an explicit readiness
  gap; a passing correctness suite or individual commit records do not establish branch-wide speed.

## Before landing

Before any branch completion, merge handoff or retirement, first satisfy
[`git-workflow`'s evidence preservation](../../git-workflow/references/branch-evidence.md).
Timing records must be committed, remotely confirmed and referenced by the handoff at that
boundary; do not wait for landing when a branch is handed off earlier. The steps below retain
the additional performance requirements for landing.

1. Complete the branch-start-to-final comparison above and report significant changes. Ensure
   the source commits being landed have records; surface missing or failed measurements
   and investigate regressions rather than silently skipping them. An unavailable host remains
   an explicit gap for the Developer to resolve before landing.
2. Initialize/sync the actual `.storage` Git submodule if needed; never write archive data into
   its uninitialized directory. Commit only this task's new performance records in the submodule.
3. Push that archive commit and confirm it exists remotely before pinning its Gitlink in Tao.
   The new implementation's authorized `land` workflow performs archive initialization,
   publication and pinning during landing. Earlier handoffs must complete preservation through
   a supported authorized route before becoming merge-ready; report a missing route as pending.
   Recording alone does not publish. Do not bypass the host allowlist or invoke the old
   implementation's tools as a substitute.
4. Commit the updated `.storage` pointer as a separate Tao follow-up. Include the measured source
   SHAs, archive commit and record paths in the reviewed squash/merge message so the final main
   commit can be traced back to its measurements.
5. Only then use the authorized landing route. Permission to record or publish timing data is
   not permission to land; never rewrite pushed archive history.

Local implementation commits may accumulate while work is ongoing. Commit and push their archive
records, then update the pointer before the first branch-completion or merge-handoff boundary,
even while landing is paused. Do not discard pending records during normal or partial cleanup.
