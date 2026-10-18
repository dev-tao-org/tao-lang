/** ReloadTiming measures one source update through both previews' refresh milestones. */
export type ReloadTiming = { revision: string; saveToHmrMs: number; saveToAppliedMs: number }

/** ReloadTimings correlates current-revision receipts and reports each completed reload once. */
export class ReloadTimings {
  private revision = ''
  private startedAtMs = 0
  private reported = false
  private readonly frames = new Map<string, { hmr?: Signal; applied?: Signal }>()

  constructor(private readonly sessionId: string, private readonly report?: (timing: ReloadTiming) => void) {}

  begin(revision: string, startedAtMs: number): void {
    this.revision = revision
    this.startedAtMs = startedAtMs
    this.reported = false
    this.frames.clear()
  }

  receive(value: unknown): void {
    if (this.reported || !isSignal(value)) {
      return
    }
    if (value.sessionId !== this.sessionId || value.revision !== this.revision) {
      return
    }
    const frame = this.frames.get(value.frameId) ?? {}
    if (value.type === 'tao.update-done') {
      frame.hmr ??= value
    } else {
      frame.applied ??= value
    }
    this.frames.set(value.frameId, frame)
    this.reportIfComplete()
  }

  private reportIfComplete(): void {
    const complete = [...this.frames.values()].filter(frame =>
      frame.hmr && frame.applied && frame.hmr.bootId === frame.applied.bootId
    )
    if (complete.length !== 2) {
      return
    }
    this.reported = true
    this.report?.({
      revision: this.revision,
      saveToHmrMs: Math.max(...complete.map(frame => frame.hmr!.timestampMs)) - this.startedAtMs,
      saveToAppliedMs: Math.max(...complete.map(frame => frame.applied!.timestampMs)) - this.startedAtMs,
    })
  }
}

type Signal = {
  type: 'tao.update-done' | 'tao.preview-applied'
  sessionId: string
  frameId: 'left' | 'right'
  bootId: string
  revision: string
  timestampMs: number
}

function isSignal(value: unknown): value is Signal {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const signal = value as Partial<Signal>
  return hasIdentity(signal)
    && (signal.type === 'tao.update-done' || signal.type === 'tao.preview-applied')
    && typeof signal.timestampMs === 'number' && Number.isFinite(signal.timestampMs)
}

function hasIdentity(signal: Partial<Signal>): boolean {
  return typeof signal.sessionId === 'string' && typeof signal.revision === 'string'
    && typeof signal.bootId === 'string' && (signal.frameId === 'left' || signal.frameId === 'right')
}
