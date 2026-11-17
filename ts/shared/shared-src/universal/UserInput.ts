import { requireCheckArguments } from './CheckArguments'
import * as Errors from './Errors'

export { requireInput as require }

/** requireInput checks a caller-correctable condition and throws a user input error on failure. */
function requireInput(condition: boolean, message: string): asserts condition {
  requireCheckArguments(condition, message)
  if (!condition) {
    Errors.ThrowUserInput(message)
  }
}
