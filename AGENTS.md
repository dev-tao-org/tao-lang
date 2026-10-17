# Tao

Tao is a programming language for building apps.

- `./ts` holds the typescript implementation.
- Keep workspace `package.json` and TypeScript configuration in `ts/` or `old-tao-v1/`, not the repository root.
- A PoC implementation exists in `./old-tao-v1`.
  - Use the PoC for reference, but don't copy code wholesale.

## Agent usage

These are your rules of usage:

- Agents can use trivial shell commands: `cd, ls, pwd, mkdir, rm, cp, mv, git`, etc
- ALL non-trivial agent commands MUST use `./agent`: `./agent <CMD> <subcommands> <args> <option flags>`
  - Agent-only commands live in `ts/CLIs/CLIs-src/agent-cli/*`
  - Agent commands shared with the developer are imported from the Dev CLI
  - Developer-used commands live in `ts/CLIs/CLIs-src/dev-cli/*`
- Agents NEVER use `python`, `bun` etc directly

## Your mission

Your mission is to follow the developer's instructions to implement the Tao MVP in pieces, following this process:

- Stub-plan-code:
  - The developer describes the PoC functionality to implement;
  - The developer may have provided new code stubs for you to fill out;
  - You create a plan together in dialogue mode (see skill);
    - When done, you propose a plan with N steps, each of which will be reviewed by the developer before you proceed to the next step.
  - You write tests and implement the plan with TDD;
    - The majority of repo test should be in e2e Tao tests.
    - Keep package tests to basic functionality and regression tests.
    - Unless told not to, you should implement one functional piece at a time, and ask for review before proceeding.
  - You review the code for repo conformance;
  - The developer reviews the code and provides feedback;
  - You make changes, and land the code.

## Rules

Implementation rules:

- General rules:
  - ALWAYS follow existing code style and conventions from files in the same folder.
  - ALWAYS propose new folder structures before creating new folders.
- TS:
  - JSDoc:
    - Exported values are commented on a single line: `/** <Exported name> <verb> <description> */\nexport <Exported name>...`
    - When needed, multiple lines are used with a space indentation: `/** <Exported name> ...\n Lorem ipsum\nDolor sit */\nexport ...`
- Scripts:
  - All common user actions live in `Justfile`
  - Dev CLI commands perform every required workflow step themselves; Justfile dev recipes call one complete command.
  - ALL scripts are written

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
