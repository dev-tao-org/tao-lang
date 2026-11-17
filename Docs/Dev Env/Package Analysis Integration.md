# Package analysis integration

This consolidation prepares `feat/package-graph` for human review in PARTIAL REVIEW.
It does not land changes on main or approve the new implementation.

## Included work

| Source                                               | Revision                                   | Review boundary                                                                               |
| ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| PARTIAL REVIEW                                       | `b613ffa66420759e9b70956c637fbe54f1957cf4` | Existing human approvals remain valid; its checkpoint records no pending paths or rechecks.   |
| Package analysis and managed dependency installation | `82d136de263ebb058cab0af8a9c21e1cdaf0065f` | New implementation awaiting human review.                                                     |
| Codegen ownership                                    | `8e3ccf2342d234a6c1db8fd2220737b5e807d8a2` | New implementation awaiting human review.                                                     |
| Accepted language design documents                   | `2840ea7a1757e439fad836e520bd2d1c6095e84e` | Records accepted design; does not implement those language features.                          |
| Codegen evidence handoff                             | `7deceb519410f7eea91dc22bcdec25d09498ad1d` | Evidence and explicit archive-publication status.                                             |
| Public export narrowing                              | `02f27535a6a9dc219968911588b27e84c96ce9b8` | Internal compiler, formatter and workspace stages removed from package facades.               |
| Shared generated contracts                           | `4b5d72142c612179aee5608fbe2e064613297efa` | Review repair sharing publication names, prop types and sidecar asset declarations.           |
| Deep snapshot traversal                              | `3aa27b2462262b8c5257ec581d9fef024d3d1898` | Review repair for reproduced copy and equality stack overflows.                               |
| Tooling review repairs                               | `12a6ad4788e21baac46546cffb5d12bba07c7efd` | Corrected pinned-tool arguments, paths, approval parity and graph classifications.            |
| Later PARTIAL REVIEW corrections                     | `12f4e79e7a5e92cc8d90009b2c5ea13b68cfe8d3` | Reviewed async JSON file handling, merged with portable paths and corrected dependency flags. |

The initial review branch was merged first, followed by the codegen/design branch. Neither
merge had Git conflicts. The new `dependency-add` command needed one integration
adjustment to use the reviewed executable-plus-arguments command API.

The subsequent integration `42c9c072522615d16bbc09498bffd2445cf902d0` includes the immutable-values candidate `fd71fc00f9b1404979c7057a7130182d6e52c22b`, including its TS Lib App examples and consumer assertions. It preserves the reviewed `Catalog` publication alias and pane fixtures, and adapts the snapshot test to the reviewed execution API. Independent review of this expanded batch follows the earlier human-reviewed baseline; these integrations do not themselves establish human approval.

The later reviewed corrections were merged through `109f0dd9a8057eacb63ab3f6d6f3b0811324dec9`. Full verification passed in `.artifacts/logs/dev/2026-11-16T16-24-06.426Z-88643.log`. The source-review record is retained in `.artifacts/checkpoint/consolidated-review-and-exports.md`, distinguishing each frozen target, its findings and the final reviewed state. The newly authorized `ts/repo-analysis` extraction, including repository scripts and performance tooling, is separate work on `feat/repo-analysis` and is not included in this batch.

## Verification and findings

- Expanded integration `42c9c072522615d16bbc09498bffd2445cf902d0` passed full verification in `.artifacts/logs/dev/2026-11-16T16-06-27.944Z-89302.log`, including the TS Lib App and immutable-value Tao journey. An earlier run timed out in an unchanged HTTP browser test; that test then passed unchanged in isolation and in the full rerun. The timeout's root cause is unconfirmed.
- Its exact-commit preview record passed under `.storage/performance/preview/42c9c072522615d16bbc09498bffd2445cf902d0/`. A single-session comparison with the preceding tip does not establish a speed change or physical paint timing.
- The tooling implementation passed 653 TypeScript tests and six Tao journeys
  before integration. The combined implementation passed 611 TypeScript tests and
  six Tao journeys, including the reviewed branch's test changes.
- Combined verification log: `.artifacts/logs/dev/2026-11-16T15-49-51.252Z-55812.log`.
- The first combined verification exposed stale generated AST artifacts. Running
  pinned setup regenerated them. The next run identified the command API adjustment.
  Both issues are resolved; their failed-run logs remain in the local inventory.
- The test-only usage report is advisory. On the earlier `f271a4661` tree it reported one
  module, ten declarations and eighteen optional argument positions. It reuses the
  source-conformance TypeScript program; the existing two Knip gates remain intact.
- Optional-argument analysis covers conservative direct calls, not individual
  options fields or arbitrary control flow. Findings require contract review.
- Dependency graph classification corrects known mixed-import and inline type/dynamic-import coalescing cases. It remains based on dependency-cruiser resolution and can omit a separate inline type edge when an ordinary static import wins the scanner's coalescing key. The test-only report is also conservative around indirectly escaped namespaces. Neither report proves an API is safe to remove without consumer review.
- The earlier ownership audit has been reconciled against a later committed integration
  snapshot. The dispositions below supersede its original list of open findings.

