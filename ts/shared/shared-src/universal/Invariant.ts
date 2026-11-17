import * as Errors from './Errors'

/** Invariant checks a condition guaranteed by Tao and throws an internal error on failure. */
export function Invariant(condition: boolean, message: string): asserts condition {
  if (typeof condition !== 'boolean' || typeof message !== 'string') {
    Errors.ThrowShouldNeverHappen('A condition check requires a boolean and a string message.')
  }
  if (!condition) {
    Errors.ThrowShouldNeverHappen(message)
  }
}
