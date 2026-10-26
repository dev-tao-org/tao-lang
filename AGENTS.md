# Tao

Tao is a programming language for building apps.

- `./ts` holds the typescript implementation.
- A PoC implementation exists in `./.x-tao-old-v1`.
  - When planning or implementing language syntax and functionality, consult the old implementation as the specification for syntax and behavior unless a departure has been agreed with the developer. Do not copy code wholesale.
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
- `./agent` logs full output by default and prints concise results plus warning/error notices. `TERMINAL_OUTPUT=1` also streams full output to the terminal.
- CLI entrypoints activate the checkout's pinned devenv (or prepared portable Linux profile); dependency installation remains explicit through `./agent setup`.
- Keep equivalent native agent settings synchronized across Codex, Claude Code and Cursor in the same change; `agent-instructions` owns their file locations and unsupported equivalents.
- Host execution uses `./agent unsandboxed <operation>` with `.config/agent-host-commands.json`; the harness must grant host access.
- Root formatting, fixing, checking, testing, verification and cleanup commands operate on the new implementation. Run legacy workflows from `.x-tao-old-v1/`; agents check or test the legacy implementation only when its files have changed.

## Dependencies and feature planning

- Determine during planning whether new or updated dependencies are needed.
- Ask the developer before installing, adding or updating dependencies, including manifest or lockfile changes. Removing dependencies and updating the corresponding manifests and lockfiles does not require approval. Prefer asking during planning; ask mid-implementation when a newly discovered library is necessary or useful. After approval, agents may perform the approved installs and updates; existing approval applies within its stated scope.
- When planning features, use a subagent to research open-source libraries through the library-research workflow in `agents/skills/delegation/SKILL.md`.
- Use `pipeline-performance` for every change touching the current or future preview-refresh hot path.
- Consider Windows, Linux, macOS, iOS and Android as eventual runtime targets when developing and choosing dependencies: Studio and CLI target at least Windows/Linux/macOS, Companion targets iOS/Android, and standalone Studio-like authoring on iPad remains a future possibility. Keep platform-specific assumptions behind explicit boundaries; this does not require implementing every target in each slice.
- Keep CLI/Studio file access sandbox-compatible by default: use user-authorized project directories and platform-provided app cache, support or container directories. If access outside that boundary would materially simplify implementation, surface the benefit and sandbox/distribution tradeoff rather than silently assuming access; preserve native permission flows.

## Decisions and communication

- Resolve questions needing developer input during planning. For a decision discovered during implementation, use best judgment and continue; at completion, state the assumption and ask whether it should change.
- During implementation, ask immediately if a decision is essential or would substantially split the implementation. Continue independent work while awaiting a reply; after three minutes without a response, proceed with best judgment and report the choice at completion. This fallback does not replace explicit approval required for dependencies, destructive actions, publication, landing, or other permission-gated operations.
- Default to brief answers: give the outcome and material implications, then let the developer ask for more detail. Avoid exhaustive inventories, extended examples and implementation recaps unless requested; surface important deviations, assumptions, risks and decisions that need follow-up.
- Treat consecutive developer messages as cumulative: later messages do not replace, cancel or silently deprioritize unanswered questions or requests in earlier messages. Address every pending question and request as if no follow-up had arrived, incorporating any later clarification. Only an explicit cancellation or replacement supersedes earlier work.
- Track every developer question and request, including those arriving during a response or implementation, in the task checkpoint across interruptions and compaction. Before finishing a turn or handing off, reconcile all messages and answer or explicitly retain every pending item; never answer only the latest message while dropping earlier ones.
- Keep working notes, investigation logs, checkpoints and progress records under `.artifacts/notes/`, `.artifacts/checkpoint/` or `.artifacts/progress/`. Normal and partial cleanup retain these paths; only `clean --full` removes them.
- During development, briefly tell the developer when an environment complication is discovered. Retain every complication left unresolved in task-local `.artifacts` notes or the checkpoint across interruptions and compaction; record its impact, workaround and open/resolved status. A workaround alone does not resolve the underlying issue.
- Track meaningful environment friction, including missing helpful tooling, slow or unreliable setup, poor diagnostics, redundant verification without useful caching or test selection, concurrent-work interference, unnecessary permission requests and unavailable actions that reasonably ought to be available. Assess permission friction against actual risk and required developer judgment; recording it does not relax approval or verification requirements.
- When asked about issues encountered, give a concise executive report from the task's complication record. When asked what remains or whether work is ready to land or archive, also surface every unresolved complication, distinguishing blockers from follow-up improvements.
- Keep `Docs/Specification/` aligned with Tao language behavior as implementations change; its `AGENTS.md` owns scope and writing style. Repository tooling and contributor workflows belong in [Docs/Dev Env](Docs/Dev%20Env/README.md). Update other repository documents only when the developer instructs you to do so; keep observations and progress in `.artifacts`.

