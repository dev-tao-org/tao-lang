# Preview timing history

Retain one measured preview run for each implementation commit, including commits outside the
compiler. Timing-data, submodule-pointer and instruction-only follow-up commits reference their
source commit instead of triggering another measurement.

## Capture

- Developer command: `./dev performance preview`. Agents on macOS use the approved host operation
  `./agent unsandboxed performance preview`. This starts isolated headless Expo web previews,
  exercises text, added-view and column-to-row edits through disk watching, and prints the JSON
  report path. No screenshots are required.
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
receipt, not proof of physical paint; the save-based clock currently starts at watcher observation.
One run's three scenarios are individual samples, not a statistically established median or p95.
Do not replace an existing per-commit record with a faster rerun. Diagnostic reruns stay in
`.artifacts` with their conditions; a correction is a separately identified archive addition.

## Before landing

1. Ensure the source commits being landed have records; surface missing or failed measurements
   and investigate regressions rather than silently skipping them. An unavailable host remains
   an explicit gap for the Developer to resolve before landing.
2. Initialize/sync the actual `.storage` Git submodule if needed; never write archive data into
   its uninitialized directory. Commit only this task's new performance records in the submodule.
3. Push that archive commit and confirm it exists remotely before pinning its Gitlink in Tao.
   Use the supported storage publication/pin workflow in `storage-archive`. The new implementation
   currently has neither storage commands nor allowlisted submodule initialization/push operations.
   Until that tooling exists or the Developer performs publication, report this prerequisite as
   blocked and retain pending records under `.artifacts/notes/preview-history/`. Do not bypass the
   host allowlist or invoke the old implementation's tools as a substitute.
4. Commit the updated `.storage` pointer as a separate Tao follow-up. Include the measured source
   SHAs, archive commit and record paths in the reviewed squash/merge message so the final main
   commit can be traced back to its measurements.
5. Only then use the authorized landing route. Permission to record or publish timing data is
   not permission to land; never rewrite pushed archive history.

Local implementation commits may accumulate while landing is paused. Commit and push their
archive records, then update the pointer before landing; do not discard the pending records during
normal or partial artifact cleanup.
