# Remote timing workflow

The `performance-investigation` skill uses existing SSH access, immutable Git bundles and a fixed
Tao fixture. It compares branch checkpoints, investigates significant transitions and retains raw
session evidence. It needs no Tao daemon or separate Tao authentication. See the
[skill](../../../agents/skills/performance-investigation/SKILL.md) and
[operation reference](../../../agents/skills/performance-investigation/references/operations.md).

## Local Wi-Fi setup and shared developer home

Use a checkout containing these commands on each Mac, prepared with `./agent unsandboxed setup`.
Initialize development storage on both Macs:

```sh
./dev timing-home
```

This creates `~/.tao-dev/timing/{checkouts,reports,transfers}`, `~/.tao-dev/locks` and
`~/.tao-dev/ssh`. Existing shell setup uses `~/.tao-dev/shell`. Prepared immutable clones belong
under `timing/checkouts`; transferred bundles belong under `timing/transfers`. Collected reports
are shared across controller worktrees under `timing/reports`. Branch comparison artifacts stay
in the runner tooling checkout. Credentials stay
with ordinary SSH/Keychain. Host defaults can later live in `hosts.json`; no empty config is created.

Import collected reports from an existing controller checkout once, retaining the original evidence:

```sh
./dev timing-home --import-reports .artifacts/notes/performance-investigation/reports
```

Imports refuse conflicting bytes instead of replacing evidence. `--dry-run` prints the plan without
creating directories. Local task notes, raw job evidence and build output stay in each checkout's
`.artifacts`. The account-wide measurement lock retains its existing OS support location so prepared
runner helpers continue to coordinate with the current helper.

With Remote Login enabled for the runner's existing macOS user, connect from the controller:

```sh
./dev timing-connect ro@192.168.50.199
```

For password-free repeat connections, run `just ssh-key-setup ro@192.168.50.199` in Terminal
on the controller. Choose a passphrase and unlock the key when macOS Keychain prompts. SSH may
ask for the laptop's login password to install the public key. The recipe manages its own entry
in `~/.ssh/config` and verifies a new login with the old socket and SSH agent disabled.
Rerun it to complete or repair enrollment. Use the same endpoint or alias for later timing commands.

The examples below require prepared clones at the shown paths. Existing clones under `~/Timing`
must be relocated while idle and re-prepared/validated before using their new paths; directory
creation alone does not move them. Retained historical reports keep their original recorded paths.

## Optional CLI-only private networking

Tao's pinned Nix environment supplies the NetBird CLI. No machine-repo declaration or GUI app is
needed. Local Wi-Fi timing does not require this installation.

On the timing Mac:

```sh
just timing-setup runner
```

On the controlling Mac:

```sh
just timing-setup controller
./dev timing-connect ro@tao-timing.netbird.cloud
```

Both setup commands request ordinary administrator authorization, retain the pinned package against
Nix garbage collection, install/start NetBird's standard background service and launch browser sign-in.
Sign in to the same account on both Macs. `--no-browser` prints the login URL instead; `--dry-run`
previews setup without changing the machine. An existing service with a different executable is
reported instead of overwritten. The service reconnects at boot subject to NetBird session expiration.

NetBird assigns private IPs and peer DNS names. Replace `tao-timing.netbird.cloud` above with the
actual name shown by runner setup if a naming collision produces a suffix. These are private endpoints,
not publicly exposed ngrok-style URLs. No domain purchase or router port forwarding is normally needed.
NetBird supplies reachability; the runner still needs macOS Remote Login enabled for the existing user.

`timing-connect` uses ordinary SSH trust/password/key authentication and retains a private control
socket for two idle hours. It returns to the controlling Mac's prompt without opening a remote shell.
It does not edit SSH configuration or create another key. Repeat it after the connection expires.

Close that reusable connection explicitly:

```sh
./dev timing-disconnect ro@192.168.50.199
```

For one command that authenticates, measures, prints the report and closes its own connection:

```sh
./dev timing-session ro@192.168.50.199 /Users/ro/.tao-dev/timing/checkouts/20261029-1602/current
```

The one-shot session uses a unique private socket, leaving any reusable connection untouched.
It attempts cleanup after authentication, measurement or reporting failures, and prints the final
report after cleanup succeeds. It accepts the same workload flags as `timing-run`, including
`--samples`, `--edits`, `--tooling`, `--fixture` and `--dry-run`. No execution deadline is added.

## Compare a branch

Prepare an immutable baseline and candidate checkout on the timing laptop using the
[snapshot and receive operations](../../../agents/skills/performance-investigation/references/operations.md).
Use a fixed reference checkout to track progress over time. To compare against a branch point
that predates the current measurement protocol, prepare separate snapshots with the same
instrumentation on both revisions. Record the original revisions and the instrumentation changes
with the comparison. Compare only the workloads both can run with equivalent boundaries.

```sh
./dev timing-compare ro@192.168.50.199 /absolute/runner/baseline /absolute/runner/candidate --tooling /absolute/runner/tooling
```

The command uses the enrolled SSH key and prints the exact revisions. The tooling checkout
provides the fixture and coordinates the run. Each measured checkout supplies its own preview
driver and must support the same measurement protocol. The command checks this before starting
the first session. Use the original tooling snapshot to summarize previously recorded jobs.
The comparison runs actual headless browser previews on the fixed performance project with
24 dependency files and 240 additional compiled views. It starts five fresh baseline/candidate
pairs, alternating which revision runs first.
Each session measures startup and 24 edits, including 16 warm edits. The browser checks the
requested content and mounted tree after each edit.

