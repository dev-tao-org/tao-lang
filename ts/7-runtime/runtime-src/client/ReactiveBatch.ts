import { Errors } from '@shared'
import Preact from './Bridge-Preact'

/** runSynchronousReactiveBatch settles authored writes and rejects asynchronous batch callbacks. */
export function runSynchronousReactiveBatch<T>(perform: () => T): T {
  let result!: T
  Preact.batch(() => {
    result = perform()
  })
  if (isThenable(result)) {
    Errors.ThrowUserInput('Reactive batches must finish synchronously; do not return a Promise.')
  }
  return result
}

type ObjectOrFunction = object | Function

function isThenable(value: unknown): boolean {
  if (!isObjectOrFunction(value)) {
    return false
  }
  return 'then' in value
}

function isObjectOrFunction(value: unknown): value is ObjectOrFunction {
  return typeof value === 'object' && value !== null || typeof value === 'function'
}
