# Remote timing workflow

The `performance-investigation` skill uses existing SSH access, immutable Git bundles and a fixed
Tao fixture. It compares branch checkpoints, investigates significant transitions and retains raw
session evidence. It needs no Tao daemon or separate Tao authentication. See the
[skill](../../../agents/skills/performance-investigation/SKILL.md) and
[operation reference](../../../agents/skills/performance-investigation/references/operations.md).

`just tailscale-install` installs the official macOS app, preserving an existing installation.
Its `--dry-run` resolves the package without installation. Human setup still includes native VPN
consent, sign-in, Remote Login and ordinary SSH authentication/trust. Tailscale alone does not
establish an authenticated SSH session.

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

Unverified boundaries: actual second-Mac transport and timing, SSH disconnect survival, native
installation/permission prompts, forced termination and account-lock contention. A fresh clone may
need a separate `.storage` bundle while its pinned commit is unpublished; the operation reference
documents that bootstrap. No main landing or human-led review acceptance is implied.
