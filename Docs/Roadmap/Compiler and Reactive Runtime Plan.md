# Compiler and Reactive Runtime Plan

Status: revised after Astra high-effort critique and a focused follow-up, 2026-10-22. The developer
authorized applying the resulting plan improvements. The concrete starting design and proof gates
below replace the earlier open-ended interface sketches. Broad implementation still depends on the
architecture proof; this planning document does not itself authorize source implementation,
dependency installation, Git changes or integration. The final edited document has not received a
separate line-by-line rereview.

## Goal and priorities

Build a small compiler/runtime foundation that can support the remaining Tao language without
repeated architectural rewrites. Rank alternatives in this order:

1. Fastest achievable source-edit-to-preview result, now and as language features accumulate.
2. DRY behavior, low cognitive overhead, elegance and simplicity of the resulting structures.
3. Straightforward extension to remaining language features, without implementing them prematurely.

Existing and previous code are evidence about behavior, failure modes and integration costs, not
reasons to retain a weaker design. Establish the strongest architecture first, then explain how
it fits or should replace the current structures. Challenge this draft where its abstractions
would constrain a faster or simpler solution; distinguish recommendations from agreed decisions.

## Starting state and authority

- Worktree: `/Users/ro/.codex/worktrees/aea4/tao-lang`.
- Branch: `feat/projects-sessions-review-fixes`; HEAD:
  `67d8604fde0e08eb58b26be140588d1d8ecc417b` at drafting time.
- The worktree contains a large pending readability/compiler patch, staged root guidance, and
  an untracked runtime API specification. These are part of the review context, not committed
  implementation of this plan. Preserve both index and worktree selections.
- Historical full verification passed 392 TypeScript tests and five Tao journeys at the recorded
  patch checkpoint. It is not verification of subsequent guidance or this proposed architecture.
- Existing independent reviews and human approvals were scoped. Do not describe the full current
  dirty tree, this plan, or future implementation as already reviewed or approved.
- Before later implementation, establish exclusive ownership of affected paths and the intended
  dirty baseline with the developer. Do not automatically commit, copy, stash or merge it.

## 1. Semantic grammar and AST

### Agreed shapes

- Rename `LetDefinition` to `LetDeclaration` throughout grammar, AST, compiler and consumers.
- Represent semantic declaration alternatives as a named `Declaration` union, with exhaustive
  discriminated dispatch. A named grammar supertype must retain concrete declaration kinds;
  avoid introducing a redundant wrapper CST/AST node just to name the union.
- Name semantic unions across the grammar. Keyword/token alternatives do not need invented nodes.
- Replace the current render shape with recursive `ViewRenderExpression` and a
  `ViewRenderStatement` union of `RenderInjectStatement | RenderViewExpressionStatement`.
  Preserve the authored `render` statement boundary in concrete nodes.
- `ViewDeclaration.body` is `ViewDeclarationImplementation`, a union of
  `Block | ForeignView`.
- File and braced statement collections use one `Block` with ordered `Statement` members.
  The parser uses the same statement alternatives for every owner.
- Author declaration and binding names with an uppercase initial, including explicit aliases,
  parameters and captures. SDK-provided names and package paths keep their own spelling.

Generate as much of the semantic node definitions, fields, union membership, constructors,
predicates and dispatch as practical from grammar-owned metadata. Keep one source of truth rather
than parallel handwritten type inventories. Explicit small semantic transformations remain for
literal decoding, normalized collections, qualified names and tags.

Do not assume Tree-sitter's structural node metadata alone captures all semantic invariants.
Keep any added metadata small and explicit. No second intermediate tree, additional full-tree
preview traversal, or general AST-generation framework without a concrete need.

Preserve recognized statements and their source ranges in the CST and AST. Validate permitted
owners, ordering, multiplicity and authored declaration names on the semantic AST before linking and code generation. The editor
reports the same placement diagnostics for complete syntax and retains parser diagnostics for
incomplete edits. Preserve supported valid syntax and the single-render rule. Consult old
grammar and validation for proven edge cases while honoring the names and shapes above.

Update linker, formatter, workspace consumers, tests and specs together. No compatibility readers,
duplicate old/new node designs, or implicit porting of additional language features.

## 2. Compiler and generated-code boundary

