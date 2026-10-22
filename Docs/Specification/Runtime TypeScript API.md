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

#### Runtime boundary

Compiler-generated code may use internal runtime operations. Authored TypeScript uses the public
API and does not depend on those operations or React Native directly. Native implementation details
stay behind API-owned contracts rather than a re-exported React Native namespace.

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
Values are compared with `Object.is`.

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