See [Repository APIs](Repository%20APIs.md) for command usage and
[Codegen Ownership Evidence](Codegen%20Ownership%20Evidence.md) for the source slice.

## Package and API ownership audit reconciliation

The original audit examined `4681a23e5b166738abe0145662168197750c6b21`. This reconciliation
checked `bfc14aa2dcff81a914cdf5ffcb535ffb1dd22a7c` using committed source, manifest and
lockfile metadata, call sites, and representative generated and host-loaded consumers.
“Still worthwhile” identifies an open candidate; “requires a decision” identifies a
boundary or policy still to settle. Neither status authorizes implementation.

| Retained finding                                                  | Disposition at the reconciled snapshot                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidecar test module/entry selection, executor and Catalog exports | Still worthwhile                                                 | `tao-cli/commands/test-sidecars.ts` duplicates `ModuleDependencies.resolveModule` lookup errors, chooses the shallowest source entry with a lexical tie break, and passes Workspace's `executeManagedTool` back into `Workflow.execute`. Both Catalog enumerators still have this external command consumer as well as internal discovery consumers.                                                                                                        |
| `@workspace/testing`                                              | Still worthwhile                                                 | The alias's only tracked importing file is `tao-cli.ProjectCommand.test.ts`. `Workflow.ts` calls its target `runSidecarTests` directly in production. The alias and the operation have different consumers.                                                                                                                                                                                                                                                 |
| App selection via Workspace compiler substitution                 | Still worthwhile                                                 | `CompileApplication` and `testing/AppTestDriver` each wrap the compiler to set `CompileOptions.app`. `Workspace.build` selects the injected compiler or the default. Synthetic compiler substitutes in Workspace tests serve a separate purpose.                                                                                                                                                                                                            |
| Runtime generated publication state                               | Requires a decision                                              | `Runtime.start` reads `generated` and attaches `publishGenerated`; `WorkspaceBuild` assigns `publicationSequence` and updates accepted `generated` for both disk and memory paths. `Workspace` checks the callback before changing sidecar snapshots. The module refresh benchmark seeds `generated`; preview harness and receipt code read it.                                                                                                             |
| Perf → CLI parser stdout dependency                               | Implemented                                                      | `6003c8c60` moved the workload to `repo-analysis/Performance`; `parser-sample.ts` writes JSON and a newline via shared `Process.stdout`. `parser-performance.ts` still captures the dynamic child route and records `parser.process-wall`. The CLI calls `@repo-analysis/performance`; the old Perf package is gone.                                                                                                                                        |
| JS keyword/strict-mode capture check                              | Superseded                                                       | `3fa117adf` removed the reserved-word list when Tao source validation began rejecting lowercase-initial authored captures. The former lowercase cases are ruled out by that source rule.                                                                                                                                                                                                                                                                    |
| Generated `TR` and `Tao` capture-name collisions                  | Requires a decision                                              | `InjectionsCompiler.assertCaptureName` still rejects these identifiers during JS emission; `RuntimeEmitter` emits the corresponding imports. This covers a target collision on otherwise uppercase-valid names.                                                                                                                                                                                                                                             |
| Injection context availability                                    | Still worthwhile                                                 | `InjectionsCompiler.compileCapture` accepts `@@children` and rejects other names during emission. The grammar accepts a named context reference; `SourceValidation` currently checks capture declaration names, not context availability.                                                                                                                                                                                                                   |
| Duplicate lexical declarations and imports                        | Requires a decision                                              | `LinkModules` calls `LinkModuleValidation.assertUniqueLocalBindings` for same-scope declarations and separately checks source/import bindings during linking. The dedicated source validation stage exists; it has not taken over duplicate lexical binding checks.                                                                                                                                                                                         |
| Tao structural validation and project-aware requirements          | Implemented                                                      | `e594a1fbf` integrates the dedicated `2.5-source-validation` stage; `a38f85e1b` preserves requirements-only discovery. `SourceValidation` handles statement placement and authored names; Workspace keeps the separate project-root check in `dependencies/Requirements.ts`, used by preparation and metadata discovery. Import and module linking remain in their context-aware owners.                                                                    |
| Structural validation at direct compiler entrypoints              | Requires a decision                                              | `Workspace.compileLibraryPackage` validates before loading and linking. Exported `Compile.compileLibrary` accepts a `LinkedProgram`; neither it nor `Typecheck.linkModules` establishes structural validation. Tracing a parsed `ts-library Demo {}` through these direct calls reaches the missing-publish invariant in `LibraryPublications`. App `Compile.compile` validates its single-file fallback but also accepts a caller-supplied linked program. |
| Foreign view parameter type versus missing generated import       | Requires a decision                                              | `ViewsCompiler.compileForeignView` still rejects non-text parameters and separately raises an invariant for a missing compiled component. The first check's owner depends on whether the restriction belongs to Tao or to its current backend.                                                                                                                                                                                                              |
| Compile, Fix and Workspace internal re-exports                    | Implemented                                                      | `02f27535a` removed `collectLibraryPublications`, `compileProgram`, `compileModuleSources`, raw `layout`, `publishBuild`, `WorkspacePreparation`, `resolveLockedAlias`, `resolveLockedRequirement` and `prepareSourceDependency` from the audited root facades. Local tests use the owner modules. The editor uses `@fix/format` for `SourceEdit`; browser-safe formatting and embedded entries remain.                                                     |
| Workspace dependency preparation still used across packages       | Requires a decision                                              | `PerformanceProject.preparePreviewProject` dynamically imports Workspace and calls `createProjectDependencyOptions` and `prepareDependencies`. These are live production tooling consumers; any later narrowing needs a proven replacement for that preparation path.                                                                                                                                                                                       |
| CLI runtime tooling export and optional ownership move            | Still worthwhile to narrow; moving ownership requires a decision | `@cli-kit/runtime-tooling` re-exports `runtime-build` and `runtime-sources`; its three importing test files use `prepareRuntime` or `readRuntimeSources`. CLI setup, checks, compile and preview call the real build directly, and that build consumes the resource reader and coordinates the build lock.                                                                                                                                                  |
| Manifest drift: CLI → Perf and Perf → Compile                     | Superseded / implemented in the replacement graph                | `ts/CLIs/package.json` declares `@tao/repo-analysis`; `ts/repo-analysis/package.json` declares `@tao/compile`. These cover the former edges after `6003c8c60`.                                                                                                                                                                                                                                                                                              |
| Manifest drift: IDE → Shared                                      | Still worthwhile                                                 | The editor has direct `@shared` and `@shared/os` imports and no `@tao/shared` entry in its package manifest. CLI's app-selection wrapper also imports `@compile` without a CLI `@tao/compile` declaration; address that seam before changing its metadata. Neither finding demonstrates an install failure.                                                                                                                                                 |
| `Workspace.execute` test-only services parameter                  | Implemented                                                      | `a60157f78` removed the third argument and restored real preparation as the only public workflow route. `Workflow.execute` takes request and UI. The separate compiler substitution and sidecar executor input are not this parameter.                                                                                                                                                                                                                      |
| Explicit test entries and generated/runtime surfaces              | Superseded as removal candidates                                 | `@workspace-tests` and `@shared-tests` are intentional test entries. Generated library source imports `@tao/ts-api`; generated views and sidecars use `@tao/runtime-api`; Expo scaffolding selects the React JSX bridge. Metro resolves `tao:metro-hmr-client` via `Bridge_expo-metro`. These contracts do not depend on an incoming static import in the workspace graph.                                                                                  |
| Library package and sidecar declaration emission                  | Implemented for the audited codegen boundary                     | `8e3ccf234` and `4b5d72142` put library package file emission and generated sidecar contract/asset declarations in Compile. Workspace calls those exports and still owns dependency resolution, managed resources and publication. Later output layout belongs to its own slice.                                                                                                                                                                            |

