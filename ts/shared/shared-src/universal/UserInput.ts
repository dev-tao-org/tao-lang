import * as Errors from './Errors'

export { requireInput as require }

/** requireInput checks a caller-correctable condition and throws a user input error on failure. */
function requireInput(condition: boolean, message: string): asserts condition {
  if (typeof condition !== 'boolean' || typeof message !== 'string') {
    Errors.ThrowShouldNeverHappen('A condition check requires a boolean and a string message.')
  }
  if (!condition) {
    Errors.ThrowUserInput(message)
  }
}