## Your mission

Your mission is to follow the developer's instructions to implement the Tao MVP in pieces, following this process:

- Stub-plan-code:
  - The developer describes the PoC functionality to implement;
  - The developer may have provided new code stubs for you to fill out;
  - You create a plan together in dialogue mode (see skill);
    - During discussion or planning, never begin implementation until the developer explicitly agrees to go ahead with the plan and any review points. This includes creating stubs, moving folders and editing implementation files. Agreement on individual design choices, requests describing the proposed result, and unanswered questions do not authorize implementation.
  - You write tests and implement the plan with journey-first TDD;
    - Keep `Apps/Dev/Kitchen Sink/Kitchen Sink.tao` runnable and demonstrating every implemented language feature; update it whenever language functionality is added or changed.
    - For valid observable language/app behavior, first add or extend authored Tao and a failing end-to-end journey, then implement the behavior. Use `test-quality` to choose the primary proof before adding tests at other layers.
    - Avoid exhaustive package testing. Package tests need a distinct essential basic contract, demonstrated regression or important edge not already credibly asserted end to end; `ts/AGENTS.md` owns eligibility and cost rules. Do not add a test for every helper, method or implementation layer.
    - Fast overlapping end-to-end journeys are acceptable. Retire redundant package proofs instead of consolidating journeys merely to remove overlap.
    - Prefer larger formatting fixtures exercising multiple rules over a separate test for each formatting detail.
    - Run every new test directly before finishing implementation; also run relevant existing tests when the change may affect broader behavior. If parallel agents cause failures outside your owned work, report and coordinate them without repairing their changes yourself.
    - Implement one functional piece at a time; handle newly discovered decisions using the policy above.
  - Never launch reviews unless explicitly instructed by the developer. This includes correctness, style, conformance, file-layout and organizational-health reviews, checkpoint reviews and review follow-ups. Use `code-review` only within the requested scope; implementing, committing or landing does not authorize a review;
  - After each implementation chunk, run `./agent fmt`.
  - After heavy testing and at completed-work checkpoints, periodically run `./agent clean --partial`. It retains 24 hours of successful output, all failures, active or unclassified artifacts, caches, and task notes; clean only after needed diagnostics have been inspected.
  - After completing an implementation slice, run `./agent verify` and resolve relevant failures before reporting the slice complete. Instruction-only changes require `./agent check`, without rerunning application tests; `verification-lanes` owns selection and reuse of unchanged validation evidence.
  - The developer reviews the code and provides feedback;
  - You make changes, and land the code.

## Implementation policy

- Never preserve backward compatibility. Tao rolls forward only: update affected implementations, callers, formats, fixtures and documentation together. Do not add legacy readers, migration branches, compatibility shims or fallbacks for superseded assumptions.
- For a large breaking rewrite, coordinate exclusive ownership by one agent with the developer instead of maintaining old and new designs in parallel. Rebuild incompatible generated state explicitly; do not silently discard authored data or re-resolve durable dependency pins.

## Conformity and style

- `check` enforces types, unused locals/parameters, dead exports/files, formatting (two spaces), and source rules.
- Source rules:
  - Exported APIs need name-led JSDoc; public shape members may have it, private code may not.
  - Other comments use `//`.
  - Multiline JSDoc: `/** <NAME> <VERB> ...`, aligned ` *  <text>`, and text-ending ` */`.
  - Use `Try`; native exception handling belongs only in `universal/TryCatch.ts`.
  - Timing entry points use `Timings.createTopLevelTimer`; orchestration uses `Timings.measure`, leaves use `Timings.measured`, and nested operations run through `timings.run`. Only `Timings.ts` constructs collectors or configures their default clocks; callers never use `new Timings()`.
  - Use `Switch(...)` or `Switch.*` from `@shared` for switch dispatch; never use native `switch` statements.
  - Keep import declarations on one formatted line. Keep short named imports; when a named list would wrap, prefer one namespace import and qualify values and types through it. Prefer module namespaces over exported aggregate objects or defaults created only for this style; generated and whole-file third-party source are outside this rule.
  - Multiline strings use indented `S` templates with aligned closing backticks.
  - Builtins/platform globals belong in `ts/shared/shared-src/os/`, accessed via `@shared/os`; portable clocks/timers belong in universal `Time`.
  - Function bodies: at most 45 physical interior lines, including comments and blanks.
  - Handwritten TypeScript files: 250-line soft limit, 350-line hard limit; generated and whole-file third-party sources are excluded. Mark imported whole files with `@third-party` source provenance.
  - Never name handwritten files `index.ts`. Name directory entrypoints after their parent folder, such as `incremental-review/incremental-review.ts`.
  - Object functions with only a returned expression use expression-bodied arrow properties: `Name: name => value`. Other object functions use method syntax; retain methods when arrows would change `this`, `arguments`, `super` or generator behavior.
