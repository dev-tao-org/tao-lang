# Roadmap 2 - Incremental Compilation and Interactive Apps

Continue from [Roadmap 1](Roadmap%201%20-%20Repository%20Setup%20and%20First%20App.md). Follow the planning and implementation process in `AGENTS.md`; these goals describe intended work, not authorization to start it.

## Goal 1 — Incremental compilation and reliable Fast Refresh

- [ ] Format generated code so the runtime remains readable.
- [ ] Retain document and dependency state across compilations; define invalidation for changed view bodies and their dependencies.
- [ ] Recompile affected definitions and publish only changed modules; consider one output file per definition.
- [ ] Shape generated React components for Fast Refresh and preserve unrelated view state.
- [ ] Prove reduced work and compare source-change-to-preview timings against the current baseline.

Success: changing one view updates both previews without recompiling unrelated definitions or resetting unrelated state.

## Goal 2 — Semantic analysis shared with the editor

- [ ] Extend existing module resolution into semantic name resolution and type checking.
- [ ] Share diagnostics between the CLI and an editor language service.
- [ ] Add completion, hover, go-to-definition and rename.
- [ ] Limit analysis to affected documents and dependencies after an edit.

Success: the CLI and editor agree on errors, and ordinary edits avoid a full-workspace recheck.

## Goal 3 — Stateful views, actions and executable previews

- [ ] Implement view state, event handlers and actions.
- [ ] Settle remaining questions in [Local State and Data Drafts](../Specification/Local%20State%20and%20Data%20Drafts.md) before implementing the relevant data behavior.
- [ ] Implement [Live Previews](../Specification/Live%20Previews.md), including named previews, supplied environment settings and initial-state overrides.
- [ ] Extend [Tests](../Specification/Tests.md) to render individual views with supplied inputs and state.
- [ ] Build a realistic interactive app whose previews and tests exercise the same runtime behavior.

Success: developers can explore and test an interactive view in named scenarios without writing a separate app for each scenario.

## Goal Misc

- [ ] Complete interactive Cursor/VS Code extension acceptance.
- [ ] Verify Hello World on headless iOS Simulator and Android Emulator.
- [ ] Select native platforms locally and record cold/warm platform timings.
- [ ] Run web, iOS and Android in CI with shared generated Tao output and parallel platform jobs; measure total CI time before adding further build infrastructure.
- [ ] Complete the original branch-baseline versus final preview comparison before landing the current work; retain the results under [Performance](../Performance/README.md).
- [ ] Repair the shared Watchman launchagent's stale executable path when its restart can be coordinated with active sessions.
- [ ] Revisit deferred legacy maintenance failures only when those workflows are needed again; see [Reference Verification](../Specification/Reference%20Verification.md).

Specs describe behavior; this roadmap tracks the remaining work. Move unrelated follow-up tasks into Goal Misc rather than expanding the three projects implicitly.