Centralize emitted `TR.*` operations in one owning code-generation file. Node-specific emitter
functions and runtime operations should correspond to the semantic AST node names. Structural
operations without authored nodes may retain honest purpose-specific names. Avoid turning this
into a generic string-driven emitter framework.

Emitter functions receive whole relevant typed nodes/linked records and extract their own fields.
A function named `compileBinding` must receive an actual binding; do not invent AST syntax solely
to justify a helper name. Name each independently meaningful compilation step and reuse shared
operations rather than repeating runtime strings or nontrivial property chains.

Use exhaustive, type-narrowed node dispatch. A contextual dispatcher may pass a small context to
handlers when necessary. Prefer fixed lexical `_Scope` shadowing and prototype-based scopes over
threading scope-name strings and capture sets through every function. No mutable global compiler
context or AST parent links added merely to avoid arguments. Reviewers may recommend a stronger
resolution strategy if it demonstrably improves the ranked goals.

Generated code owns authored structure: literals, references, callbacks, module wiring and authored
TS bodies. Shared execution mechanics belong in the handwritten runtime. This applies to examples
and stubs as well as source. For example, generated mutation should be as small as:

```ts
count.update(count.jsValue() + 1)
```

The runtime owns batching and notification scheduling. Generated code must not repeat those
wrappers per mutation. Runtime-owned actions/events can provide a shared outer boundary.

Keep existing Timings conventions and operation visibility; avoid adding instrumentation work to
every expression read unless measurement establishes its necessity and cost.

## 3. Public authored TypeScript API

The only documented authored import is:

```ts
import Tao from '@tao/runtime-api'
```

Expose one default object with only capabilities needed by current sidecars, injections, stdlib TS
and external Tao modules. Generated code may use private `TR`; authored TS relies on API-owned
contracts, without internal runtime or React Native namespaces. Do not broadly re-export TR or RN.

Inline injections receive explicit captures and this same API object. Keep them in the generated
module for this slice; use recognizable component/custom-hook boundaries for hook-bearing bodies.
This is an authored contract, not enforced isolation: restrictions on technically importable or
lexically reachable internals are deferred. The old separate-module design had stronger isolation;
do not claim that inline functions provide it.

Wire the public entrypoint through workspace TypeScript paths, managed sidecar contracts and
generated Metro resolution. Preserve the distinct private runtime boundary. Update the existing
`Docs/Specification/Runtime TypeScript API.md` as behavior becomes implemented.

## 4. One reactive-engine boundary

All direct value-related React integration belongs in one Tao-owned adapter module: state, refs,
memoization, observation/subscription and lifecycle hooks. Underlying reactive-library integration
also remains behind that boundary. UI rendering has a separate responsibility; this does not require
moving every React component into that file.

Other code uses Tao contracts. The boundary must permit engine/policy comparisons without changing
generated code or defining separate expression hierarchies. A provider owns dependency tracking;
do not introduce a Tao graph alongside the provider's graph. Policy hooks are useful only where the
provider can implement them honestly. Generated custom-hook calls must remain recognizable to
React Fast Refresh tooling; centralization must not hide hook topology in ordinary callbacks or
opaque factories.

The starting React bridge is:

- `useState` retains a stable source-signal object whose initializer is pure. That object contains
  the sole writable value; React does not hold a second raw-value copy.
- `useMemo` can retain pure computed candidates keyed by stable inputs. Treat it as an optimization
  cache, not a guaranteed resource lifetime. Discarding/recreating a candidate must remain correct.
- A `useSyncExternalStore` bridge supplies stable subscribe/snapshot functions. Commit attaches
  subscriptions and reconciles a fresh authoritative snapshot to close the render-to-subscribe race.
- Fast Refresh can retain source cells under normal React rules while replacing derived candidates
  and observations when their code changes. Never mutate a committed evaluator ref during render.

All these underlying React references stay inside the one adapter file. Generated code calls
recognizable Tao custom hooks. None of these choices proves performance until the actual integration
is measured.

The initial proof must emit actual stable, module-level named React components for Tao views and
hook-bearing injections, rendered as elements rather than ordinary callback invocations. Generated
model hooks may group adapter calls when their hook signatures remain statically visible. Test the
real Metro transform; function names alone do not establish Refresh behavior.

