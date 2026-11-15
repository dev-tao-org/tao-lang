# Runtime TypeScript API WIP

Tao exposes one public runtime API to authored TypeScript in sidecars, injections and Tao modules, including the standard library.

```ts
import Tao from '@tao/runtime-api'
```

#### Availability

The entrypoint is available to sidecars, injections and standard-library implementations. Import
restrictions will be enforced later; documentation presents only the public API.

#### `Tao`

Authored TypeScript accesses runtime capabilities through the single `Tao` object. Inline injections
receive that same API object alongside their explicit captures, without importing inside the body.
Only capabilities needed by authored implementations belong in this API.

#### Named input types

In the agreed future generated TypeScript API, named Tao input types remain distinct and use generated checked constructors. Named argument objects require those typed values rather than raw primitives. Construction enforces declared value constraints, not authorization or database access.

Named values use immutable representations that retain nominal identity at runtime, rather than compile-time-only primitive branding. Generated return values preserve declared named Tao types. Extracting primitives for external libraries is explicit. Nominal value representation is separate from reactive expression wrappers.

The agreed future SDK also wraps core `text`, `number` and `boolean` values rather than supplying raw JavaScript primitives as pure sidecar inputs or results. Immutable snapshot wrappers remain distinct from live reactive readers; their checked constructors use the lowercase core names. Earlier raw-primitive signature examples are superseded.

External data enters through explicit generated checked decoding using `Type.from(input)`. Invalid representations or values that violate declared constraints are rejected rather than silently coerced. Decoding does not grant authorization. Values expose `encode()` for their external JavaScript representation.

TypeScript consumers use Tao SDK functions for Tao equality and corresponding Tao-defined value operations, sharing the language's semantics rather than reimplementing them with JavaScript operators. Exact SDK function names remain to be designed.

Nominal value equality compares declaration identity and contained value, not wrapper allocation identity. Separate loaded copies of the same compiled declaration share stable nominal identity rather than requiring the same JavaScript constructor instance. Different nominal declarations remain distinct even when their payloads match. Identity compatibility across differing declaration versions remains a separate contract.

Incompatible loaded definitions of the same nominal declaration are rejected with a diagnostic rather than admitted by structural similarity. Ordinary checked decoding accepts external plain records, lists and primitives; opaque host objects require explicit conversion instead of automatic property/getter inspection.

#### Generated sidecar contracts

The compiler generates the interfaces and function or method signatures a sidecar implementation must satisfy from its Tao declaration. The sidecar conforms to that generated contract rather than separately defining the requirements exposed to Tao callers.

The owning `.tao` module is the canonical TypeScript import surface for generated types, factories and implementation contracts. Pure callbacks and action callbacks have distinct generated contracts: pure callbacks participate in evaluation, while action callbacks explicitly invoke effects.

Each Tao file may have at most one sidecar, named to match that Tao file. The exact filename convention and whether the Tao declaration can omit the implementation pathname are deferred decisions. A sidecar may import ordinary private TypeScript helper modules without giving each helper a Tao declaration; their execution remains subject to the owning managed boundary.

Sidecars are expected to import their owning Tao module and use its generated API for implementation. Calling generated Tao functions, including functions in that same module, is a supported boundary. Normal checked construction, encoding and decoding helpers hide runtime factory plumbing from sidecar authors.

Requirements that cannot be inferred from an opaque implementation are declared on its Tao sidecar declaration. Reuse ordinary Tao concepts where possible; add sidecar-specific declaration syntax where needed rather than introducing general language syntax solely for an implementation boundary. TypeScript metadata does not silently add caller or host requirements absent from the declared contract.

#### Encoding and implementation objects

In the agreed future contract, a value's `encode()` returns its external JavaScript representation, not JSON text. Directly imported generated construction helpers validate inputs and reject invalid values, producing immutable Tao values without requiring JavaScript class-constructor syntax.

Encoding recursively converts ordinary record fields and list entries. Unsupported values raise a typed Tao failure rather than silently producing a partial representation. Opaque capabilities require an explicit encoding contract. `Type.from` rejects already-typed values of unrelated nominal types instead of automatically unwrapping them; explicit extraction followed by checked construction is permitted. This does not change the separately agreed ancestor/descendant construction rules.

Checked construction uses the directly imported type's `from` function, such as `TemperatureReading.from(input)`. Invalid input raises a typed Tao failure handled through the surrounding Tao execution boundary.

