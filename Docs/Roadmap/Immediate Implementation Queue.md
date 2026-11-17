# Immediate implementation queue

This queue records the developer-approved direction and immediate execution order as of 2026-11-16. It tracks projects and reviewable slices, not a claim that their language details are all settled. Owning specifications and topic roadmaps remain authoritative for accepted semantics. Open designs require discussion before implementation.

## 1. Reconcile review and remove the disabled branch

Status: complete. Independently reviewed rollback `1d95d7b9` integrated here; regenerated output committed as `06946fd6`. Partial Review received it in `b70110c90` and regenerated its output as `ae1edf172`. Verification passed in both checkouts. Human review remains separate.

1. Obtain a safe committed Partial Review checkpoint and coordinate affected-file ownership.
2. Merge that checkpoint into the integration work, then remove the entire disabled feature branch, including its Boolean support and disabled-specific review corrections. Preserve unrelated subsequent fixes. Use forward commits, not history rewriting.
3. Update affected specifications and tasks to distinguish future requirements from implemented behavior. Retain the old implementation and acceptance scenarios in history as reference, not the replacement design.
4. Regenerate tracked app and library output through Tao, verify and independently review.
5. Integrate the reviewed result into the coordinating branch, then coordinate its return merge into Partial Review. The developer explicitly authorized this return merge for this rollback cycle; it is not general automatic handoff permission.
6. Notify the developer with final commits and review/verification evidence before continuing language implementation.

## 2. Close current engineering work