Establish the owner protocol before broad integration: render may construct unobserved candidates;
commit attaches observations; replacement/unmount detaches them; abandoned renders attach nothing.
A candidate render must not mutate a committed owner's evaluator/ref, dispose its graph, or publish
notifications. Prove render-to-subscribe race handling and Strict Mode cleanup/restart.
Cleanup/restart must be able to reattach observations; do not irreversibly retire a still-owned
source merely because a development effect was cleaned up and restarted.

## 5. Expressions and computation policies

The public contract is small:

```ts
interface Expression<T> {
  jsValue(): T
  observe(receive: (value: T) => void): Observation
}

interface WritableExpression<T> extends Expression<T> {
  update(value: T): void
}

interface Observation {
  unobserve(): void
}
```

- `jsValue()` returns the raw, nonreactive JS value. Reading a function value does not invoke it.
- Object results are shared read-only snapshots, with no defensive copying per read.
- `observe` delivers the current value immediately and subsequent changed values after settlement.
- Compare delivered values with `Object.is`; release observations on `unobserve` and owner disposal.
- Avoid per-read wrapper allocations. Retain dependency tracking on cached reads.
- Pure computed expressions track the inputs actually read, including dynamic branches. Release
  obsolete dependencies when a branch changes. Future pure calls may read captured state as well
  as explicit arguments; effectful invocation remains separate from pure evaluation.

Separate the React-facing observation snapshot from the public `jsValue()`/immediate `observe`
contract. Uncached object-producing expressions can allocate a new result on every evaluation;
passing that reader directly as `useSyncExternalStore`'s snapshot would be unstable. The bridge
needs a retained delivered snapshot or a stable version with a coherent read protocol. This is
delivery bookkeeping, not a second writable store or graph. Do not count retained observation
snapshots as evidence that uncached evaluation has the same allocation cost as cached evaluation.
An uncached object-producing public read may return a new identity on each evaluation. Stable
observation snapshots are a separate contract; they must not silently introduce caching into the
public-read experiment. For the initial lazy candidate, both may share an immutable cached result.

One shared expression/writable implementation and shared read/write entrypoints delegate to an
engine-owned computation provider. It may receive internal nodes and own caching, invalidation
and settlement, rather than duplicating expression types for each strategy.

Compare these policies:

| Policy   | Change propagation                                       | Read                                         |
| -------- | -------------------------------------------------------- | -------------------------------------------- |
| Uncached | Schedule affected observations                           | Evaluate without retaining computed results  |
| Lazy     | Invalidate reachable dependant caches                    | Reuse a valid result or recursively evaluate |
| Eager    | Recompute affected dependants; propagate changed results | Return cache after pending work settles      |

This table describes intended semantics, not a complete graph algorithm. All modes must support
coherent diamond dependencies, read-your-writes, dynamic dependencies, and unchanged-value
notification suppression. Eager scheduling must avoid mixed old/new inputs and unnecessary repeat
evaluation. Lazy observed nodes must still be evaluated when delivering notifications.

Preact Signals Core 1.14.4 is approved for the implementation phase and is the initial candidate,
not a proven performance winner. Prove that its public API supports the required integration and
whether these policies can share it cleanly. Do not layer a second full graph over it or distort a
comparison by bypassing dependency tracking. If a clean policy seam is unavailable, report the
specific limit and recommend a smaller honest experiment or revised adapter before broad coding.
Approval for this dependency does not authorize additional libraries.

Use these precise experiment labels rather than claiming three universally interchangeable graph
algorithms:

| Candidate           | What the proof must establish                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Native lazy         | Native computed caching and synchronous batching satisfy the Tao contract                       |
| Uncached evaluation | Public reads recompute while tracking and observation remain correct, without a second graph    |
| Observed eager      | Selected computeds kept observed through public APIs update eagerly, with bounded lifetime cost |

Observed eager is not a claim of universal eager propagation. An unavailable candidate is a useful
result; do not build framework machinery solely to make the matrix complete.

The inspected Preact 1.14.4 core compares both source writes and computed outputs with `!==`, not
`Object.is`. Raw signals therefore discard a `0` to `-0` transition, while repeated `NaN` can cause
extra work. Callback filtering cannot repair a discarded value. Prove an equality-preserving
representation adapter covering source and computed values without a second graph, and include
its allocation/GC and propagation cost in comparisons. Test signed zero through a downstream
calculation such as `1 / value`, not just notification counts.

