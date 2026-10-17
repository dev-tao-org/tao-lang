import * as Errors from './Errors'

/** TryOptions supplies optional recovery and finalization handlers. */
export type TryOptions<Recovery = never, Final = void> = {
  catch?: (thrown: unknown) => Recovery
  finally?: (thrown: unknown, error: Errors.TaoError | undefined) => Final
}

type AlwaysPromise<T> = [T] extends [never] ? false : [T] extends [PromiseLike<unknown>] ? true : false
type TryResult<Value, Recovery, Final> = AlwaysPromise<Value> extends true ? Promise<Awaited<Value> | Awaited<Recovery>>
  : AlwaysPromise<Final> extends true ? Promise<Awaited<Value> | Awaited<Recovery>>
  :
    | Value
    | Recovery
    | (Extract<Final, PromiseLike<unknown>> extends never ? never : Promise<Awaited<Value> | Awaited<Recovery>>)

type Outcome = { ok: true; value: unknown } | { ok: false; thrown: unknown; error: Errors.TaoError }
type PendingOutcome = Outcome | Promise<Outcome>

/** Try normalizes failures, allows recovery, and finalizes once with the original callback failure.
 *  Synchronous stages return synchronously; promise-like stages are awaited. Finalizer failures override
 *  pending results or failures, just like native finally, and are normalized before propagation. */
export function Try<Value, Recovery = never, Final = void>(
  action: () => Value,
  options: TryOptions<Recovery, Final> = {},
): TryResult<Value, Recovery, Final> {
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

function failure(thrown: unknown): Outcome {
  return { ok: false, thrown, error: Errors.fromUnknown(thrown) }
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

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as PromiseLike<unknown>).then === 'function'
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
