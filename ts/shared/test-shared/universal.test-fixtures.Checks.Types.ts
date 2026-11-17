import { Invariant, UserInput } from '@shared'

/** UncheckedCheck represents a check called from JavaScript without argument type checking. */
export type UncheckedCheck = (condition: unknown, message: unknown) => void

type OptionalText = string | undefined

function verifyInvariantNarrowing(value: OptionalText): number {
  Invariant(value !== undefined, 'A value must be available.')
  return value.length
}

function verifyUserInputNarrowing(value: OptionalText): number {
  UserInput.require(value !== undefined, 'Provide a value.')
  return value.length
}

function verifyRejectedArguments(promise: Promise<boolean>): void {
  // @ts-expect-error A Promise is not an explicit boolean condition.
  Invariant(promise, 'A value must be available.')
  // @ts-expect-error A Promise is not an explicit boolean condition.
  UserInput.require(promise, 'Provide a value.')
  // @ts-expect-error A truthy number is not a boolean condition.
  Invariant(1, 'A value must be available.')
  // @ts-expect-error A truthy number is not a boolean condition.
  UserInput.require(1, 'Provide a value.')
  // @ts-expect-error Messages must be strings even when the condition passes.
  Invariant(true, 1)
  // @ts-expect-error Messages must be strings even when the condition passes.
  UserInput.require(true, 1)
}

void [verifyInvariantNarrowing, verifyUserInputNarrowing, verifyRejectedArguments]