- Review:
  - Name functions, methods and callable variables or parameters with verbs or verb phrases, such as `resolveModuleIndex`. Retain noun names only for a clear convention or contract, such as same-named type constructors, React components, property getters or required external API names.
  - Name variables and fields for the value they hold: use `aliasesScope` for a scope, `declarationKey` for an encoded key and `modulesDirectory` for a directory. Do not use collection names for scopes, handles or encodings; retain concise domain names when their meaning is clear.
  - Never nest or chain ternary expressions. Keep a single simple conditional expression inline; move multi-branch decisions into a named function with explicit conditions and returns.
  - Access React, React Native and Preact through their `Bridge-React.ts`, `Bridge-ReactNative.ts` and `Bridge-Preact.ts` modules using default namespace imports; keep direct library imports inside the bridges. Preserve external compatibility probes when their contract requires direct peer-library resolution.
  - Nontrivial `if` / `else if` chains must account for unmatched input: use a final `else` explaining intentional no action, or fail explicitly when that state is impossible. Preserve concise guard clauses and exhaustive dispatch instead of adding redundant branches.
  - Put all exports immediately after imports, before private definitions.
  - Follow nearby conventions only when they comply with applicable specific rules. Specific rules always override consistency with existing code; never copy a violating pattern to match its surroundings.
  - Writers and reviewers keep a task-local tally of encountered instruction violations and inconsistent implementations of equivalent behavior, grouped by rule or pattern with counts, representative locations and resolution status. At natural checkpoints, report the remaining tally and propose focused improvements; distinguish required corrections from optional alignment, and preserve the authorized scope.
  - Seek DRY, efficient shared behavior. Extract conditions with three or more checks into named predicates; extract unclear two-check conditions too.
  - Extract repeated behavior with matching semantics, domain policies and calculations with independently meaningful steps into specifically named functions, even below the line limit. Search related code for shared suboperations; preserve meaningful differences. Keep short, single-use transformations local when extraction adds navigation without improving understanding.
  - Give magic strings and special values, including delimiters and sentinels, domain-named constants at their owning boundary. Reuse that owner instead of repeating literals; retain literal syntax where it is itself the contract, such as grammar rules and independent test expectations.
  - Put context conversions and option overlays in specifically named functions; callers pass typed records instead of constructing spread-and-override objects inline. Preserve override order and shared references when extracting them.
  - Extract nontrivial stages of chained invocations into operation-named functions. Replace repeated multi-level navigation through domain records with typed, domain-named helpers; keep obvious one-off property reads inline.
  - Keep domain data as typed records through internal operations; let helpers receive the relevant node or record and extract their own fields. Keep delimiter strings and positional encodings at representation boundaries such as canonical ordering, storage, protocols and generated code, rather than packing and unpacking them between internal callers.
  - For repeated meaningful domain-record construction, use a same-named, expression-bodied constructor that assigns typed fields only. Keep policy, branching, defaults and validation in callers or factories; preserve optional-property absence, enumerable keys, field order and shared references when they are contractual. Skip one-off config/test literals and generated or external shapes.
  - Before a call or result object, name nontrivial argument and field calculations with purpose-specific local constants. Keep obvious literals and property reads inline; use a named function when the calculation owns reusable behavior or policy, and a compact example when concrete values alone make it clear.
  - When concrete values clarify an otherwise opaque transformation, add one short `// ex: input -> output` comment immediately above it. Use ` | ex: input -> output` for a second example only when it explains a useful boundary. Shorten incidental values with `X`, `Foo` or `...`, preserving the syntax, character case and edge behavior being illustrated; omit unnecessary quotes and avoid long lines. Do not annotate obvious operations or repeat an example at every caller. Whole-API examples belong in existing exported JSDoc as `ex:`; expression examples stay beside the expression.
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

