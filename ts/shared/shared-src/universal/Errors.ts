import { Try } from './TryCatch'

// ProcessSignal declares a platform process signal value without depending on Node types.
type ProcessSignal = string

/** TaoError declares errors expected by Tao command and library code. */
export type TaoError =
  | UserInputError
  | UnexpectedBehaviorError
  | HostEnvironmentError
  | CommandExecutionError

/** ErrorDetails declares structured context attached to Tao errors. */
export type ErrorDetails = Record<string, unknown>

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

/** isTaoError checks whether a value is one of Tao's structured errors. */
export function isTaoError(error: unknown): error is TaoError {
  // Identity checks do not invoke a thrown Proxy's prototype traps, unlike instanceof.
  return typeof error === 'object' && error !== null && taoErrors.has(error)
}

/** messageOf reads the message out of an unknown thrown value for a surface that shows it
 *  verbatim, such as a status line or an inline alert. `formatForUser` is the terminal rendering.
 *  `packages/apps/runtime/TaoRuntime-src/TR-errors.ts` keeps `errorMessage` as its mirror. */
export function messageOf(error: unknown): string {
  return errorDetail(error) ?? describeThrownValue(error)
}

function errorDetail(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message.trim().length > 0 ? error.message : undefined
  }
  if (typeof error === 'string') {
    return error.trim().length > 0 ? error : undefined
  }
  if (typeof error === 'object' && error !== null) {
    const carried = (error as { message?: unknown }).message
    return typeof carried === 'string' && carried.trim().length > 0 ? carried : undefined
  }
  return error === undefined || error === null ? undefined : String(error)
}

function describeThrownValue(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return String(value)
  }
  const name = value.constructor?.name ?? 'object'
  const fields = Object.entries(value)
    .filter(([, field]) => field === null || ['boolean', 'number', 'string'].includes(typeof field))
    .slice(0, 4)
    .map(([key, field]) => `${key}: ${typeof field === 'string' ? field : String(field)}`)
  return fields.length === 0 ? name : `${name} (${fields.join(', ')})`
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

/** formatForUser renders an error message suitable for terminal users.
 *  `TAO_DEBUG_ERRORS=1` swaps in the log rendering instead. An `UnexpectedBehaviorError` reaches the
 *  terminal as the bare sentence "Something went wrong.", which is right for a Tao developer and
 *  useless for whoever has to find the cause; the switch is what turns that report into the same
 *  name, details, cause, and stack the logs already carry. */
export function formatForUser(error: unknown): string {
  if (debugErrorsEnabled()) {
    return formatForLog(error)
  }
  return isTaoError(error) ? error.messageForUser : unexpectedErrorMessage
}

// Error normalization and Try form the platform-independent failure boundary. Neither calls the
// other during module initialization. Read the switch without importing platform types;
// environments without process never enable it.
function debugErrorsEnabled(): boolean {
  const ambient = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  const value = ambient?.env?.[DEBUG_ERRORS_ENV]
  return value !== undefined && value !== '' && value !== '0' && value !== 'false'
}

const DEBUG_ERRORS_ENV = 'TAO_DEBUG_ERRORS'

/** formatForLog renders an error message with diagnostic details. */
export function formatForLog(error: unknown): string {
  const taoError = fromUnknown(error)
  const parts = [`${taoError.name}: ${taoError.message}`]

  if (taoError.details) {
    parts.push(`details=${safeJson(taoError.details)}`)
  }
  if (taoError.cause !== undefined) {
    parts.push(`cause=${formatCause(taoError.cause)}`)
  }
  if (taoError.stack) {
    parts.push(taoError.stack)
  }

  return parts.join('\n')
}

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.stack ?? cause.message : safeJson(cause)
}

function safeJson(value: unknown): string {
  return Try(() => JSON.stringify(value), { catch: () => '<safeJson: unserializable>' })
}
