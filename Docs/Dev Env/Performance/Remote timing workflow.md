# Remote timing workflow

Run `just timing-setup` and give the printed prompt to an agent. The agent helps set up ordinary SSH
key access to the timing machine and prepares a pinned Tao tooling checkout there. Use an existing
SSH alias or `user@hostname` reachable from this machine. On a Mac, enable Remote Login for the chosen
account through System Settings. Keep SSH host-key verification enabled.

The setup agent can run `./agent ssh-key-setup HOST` if a new key is needed. Run that command
in Terminal if key enrollment prompts for a password or passphrase. On the runner, use the physical
checkout path reported by `pwd -P` for `TOOLING`. Prepare it with
`TAO_SETUP_STORAGE=false ./agent unsandboxed setup`. Then
`./agent timing-configure HOST TOOLING` checks that the prepared checkout supports snapshot measurements
over SSH and saves its physical path and host in `~/.tao-dev/timing/runner.json`.

## Run one round

```sh
just timing-run
just timing-run ~/code/tao-another-worktree --samples 3
just timing-run --ref HEAD --edits 8
just timing-run --dry-run
```

`CHECKOUT` is optional and defaults to the Git worktree containing the directory where you invoke
`just`. The command normally snapshots saved changes, including staged and unstaged edits and
nonignored untracked files. Save editor buffers first. Use `--ref` for an exact committed revision.
The snapshot is private to the configured SSH runner and preserves your local branch and index.
Ignored files and untracked archive receipts stay local.

The runner holds the timing lock while it verifies the snapshot, prepares an isolated checkout
with pinned dependencies, and runs five fresh preview sessions with 24 edits each by default. Raw results stay under its tooling
checkout. Tao saves the summary under `~/.tao-dev/timing/reports` on the controller and removes the
temporary runner checkout after a successful run.

Agents use [the performance investigation operations](../../../agents/skills/performance-investigation/references/operations.md)
for paired comparisons, retained reports, live progress, or trouble diagnosing SSH. One timing
round measures one source snapshot. For a regression verdict compare balanced pairs on the same runner.

## Measurement conditions

Use a quiet runner on power with a consistent power mode, sufficient cooling and no concurrent
builds or measurements. A separate standard user is optional: it reduces per-user background apps,
but does not isolate system services, thermal state or other logged-in users. Leave security services
enabled. Finish dependency preparation before measuring and define warmup consistently.

Retain a fixed reference commit and workload across balanced comparison rounds. Measure that control
before and after candidate batches and retain its session medians and variability over time. Idle
CPU activity is context, not a replacement for the reference workload. Segment control history when
hardware, OS, browser, runtime, fixture or power policy changes; investigate repeated control shifts
before attributing a change to Tao. Never hide a regression by silently replacing the control.

## Validation on 2026-10-29

Source `ed45019bd7f8816684a21c36e2f0b64435e1ec7e`, tree
`2b12173f95e79799762fc6e218251eae185a5e5e`, passed full verification and three bounded review rounds.
Seven P2 findings across the first two rounds were repaired; the final round found no P0–P2 findings
or required instruction violations. Optional low-level Git subprocess deduplication was deferred.

All four implementation commits have successful per-commit preview records under
`.storage/performance/preview/<source-commit>/`. A separate final runner job passed with 24 edits,
including 20 warm edits, and its summary passed. These single-session checks prove local workflow
acceptance; they do not establish statistical performance equivalence or physical paint latency.

The [evidence inventory](../../../.storage/evidence/ed45019bd7f8816684a21c36e2f0b64435e1ec7e/performance-review-20261029/inventory.json)
identifies source provenance, raw reports, review conclusions and validation logs with checksums.
Archive publication remains a handoff requirement: confirm the archive commit remotely before
pinning it in Tao. Keep this worktree and local evidence until publication succeeds.

Subsequent second-Mac validation passed 39 sessions/936 edits, including identical-code controls.
Compiler phases were stable and browser/HMR variance prevented causal attribution. SSH disconnect
survival, forced termination and account-lock contention remained unverified in that run.
