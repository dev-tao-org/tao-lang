# Restricted launches

## Choose access for the work

- The caller chooses the narrowest supported profile that covers the authorized task. Use
  `tao-workspace` for implementation and `tao-review` or an enforced read-only equivalent for
  read-only workers. Ordinary workspace writes, including Codex **Approve for me**, are an
  acceptable implementation fallback. Other harnesses use their restricted equivalents.
- Use `tao-native` for repeated Simulator or Xcode access, `tao-local-services` for the local
  Docker-backed stack, and `tao-release` for an authorized local archive. Select these for the
  stated task without asking again. A profile grants technical access and does not authorize
  release, credential use, or visible app control. Follow `quiet-ui-workflows` for app control.
- Keep one-off host operations in the restricted session. Use the named `./agent unsandboxed`
  operation and the harness's command-scoped approval path. Full access requires a concrete need
  and explicit Developer approval before selecting it.

## Before creation

- Unless the Developer explicitly approved Full access for this launch, establish restricted
  startup through the tool's permission selector or a verified restricted destination default.
  Worktree environment setup and `SessionStart` hooks can run before the worker sees its brief.
  If the mode is unknown before creation, launch only the preflight and only after verifying that
  startup commands that write or need host access are disabled or deferred. Use a different
  restricted route if these conditions cannot be met. Do not launch under known, unapproved Full
  access.
- Reviews and other read-only assignments require enforced read-only access from launch and no
  mutating startup steps. If a visible chat tool cannot establish that boundary, use an enforced
  read-only subagent. If a visible chat is required and no such route is available, report it.
- State the required capabilities and acceptable fallback in the brief. Require an exact
  profile name only when the Developer requires it.

## Worker preflight

- Verify the effective sandbox, isolated worktree and agreed starting commit before edits or host
  operations. Prompt text, committed config and the caller's mode do not establish the worker's
  effective permissions. A worker with ordinary workspace writes may establish its own branch and
  begin implementation. For missing capabilities, use existing scoped host routes or continue
  independent work while reporting the exact operation that is blocked. A different profile name
  alone is not a reason to stop.
- If the effective mode cannot be verified, a required profile or access restriction is missing,
  or a worker has unapproved full access, stop after preflight or at the next safe boundary if
  already running. Report the boundary and use a verified configuration before resuming.
