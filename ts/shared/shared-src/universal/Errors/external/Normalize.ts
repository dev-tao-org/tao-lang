import { isTaoError } from '../Base'
import * as Values from '../Values'

/** fromUnknown normalizes an unknown thrown value into a Tao error. */
export function fromUnknown(error: unknown, details?: Values.ErrorDetails): Values.TaoError {
  if (isTaoError(error)) {
    return error
  }
  return new Values.UnexpectedBehaviorError(Values.unexpectedErrorMessage, { cause: error, details })
}