The report leads with confirmed speedups, slowdowns and inconclusive changes. Each workload shows
harness launch with previews closed, first preview open, warm preview reopen, and edit timings.
The harness opens the frames by clicking Show previews. The first open starts Expo. Three warm
reopens use fresh frames in the running browser and Expo session after the edits. The edit rows
include session variation, warm edits over 100 ms, and observed frame restarts. Work counts cover
compiler discovery, parse and emit operations, changed generated paths, and delivered Metro delta
modules. The report prints its alert thresholds and the paired changes used to check them.
A change needs agreement across pairs
and a fresh confirmation round within the same command. Inconclusive rows indicate disagreement
within or across rounds. The error label describes severity. Measurement or provenance failure
causes a nonzero command exit.

The runner keeps the comparison index, fixed fixture and raw timings under the printed comparison
directory. To collect the evidence, retrieve that directory including its `sessions/` children.
These sessions are separate from the jobs searched by the standalone `timing-report` command.

## Run a timing job

Use the dedicated speed-testing machine in an isolated, prepared checkout under its shared timing
lock for all formal speed tests. Run `just timing <runner-checkout> --host <runner>` or set
`TAO_TIMING_HOST` and `TAO_TIMING_CHECKOUT` to use `just timing` without arguments. The shortcut
uses five independent sessions of 24 edits and measures the named runner checkout. Prepare the
exact revision there before starting.

Use `just timing --local` for one diagnostic preview run in the current local checkout.
An interrupted or failed run retains evidence separately
from completed comparisons. Compare revisions with the same launch and reopen workloads.
The browser endpoint is React-applied with a DOM check. The native
Studio app and its benchmark are still in the legacy implementation.

## Repeat an existing immutable benchmark

From the controlling Mac, run `just timing-watch` to follow the runner over SSH. Set
`TAO_TIMING_HOST` to the runner's existing SSH alias or login, or supply it as
`just timing-watch HOST`. The default runner is `ro@192.168.50.199`. On the runner itself, use
`just timing-watch --local`. Press Ctrl+C to close the display.

Jobs share one append-only log in the timing home. The start line includes the optional
`--label` from `timing-run`, `timing-session`, or `timing-compare`.

From the controlling Mac, after preparing or relocating the immutable checkpoint:

```sh
./dev timing-run ro@192.168.50.199 /Users/ro/.tao-dev/timing/checkouts/20261029-1602/current
```

This runs five independent sessions of 24 edits, retaining 16 warm edits per session. Reports remain
under the tooling checkout's `.artifacts/notes/performance-investigation/jobs/`. The command prints
the measured commit, session count, scenario medians and ranges, and raw-report location. A collected
JSON summary is also saved under `~/.tao-dev/timing/reports/`, shared across controller worktrees.
The report ends with a blank-line-separated deviation summary comparing the previous comparable
locally collected job on the same SSH address. Selection uses measurement timestamps, not retrieval
order, and requires matching fixture, workload, browser, toolchain, system and frame conditions.
Each scenario shows percentage change, this run's median, the baseline median and session-range overlap.
Changes meeting both 5% and 2 ms are flagged as unconfirmed; at least five independent sessions
per job are required. Reports with fewer sessions remain evidence but are not selected as baselines.
An unchanged measured source tree provides a machine-drift control; changed source cannot isolate
machine drift. These screens do not establish statistical significance or
rule out gradual cumulative drift. Missing or invalid evidence is disclosed rather than treated
as no deviation. Collect older jobs again to retain their runner address and measurement timestamps;
unidentified summaries are not selected as baselines.
It repeats the named
checkpoint; it does not sync current source or measure uncommitted edits. The checkout must be prepared
and immutable, and must contain the performance skill helper and fixture. `--tooling /absolute/path`
selects a separate fixed tooling checkout; `--fixture /absolute/path`, `--samples` and `--edits` select
explicit workloads. `--dry-run` prints paths and workload without connecting.

Print a completed report without measuring again:

```sh
./dev timing-report ro@192.168.50.199 /Users/ro/.tao-dev/timing/checkouts/20261029-1602/current
```

This selects the most recently modified job directory. `--job /absolute/job/directory` selects
an exact job; failed or interrupted jobs are rejected instead of silently showing an older success.
Both commands reuse the private socket established by `timing-connect`, on local Wi-Fi or an
already configured private network. The report command needs no new code on a prepared runner
that already supports the performance skill's `summarize` operation.

Use the snapshot/receive/SSH/transfer operations in the linked skill reference to prepare new source
or compare historical checkpoints. Do not present repeated sessions of one checkpoint as a branch
comparison. The older optional `just tailscale-install` command remains available for explicit use.

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
Compiler phases were stable; browser/HMR variance prevented causal attribution. Native NetBird
installation/login and internet reachability still need both Macs enrolled. Other unverified boundaries
are SSH disconnect survival, forced termination and account-lock contention. A fresh clone may
need a separate `.storage` bundle while its pinned commit is unpublished; the operation reference
documents that bootstrap. No main landing or human-led review acceptance is implied.