The two Knip checks and the advisory test-only usage report are useful cross-checks.
The package graph cannot establish symbol use, generated or dynamic reachability, or options-field
usage. This was a source reconciliation, with no application runs, package relocation proof,
cross-platform acceptance, or new branch-wide review. The last independent parent review was
`4094fe54732991490586eba9bbd78797df838672` in its runtime/tooling scope. The unrelated
publication-cleanup P2 remains open.

The reconciliation worktree retains the original report, evidence inventory and unaccepted follow-up
candidates in `.artifacts/notes/package-api-reconciliation/`. See the
[Immediate implementation queue](../Roadmap/Immediate%20Implementation%20Queue.md#cross-cutting-follow-ups)
for accepted work still pending.

## Retained local evidence

The developer explicitly deferred remote evidence publication for this consolidation.
Keep both source worktrees and their local evidence; no archive pointer update or
remote archive publication is claimed.

In the package-graph worktree:

- `.artifacts/notes/package-analysis-integration-inventory.txt`: file hashes for the
  retained reports, checkpoints and verification logs.
- `.artifacts/package-graph.md` and `.artifacts/package-graph.json`: refreshed package
  diagrams and import evidence.
- `.artifacts/test-only-usage.md`: current advisory candidates.
- `.artifacts/notes/package-api-audit.md`: read-only audit and coverage limits.
- `.artifacts/checkpoint/graph-and-ownership-audit.md` and
  `.artifacts/checkpoint/test-only-usage.md`: implementation and coordination records.
- `.storage/performance/preview/82d136de263ebb058cab0af8a9c21e1cdaf0065f/`:
  successful tooling-commit preview record and raw report, retained locally.

The original `14a4` worktree additionally retains the verified codegen evidence
package and `.artifacts/notes/preview-history/8e3ccf2342d234a6c1db8fd2220737b5e807d8a2/`.
That preview record was measured on an isolated clean checkout of the exact commit.
Individual records do not establish a branch-wide speedup or physical paint timing.

PARTIAL REVIEW should merge the final provided tip, preserve its existing approval
receipts, and review only new changes and any necessary integration rechecks.
