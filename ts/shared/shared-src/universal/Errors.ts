/** TaoError declares errors expected by Tao command and library code. */
export type TaoError =
  | UserInputError
  | UnexpectedBehaviorError
  | HostEnvironmentError
  | CommandExecutionError

/** ErrorDetails declares structured context attached to Tao errors. */
export type ErrorDetails = Record<string, unknown>

/** isTaoError checks whether a value is one of Tao's structured errors. */
export function isTaoError(error: unknown): error is TaoError {
  // Identity checks do not invoke a thrown Proxy's prototype traps, unlike instanceof.
  return typeof error === 'object' && error !== null && taoErrors.has(error)
}

/** isCommandExecutionError checks whether a value is Tao's structured child process failure. */
export function isCommandExecutionError(error: unknown): error is CommandExecutionError {
  return isTaoError(error) && error.name === 'CommandExecutionError'
}

/** describe separates stack frames from complete error details, including causes and aggregate members. */
export function describe(error: unknown): { stacks: string[]; details: unknown } {
  const stacks: string[] = []
  const details = errorDetails(error, stacks, new WeakSet())
  return { stacks, details }
}

/** fromUnknown normalizes an unknown thrown value into a Tao error. */
export function fromUnknown(error: unknown, details?: ErrorDetails): TaoError {
  if (isTaoError(error)) {
    return error
  }
  return new UnexpectedBehaviorError(unexpectedErrorMessage, { cause: error, details })
}

/** Throw normalizes and rethrows an unknown failure, preserving existing Tao error identity. */
export function Throw(error: unknown): never {
  throw fromUnknown(error)
}

/** ThrowUserInput throws a user-correctable Tao error.
 *  The author's data or contract is wrong; the message must tell the person writing the Tao program what to change. */
export function ThrowUserInput(messageForUser: string, details?: ErrorDetails): never {
  throw new UserInputError(messageForUser, details)
}

/** ThrowUnexpected throws an internal Tao error.
 *  Use for an invariant Tao or an upstream layer should guarantee. This is a Tao bug, not the author's;
 *  the reader and recovery owner is a Tao developer. */
export function ThrowUnexpected(messageForUser: string, opts?: { cause?: unknown; details?: ErrorDetails }): never {
  throw new UnexpectedBehaviorError(messageForUser, opts)
}

/** ThrowHostEnvironment throws a Tao error blaming the machine, toolchain, or an external process.
 *  Use for missing native modules or build artifacts, helpers that cannot start, and similar host failures. */
export function ThrowHostEnvironment(
  messageForUser: string,
  opts?: { cause?: unknown; details?: ErrorDetails },
): never {
  throw new HostEnvironmentError(messageForUser, opts)
}

/** ThrowCommandExecution throws a structured child process failure.
 *  This specializes host-environment failures and retains the full command result for diagnostics. */
export function ThrowCommandExecution(result: CommandErrorResult): never {
  throw new CommandExecutionError(result)
}

// ProcessSignal declares a platform process signal value without depending on Node types.
type ProcessSignal = string

type CommandErrorResult = {
  command: string
  args: readonly string[]
  cwd?: string
  status: number | null
  signal: ProcessSignal | null
  stdout: string
  stderr: string
  error?: Error
}

const unexpectedErrorMessage = 'Something went wrong.'
const taoErrors = new WeakSet<object>()

class BaseTaoError extends Error {
  readonly details?: ErrorDetails
  readonly cause?: unknown
  readonly messageForUser: string

  constructor(name: TaoError['name'], messageForUser: string, opts: { cause?: unknown; details?: ErrorDetails } = {}) {
    super(messageForUser)
    taoErrors.add(this)
    this.name = name
    this.messageForUser = messageForUser
    this.cause = opts.cause
    this.details = opts.details
  }
}

// UserInputError reports invalid input or expected user-correctable failures.
class UserInputError extends BaseTaoError {
  override readonly name = 'UserInputError'

  constructor(messageForUser: string, details?: ErrorDetails) {
    super('UserInputError', messageForUser, { details })
  }
}

// UnexpectedBehaviorError reports internal failures that should not happen in normal use.
class UnexpectedBehaviorError extends BaseTaoError {
  override readonly name = 'UnexpectedBehaviorError'

  constructor(messageForUser = unexpectedErrorMessage, opts: { cause?: unknown; details?: ErrorDetails } = {}) {
    super('UnexpectedBehaviorError', messageForUser, opts)
  }
}

// HostEnvironmentError reports a failure of the machine, toolchain, or an external process.
class HostEnvironmentError extends BaseTaoError {
  override readonly name = 'HostEnvironmentError'

  constructor(messageForUser: string, opts: { cause?: unknown; details?: ErrorDetails } = {}) {
    super('HostEnvironmentError', messageForUser, opts)
  }
}

// CommandExecutionError reports a failed child process invocation.
class CommandExecutionError extends BaseTaoError {
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

function formatCommandForError(command: string, args: readonly string[]): string {
  return [command, ...args].map(formatCommandPart).join(' ')
}

// Quote a command word that a reader could not paste back as written.
function formatCommandPart(value: string): string {
  return /^[\w./:=@+-]+$/.test(value) ? value : JSON.stringify(value)
}

function errorDetails(error: unknown, stacks: string[], seen: WeakSet<Error>): unknown {
  if (!(error instanceof Error)) {
    return error
  }
  if (seen.has(error)) {
    return '[Circular error cause]'
  }
  seen.add(error)
  const { stack, cause, ...details } = error
  const fields: Record<string, unknown> = details
  if (fields.messageForUser === error.message) {
    delete fields.messageForUser
  }
  const frames = stack?.split('\n').slice(1).join('\n')
  if (frames) {
    stacks.push(frames)
  }
  return {
    ...fields,
    name: error.name,
    message: error.message,
    ...(error instanceof AggregateError
      ? { errors: error.errors.map(member => errorDetails(member, stacks, seen)) }
      : {}),
    ...(cause === undefined ? {} : { cause: errorDetails(cause, stacks, seen) }),
  }
}
