import * as Json from '../Json'
import * as IdentifiersRegxs from '../Regxs/IdentifiersRegxs'
import { BaseTaoError, isTaoError } from './Base'

/** TaoError declares errors expected by Tao command and library code. */
export type TaoError =
  | UserInputError
  | UnexpectedBehaviorError
  | HostEnvironmentError
  | CommandExecutionError

/** ErrorDetails declares structured context attached to Tao errors. */
export type ErrorDetails = Record<string, unknown>

/** isCommandExecutionError checks whether a value is Tao's structured child process failure. */
export function isCommandExecutionError(error: unknown): error is CommandExecutionError {
  return isTaoError(error) && error.name === 'CommandExecutionError'
}

/** CommandErrorResult retains an external process outcome. */
export type CommandErrorResult = {
  command: string
  args: readonly string[]
  cwd?: string
  status: CommandStatus
  signal: CommandSignal
  stdout: string
  stderr: string
  error?: Error
}

/** UserInputError reports invalid input or expected user-correctable failures. */
export class UserInputError extends BaseTaoError {
  override readonly name = 'UserInputError'

  constructor(messageForUser: string, details?: ErrorDetails, opts: { cause?: unknown } = {}) {
    super('UserInputError', messageForUser, { ...opts, details })
  }
}

/** UnexpectedBehaviorError reports internal failures that should not happen in normal use. */
export class UnexpectedBehaviorError extends BaseTaoError {
  override readonly name = 'UnexpectedBehaviorError'

  constructor(messageForUser = unexpectedErrorMessage, opts: { cause?: unknown; details?: ErrorDetails } = {}) {
    super('UnexpectedBehaviorError', messageForUser, opts)
  }
}

/** HostEnvironmentError reports a failure of the machine, toolchain, or an external process. */
export class HostEnvironmentError extends BaseTaoError {
  override readonly name = 'HostEnvironmentError'

  constructor(messageForUser: string, opts: { cause?: unknown; details?: ErrorDetails } = {}) {
    super('HostEnvironmentError', messageForUser, opts)
  }
}

/** CommandExecutionError reports a failed child process invocation. */
export class CommandExecutionError extends BaseTaoError {
  override readonly name = 'CommandExecutionError'
  readonly result: CommandErrorResult

  constructor(result: CommandErrorResult) {
    super('CommandExecutionError', `Command failed: ${formatCommandForError(result.command, result.args)}`, {
      cause: result.error,
      details: {
        cwd: result.cwd,
        status: result.status,
        signal: result.signal,
        stderr: result.stderr,
        stdout: result.stdout,
      },
    })
    this.result = result
  }
}

/** unexpectedErrorMessage supplies the default unexpected failure description. */
export const unexpectedErrorMessage = 'Something went wrong.'

type ProcessSignal = string
type CommandStatus = number | null
type CommandSignal = ProcessSignal | null

function formatCommandForError(command: string, args: readonly string[]): string {
  return [command, ...args].map(formatCommandPart).join(' ')
}

// Quote a command word that a reader could not paste back as written.
function formatCommandPart(value: string): string {
  return IdentifiersRegxs.SafeCommandTokenRegx.test(value) ? value : Json.Print(value)
}
