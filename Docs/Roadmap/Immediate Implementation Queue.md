# Immediate implementation queue

This queue records the developer-approved direction and immediate execution order as of 2026-11-16. It tracks projects and reviewable slices, not a claim that their language details are all settled. Owning specifications and topic roadmaps remain authoritative for accepted semantics. Open designs require discussion before implementation.

## 1. Reconcile review and remove the disabled branch

Status: authorized, delegated on `feat/disabled-rollback`.

1. Obtain a safe committed Partial Review checkpoint and coordinate affected-file ownership.
2. Merge that checkpoint into the integration work, then remove the entire disabled feature branch, including its Boolean support and disabled-specific review corrections. Preserve unrelated subsequent fixes. Use forward commits, not history rewriting.
3. Update affected specifications and tasks to distinguish future requirements from implemented behavior. Retain the old implementation and acceptance scenarios in history as reference, not the replacement design.
4. Regenerate tracked app and library output through Tao, verify and independently review.
5. Integrate the reviewed result into the coordinating branch, then coordinate its return merge into Partial Review. The developer explicitly authorized this return merge for this rollback cycle; it is not general automatic handoff permission.
6. Notify the developer with final commits and review/verification evidence before continuing language implementation.

## 2. Close current engineering work

- Resolve remaining integration findings: failed direct library output cleanup; parser preparation for the outer `agent unsandboxed verify` route; vacuous test assertion. Preserve these fixes through the rollback.
- Retain the independently reviewed synchronous-batch repair separately from the now-paused Boolean capture repair. Integrate it without importing disabled/Boolean fixtures or stale generated output.
- Finish the native CI worker's exact-tip verification and performance report; independently review, integrate and verify that branch separately. Earlier green CI is not evidence for a later tip.
- Preserve performance and review evidence, back up commits, and retire worktrees only when their unique evidence is safe. Remote archive publication remains separately deferred for this consolidation.

## 3. Reconcile the complete design ledger

Fold the three history audits into the owning roadmap/specification topics. Restore omitted accepted requirements and explicit deferrals; remove stale pending entries for implemented work. Preserve pending proposals in task notes. Correct superseded package-output descriptions. Keep implementation, independent review, human review, integration and landing distinct.

## 4. Design core types and expressions

Owner: [Language decisions](Tao%20Language%20Design%20Decisions.md), [Runtime PoC](Tao%20Runtime%20PoC.md).

Design Boolean, text and numeric types as one coherent foundation, rather than adding Boolean support as an incidental prerequisite for disabled. Resolve numeric representation/precision/limits, named types, construction/validation/conversion, arithmetic/comparison/logical expressions, optional values and `none`/`missing`, and time/duration semantics. Specify consistent sidecar and TypeScript-library contracts. Refresh one annotated example spanning the core types and their conversions.

Implementation remains a sequence of small reviewable pieces beneath that shared design; this queue does not select unsettled numeric representations or spellings.

## 5. Design brackets, layout, styling and design declarations

Consult the previous implementation first. Establish a general bracket parser/AST, typed validation and compact runtime contract. Define the initial layout/style subset, reusable designs, composition and precedence. Include disabled interaction from the start, distinguishing visual styling from interaction enforcement, inherited behavior, keyboard/accessibility and custom controls. The removed implementation is evidence, not an assumed architecture.

Core-type and bracket design can proceed together. Implement the necessary type foundation before the bracket features that depend on it. Do not require the entire design system before implementing a useful coherent subset.

## 6. Package and library implementation

Owner: [TypeScript libraries](TypeScript%20Library%20Decisions%20and%20PoC.md).

- Address folder-defined packages through explicit imports and the accepted visibility rules; remove superseded whole-package imports and publication aliases.
- Implement centralized library publication and agreed shared app/library output organization: TypeScript source by default, explicit distribution build, generated manifests/configuration/dependency mappings and package facades.
- Provide automatic initialization and singular top-level state. Resolve runtime identity and package initialization boundaries without duplicating shared runtime contexts.
- Prove ordinary TypeScript consumption, relocation and multiple-library use.

Keep cross-library interaction requirements with this runtime boundary and the redesigned bracket system; do not restore the removed disabled implementation merely to satisfy an older task entry.

## 7. Reactive values, sidecars and typed calculations

Owners: [Compiler and reactive runtime](Compiler%20and%20Reactive%20Runtime%20Plan.md), [Language decisions](Tao%20Language%20Design%20Decisions.md).

Complete generated sidecar contracts, checked conversions, immutable snapshots and structural equality, observation/writable-state integration, pure and inline functions, typed matching and inferred returns. Effects remain explicit actions. Reuse already implemented behavior rather than reopening its decisions. Prove authored Tao calculations and headless TypeScript-library consumption.

## 8. Actions, control flow and collections

Implement local state and updates, scoped actions and event bindings, render/control-flow `when` and first-match `pick`, agreed `check`/`guard` scope behavior, aggregate action inspection and failure presentation. Add ActionButton only after its action and bracket foundations. Track ordinary collection operations and iteration; resolve remaining key/identity questions before implementing those parts.

## 9. Data and providers

Owner: [Provider conformance](Tao%20Provider%20Conformance.md).

Start with a complete Notes schema, generated datasource contract and real InstantDB adapter, using legacy query/iteration syntax as the starting point. Implement entity-owned access/validation, authoritative enforcement and transactional contracts, then drafts, explicit persistence keys and conflict handling. Prove rejected edits survive reopening, keys survive source relocation and late responses after logout cannot restore cleared state. Keep provider-owned synchronization distinct from the unresolved public local-versus-authoritative completion API. Follow with the other provider and server SDK proofs.

## Cross-cutting follow-ups

- Settle internal invariant versus user-input checking APIs and classify checks by owner before migrating them.
- Assess remaining package-export/ownership and AST-generation proposals; do not treat audit suggestions as accepted implementation.
- Complete runtime/stdlib architecture review: centralize execution semantics, keep generated code compact, and coordinate UI ownership changes with package layout.
- Re-rank navigation, scrolling, keyed composition and remaining app-authoring gaps rather than assuming an old proposed opening sequence remains approved.

These follow-ups are grouped, not assigned a strict implementation priority beyond their actual dependencies.

## Explicitly deferred

[Advanced action execution](Advanced%20Action%20Execution.md) retains retry, cancellation, concurrency, progress and individual-operation inspection. Also preserve deferred scheduled actions with explicit execution providers, local project linking, piping reconsideration, callable conveniences and detailed [developer-overlay design](App%20Developer%20Overlay.md).

## Slice completion

Every language slice updates the runnable Kitchen Sink and proves its applicable behavior through a compiled library consumed by ordinary TypeScript. Keep generated output runtime-oriented, run appropriate verification/performance checks, and independently review before integration. Update this queue and its owning topic documents when scope, decisions or implementation status change.
