/** previewExpectationCapacity bounds outstanding and retained preview expectations. */
export const previewExpectationCapacity = 64

/** PreviewExpectation identifies ordered generated output expected by a preview. */
export type PreviewExpectation = { revision: string; sequence: number }

/** PreviewIdentity identifies a particular frame instance within a host session. */
export type PreviewIdentity = { sessionId: string; frameId: string; bootId: string }

/** PreviewOutcome identifies a real application or explicit terminal result. */
export type PreviewOutcome = PreviewExpectation & {
  kind: PreviewOutcomeKind
  message?: string
}

/** PreviewOutcomeSnapshot summarizes pending work and the latest preview error. */
export type PreviewOutcomeSnapshot = {
  pending: number
  latestApplied: number
  deadline?: number
  error?: string
  diagnostics: readonly string[]
}

/** PreviewOutcomeTracker bounds outstanding work independently for one preview frame. */
export class PreviewOutcomeTracker {
  private bootId?: string
  private readonly pending = new Map<number, PendingExpectation>()
  private readonly diagnostics: string[] = []
  private latestApplied = -1
  private automaticRecoveryUsed = false
  private expired = false
  private currentError?: string

  constructor(
    private readonly sessionId: string,
    private readonly frameId: string,
    private readonly timeoutMs: number,
  ) {}

  bindInstance(bootId: string): void {
    this.bootId = bootId
    this.pending.clear()
    this.latestApplied = -1
    this.expired = false
  }

  expect(expectation: PreviewExpectation, now: number): void {
    if (shouldIgnoreExpectation(this.expired, expectation, this.latestApplied, this.pending)) {
      return
    }
    this.pending.set(expectation.sequence, { ...expectation, startedAt: now })
    if (this.pending.size > previewExpectationCapacity) {
      this.recordError('Preview update backlog exceeded its limit. Reload to synchronize.')
      this.expired = true
      this.pending.clear()
    }
  }

  receive(identity: PreviewIdentity, outcome: PreviewOutcome): boolean {
    if (!this.matchesInstance(identity) || this.expired) {
      return false
    }
    const expectation = this.pending.get(outcome.sequence)
    if (!expectation || expectation.revision !== outcome.revision) {
      return false
    }
    this.terminal(outcome)
    return true
  }

  terminal(outcome: PreviewOutcome): void {
    if (outcome.kind === 'applied') {
      this.latestApplied = Math.max(this.latestApplied, outcome.sequence)
      this.currentError = undefined
    } else if (isFailure(outcome)) {
      this.recordError(outcome.message ?? `Preview ${outcome.kind}. Reload to recover.`)
      this.pending.clear()
    } else {
      // No-op and superseded publications need no React commit.
    }
    for (const sequence of this.pending.keys()) {
      if (shouldRemovePendingOutcome(sequence, outcome)) {
        this.pending.delete(sequence)
      }
    }
  }

  checkDeadline(now: number): RecoveryAction | undefined {
    const oldest = this.pending.values().next().value
    if (shouldSkipDeadline(oldest, now, this.timeoutMs, this.expired)) {
      return undefined
    }
    this.expired = true
    this.pending.clear()
    this.recordError('Preview did not acknowledge its update before the deadline.')
    if (this.automaticRecoveryUsed) {
      return 'failed'
    }
    this.automaticRecoveryUsed = true
    return 'reload'
  }

  manualRecovery(): void {
    this.automaticRecoveryUsed = false
  }

  reportError(message: string): void {
    this.recordError(message)
    this.pending.clear()
  }

  snapshot(): PreviewOutcomeSnapshot {
    const oldest = this.pending.values().next().value
    return {
      pending: this.pending.size,
      latestApplied: this.latestApplied,
      deadline: oldest ? oldest.startedAt + this.timeoutMs : undefined,
      error: this.currentError,
      diagnostics: [...this.diagnostics],
    }
  }

  private matchesInstance(identity: PreviewIdentity): boolean {
    return identity.sessionId === this.sessionId && identity.frameId === this.frameId && identity.bootId === this.bootId
  }

  private recordError(message: string): void {
    this.currentError = message
    if (this.diagnostics.at(-1) !== message) {
      this.diagnostics.push(message)
      this.diagnostics.splice(0, Math.max(0, this.diagnostics.length - 16))
    }
  }
}

type PendingExpectation = PreviewExpectation & { startedAt: number }
type OptionalPendingExpectation = PendingExpectation | undefined
type RecoveryAction = 'reload' | 'failed'
type PreviewOutcomeKind =
  | 'applied'
  | 'noop'
  | 'superseded'
  | 'build-error'
  | 'runtime-error'
  | 'disconnected'
  | 'resync-required'

function shouldIgnoreExpectation(
  expired: boolean,
  expectation: PreviewExpectation,
  latestApplied: number,
  pending: ReadonlyMap<number, PreviewExpectation>,
): boolean {
  return expired || expectation.sequence <= latestApplied || pending.has(expectation.sequence)
}

function shouldRemovePendingOutcome(sequence: number, outcome: PreviewOutcome): boolean {
  return sequence === outcome.sequence || (outcome.kind === 'applied' && sequence < outcome.sequence)
}

function shouldSkipDeadline(
  oldest: OptionalPendingExpectation,
  now: number,
  timeoutMs: number,
  expired: boolean,
): boolean {
  return !oldest || now - oldest.startedAt < timeoutMs || expired
}

function isFailure(outcome: PreviewOutcome): boolean {
  return outcome.kind !== 'applied' && outcome.kind !== 'noop' && outcome.kind !== 'superseded'
}
