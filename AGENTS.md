# Tao

Tao is a programming language for building apps.

- `./ts` holds the typescript implementation.
- Keep workspace `package.json` and TypeScript configuration in `ts/` or `old-tao-v1/`, not the repository root.
- A PoC implementation exists in `./old-tao-v1`.
  - Use the PoC for reference, but don't copy code wholesale.
  - When reimplementing existing functionality, preserve its behavior by default unless the developer requests a change.
  - Keep the previous implementation as reference. Except for fixes necessary to keep that reference working, discuss changes to `old-tao-v1/` with the developer during planning. If a necessary change is discovered during implementation, make the minimal change, then disclose it at completion and ask whether it was acceptable or should be tackled differently.

## Agent usage

These are your rules of usage:

- Agents can use trivial shell commands: `cd, ls, pwd, mkdir, rm, cp, mv, git`, etc
- ALL non-trivial agent commands MUST use `./agent`: `./agent <CMD> <subcommands> <args> <option flags>`
  - Agent-only commands live in `ts/CLIs/CLIs-src/agent-cli/*`
  - Agent commands shared with the developer are imported from the Dev CLI
  - Developer-used commands live in `ts/CLIs/CLIs-src/dev-cli/*`
- Agents NEVER use `python`, `bun` etc directly
- Root formatting, fixing, checking, testing, verification and cleanup commands operate on the new implementation. Run legacy workflows from `old-tao-v1/`; agents check or test the legacy implementation only when its files have changed.

## Dependencies and feature planning

- Determine during planning whether new or updated dependencies are needed.
- Ask the developer before installing or updating dependencies, including manifest or lockfile changes. Prefer asking during planning; ask mid-implementation when a newly discovered library is necessary or useful. After approval, agents may perform the approved installs and updates; existing approval applies within its stated scope.
- When planning features, use a subagent to research open-source libraries through the library-research workflow in `agents/skills/delegation/SKILL.md`.

## Decisions and communication

- Resolve questions needing developer input during planning. For a decision discovered during implementation, use best judgment and continue; at completion, state the assumption and ask whether it should change.
- During implementation, ask immediately if a decision is essential or would substantially split the implementation. Continue independent work while awaiting a reply; after three minutes without a response, proceed with best judgment and report the choice at completion. This fallback does not replace explicit approval required for dependencies, destructive actions, publication, landing, or other permission-gated operations.
- Default to concise executive summaries: give the outcome and material implications at a high level. Omit routine implementation details and activity recaps unless requested; surface important deviations, assumptions, risks, and decisions that need follow-up.
- Track every developer request, including requests arriving during implementation, in the task checkpoint across interruptions and compaction. Keep each pending until addressed; a superseded or irrelevant request may be marked complete with the reason. Reconcile the checklist before finishing or handing off so no request is dropped.

## Your mission

Your mission is to follow the developer's instructions to implement the Tao MVP in pieces, following this process:

- Stub-plan-code:
  - The developer describes the PoC functionality to implement;
  - The developer may have provided new code stubs for you to fill out;
  - You create a plan together in dialogue mode (see skill);
    - Agree on the plan and any review points with the developer before implementation.
  - You write tests and implement the plan with TDD;
    - The majority of repo test should be in e2e Tao tests.
    - Keep package tests to basic functionality and regression tests.
    - Implement one functional piece at a time; handle newly discovered decisions using the policy above.
  - You review the code for repo conformance;
  - After completing an implementation slice, run `./agent verify` and resolve relevant failures before reporting the slice complete.
  - The developer reviews the code and provides feedback;
  - You make changes, and land the code.

## Rules

Implementation rules:

- General rules:
  - ALWAYS follow existing code style and conventions from files in the same folder.
  - ALWAYS propose new folder structures before creating new folders.
- TS:
  - Non-JSDoc comments use `//` lines, including multiline comment blocks; reserve `/** ... */` for JSDoc and do not use `/* ... */` comments.
  - Use `Try` from `@shared` for exception handling, including async recovery and cleanup; native try/catch belongs only in the `TryCatch.ts` primitive.
  - Raise failures through the capitalized `Errors.ThrowX` helpers (or `Errors.Throw` to rethrow/normalize), rather than throwing imported error classes. Test fixtures may throw raw values to exercise failure boundaries.
  - JSDoc:
    - Exported values are commented on a single line: `/** <Exported name> <verb> <description> */\nexport <Exported name>...`
    - When needed, multiple lines are used with a space indentation: `/** <Exported name> ...\n Lorem ipsum\nDolor sit */\nexport ...`
- Scripts:
  - All common user actions live in `Justfile`
  - All Justfile recipes call a single complete `./dev ...` command; the Dev CLI owns every workflow step. Document justified exceptions beside the recipe.
  - ALL scripts are written
- Git workflow:
  - Before committing, run `./agent fix` or `./agent fmt` (the `j fix` / `j fmt` workflows).
  - Always create a new feature branch for your new worktree.
  - Make commits as you implement parts. Tests don't HAVE to be passing part-way commits.

## Guidelines

These are your guidelines to always keep in mind and follow:

- The repo values CONSISTENCY, EFFICIENCY and REUSABILITY:
  - When you spot inconconsistencies, inefficiencies and opportunities for improvement, note them with a proposed fix.
  - Proposed fixes go in `

## Implementation architecture

- `old-tao-v1/` implements the previous PoC implementation.
- `ts/@workspace` implements an "active workspace".
  - It manages an opened tao project: its files, background processes, build system, etc.
  - It performs workspace actions: monitors file changes, formats code, runs tests, builds and launches apps, builds and reloads view previews, etc.
- `ts/@parser` implements the parser.
  - Treesitter is used for file parsing.
- `ts/@tooling` implement tao tooling commands: `fix`, `test`, `run`, etc
- `ts/@compiler`
- `Apps/` implements repo tao app, and tao apps used for e2e testing.
  - `Apps/Tao Studio/Tao Studio.tao` implements the tao studio desktop app.
  - `Apps/Studio Companion/Studio Companion.tao` implements the studio phone/tablet companion app.
  - `Apps/Test Apps/*` implements the e2e test apps.
    - We use few test apps, to minimize compilation time during e2e testing.
- `Docs/` contains the repo roadmap and documentation.
- TBC ...
