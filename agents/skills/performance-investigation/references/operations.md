# Performance investigation helpers

Use this entry on the controller or a prepared tooling checkout on the runner:

```sh
./agent skill-script agents/skills/performance-investigation/scripts/performance.ts -- --help
```

Below, `PERF` means that complete prefix before the operation. It is shorthand in this reference,
not an installed executable. All paths supplied to a runner are absolute POSIX paths. Local paths
resolve from the original CLI caller's directory.

## Capture and receive

```sh
PERF snapshot
PERF snapshot --repo /Users/ro/code/tao --ref FULL_COMMIT_SHA
PERF receive --bundle /Users/ro/.tao-dev/timing/transfers/snapshot.bundle --manifest /Users/ro/.tao-dev/timing/transfers/snapshot.json --directory /Users/ro/.tao-dev/timing/checkouts/current
PERF receive --bundle /Users/ro/.tao-dev/timing/transfers/snapshot.bundle --manifest /Users/ro/.tao-dev/timing/transfers/snapshot.json --directory /Users/ro/.tao-dev/timing/checkouts/baseline --ref FULL_BASELINE_SHA
```

`snapshot` writes a bundle and manifest under the controller checkout's
`.artifacts/notes/performance-investigation/snapshots/<id>/`. Without `--ref`, it captures saved
working content through a disposable index and private object store. The real index is checked
byte for byte before and after capture; HEAD and source status must also remain stable. Two
saved-tree captures must agree. Concurrent editing can still resume after capture: the bundle,
not the mutable working directory, is the measurement input.

The bundle contains reachable parent history and a `performance-snapshot` branch; it needs no
GitHub publication or reverse SSH access to the controller. It includes Git blobs, symlinks and
executable bits, not dependencies, ignored files or uncommitted submodule content. The manifest
lists submodule pins and preserves dirty provenance; separately transfer required submodule data.
Active Git content transforms are rejected instead of silently normalizing saved bytes.
Undeclared embedded repositories are rejected. Executable bits are captured even when the controller
ignores mode changes; captured and received source bytes, symlinks and modes are verified against the Git tree.

`receive` verifies the bundle hash and clones into a new directory; it never resets an existing
checkout. A requested historical SHA must exist in the bundle. Seed required submodule pins as
described below before running setup inside each new candidate. Use `./agent unsandboxed setup`
on current revisions. Historical revisions use the setup command declared by that checkout.
Inspect and record setup-induced source changes;
the runner refuses dirty implementation inputs. No dependency/tool versions are upgraded implicitly.

## Existing SSH infrastructure

For local Wi-Fi, initialize storage with `./dev timing-home` on both Macs and use the runner's
existing Remote Login account. `./dev timing-connect HOST` authenticates a reusable socket under
`~/.tao-dev/ssh`; its path can be supplied to `ssh --control-path` below. Optional private networking
is described in the [remote workflow](../../../../Docs/Dev%20Env/Performance/Remote%20timing%20workflow.md).
Network installation does not itself establish an authenticated SSH connection.

```sh
PERF hosts
PERF ssh tao-bench --cwd /Users/ro -- uname -a
PERF ssh tao-bench --cwd /Users/ro -- mkdir -p /Users/ro/.tao-dev/timing/transfers
PERF copy tao-bench /absolute/controller/snapshot.bundle /Users/ro/.tao-dev/timing/transfers/snapshot.bundle
PERF copy tao-bench /absolute/controller/snapshot.json /Users/ro/.tao-dev/timing/transfers/snapshot.json
PERF copy tao-bench /Users/ro/.tao-dev/timing/transfers/job.log /absolute/controller/job.log --download
```

`hosts` lists literal aliases from the current user's top-level SSH config. It does not expand
SSH Include files or connect to candidates.
Use the actual configured address if an alias comes from an Include file. Discovery does not
establish that a peer is a prepared timing host.

`ssh` uses existing SSH config/authentication and host trust, with batch mode and a bounded
connection timeout. Each remote argv element is quoted independently; no raw shell expression
is needed. `copy` uses modern OpenSSH's default SFTP transport, with no legacy SCP override.
An authentication/trust failure needs ordinary SSH setup by the human; never disable host checking
or add a separate Tao credential to bypass it. An invalid target is not automatically replaced.

On a new runner without this skill, bootstrap through existing SSH: transfer the bundle/manifest,
invoke `git clone --branch performance-snapshot /absolute/snapshot.bundle /absolute/tooling`, seed
required submodule pins, then run `./agent unsandboxed setup` in that tooling clone. The skill
is now available there. Use its `receive` operation for other checkpoints. SSH infrastructure itself
must already be enabled.

