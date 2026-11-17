import * as Errors from './Errors'

export { requireInput as require }

/** fail raises a caller-correctable failure, preserving diagnostic details and its cause. */
export function fail(message: string, details?: Errors.ErrorDetails, opts?: { cause?: unknown }): never {
  if (typeof message !== 'string') {
    Errors.ThrowShouldNeverHappen('An input failure requires a string message.')
  }
  return Errors.Throw(Errors.createUserInputError(message, details, opts))
}

/** requireInput checks a caller-correctable condition and throws a user input error on failure. */
function requireInput(condition: boolean, message: string): asserts condition {
  if (typeof condition !== 'boolean' || typeof message !== 'string') {
    Errors.ThrowShouldNeverHappen('A condition check requires a boolean and a string message.')
  }
  if (!condition) {
    fail(message)
  }
}
