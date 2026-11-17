import * as Errors from './Errors'

/** requireCheckArguments rejects malformed calls without inspecting or attaching their arguments. */
export function requireCheckArguments(condition: unknown, message: unknown): void {
  if (typeof condition !== 'boolean' || typeof message !== 'string') {
    Errors.ThrowShouldNeverHappen('A condition check requires a boolean and a string message.')
  }
}