Checked record construction rejects undeclared external fields rather than silently discarding them. Construction failures collect multiple issues within a bounded diagnostic budget and include field paths. The failure retains the full rejected payload without diagnostic truncation. Full-payload inspection is exposed through its debug `Render` method, rather than raw string output or ordinary public payload access. That rendering presents useful debugging context and a best-effort expandable value tree. Default error messages, UI and logs omit rejected values. A bounded issue count does not truncate the separately retained payload.

Structured issue metadata, including kinds, field paths and constraints, remains programmatically accessible to app logic. The full-payload diagnostic rendering restriction does not hide that metadata.

Each sidecar provides one default implementation object through `sidecar.implement`, a concretely typed generated helper exported by its owning Tao module. This replaces the earlier top-level `ImplementSidecar` export design. The helper's concrete interface covers the declarations assigned to the sidecar, supplying contextual method and parameter types and editor completion. Authors do not supply a generic interface argument at each implementation.

Compiler/SDK-defined imports use lowercase names, while authored Tao declarations use uppercase names. No `$` prefix is needed for the generated namespace. Core SDK constructors use lowercase `text`, `number` and `boolean`. SDK arithmetic initially requires explicit wrapped core operands, such as `tao.number.from(2)`; implicit JavaScript literal wrapping is deferred for possible later simplification. These are future naming and boundary rules; existing runtime names elsewhere in this document describe current implementation.

#### Managed sidecar execution

All sidecar execution belongs to Tao-managed execution. Returned promises and additional asynchronous work or callbacks must participate through managed interfaces and helpers, so runtime exceptions become defined Tao failures and reach declared application handling. Generated contracts, documentation and discoverable defaults guide authors through this path; arbitrary detached work that bypasses it is outside that guarantee.

Network and storage effects occur inside invoked sidecar actions, not during module loading. Module scope contains declarations and configuration; module-loading exceptions still enter defined Tao failure handling. An asynchronous module-initialization lifecycle is not part of this initial contract.

The generated boundary preserves existing typed Tao failures and normalizes unexpected host exceptions into typed failures with diagnostic information. Authors can explicitly translate known external errors into domain failures, supported by helpers and automation where possible. Runtime results are checked against the generated return contract, with fast paths for validated immutable Tao values.

Action implementations may return synchronously or through a promise; the managed boundary handles either. Pure function implementations remain synchronous. Standard decoding, return-contract and unexpected-host failures are implicit and documented rather than listed on every declaration; explicit domain failures remain separately declared.

Pure sidecars may mutate private local construction buffers. Caller-owned inputs and published outputs remain protected; private construction does not authorize external effects or mutation.

#### Pure function sidecar inputs

In the agreed future contract, pure function sidecars receive immutable input snapshots without live subscriptions or write authority. Their snapshot wrappers retain the one-shot immutable observation behavior. Tao manages reactive evaluation around the call: changed inputs cause recomputation, and equal outputs do not propagate downstream. Sidecars compute a result rather than managing subscriptions.

The compiler and runtime automatically create and own reactive evaluation wrappers. Pure sidecar authors implement ordinary snapshot-in/result-out functions without constructing those wrappers. Tao-authored callbacks invoked synchronously within an evaluation retain their captured reactive dependencies. Callback identity alone is insufficient to determine whether the enclosing computation is current. Per-item caching is a separate optimization, not required for correctness.

#### Pure callback lifetime

Callbacks supplied to a pure sidecar evaluation may be invoked only during their owning evaluation. The generated runtime wrapper rejects invocation after that evaluation has ended; retaining a callback does not extend its lifetime. View event handlers and action callbacks have separately declared lifetimes. This rule does not by itself define the contract for pure functions returned as values.

Generated pure callback signatures use named argument objects, consistent with other generated calls; for example, `Keep({ Credit })`.

#### View sidecar inputs

In the agreed future contract, ordinary view-sidecar parameters such as `Value text` receive read-only reactive readers, supporting current-value reads, `observe` and `onChange`. Immutable arguments satisfy the same read contract: observation delivers once and change-only observation never delivers. A `state` parameter additionally grants write authority. This supersedes current raw snapshot props for ordinary view-sidecar inputs; pure function and action input contracts are separate.

#### Writable sidecar parameters

