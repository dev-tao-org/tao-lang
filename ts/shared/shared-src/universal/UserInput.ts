import * as Errors from './Errors'

export { RequireInput as Require }

/** Fail raises a caller-correctable failure, preserving diagnostic details and its cause. */
export function Fail(message: string, details?: Errors.ErrorDetails, opts?: { cause?: unknown }): never {
  if (typeof message !== 'string') {
    Errors.ThrowShouldNeverHappen('An input failure requires a string message.')
  }
  return Errors.Throw(Errors.createUserInputError(message, details, opts))
}

/** RequireInput checks a caller-correctable condition and throws a user input error on failure. */
function RequireInput(condition: boolean, message: string): asserts condition {
  if (typeof condition !== 'boolean' || typeof message !== 'string') {
    Errors.ThrowShouldNeverHappen('A condition check requires a boolean and a string message.')
  }
  if (!condition) {
    Fail(message)
  }
}