First try a private numeric representation adapter: encode `-0` and `NaN` with distinct canonical
sentinels, leaving other values unboxed. Encode both source and computed outputs and decode every
public read, observer delivery and evaluator input. Never expose internal sentinels as authored
values. Prove signed-zero arithmetic, repeated `NaN`, chained computations and batch reverts.
This is an initial candidate, not an assumption that its overhead is negligible.

A uniform expression contract does not require a graph node per AST expression. Constants need no
dependencies; references can retain existing expression identity; cheap pure intermediate work can
stay inside a tracked evaluator. Compare selective graph construction and observation granularity
against universal node construction before introducing either as a mandatory compiler pattern.

## 6. Independent batching policies

Writes change their authoritative value immediately. Deferral applies to derived work and observer
delivery, not to replaying queued mutations later. Read-your-writes is required even before the
normal settlement boundary. Notification batching is not transaction isolation or rollback.

Both policies share nesting, pending-change tracking, equality checks, error cleanup, observer
delivery and reentrant-write handling. Only the flush-scheduling policy should differ where possible:

```ts
interface Batching {
  run<T>(perform: () => T): T
  changed(): void
}

type ScheduleFlush = (flush: () => void) => void
```

- Synchronous: settle/notify when the outermost runtime batch returns. Independent updates outside
  one action/event boundary can cause multiple settlements.
- Deferred: schedule one microtask after the current synchronous stack, coalescing separate writes.
  Reading before that flush must refresh necessary computations without prematurely delivering
  observer callbacks. Reentrant callbacks may require another bounded settlement pass.
- No batch remains open across `await`. Define and test failed-operation cleanup without inventing
  rollback. An already queued callback must not touch a disposed owner.

The earlier baseline was synchronous action/event batching. The developer subsequently requested
both implementations for comparison; deferred batching is now an explicit candidate, not a silently
adopted default. Select the shipped default on semantic suitability and measured preview/update
cost. Keep policy selection at engine construction, not scattered per-node options.

Verify that computation and batching policies are actually compatible; do not promise that all six
combinations are meaningful or independently controllable through a chosen library's public API.

Make that compatibility test a go/no-go gate. Start the proof with the candidate's native lazy
computation and synchronous batching. Notification-only microtask coalescing is a separately labeled
experiment: delaying a Preact subscription receiver may leave every computed evaluation synchronous.
Any deferred-computation candidate must prove reduced evaluation counts, fresh in-batch reads and
correct callback timing using supported APIs. Do not construct a second scheduler/graph merely to
preserve the draft interface. Define bounded reentrant-update handling and a cycle/failure policy.

Count evaluations, notifications and allocations independently. Admit a candidate only with semantic
parity, supported provider APIs, one graph and bounded ownership/cleanup. Deferred delivery and
deferred computation are different experiments even when both use microtasks; label results by the
work actually avoided.

## 7. Preview lifetime and full-language direction

Follow underlying RN Fast Refresh preservation/reset behavior rather than custom state migration.
Emit stable, recognizable React component/custom-hook structure. Preserve component identity and
keys where semantics allow. Re-evaluate changed computations even when their data inputs compare
equal; a source edit changes code, not merely a source value.

Component-owned state, derived-expression identities, observer ownership and replaced-code
generations need explicit lifetimes. Dispose removed subscriptions and obsolete graphs; prevent
stale callbacks from publishing after replacement or unmount. A full JS reload resets in-memory
state. Persisted non-data state is a separate future store concern, not guaranteed by local hooks.

Keep three measurements and mechanisms distinct: live value updates, generated-module Fast
Refresh, and full runtime reload. A faster signal benchmark does not establish faster code refresh.
Investigate the best possible generated component/module boundaries and incremental publication
strategy, rather than assuming current single-module descriptors are optimal. Architectural critique
may recommend a better boundary; broad workspace/setup rewrites require separate scope agreement.

During the architecture proof compare stable component-only generated modules with separate shared
value/module wiring, grouped per source file versus per view. Establish which updates Metro actually
propagates and measure changed-output publication. Multi-file emission must preserve coherent build
generations; sequential file replacements alone do not retain the current single-file publication
property. Do not commit to a split before the integration/correctness and performance evidence.