- Before declaring a branch finished or ready for landing/merge handoff, or retiring its worktree/task, complete `git-workflow`'s branch-evidence preservation workflow; do not defer evidence retention to landing or the receiving agent.

- Change Git state only when the developer instructs the agent to perform that action. Editing or reviewing code does not by itself authorize staging, unstaging, committing, switching or moving branches, merging, rebasing, stashing, resetting, or restoring files; preserve the developer's index and worktree selections.
- Before launching a subagent from a branch with relevant uncommitted changes, warn the developer which changes its baseline would omit and establish the intended snapshot. Never automatically stage, commit, stash or copy those changes to prepare a handoff.
- Land only when explicitly instructed by the developer. A pause or stop revokes authorization until explicitly renewed.
- Before committing, run `./agent fix` or `./agent fmt` (the `j fix` / `j fmt` workflows).
- When the developer authorizes creating a worktree, create a new feature branch for it.
- Commit only when instructed by the developer. Before an authorized commit, complete the verification required for its change type above; reuse passing evidence when its inputs have not changed. For a deliberately intermediate implementation state, state the reason and any known failures in the commit and task checkpoint.
- Back up committed work to `origin` after meaningful implementation chunks, rather than after every commit; `git-workflow` owns backup pushes and keeping them from triggering CI unless requested.
- Retain one preview-performance record per implementation commit through `pipeline-performance`; its history workflow also owns archive publication before authorized landing.
- Always compare preview performance from the branch's starting baseline to its final implementation before landing. Use `pipeline-performance` for comparisons and promptly flagging significant changes during development.

## Implementation architecture

- `ts/` owns the independent TypeScript workspace, dependencies, lockfile and compiler configuration.
- `ts/CLIs/CLIs-src/tao-cli/` owns project commands; `dev-cli/` owns developer commands; `agent-cli/` adds agent-only commands and imports shared dev commands. Root `tao`, `dev` and `agent` are thin environment-aware launchers.
- `ts/CLIs/CLIs-src/cli-kit/` provides command execution, configured output, fatal handling, secrets and host dispatch. `cli-checks/` owns diagnostics, validation, source rules and test timing reports.
- `ts/shared/shared-src/universal/` provides portable errors, Try, strings, time and type-safe switching. `os/`, exported through `@shared/os`, owns platform operations, repository roots and artifacts.
- `ts/0-workspace/workspace-src/` owns projects, sessions, dependency preparation, sidecars and workspace publication. `ts/1-grammar/grammar-src/` owns the Tree-sitter grammar, native binding and CST parser. `ts/2-ast-gen/ast-gen-src/` owns CST-to-AST transformation. `ts/3-typecheck/` owns linking and current validation; `ts/4-fix/` owns formatting and fixing; `ts/5-check/` reserves the following check stage. `ts/6-compile/` owns AST-to-code generation; its `AGENTS.md` owns the compiler/runtime boundary. `ts/7-runtime/runtime-src/` owns the handwritten app runtime. `ts/stdlib/` owns the bundled Tao project. `ts/perf/` owns performance fixtures and measurement drivers; shared `Timings` records operation spans.
- Tests live in sibling `*-test/` folders. `ts/scripts/` holds tool configuration such as Knip.
- `.config/` owns tool/bootstrap configuration and the local InstantDB Compose file. Root `devenv.*` defines the pinned environment; `.envrc` activates it through direnv, with `enter-tao-dev-env.sh` as the explicit alternative.
- `agents/`, `.rulesync/`, and native harness directories own agent guidance and configuration. `.secrets/` contains encrypted secrets; `.storage/` is the QA archive submodule.
- `.artifacts/` holds generated output, logs, caches, temporary state and retained agent notes/progress; the PoC links to it. Its separate environment state lives under `.devenv/.x-tao-old-v1/`.
- `.x-tao-old-v1/` retains the reference language, compiler, runtimes and apps, including Studio, Companion and test apps.
- `Docs/Roadmap/` holds project plans, `Docs/Specification/` describes the language for Tao users, and `Docs/Dev Env/` describes repository development and retained performance evidence.
- Packages own their manifests and TypeScript configs extending `ts/tsconfig.base.json`; `ts/package.json` owns workspace metadata. Runtime scaffold code and instrumentation are consumed by generated apps and the performance harness.