Tao setup initializes `.storage`; its pinned commit may be local and unpublished. Before first
setup, transfer that submodule's reachable Git history too. For example, when the controller's
`.storage` HEAD contains the required pin:

```sh
git -C .storage bundle create /absolute/controller/storage.bundle HEAD
PERF copy tao-bench /absolute/controller/storage.bundle /Users/ro/.tao-dev/timing/transfers/storage.bundle
PERF ssh tao-bench --cwd /Users/ro/.tao-dev/timing/checkouts -- git clone /Users/ro/.tao-dev/timing/transfers/storage.bundle /Users/ro/.tao-dev/timing/checkouts/current/.storage
PERF ssh tao-bench --cwd /Users/ro/.tao-dev/timing/checkouts/current -- git submodule init -- .storage
PERF ssh tao-bench --cwd /Users/ro/.tao-dev/timing/checkouts/current/.storage -- git checkout --detach FULL_PINNED_STORAGE_SHA
```

Verify the full pin against the snapshot manifest, and retain the submodule bundle checksum with
the transfer evidence. Repeat for other required submodules. If setup already made a partial
submodule clone, fetch the transferred bundle's `HEAD` into that owned clone instead of cloning
over it, then check out the pin and retry setup. Do not publish archive data, replace pins, relax
Git's file-transport policy globally or alter the controller's submodule to make setup pass.

For access away from home, use the runner's configured private address or DNS name. Configure
the host to remain awake on power. Verify reachability before leaving it unattended.

## Measure, detach and collect

```sh
PERF run --repo /Users/ro/.tao-dev/timing/checkouts/baseline --fixture /Users/ro/.tao-dev/timing/transfers/canonical.tao --label "Your agent or chat name"
PERF run --repo /Users/ro/.tao-dev/timing/checkouts/current --fixture /Users/ro/.tao-dev/timing/transfers/canonical.tao --samples 5 --edits 24 --label "Your agent or chat name"
PERF summarize /absolute/job-one /absolute/job-two
PERF ssh tao-bench --cwd /Users/ro/.tao-dev/timing/checkouts/tooling --detach /Users/ro/.tao-dev/timing/transfers/job.log -- ./agent skill-script agents/skills/performance-investigation/scripts/performance.ts -- run --repo /Users/ro/.tao-dev/timing/checkouts/current --fixture /Users/ro/.tao-dev/timing/transfers/canonical.tao --label "Your agent or chat name"
```

The default is one session per job so the skill can balance checkpoint order across rounds.
`--samples 5` batches five sessions of one checkpoint; use it only when that ordering is intended.
The tooling checkout stays fixed while each job executes the candidate's own preview command.
The runner audits candidate source bytes, symlinks and modes after setup and around each session;
Git's clean status alone is insufficient because content transformations can hide byte differences.
Keep the candidate toolchain/browser versions equal, and record any harness version differences.
Older checkpoints lacking `--fixture` or repeated-edit support are incompatible: do not retry with
silently changed workload semantics. Prepare an explicit, retained instrumentation patch shared
across the compared candidates, or report the gap.

The runner prints a job directory before measurement and writes `job.json` atomically throughout.
It copies every completed sample, the canonical fixture, source identities and selected environment
into the tooling checkout's `.artifacts/notes/performance-investigation/jobs/<id>/`. Completed raw
reports and logs from execution or postvalidation failures are retained with a `failed-` prefix. A terminated process
may leave status `running`; that is interrupted evidence, never a pass.

`--detach` starts a finite `nohup` job and redirects input/output; SSH returning proves launch
dispatch only. Read `job.log` for the printed job directory, then inspect its `job.json` until it
passes or fails. If no job directory appears, inspect the log for an early setup/launch failure.
Use another `ssh` invocation to read status after reconnecting; no Tao daemon or listener is involved.
The session lock is released by the OS when the worker exits. It coordinates only helpers running
as this account, not unrelated builds or another user.

Summaries retain one median per scenario/sample-class per independent process session, and then
report those session medians and their range. They reject incomplete jobs and changed conditions
within a job, truncated workloads and duplicate session identities; the skill must also compare conditions
across jobs. Raw edit counts must not be
presented as independent session counts or as evidence of physical paint.

Retrieve each retained file with `copy --download`; for larger evidence sets, use `ssh` to create
an archive from the explicit job directory and download that archive. Preserve its checksum and
manifest before applying the repository's normal evidence retention workflow.
