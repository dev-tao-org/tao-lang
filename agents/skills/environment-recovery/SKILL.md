---
name: environment-recovery
description: >-
  Recover Tao tooling failures that command output and checkout diagnosis do not resolve. Use for
  missing devenv profiles, wrong Bun or PATH, denied installs, EEXIST, PermissionDenied,
  host-blocked browsers, stray processes, or occupied ports; also when choosing sandboxed versus
  host execution.
---

# Environment Recovery

Every failure here is the toolchain, not the branch; root `AGENTS.md` covers reading a failing
command's own output first. Come here when that is not enough, or when you need the reasoning
behind it.

## The worktree's own path

- Create a worktree at a real path, never one reached through a symlink. `/tmp` resolves to
  `/private/tmp` on macOS and the sandbox sets `$TMPDIR` to the symlink form, so a checkout made
  there is reached by two paths at once: TypeScript resolves imports through both, treats the
  results as different declarations, and `./agent check` fails with types that are not
  assignable to themselves (`Type 'AdvanceStep' is not assignable to type 'AdvanceStep'`) naming no cause.
- `./agent doctor`'s `worktree path` check names it. `git worktree move <given> <real>` fixes it,
  but has no named host operation: report the exact move and ask the Developer before adding one.
  The rule is the symlink, not the location — worktrees under
  `/private/tmp` are fine, and a symlinked home or network mount hits the same failure.

## The devenv profile

- Root CLI entrypoints reuse a prepared devenv profile whose recorded inputs and profile target still match, including a matching primary-checkout profile for worktrees. Cold or changed inputs enter devenv once to prepare it; ordinary reuse does not create new GC roots. Dependency installation stays explicit through `./agent unsandboxed setup`;
  `dev-automation` owns the harness setup entrypoints.
- Linux without devenv can reuse a prepared portable Nix profile; the entrypoint checks its locked
  identity through the tools-only bootstrap. Without either environment, it reports what is missing
  instead of using host tooling.
- Repository commands invoke managed tools by name. Tool-shell exports do not persist between calls,
  so keep nontrivial workflows behind `./agent`, which activates their environment on each invocation.
- Build a missing profile through root `./enter-tao-dev-env.sh` (legacy: `./enter-tao-dev-env`) in a regular terminal. A sandbox denial
  from Nix's daemon socket does not mean the pinned lock is broken.

## Denied installs

- A few npm packages ship `.idea/` and `.gitmodules`, which an agent sandbox protects inside the
  working directory and no setting exempts. A sandboxed install that must write one fails as
  `PermissionDenied: …`, `EEXIST: failed to link package`, or — when the package is new to Bun's
  cache — `failed to download <package>: EPERM`. `./agent` distinguishes these from a denied
  temporary directory and prints the matching recovery; `./agent doctor` reports the broken install
  and the same remediation. Only the tempdir case is resumable. For a protected-path failure, run
  `./agent unsandboxed setup` with harness host approval.
  Do not start `just session-unsandboxed` on your own.
- Never name a Bun install backend to work around this. `--backend=copyfile` writes every packaged
  file through its own path, making `bun install` unrunnable sandboxed rather than fixing it.

## Sandbox or host

- `./agent unsandboxed capabilities` distinguishes a sandbox denial from a missing host tool. Reach for it
  before concluding the host lacks something.
- Opt-in permission profiles launch as harness sessions — see `just --list`'s Sessions group.
  Codex reads the same profiles as `tao-review`, `tao-native`, `tao-local-services`, and
  `tao-release`, defaulting to `tao-workspace`.
- A sandbox denial alone needs no Developer notification or conversational approval. Diagnose from
  the failed command's report and use an existing permitted `./agent unsandboxed` operation when
  the task authorizes the action. Quietly use that route, including its normal harness approval,
  without announcing the denial or host execution.
- If the needed operation has no permitted host route, or the harness refuses that route, explain
  what operation is needed, why it is necessary, and the exact command or narrowly scoped access
  change proposed. Obtain Developer approval before adding access; continue independent work.
  Do not use alternate spellings, a broader host session, or policy changes to bypass a refusal.
- Host access does not authorize the action itself. Preserve separate approval requirements for
  dependencies, destructive operations, publication, landing and visible UI.
- No agent sandbox reaches Watchman's socket, and only the opt-in `tao-local-services` profile
  reaches Docker's, by design: both sockets live under a developer's home directory, which a tracked
  config cannot name. Run file-watching dev loops with
  `./agent unsandboxed app-dev`, `test-watch`, `studio`, or `studio-native`, and the local InstantDB stack with
  `./agent unsandboxed local-instantdb start` or `stop`. A denied Watchman socket in a sandbox is
  expected; sandboxed tests and builds crawl the tree without it.
- The browser and native UI lanes cannot run inside the managed Bash sandbox. Use
  `./agent unsandboxed studio-smoke` or `./agent unsandboxed studio-proof-real-app`; if the host
  blocks Chrome there, rerun only with explicit review, and never reuse an existing browser profile.

## Processes and ports

- Inspect all processes with `./agent unsandboxed processes list`, one process's start time with
  `./agent unsandboxed processes started <pid>`, and one listening port with sandboxed
  `lsof -nP -iTCP:<port> -sTCP:LISTEN -t`. Other process probes need the Developer's
  approval, and every signal stays under review since a prefix cannot validate a PID.
- Repository code reads process facts through `ProcessTree`, never through `ps`. On macOS it uses
  libproc with no subprocess, so a sandbox denial cannot silently degrade its PID-reuse protection.
- After review, confirm the PID belongs to the intended task. Send `kill -TERM <pid>` first and
  use `kill -KILL <pid>` only when the process survives graceful shutdown.
- Studio has its own lifecycle commands — `./dev studio-ps`, `./dev studio-stop`,
  `./dev studio-doctor` — and they are the right tool for a stray Studio process.