In the agreed future syntax, `view NameEditor(Value state text) from ./NameEditor.tsx` declares that the sidecar receives writable access to caller-owned storage. The compiler generates the writable parameter contract. The parameter does not create a copy or own new storage; writable fields of local draft state can satisfy it. This replaces the legacy sidecar `mutable` spelling.

#### Runtime boundary

Compiler-generated code may use internal runtime operations. Authored TypeScript uses the public
API and does not depend on those operations or React Native directly. Native implementation details
stay behind API-owned contracts rather than a re-exported React Native namespace.

#### Disabled interaction

In the agreed future behavior, core Tao controls honor inherited disabled state automatically, including when composed inside a TypeScript sidecar. A raw custom control must honor that state and suppress user-triggered interaction while disabled. Programmatic work continues. See [Actions and Results](Actions%20and%20Results.md#disabled-interaction).

#### `Tao.Text`, `Tao.View`, `Tao.TextInput`, `Tao.Pressable`

These components provide the supported native presentation capabilities. `Tao.Pressable` groups
synchronous updates made by its `onPress` callback into one batch.

#### `Tao.useWritable(() => value)`

Retains one writable expression for a mounted component. Its initializer supplies the initial value;
later writes use `update`. Existing Tao text parameters and explicit text captures are plain strings.

#### `Tao.useComputed(() => value, [inputs])`

Creates a pure computed expression from stable inputs. Expression reads inside the calculation track
dependencies; callers must not depend on how often the calculation runs.

#### `Tao.useValue(expression)`

Reads an expression and subscribes the mounted component to changed values. Rendering alone does not
attach an observation; abandoned renders and unmounted components retain no subscription.

#### `expression.jsValue()`

Returns the underlying raw, non-reactive JavaScript value, evaluating the expression when needed.
Receiving that value does not itself subscribe the caller to later changes. Object-valued results
are shared read-only snapshots, without copying on each read; writes use Tao's writable APIs.

#### `writable.update(value)`

Changes the writable value immediately. Subsequent reads see the new value; observer delivery
follows the enclosing batch's settlement.

#### `expression.observe(callback)`

Calls the callback immediately with the current raw JavaScript value, then with changed values after
each batch. Returns an object with an `unobserve()` method that stops observation.
The current implementation compares values with `Object.is`. The agreed future [value equality](Reactive%20Expressions.md#value-equality) compares ordinary lists and records by contents while preserving explicit entity and operation identity.

#### Immutable and changing values

The agreed future contract distinguishes immutable snapshots, reactive readers and writable references. Immutable values also support observation: `observe` calls back immediately once, retains no subscription, and returns an observation whose `unobserve()` is harmless. Reactive readers deliver the initial value and subsequent changed values. Observation does not grant write authority.

#### `expression.onChange(callback)`

In the agreed future API, `onChange` observes subsequent value changes without initial delivery. On an immutable value it never invokes the callback and retains no subscription. It returns the same observation-handle contract as `observe`.

#### Observation lifetime

In the agreed future contract, view-owned observations automatically stop when their view is disposed. Callers may stop them earlier with `unobserve()`. Observations outside views require an explicit lifetime owner or explicit cleanup. Observing a value does not tie the subscription's lifetime to the value itself.

#### Sidecar value ownership

In the agreed future contract, sidecars receive deeply read-only types for ordinary Tao list and record snapshots, backed by runtime-owned immutable snapshots. They publish replacements or use an explicit reactive mutation interface. Types and API names distinguish observation from write authority.

When accepting ordinary external lists and records, the runtime copies them into owned immutable snapshots so retained external references cannot mutate published values. Already-owned snapshots can be reused; reads need not copy. Entity and operation handles remain distinct capabilities rather than values recursively copied or frozen. The precise representation and protection mechanism remain implementation-design work.

```ts
const observation = expression.observe(value => console.log(value))
observation.unobserve()
```

#### Batches

`Tao.Pressable` groups synchronous mutations inside its `onPress` callback. Individual writes also
settle a batch. Writes are visible immediately; observers receive changed values when the batch
settles. A batch does not remain open across an asynchronous wait.

#### Preview updates

Recompiled components follow React Native Fast Refresh's normal Hook-state behavior, including its
preservation and reset rules. Tao does not impose a separate initializer-reset policy. Changed
computation code invalidates its previous cached result, and removed observations are released.
A full runtime reload resets in-memory state.

#### Upcoming features

The expression contract leaves room for future item and data member reads, functions, state and
asynchronous results. This slice does not implement item or data types or their member behavior.
