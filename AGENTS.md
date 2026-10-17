# Tao

Tao is a programming language for building apps.

- `./ts` holds the typescript implementation.
- A PoC implementation exists in `./.x-tao-old-v1`.
  - Use the PoC for reference, but don't copy code wholesale.
  - When reimplementing existing functionality, preserve its behavior by default unless the developer requests a change.
  - Port reimplemented functionality into the new implementation with its own dependencies and tools; never import or execute old implementation code, or borrow its dependencies or executables, to implement a port.
  - Keep the previous implementation as reference. Except for fixes necessary to keep that reference working, discuss changes to `.x-tao-old-v1/` with the developer during planning. If a necessary change is discovered during implementation, make the minimal change, then disclose it at completion and ask whether it was acceptable or should be tackled differently.

## Agent usage

These are your rules of usage:

- By default, interpret questions and perform planning, implementation, investigation, and validation against the new implementation outside `.x-tao-old-v1/`. Use the old implementation only for purposes explicitly authorized by applicable rules or instructions, or specifically requested by the developer.
- Agents can use trivial shell commands: `cd, ls, pwd, mkdir, rm, cp, mv, git`, etc
- ALL non-trivial agent commands MUST use `./agent`: `./agent <CMD> <subcommands> <args> <option flags>`
  - Agent-only commands live in `ts/CLIs/CLIs-src/agent-cli/*`
  - Agent commands shared with the developer are imported from the Dev CLI
  - Developer-used commands live in `ts/CLIs/CLIs-src/dev-cli/*`
- Agents NEVER use `python`, `bun` etc directly
- `./agent` logs by default; use `TERMINAL_OUTPUT=1 ./agent ...` for terminal output (`0` selects logs). Stderr remains visible.
- CLI entrypoints activate the checkout's pinned devenv (or prepared portable Linux profile); dependency installation remains explicit through `./agent setup`.
- Keep equivalent native agent settings synchronized across Codex, Claude Code and Cursor in the same change; `agent-instructions` owns their file locations and unsupported equivalents.
- Host execution uses `./agent unsandboxed <operation>` with `.config/agent-host-commands.json`; the harness must grant host access.
- Root formatting, fixing, checking, testing, verification and cleanup commands operate on the new implementation. Run legacy workflows from `.x-tao-old-v1/`; agents check or test the legacy implementation only when its files have changed.

## Dependencies and feature planning

- Determine during planning whether new or updated dependencies are needed.
- Ask the developer before installing or updating dependencies, including manifest or lockfile changes. Prefer asking during planning; ask mid-implementation when a newly discovered library is necessary or useful. After approval, agents may perform the approved installs and updates; existing approval applies within its stated scope.
- When planning features, use a subagent to research open-source libraries through the library-research workflow in `agents/skills/delegation/SKILL.md`.

## Decisions and communication

- Resolve questions needing developer input during planning. For a decision discovered during implementation, use best judgment and continue; at completion, state the assumption and ask whether it should change.
- During implementation, ask immediately if a decision is essential or would substantially split the implementation. Continue independent work while awaiting a reply; after three minutes without a response, proceed with best judgment and report the choice at completion. This fallback does not replace explicit approval required for dependencies, destructive actions, publication, landing, or other permission-gated operations.
- Default to concise executive summaries: give the outcome and material implications at a high level. Omit routine implementation details and activity recaps unless requested; surface important deviations, assumptions, risks, and decisions that need follow-up.
- Track every developer request, including requests arriving during implementation, in the task checkpoint across interruptions and compaction. Keep each pending until addressed; a superseded or irrelevant request may be marked complete with the reason. Reconcile the checklist before finishing or handing off so no request is dropped.
- Write useful observations in `Docs/Agent Notes/` (environment issues in `Dev Env Issues.md`). These notes are never authoritative; keep investigation logs out of roadmaps.

## Your mission

Your mission is to follow the developer's instructions to implement the Tao MVP in pieces, following this process:

- Stub-plan-code:
  - The developer describes the PoC functionality to implement;
  - The developer may have provided new code stubs for you to fill out;
  - You create a plan together in dialogue mode (see skill);
    - Agree on the plan and any review points with the developer before implementation.
  - You write tests and implement the plan with TDD;
    - Write only enough tests to prove the main functionality; avoid exhaustive testing. Add regression tests when new changes break existing behavior.
    - The majority of repo test should be in e2e Tao tests.
    - Keep package tests to basic functionality and regression tests.
    - Implement one functional piece at a time; handle newly discovered decisions using the policy above.
  - Run code reviews, including subagent reviews, only when explicitly requested by the developer;
  - After each implementation chunk, run `./agent fmt`.
  - After heavy testing and at completed-work checkpoints, periodically run `./agent clean --partial`. It retains 24 hours of successful output, all failures, active or unclassified artifacts, caches, and task notes; clean only after needed diagnostics have been inspected.
  - After completing an implementation slice, run `./agent verify` and resolve relevant failures before reporting the slice complete.
  - The developer reviews the code and provides feedback;
  - You make changes, and land the code.

## Conformity and style

