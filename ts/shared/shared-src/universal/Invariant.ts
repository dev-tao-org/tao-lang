import { requireCheckArguments } from './CheckArguments'
import * as Errors from './Errors'

/** Invariant checks a condition guaranteed by Tao and throws an internal error on failure. */
export function Invariant(condition: boolean, message: string): asserts condition {
  requireCheckArguments(condition, message)
  if (!condition) {
    Errors.ThrowShouldNeverHappen(message)
  }
}
