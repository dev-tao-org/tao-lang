# Advanced Action Execution — post-MVP design

Post-MVP design for invocation handles and history, retained results, cancellation targeting, progress reporting, concurrency policies and safe retries. This document preserves accepted directions and, at the developer's explicit request, unresolved alternatives and relevant examples. MVP inspection supports aggregate `when ACTION` and first-match render `pick ACTION`; prior acceptance of richer inspection does not put it in MVP. Nothing here establishes implemented or verified behavior.

## Scope and dependency boundary

Cancellation is explicitly deferred in full: capability declarations, signalling, targeting, propagation, settlement and cancellation-specific status inspection. Retain the prior choices below for later work; do not implement cancellation to complete MVP aggregate matching.

Progress reporting is also deferred post-MVP. It is tracked here for continuity, not because it technically depends on retry. The MVP can show pending/slow/terminal outcomes without percentages.

Retry repeats an existing logical invocation with its recorded inputs and identity. A new `do` is a new invocation, not a retry. Retry is separate from reactive re-evaluation, a user's new submission after editing, and a provider's internal transaction/network recovery.

MVP action execution, generated sidecar contracts, aggregate matching through `when ACTION`, immutable values, drafts and transactional validation do not require these advanced inspection/replay APIs. No public actionStatus handle, invocation history or individual execution inspection is required for MVP. MVP failure presentation must not offer a generic retry control without a supported contract. App-authored recovery can correct inputs or deliberately create a new invocation where domain semantics permit it; this is not a universally safe replacement for retry after uncertain external effects.

Provider SDKs may perform their own documented transaction or transport retries. Their atomicity, authorization, deduplication and offline guarantees remain provider responsibilities; this deferral does not remove those requirements or authorize replay of arbitrary external side effects.

## Invocation inspection and retention (post-MVP)

### Previously accepted directions, now deferred

- `status Action` produces an idempotent reactive actionStatus handle for the action instance. Repeated access observes the same activity, not independent history. Applying status to an existing actionStatus is invalid.
- View-local actions have per-view-instance ownership that survives ordinary re-renders. Aggregate matching does not invoke actions or consume failures.
- Pending means any invocation remains pending. Slow concerns any currently executing invocation exceeding its threshold. Latest terminal outcome follows completion order, not start order; pending can coexist with the preceding completion/failure/cancellation outcome.
- The vocabulary is idle, pending, slow, cancelling, completed, failed, cancelled and concluded. Concluded replaces finished: for an invocation it means terminal; for an aggregate it means at least one terminal outcome and no pending invocations. Available result/ready and terminal execution are distinct concepts.
- A previous successful result remains available while a newer invocation is pending or fails. Automatic retention was bounded to pending invocations, latest concluded invocation and latest successful result; the last two can share a handle. Superseded terminal handles can be released when neither app code nor failure presentation retains them.
- Full automatic `operations Action` history was deferred. App-owned attachment rows/local actions or explicitly retained handles cover individual uploads initially. Inspection alone must not create infinite storage or alter retention merely because a view observes an action.
- Earlier collection direction uses registration order with StartedAt metadata separate; first/last retain normal list meaning. Aggregate most-recent outcome instead uses completion order.
- A `do` binding yields ordinary returned data, not a transparent Operation wrapper. This remains compatible with MVP and is not reversed by deferring individual inspection.
- Cancellation capability means the implementation accepts a signal, not proof an external effect was undone. A sidecar explicitly settles cancellation; pending lasts until then. Local cancellation does not prove remote rollback.

### Open decisions and examples to resume