- `check` enforces types, unused locals/parameters, dead exports/files, formatting (two spaces), and source rules.
- Source rules:
  - Exported APIs need name-led JSDoc; public shape members may have it, private code may not.
  - Other comments use `//`.
  - Multiline JSDoc: `/** <NAME> <VERB> ...`, aligned ` *  <text>`, and text-ending ` */`.
  - Use `Try`; native exception handling belongs only in `universal/TryCatch.ts`.
  - Multiline strings use indented `S` templates with aligned closing backticks.
  - Builtins/platform globals belong in `ts/shared/shared-src/os/`, accessed via `@shared/os`; portable clocks/timers belong in universal `Time`.
  - Function bodies: at most 45 physical interior lines, including comments and blanks.
  - Handwritten TypeScript files: 250-line soft limit, 350-line hard limit; generated and whole-file third-party sources are excluded. Mark imported whole files with `@third-party` source provenance.
  - Object functions use method syntax: `async encrypt(...) { ... }`.
- Review:
  - Put all exports immediately after imports, before private definitions.
  - Follow nearby conventions; seek DRY, efficient shared behavior. Extract conditions with three or more checks into named predicates; extract unclear two-check conditions too.
  - Extract runs of lines whose purpose is hard to parse into functions named for the operation they perform, even when below the line limit.
  - Within private code, organize definitions loosely in reading order. Put helpers after their sole caller or, when shared, after their last caller; group sibling helpers and their own helpers while preserving initialization order.
  - Tests must not mutate developer state outside the repository, including global configuration or authentication. Remove tests that perform such changes.
  - Test Tao-owned behavior, not whether external tools, dependencies or OS primitives work; remove pass-through tests and use small recording fixtures for external execution needed to prove our logic. Keep test files in a sibling `<subject>-test/` folder.
  - Raise failures with capitalized `Errors.ThrowX` / `Errors.Throw`; raw throws belong only in error primitives and failure-boundary test fixtures.
  - Keep workspace manifests and TypeScript configs under `ts/` or `.x-tao-old-v1/`; propose new folder structures before creating them.
  - CLI commands use Commander, `commands/<command-name>.ts`, top-level registration imports and `export default registerCommand({ name, description, arguments, action })`. Inline actions unless too long; the agent CLI reuses dev commands.
  - Invoke managed tools by name (`bun`, `tsc`, etc.) through the environment PATH instead of embedding runtime, store or dependency-bin paths.
  - Prefer space-separated strings for `runCommand`, appending forwarded arguments through `variadicArgs` as the first options field; use command arrays only when needed to preserve spaces in the base command's arguments.
  - Expose static validation through `check`; keep its individual type, comment and style checks internal.
  - The global CLI fatal handler prints uncaught failures and uses the command error status when present, otherwise 1; no new implementation code assigns `process.exitCode`. Actions and workflow steps return void and propagate failures. Use variadic `runSteps`.
  - Output uses `IO.print`, yellow `IO.warn`, or red `IO.printToStdErr`. Reserve error output for flows near process exit; prefer throwing failures or warning otherwise.
  - Human command progress always appears in gray on stderr; agent progress follows its configured output mode.
  - Common developer actions live in Justfile; include only developer-selected recipes. Each calls one complete `./dev` command owning every step; document justified exceptions beside the recipe.

## Git workflow

- Land only when explicitly instructed by the developer. A pause or stop revokes authorization until explicitly renewed.
- Before committing, run `./agent fix` or `./agent fmt` (the `j fix` / `j fmt` workflows).
- Always create a new feature branch for your new worktree.
- Make commits as you implement parts. Tests don't HAVE to be passing part-way commits.

## Implementation architecture

- `ts/` owns the independent TypeScript workspace, dependencies, lockfile and compiler configuration.
- `ts/CLIs/CLIs-src/dev-cli/` owns developer commands; `agent-cli/` adds agent-only commands and imports shared dev commands. Root `dev` and `agent` are thin environment-aware launchers.
- `ts/CLIs/CLIs-src/cli-kit/` provides command execution, configured output, fatal handling, secrets and host dispatch. `cli-checks/` owns diagnostics, validation, source rules and test timing reports.
- `ts/shared/shared-src/universal/` provides portable errors, Try, strings, time and type-safe switching. `os/`, exported through `@shared/os`, owns platform operations, repository roots and artifacts.
- Tests live in sibling `*-test/` folders. `ts/scripts/` holds tool configuration such as Knip.
- `.config/` owns tool/bootstrap configuration and the local InstantDB Compose file. Root `devenv.*` defines the pinned environment; `.envrc` activates it through direnv, with `enter-tao-dev-env.sh` as the explicit alternative.
- `agents/`, `.rulesync/`, and native harness directories own agent guidance and configuration. `.secrets/` contains encrypted secrets; `.storage/` is the QA archive submodule.
- `.artifacts/` holds generated output, logs, caches and temporary state; the PoC links to it. Its separate environment state lives under `.devenv/.x-tao-old-v1/`.
- `.x-tao-old-v1/` retains the reference language, compiler, runtimes and apps, including Studio, Companion and test apps.
- `Docs/` contains the active roadmap and documentation; `Docs/Agent Notes/` contains non-authoritative working notes.
- The new parser, CST-to-AST transformer, compiler, Expo runtime and first Tao app belong to Goal 2. Agree on their folders during planning; they are not implemented yet.
