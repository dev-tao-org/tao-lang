import * as Errors from './Errors'

/** Try normalizes failures, allows recovery, and finalizes once with the original callback failure.
 *  Synchronous stages return synchronously; promise-like stages are awaited. Finalizer failures override
 *  pending results or failures, just like native finally, and are normalized before propagation.
 *  Both handlers are optional; without catch, the normalized failure propagates. */
export function Try<Value, Recovery = never, Final = void>(
  action: () => Value,
  options: TryOptions<Recovery, Final> = {},
): TryResult<Value, NoInfer<Recovery>, NoInfer<Final>> {
  const completed = continueWith(capture(action), original => {
    const handled = !original.ok && options.catch
      ? capture(() => options.catch!(original.thrown))
      : original
    return continueWith(handled, result => {
      if (!options.finally) {
        return result
      }
      return continueWith(
        capture(() =>
          options.finally!(
            original.ok ? undefined : original.thrown,
            original.ok ? undefined : original.error,
          )
        ),
        finalized => finalized.ok ? result : finalized,
      )
    })
  })
  return (completed instanceof Promise ? completed.then(unwrap) : unwrap(completed)) as TryResult<
    Value,
    Recovery,
    Final
  >
}

/** Try.WithDefault returns a fixed fallback when the callback throws or rejects. */
export namespace Try {
  /** WithDefault returns a fixed fallback when the callback throws or rejects. */
  export function WithDefault<Value, Default>(
    defaultValue: Default,
    action: () => Value,
  ): TryResult<Value, Default, void> {
    return Try(action, {
      catch: () => defaultValue,
    }) as TryResult<Value, Default, void>
  }
}

type AlwaysPromise<T> = [T] extends [never] ? false : [T] extends [PromiseLike<unknown>] ? true : false
type MayBePromise<T> = [Extract<T, PromiseLike<unknown>>] extends [never] ? false : true
type TryValue<Value, Recovery> = Value | Recovery
type SettledTryValue<Value, Recovery> = Awaited<Value> | Awaited<Recovery>
type TryStages<Value, Recovery, Final> = Value | Recovery | Final
type AsyncActionResult<Value, Recovery> =
  | Exclude<Recovery, PromiseLike<unknown>>
  | Promise<SettledTryValue<Value, Recovery>>
type MixedTryResult<Value, Recovery> =
  | Exclude<TryValue<Value, Recovery>, PromiseLike<unknown>>
  | Promise<SettledTryValue<Value, Recovery>>
type TryResult<Value, Recovery, Final> = AlwaysPromise<Final> extends true ? Promise<SettledTryValue<Value, Recovery>>
  : AlwaysPromise<Value> extends true ? AsyncActionResult<Value, Recovery>
  : MayBePromise<TryStages<Value, Recovery, Final>> extends true ? MixedTryResult<Value, Recovery>
  : TryValue<Value, Recovery>
type Outcome = { ok: true; value: unknown } | { ok: false; thrown: unknown; error: Errors.TaoError }
type PendingOutcome = Outcome | Promise<Outcome>
type OptionalTaoError = Errors.TaoError | undefined

type TryOptions<Recovery = never, Final = void> = {
  catch?: (thrown: unknown) => Recovery
  finally?: (thrown: unknown, error: OptionalTaoError) => Final
}

// Native try/catch is the primitive behind Try; callers use the normalized boundary above.
function capture(action: () => unknown): PendingOutcome {
  try {
    const value = action()
    if (isPromiseLike(value)) {
      return Promise.resolve(value).then(value => ({ ok: true, value }), failure)
    }
    return { ok: true, value }
  } catch (thrown) {
    return failure(thrown)
  }
}

function failure(thrown: unknown): Outcome {
  return { ok: false, thrown, error: Errors.fromUnknown(thrown) }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (value === null) {
    return false
  }
  const canHavePromiseMethods = typeof value === 'object' || typeof value === 'function'
  return canHavePromiseMethods && typeof (value as PromiseLike<unknown>).then === 'function'
}

function continueWith(result: PendingOutcome, next: (outcome: Outcome) => PendingOutcome): PendingOutcome {
  return result instanceof Promise ? result.then(next) : next(result)
}

function unwrap(outcome: Outcome): unknown {
  if (!outcome.ok) {
    Errors.Throw(outcome.error)
  }
  return outcome.value
}