The initial module candidate groups named components per Tao source file, exporting components
only; values and module wiring live separately. Keep paths and component names stable. Hook-bearing
injections remain named components/custom hooks within these modules, consistent with inline TS.
Begin with one observation boundary per Tao view instance, tracking its own consumed expressions;
child views own their reads. Compare finer observation only when a representative view demonstrates
unnecessary work. These are proof candidates, not benchmark conclusions or irreversible commitments.

The first publication experiment can prepare the full module tree before startup and update one
existing generated module. Topology or coordinated multi-module changes may use a clearly reported
controlled rebuild/reload until coherent incremental publication is proven. This is an experimental
boundary, not a shipped compatibility fallback. A generation-directory swap changing every module
path would confound component identity; do not use it to claim a narrow-refresh improvement.

Before simultaneous multi-file incremental updates, prove consumers cannot observe a mixed build
generation, including deliberately interrupted publication. Do not build a generic dependency
scheduler, filesystem transaction layer, migration registry or custom HMR protocol for the initial
proof. Wider publication changes require the evidence and scope decision at that gate.

The abstractions should leave room for future state, pure functions, actions, item fields and data
identity without implementing those language features now. Old item paths and schema subscriptions
are behavioral evidence, not the target granularity. Assess whether future member reads can track
only relevant receivers/fields and retarget dependencies without costly whole-graph rebuilding.

## 8. Implementation sequence after authorization

1. Establish the dirty starting snapshot, ownership and current performance baseline. Review this
   plan, reconcile material critique and obtain explicit implementation go-ahead.
2. Prove named component/hook structure, commit-owned lifetime, snapshot stability and equality
   adaptation against current supported views plus synthetic internal expressions. Include two
   mounted instances, an abandoned render, a hook-bearing injection, changed-code/unchanged-input
   refresh, removal and invalid-to-valid recovery. Resolve library limits before a broad rewrite.
   Then compare changed-module publication and observation granularity before investing in the
   additional computation/scheduling policies. Present any material architectural departure to
   the developer before committing the rest of the rewrite to it.
3. Implement the grammar/AST changes and generated semantic metadata, updating consumers in a
   coherent slice. Preserve working supported syntax and intermediate developer diagnostics.
4. Consolidate runtime emitters, lexical resolution and typed dispatch. Integrate the public Tao
   API and minimal generated calls with the proven reactive adapter and component boundaries.
5. Run common semantic tests across supported policies, compare real preview costs, choose a
   default, update specs and the runnable Kitchen Sink for changes to implemented functionality.

The architecture proof exits with an explicit result for each gate:

| Gate                    | Required evidence before broad integration                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Ownership/Refresh       | Correct named component/hook behavior, two instances, abandoned render, Strict Mode restart, removal and changed code |
| Snapshots/equality      | Stable React observation, fresh intervening reads, object outputs, signed zero, repeated NaN and batch reverts        |
| Policy feasibility      | Honest supported/unsupported labels; one graph; counted evaluations, deliveries and allocations                       |
| Publication/granularity | Measured same-fixture changes with stable module identity and an explicit coherent-update boundary                    |

If a gate fails, narrow or replace the candidate and rerun that proof. Do not advance the AST/compiler
rewrite on the assumption that a later adapter or scheduler will repair the foundation.

Keep every slice runnable. Prefer small implementations of the agreed contracts over framework
scaffolding. Source implementation and dependency installation are not authorized by writing this
plan or obtaining its review. Commit, push, merge and landing each follow current developer authority.

## 9. Verification and performance acceptance

Use minimal meaningful tests, dominated by representative Tao journeys. Internal tests cover only
the contracts not yet expressible in the current language: dynamic/diamond dependencies, cached
reads, equal results, nested/standalone batches, in-batch reads, reentrant updates and disposal.
Use recording schedulers/clocks for deterministic notification timing; do not assert fragile timings.

Exercise changed/unchanged hook topology, hook-bearing injections, failed-edit recovery, component
unmount and full reload. Compare observed behavior with normal RN behavior rather than asserting
unconditional state retention. Measure stale-owner cleanup, graph construction and allocations as
well as steady-state reads; avoid render-phase side effects and subscription leaks.

