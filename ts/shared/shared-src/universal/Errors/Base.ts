import { isObject } from '../ObjectGuards'
import type { ErrorDetails, TaoError } from './Values'

/** BaseTaoError preserves structured Tao error identity and causes. */
export class BaseTaoError extends Error {
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

/** isTaoError checks whether a value is one of Tao's structured errors. */
export function isTaoError(error: unknown): error is TaoError {
  // Identity checks do not invoke a thrown Proxy's prototype traps, unlike instanceof.
  return isObject(error) && taoErrors.has(error)
}

const taoErrors = new WeakSet<object>()

/** isNativeError checks whether a value belongs to the native Error prototype chain. */
export function isNativeError(error: unknown): error is Error {
  return error instanceof Error
}