- Completed with the rollback: failed direct library output cleanup, parser preparation for the outer `agent unsandboxed verify` route, and the vacuous test assertion.
- Synchronous-batch repair integrated from `bc5d463a`: ordinary synchronous results with a noncallable `then` field are accepted. Disabled and Boolean support remain removed. Human review is still separate.
- Reactive runtime follow-up remains under review. The read-only observation boundary replaces selective feedback containment in the runtime and its authored TypeScript API. Collection-publication benchmarks retain work counts and timings. Authored runtime type mappings remain stable across source rebuilds, avoiding unnecessary npm setup; preview validation and execution share one pinned runtime generation. Verification and measurement evidence live in the implementation checkpoint.
- Finish the native CI worker's exact-tip verification and performance report; independently review, integrate and verify that branch separately. Earlier green CI is not evidence for a later tip.
- [Studio output reconciliation](../Dev%20Env/Generated%20Output.md#reconciliation-of-the-studio-output-experiment) records the superseded pipeline and its retained evidence. The package layout slice owns foreign-view path relocation. Retain the old worktree pending durable evidence preservation and verification.
- Preserve performance and review evidence, back up commits, and retire worktrees only when their unique evidence is safe. Remote archive publication remains separately deferred for this consolidation.

## 3. Reconcile the complete design ledger

Fold the three history audits into the owning roadmap/specification topics. Restore omitted accepted requirements and explicit deferrals; remove stale pending entries for implemented work. Preserve pending proposals in task notes. Correct superseded package-output descriptions. Keep implementation, independent review, human review, integration and landing distinct.

## Near-term execution before new language design

The developer moved new core-type and layout/style design behind recent in-flight work. Finish the current Partial Review queue and resolve native CI/integration. The independent batch repair is integrated. Reconcile the history audits in parallel with those closures.

Select the next two bounded implementation slices from the existing projects before resuming new language design. Preserve small reviews and avoid changing files while their human review is active. Slice recommendations remain proposals until accepted.

## Later design: core types and expressions

Owner: [Language decisions](Tao%20Language%20Design%20Decisions.md), [Runtime PoC](Tao%20Runtime%20PoC.md).

Design Boolean, text and numeric types as one coherent foundation, rather than adding Boolean support as an incidental prerequisite for disabled. Resolve the remaining numeric representation, arithmetic, comparison, optional-value and time/duration questions. Specify consistent sidecar and TypeScript-library contracts. Use the accepted [Type Conversions](../Specification/Type%20Conversions.md) examples as input to that work.

Implementation remains a sequence of small reviewable pieces beneath that shared design; this queue does not select unsettled numeric representations or spellings.

Define the boundary between immutable data and opaque identity-bearing handles with core types and sidecar contracts. Do not imply that arbitrary mutable host objects become immutable through a TypeScript readonly annotation.

## Later design: brackets, layout, styling and design declarations

Consult the previous implementation first. Establish a general bracket parser/AST, typed validation and compact runtime contract. Define the initial layout/style subset, reusable designs, composition and precedence. Include disabled interaction from the start, distinguishing visual styling from interaction enforcement, inherited behavior, keyboard/accessibility and custom controls. The removed implementation is evidence, not an assumed architecture.

Core-type and bracket design can proceed together. Implement the necessary type foundation before the bracket features that depend on it. Do not require the entire design system before implementing a useful coherent subset.

## 4. Package and library implementation

Owner: [TypeScript libraries](TypeScript%20Library%20Decisions%20and%20PoC.md).

The explicit imports and visibility migration is integrated into the coordinating branch and imported into Partial Review; human approval remains separate. [Projects and Dependencies](../Specification/Projects%20and%20Dependencies.md) owns source addressing; [TypeScript Libraries](../Specification/TypeScript%20Libraries.md) owns publication.

- Add the explicit distribution build for already generated TypeScript source packages. Define its JavaScript and declaration targets and manifest rules.
- Extend authored-sidecar package resolution and verify multiple independently compiled libraries share the installed Tao runtime in one consumer. The [source package implementation](TypeScript%20Library%20Decisions%20and%20PoC.md#generated-source-packages) covers explicit exports, single library initialization, ordinary TypeScript consumption and relocation.
- Retained review finding: captured sidecars can reference undeclared npm packages that the generated manifest omits. Resolve this with authored-sidecar dependency validation and an independently installed consumer proof.

Keep cross-library interaction requirements with this runtime boundary and the redesigned bracket system; do not restore the removed disabled implementation merely to satisfy an older task entry.

## 5. Reactive values, sidecars and typed calculations

Owners: [Compiler and reactive runtime](Compiler%20and%20Reactive%20Runtime%20Plan.md), [Language decisions](Tao%20Language%20Design%20Decisions.md).

Complete generated sidecar contracts, checked conversions, immutable snapshots and structural equality, observation/writable-state integration, pure and inline functions, typed matching and inferred returns. Effects remain explicit actions. Reuse already implemented behavior rather than reopening its decisions. Prove authored Tao calculations and headless TypeScript-library consumption.

- **Typed initializers and conversions.** With the relevant core types in place, implement named `or` unions, postfix `as` for `let` and `state`, authored converters and fallback widening. Prove constructor and arithmetic grouping, exact target identity, source distance and tie diagnostics, unchanged value identity on widening, and the full write domain of optional and union state. Include the typed empty-list case when list typing is available. Audit typed initializer migrations for newly invoked converters and preserve the type and identity rules for entity and opaque-handle values.
- **Persisted schema.** When persistence is available, derive the schema from the initializer type. Prove an inferred scalar and an explicitly widened union survive reload with the intended write domain. Keep the explicit stable key contract in [Local State and Data Drafts](../Specification/Local%20State%20and%20Data%20Drafts.md#persistence).
- **Native functions.** With generated sidecar contracts and pure functions in place, implement [`native func`](../Specification/Sidecars.md#agreed-future-native-functions). Prove matching-file ownership, visibility through the Tao module, signature and result checking, and invocation from a compiled library in a headless TypeScript consumer.

Include external reactive-source subscription/disposal and sidecar callback lifetime protection in the sidecar integration slice. Consult the previous runtime's revocable native mutation leases; prove that discarded renders and unmounted controls cannot publish late changes. Preserve the current commit-owned React subscription bridge.

The runtime and its authored TypeScript expression API enforce synchronous, read-only observation. Carry the same callback contract into generated sidecar readers when they are implemented. Authored app-handler routing belongs to managed execution integration. Detection cannot undo asynchronous work already started. Equal resulting state values continue to suppress downstream propagation; repeated events remain distinct from state changes.

## 6. Actions, control flow and collections

The first slice implements view-local text state, `set`, synchronous scoped actions with text arguments, explicit `do`, and the standard Button’s named and anonymous `on press` bindings. See [Local State and Data Drafts](../Specification/Local%20State%20and%20Data%20Drafts.md) and [Actions and Results](../Specification/Actions%20and%20Results.md).

Later slices cover render/control-flow `when` and first-match `pick`, agreed `check`/`guard` scope behavior, aggregate action inspection and failure presentation. Add ActionButton after its action and bracket foundations. Track ordinary collection operations and iteration; resolve remaining key/identity questions before implementing those parts.

Retained compiler review finding: module-level text and imported text aliases can still pass render-target validation and fail at runtime. General render-target validation owns this follow-up; the first state/action slice rejects local text targets.

Implement writable field projections and mapped writable inputs with the state/record/input slices, retaining one authoritative storage owner. Use the previous writable-lens behavior as reference, not its compatibility wrappers. Define transaction overlays and rollback in the owning mutation/action slice; synchronous reactive batching alone does not provide rollback or authorize making every UI action transactional.

## 7. Data and providers

Owner: [Provider conformance](Tao%20Provider%20Conformance.md).

Start with a complete Notes schema, generated datasource contract and real InstantDB adapter, using legacy query/iteration syntax as the starting point. Implement entity-owned access/validation, authoritative enforcement and transactional contracts, then drafts, explicit persistence keys and conflict handling. Prove rejected edits survive reopening, keys survive source relocation and late responses after logout cannot restore cleared state. Keep provider-owned synchronization distinct from the unresolved public local-versus-authoritative completion API. Follow with the other provider and server SDK proofs.

## Cross-cutting follow-ups

- The [shared invariant and user-input checks](../Dev%20Env/Repository%20APIs.md#invariants-and-user-input)
  are implemented. Classify remaining checks by owner when migrating them. The missing-publish check
  in `requireLibraryPublication` remains deferred. Workspace validates the source before calling it.
- The retained [package and API ownership audit](../Dev%20Env/Package%20Analysis%20Integration.md#package-and-api-ownership-audit-reconciliation) has been reconciled against `bfc14aa2dc`. Its remaining ownership candidates await decisions or slice selection. The separate AST-generation proposals still need assessment.
- Complete runtime/stdlib architecture review: centralize execution semantics, keep generated code compact, and coordinate UI ownership changes with package layout.
- Re-rank navigation, scrolling, keyed composition and remaining app-authoring gaps rather than assuming an old proposed opening sequence remains approved.

These follow-ups are grouped, not assigned a strict implementation priority beyond their actual dependencies.

## Explicitly deferred

[Advanced action execution](Advanced%20Action%20Execution.md) retains retry, cancellation, concurrency, progress and individual-operation inspection. Also preserve deferred scheduled actions with explicit execution providers, local project linking, piping reconsideration, callable conveniences and detailed [developer-overlay design](App%20Developer%20Overlay.md).

- **Structural interfaces.** Implement the agreed [interface design](../Specification/Structural%20Interfaces.md) after MVP. Build on associated methods and typed matching. Prove inherited methods, compatible parameter and result types, unambiguous label mapping, and action and view dispatch with their ordinary lifecycle contracts.

## Slice completion

Every language slice updates the runnable Kitchen Sink and proves its applicable behavior through a compiled library consumed by ordinary TypeScript. Keep generated output runtime-oriented, run appropriate verification/performance checks, and independently review before integration. Update this queue and its owning topic documents when scope, decisions or implementation status change.
