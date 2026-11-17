import { UserInput } from '@shared'
import Preact from './Bridge_preact-signals-core'

/** runSynchronousReactiveBatch settles authored writes and rejects asynchronous batch callbacks. */
export function runSynchronousReactiveBatch<T>(perform: () => T): T {
  let result!: T
  Preact.batch(() => {
    result = perform()
  })
  UserInput.require(!isThenable(result), 'Reactive batches must finish synchronously; do not return a Promise.')
  return result
}

/** isThenable detects a callable then method at synchronous reactive boundaries. */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (!isObjectOrFunction(value)) {
    return false
  }
  return typeof (value as PotentialThenable).then === 'function'
}

type ObjectOrFunction = object | Function
type PotentialThenable = { then?: unknown }

function isObjectOrFunction(value: unknown): value is ObjectOrFunction {
  return typeof value === 'object' && value !== null || typeof value === 'function'
}
