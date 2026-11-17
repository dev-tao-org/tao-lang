import { fromUnknown } from './external'
import * as Values from './Values'

/** Throw normalizes and rethrows an unknown failure, preserving existing Tao error identity. */
export function Throw(error: unknown): never {
  throw fromUnknown(error)
}

/** createUserInputError constructs a caller-correctable failure with its diagnostic context. */
export function createUserInputError(
  message: string,
  details?: Values.ErrorDetails,
  opts?: { cause?: unknown },
): Values.TaoError {
  return new Values.UserInputError(message, details, opts)
}

/** ThrowShouldNeverHappen throws an internal Tao error.
 *  Use for an invariant Tao or an upstream layer should guarantee. This is a Tao bug, not the author's;
 *  the reader and recovery owner is a Tao developer. */
export function ThrowShouldNeverHappen(
  messageForUser: string,
  opts?: { cause?: unknown; details?: Values.ErrorDetails },
): never {
  throw new Values.UnexpectedBehaviorError(messageForUser, opts)
}

/** ThrowHostEnvironment throws a Tao error blaming the machine, toolchain, or an external process.
 *  Use for missing native modules or build artifacts, helpers that cannot start, and similar host failures. */
export function ThrowHostEnvironment(
  messageForUser: string,
  opts?: { cause?: unknown; details?: Values.ErrorDetails },
): never {
  throw createHostEnvironmentError(messageForUser, opts)
}

/** createHostEnvironmentError creates a host failure for deferred rejection boundaries. */
export function createHostEnvironmentError(
  messageForUser: string,
  opts?: { cause?: unknown; details?: Values.ErrorDetails },
): Values.TaoError {
  return new Values.HostEnvironmentError(messageForUser, opts)
}

/** ThrowCommandExecution throws a structured child process failure.
 *  This specializes host-environment failures and retains the full command result for diagnostics. */
export function ThrowCommandExecution(result: Values.CommandErrorResult): never {
  throw new Values.CommandExecutionError(result)
}