- Direct action predicates such as `Action is pending`, boolean `when Action is concluded`, and separately named status values were explored alongside direct `when Action`. Aggregate `when Action` and first-match render `pick Action` remain in MVP; precise richer syntax can resume later.
- Explicit invocation capture through `on started`, action-result slots and their relation to latest-status selection remain unresolved.
- Exact public access to retained invocations: proposed actionStatus fields Pending, LastConcluded and LastCompleted versus selection expressions. These field names were NOT accepted.
- Exact invocation handle type, typed return access, captured argument exposure, capability inference and mixed-operation collections. Earlier Action result slots, return-value-plus-operation wrappers and resource/results abstractions are context, not selected MVP APIs.
- Whether `cancel` accepts only one invocation handle or also an action aggregate (all current pending invocations). A snapshot loop over proposed Activity.Pending would exclude later invocations; no targeting rule was selected.
- Cancellation propagation through awaited child actions: proposed propagation concludes the caller and skips subsequent statements unless explicitly handled, versus failure or optional-return behavior. No option was selected. File-picker cancellation may instead be successful return of an empty selection; do not conflate the two.
- History ownership across view disposal, app restart and background work; explicit app retention versus bounded runtime retention; separate bounded developer event logs and durable job entities. Do not make a dev log the application data model by accident.
- Latest completed result by completion order versus latest-request-wins presentation for search/autocomplete; invocation arguments/keys may be needed to express the latter.
- Failure acknowledgment/dismissal and cleanup of retained failure payloads. Observing a failure does not handle it; removing an example row is app behavior, not automatically language-level acknowledgment.
- Examples explored: a read-only request with a button labelled Retry that starts a NEW invocation; multiple attachment rows with local upload actions; progress/cancel/concluded dismissal; charge then receipt showing unsafe parent replay; changing subscriber lists showing unstable child execution positions. Example app choices are not language requirements and examples are not to be committed as apps without later authorization.
- ActionButton's exact callable parameter type, aggregate progress forwarding, operation-result selection and library implementation remain incomplete. Do not bring individual invocation machinery into MVP solely to implement the example control.

## Retry directions retained for later implementation

- Policies are declarations at the beginning of the action body, before executable statements. They configure admission/execution rather than execute as body statements. Placement errors belong to validation, not parsing.
- Policy spelling is `retry { ... }`, distinct from the capability predicate `Operation can retry`.
- `can retry` describes supported capability, inferred statically where possible and checked for unions where necessary. It does not express present eligibility to start another attempt.
- A policy requires a safe-retry contract. Merely declaring it does not assert that arbitrary effects can safely repeat. Individual child retry capabilities alone do not prove safe replay of a multi-effect body.
- Retry preserves captured submitted inputs and logical identity. Authors must not need an explicit intermediate `let Submitted` to avoid accidentally capturing new closure values on retry. Current backend reads and authorization are checked again; captured inputs are not cached authority.
- Public retry cannot start another attempt while the invocation is pending. Waiting for a managed automatic retry remains pending.
- Use one `delay` policy, not separate delay and backoff settings. Policy functions use inline pure expressions such as `auto Context -> Context.RetryCount < 3`, with block bodies available under ordinary pure-function rules. Exact context fields and counting conventions remain open.
- `delay` governs automatic retries only. Manual retry after terminal failure remains subject to capability, pending and other valid domain constraints; no separate manual cooldown was selected.
- `concurrency reject` prevents a competing invocation while one remains pending, including automatic retry delays. A competing call receives a busy failure that bypasses automatic retry. Retry-policy configuration does not itself establish safe external-effect deduplication.
- Aggregate slow detection concerns currently executing invocations exceeding their threshold. Retry waiting does not count as executing slowly.
- Passive inspection does not consume failures. Explicit handlers own presentation and default recovery UI covers otherwise unhandled failures. Acknowledgment is distinct from resolving the underlying operation; unrelated success does not resolve an older failed invocation.

## Illustrative accepted direction

This example preserves the intended policy layout. It is not executable proof; duration syntax, callback context and the bridge's safety evidence require implementation design.

```tao
// Examples/Editor.tao — post-MVP design
action Save(Body text) {
   concurrency reject

   retry {
      auto Context -> Context.RetryCount < 3
      delay Context -> 2 seconds
   }

   do StoreDocument(Body)
}
```

## Remaining decisions

### Safe replay and composition

- What exact contract establishes safe retry for a sidecar/provider operation, how is it declared in Tao and generated SDK types, and what executable conformance evidence supports it?
- The developer proposed accepting a retrying body when every child supports retry. The unresolved additional requirement is stable child identity across parent attempts, plus safe handling of completed steps, failed steps and external effects whose outcome is unknown.
- Choose the initial supported subset: direct bridge operations/transparent forwarding only, or broader replay-safe sequences. No subset was selected before deferral.
- Define child identity in branches, loops, recursion and reordered collections. Execution position alone is unsafe when a query or collection changes between attempts.
- Decide whether completed child results are retained/reused, how their inputs are checked, and what happens when recomputation would change a child invocation. Decide which reads are refreshed and which values belong to the original submitted intent.
- Define nested retry policies and budgets without multiplying attempts unexpectedly. Determine whether pure preparatory calculations are replayed and how captured state reads are bounded.
- Define behavior across view disposal, process restart, persisted drafts and provider reconnect. Persistence of invocation identities/results, server deduplication retention and crash recovery are not yet promised.

