import type { TimingSample } from '@shared'
import type { Publication } from '@workspace/Workspace'
import { PreviewReceipts } from './PreviewReceipts'

/** ReloadTiming measures one source update through both previews' refresh milestones. */
export type ReloadTiming = {
  revision: string
  saveToHmrMs: number
  saveToAppliedMs: number
  pipeline: readonly TimingSample[]
  frames: Record<string, {
    publishToHmrMs: number
    hmrToAppliedMs: number
    saveToHmrMs: number
    saveToAppliedMs: number
  }>
}

/** ReloadTimings correlates current-revision receipts and reports each completed reload once. */
export class ReloadTimings {
  private revision = ''
  private startedAtMs = 0
  private reported = false
  private publication: Publication | undefined
  private readonly receipts = new PreviewReceipts<Signal>()

  constructor(
    private readonly sessionId: string,
    private readonly report?: (timing: ReloadTiming) => void,
    private readonly frameIds: readonly string[] = ['left', 'right'],
  ) {}

  begin(revision: string, startedAtMs: number): void {
    this.revision = revision
    this.startedAtMs = startedAtMs
    this.reported = false
    this.publication = undefined
    this.receipts.clear()
  }

  published(publication: Publication): void {
    if (publication.revision === this.revision) {
      this.publication = publication
      this.reportIfComplete()
    }
  }

  receive(value: unknown): void {
    if (this.reported || !isSignal(value)) {
      return
    }
    if (!this.matchesExpectedFrame(value)) {
      return
    }
    const milestone = value.type === 'tao.update-done' ? 'hmr' : 'applied'
    this.receipts.record(milestone, value, value)
    this.reportIfComplete()
  }

  private matchesExpectedFrame(signal: Signal): boolean {
    return signal.sessionId === this.sessionId && signal.revision === this.revision
      && this.frameIds.includes(signal.frameId)
  }

  private reportIfComplete(): void {
    const complete = this.receipts.complete(this.revision)
    const publication = this.publication
    if (!publication || this.reported) {
      return
    }
    if (complete.size !== this.frameIds.length) {
      return
    }
    this.reported = true
    this.report?.({
      revision: this.revision,
      saveToHmrMs: Math.max(...[...complete.values()].map(frame => frame.hmr.timestampMs)) - this.startedAtMs,
      saveToAppliedMs: Math.max(...[...complete.values()].map(frame => frame.applied.timestampMs)) - this.startedAtMs,
      pipeline: publication.timings,
      frames: Object.fromEntries([...complete].map(([id, frame]) => [id, {
        publishToHmrMs: frame.hmr.timestampMs - publication.publishedAtMs,
        hmrToAppliedMs: frame.applied.timestampMs - frame.hmr.timestampMs,
        saveToHmrMs: frame.hmr.timestampMs - this.startedAtMs,
        saveToAppliedMs: frame.applied.timestampMs - this.startedAtMs,
      }])),
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