Compare the same baseline and candidate fixtures through the actual Studio/watch publication path:

- Text/layout/design edits and changed computation code.
- Small and larger views, shared dependencies and multiple mounted instances.
- Representative runtime mutations as a separate workload.
- Bursts of saves and invalid-to-valid recovery; warm runs plus cold/rebuild costs separately.

Attribute source-to-publication, publication-to-HMR, and HMR-to-React-commit/paint separately. Label
React commit receipts as such. Record host conditions, work counts and distributions. The under
100 ms preview goal is an aspiration, not permission to weaken correctness or invent a speed claim.

Caching and deferred batching are hypotheses. Existing scratch benchmarks compare engine operations,
not old Tao against this architecture, and exclude a broken Alien batching adapter. Reports live
under `.artifacts/notes/reactive-expression-benchmark/`. Select optimizations from end-to-end
evidence, not synthetic read speed or architectural familiarity.

During authorized implementation use `./agent fmt`, relevant focused tests and `./agent verify`.
Retain per-commit performance records when commits are authorized, and compare the branch-start
baseline against final implementation before any authorized landing. No review/commit/landing
approval is inferred from test results or this document.

## 10. Explicit deferrals and remaining uncertainty

- Transactions, rollback and asynchronous transaction semantics are outside the probable MVP slice.
- No new item/data/member/state/function language syntax or persistence implementation in this slice.
- No enforced TS import sandbox, separate injection modules, or custom hot-state migration.
- No speculative public API capabilities or dependencies beyond the approved candidate.
- Engine policy support, React ownership integration and fastest generated-module strategy remain
  implementation/review proof obligations, not established speedups.
- Existing environment friction: `./agent skill-script` lacks workspace alias resolution; scratch
  research used a temporary supported test runner instead. That workaround did not fix the tooling.
- Existing branch performance/archive and human-review gaps remain separate from plan approval.

## 11. Bounded reactive-engine strategy spike

- [ ] **Scope and timing:** coordinate the affected runtime/benchmark paths and baseline with the
      ongoing human review before starting; implementation requires separate authorization and must
      not advance review approvals. Start from [ReactiveEngine.ts](../../ts/7-runtime/runtime-src/client/ReactiveEngine.ts),
      [reactivity-performance.ts](../../ts/perf/perf-src/reactivity-performance.ts) and
      [reactivity-heap.ts](../../ts/perf/perf-src/reactivity-heap.ts). Production currently uses native-lazy
      computation and synchronous delivery; alternate policies are test/experiment hooks.
- **Bounded comparison:** while those hooks remain, evaluate native-lazy, uncached-public-read,
  observed-eager and deferred-notification approaches; add candidates only for a concrete gap.
  Make one initial comparison and at most one focused follow-up before the decision checkpoint;
  further research needs re-scoping. Compare correctness, representative app-update and preview
  performance, retained memory, implementation simplicity and maintenance cost. Serialize timing
  runs, retain evidence and limitations, and distinguish reactive updates from source-edit refresh,
  deferred notifications from deferred computation, and React commits from physical paint.
- **Decision checkpoint:** document one production computation/delivery approach with evidence and
  tradeoffs; settle the choice with the developer before cleanup.
- **Cleanup slice:** remove losing runtime options and unnecessary bookkeeping; update benchmarks,
  tests and documentation together. Keep useful Tao API and Metro correctness boundaries; retain
  no configurable strategies solely for hypothetical future experiments.
- **Acceptance:** one documented production approach; representative behavior and real Metro/React
  proofs preserve batching, read-your-writes, reentrant-delivery safety, stable React snapshots and
  subscription ownership/cleanup. Retain focused regression coverage and reproducible performance/
  memory evidence without unsupported paint claims; removed policies have no stale callers or docs.

## Critique requested

Give a prioritized assessment, not a preservation argument for existing code. Identify correctness
and performance traps, avoidable machinery, coupling between policy interfaces, missing lifetime
contracts and future-language constraints. Highlight sound constructs too. For each material issue,
give the affected plan section, concrete scenario, expected outcome/cost and direction of improvement.
Distinguish measured evidence, source-proven mechanics and unmeasured hypotheses. Describe major
restructuring enough to judge it; small findings need not prescribe the implementer's exact patch.