### Eligibility and scheduling

- Define RetryContext fields, the meaning of RetryCount, attempt limits and defaults; distinguish retries from the initial attempt.
- Determine which failures are eligible: invalid input, authorization, conflicts, transport failure, rate limiting, server busy and uncertain completion. Static capability and per-failure eligibility are distinct.
- Specify manual retry versus an already scheduled automatic retry, including races, atomic eligibility checks and duplicate UI activation. No implicit cancel-on-retry rule was selected.
- Define connectivity reporting, offline waiting, reconnection and provider scheduling ownership. Avoid creating a universal Tao synchronization engine by accident.
- Define delay function inputs, bounded/backoff policies, jitter, server retry hints and timer ownership. Core duration/numeric design remains a separate prerequisite.
- Decide bare `retry` behavior and policy defaults. Proposed manual-only meaning was not accepted.

### Concurrency syntax

- `concurrency reject` has the accepted behavior above. Later exploration proposed `parallel`, `queue` or `serial` and shorthand `retry serial`; none of those extensions was accepted.
- If reconsidered, distinguish waiting from rejecting, specify whether shorthand also sets concurrency, and diagnose duplicate/conflicting declarations. Parallel invocations can each be safely retryable; concurrency and replay safety are separate dimensions.
- Action-level invocation queues were dropped from the current design. Provider-owned offline write queues are not the same feature. Do not restore a language queue as an incidental retry implementation detail.
- Concurrency policies, including reject/serial/queue/parallel exploration, are also explicitly deferred post-MVP. MVP controls may check pending status before invoking; this is not a global concurrency guarantee.

### Results, failures and user experience

- Decide whether retries share one result handle and how attempt history, timestamps, explanations, progress and unresolved failures are exposed and retained.
- Define retention and acknowledgment of older invocation failures alongside the selected [MVP aggregate matching rules](../Specification/Actions%20and%20Results.md#when-action). Aggregate pending and the most recently concluded terminal outcome are already defined; they do not determine whether an older failure remains available for inspection or recovery.
- Specify acknowledgment/dismissal versus resolution, successful retry versus superseding submission, and conflict recovery. A changed-input resolution should not silently be called the same-input retry.
- Define cancellation and timeout interactions, including best-effort cancellation signals and effects that can complete after the caller stops waiting. No assumption that timeout proves an effect did not occur.
- Decide how default failure UI offers recovery safely and how custom views inspect availability and reasons without losing the capability/eligibility distinction.

## Progress reporting (post-MVP)

- Preserve the distinction between progress information and terminal success: 100% request bytes sent does not establish server acceptance or durable storage.
- Progress may be indeterminate. A known asset size alone is insufficient: the transport must expose sent-byte events, and numerator/denominator must describe the same transmitted representation (raw file versus multipart/encoded body).
- Remaining design: Tao declaration of progress capability/payload; generated sidecar reporting interface; managed callback failure/lifetime handling; typed transferred/total values; unknown totals; sparse updates; parent/child progress forwarding; selection under overlapping invocations; upload phases versus processing; cleanup after cancellation/conclusion.
- Future examples may sketch a typed progress payload and generated reporting context, but their exact syntax/API is not accepted by being illustrated.

## Implementation entry gate after MVP

Resume with concrete Tao and corresponding generated TypeScript contracts. Select a bounded replay subset and prove its external-effect identity/failure behavior before adding convenience syntax or automatic recovery UI. Include authored app journeys and a real compiled ts-library consumer. Tests should exercise a successful effect followed by failure, uncertain completion, competing calls and retry identity—not just a repeated pure function.

Owning related documents: [Actions and Results](../Specification/Actions%20and%20Results.md), [Runtime PoC](Tao%20Runtime%20PoC.md), [Provider Conformance](Tao%20Provider%20Conformance.md), and [Data Access and Validation](../Specification/Data%20Access%20and%20Validation.md).
