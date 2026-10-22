# Runtime TypeScript API WIP

Tao exposes one public runtime API to authored TypeScript in sidecars, injections and Tao modules, including the standard library.

```ts
import Tao from '@tao/runtime-api'
```

#### Availability

This entrypoint is agreed future behavior and is not implemented yet. Import restrictions will be
enforced later; documentation presents only the public API.

#### `Tao`

Authored TypeScript accesses runtime capabilities through the single `Tao` object. Inline injections
receive that same API object alongside their explicit captures, without importing inside the body.
Only capabilities needed by authored implementations belong in this API.

#### Runtime boundary

Compiler-generated code may use internal runtime operations. Authored TypeScript uses the public
API and does not depend on those operations or React Native directly. Native implementation details
stay behind API-owned contracts rather than a re-exported React Native namespace.

#### Expressions

The planned common expression contract covers constants, references and computed values. Expressions
may reuse results while their dependencies are unchanged; callers must not depend on how often a
pure calculation runs. Reading a function value does not itself invoke the function.

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
Values are compared with `Object.is`.

```ts
const observation = expression.observe(value => console.log(value))
observation.unobserve()
```

#### Batches

Tao groups synchronous mutations within actions, UI events and data-provider deliveries. Writes
are visible immediately; observers receive changed values when the batch settles. A batch does not
remain open across an asynchronous wait.

#### Preview updates

Recompiled components follow React Native Fast Refresh's normal Hook-state behavior, including its
preservation and reset rules. Tao does not impose a separate initializer-reset policy. Changed
computation code invalidates its previous cached result, and removed observations are released.
A full runtime reload resets in-memory state.

#### Upcoming features

The expression contract leaves room for future item and data member reads, functions, state and
asynchronous results. This slice does not implement item or data types or their member behavior.
