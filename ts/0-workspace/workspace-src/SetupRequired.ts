import { Errors, UserInput } from '@shared'

/** isSetupRequired identifies routine setup separately from unsafe repairs and invalid source. */
export function isSetupRequired(error: unknown): error is Errors.TaoError {
  return Errors.isTaoError(error) && error.details?.setupRequired === true
}

/** requireSetup suspends a workflow until its request-scoped UI authorizes setup. */
export function requireSetup(message: string): never {
  return UserInput.fail(message, { setupRequired: true })
}
