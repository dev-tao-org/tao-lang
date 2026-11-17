import type { TimingSample } from '@shared'
import type * as Workspace from '@workspace'
import { PreviewReceipts } from './Preview/PreviewReceipts'
import type { PreviewSignalType } from './Preview/PreviewSignal'

/** ReloadTiming measures one source update through both previews' refresh milestones. */
export type ReloadTiming = {
  revision: string
  observedAtMs: number
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
  private publication: OptionalPublication
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

  published(publication: Workspace.Publication): void {
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
      observedAtMs: this.startedAtMs,
      saveToHmrMs: Math.max(...[...complete.values()].map(frame => frame.hmr.timestampMs)) - this.startedAtMs,
      saveToAppliedMs: Math.max(...[...complete.values()].map(frame => frame.applied.timestampMs)) - this.startedAtMs,
      pipeline: publication.timings,
      frames: Object.fromEntries([...complete].map(([id, frame]) => [id, {
        publishToHmrMs: frame.hmr.timestampMs - publication.publicationStartedAtMs,
        hmrToAppliedMs: frame.applied.timestampMs - frame.hmr.timestampMs,
        saveToHmrMs: frame.hmr.timestampMs - this.startedAtMs,
        saveToAppliedMs: frame.applied.timestampMs - this.startedAtMs,
      }])),
    })
  }
}

type Signal = {
  type: PreviewSignalType
  sessionId: string
  frameId: PreviewFrameSide
  bootId: string
  revision: string
  timestampMs: number
}
type PreviewFrameSide = 'left' | 'right'
type OptionalPublication = Workspace.Publication | undefined

function isSignal(value: unknown): value is Signal {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const signal = value as Partial<Signal>
  if (!hasIdentity(signal) || !hasSignalMilestone(signal)) {
    return false
  }
  return typeof signal.timestampMs === 'number' && Number.isFinite(signal.timestampMs)
}

function hasSignalMilestone(signal: Partial<Signal>): boolean {
  return signal.type === 'tao.update-done' || signal.type === 'tao.preview-applied'
}

function hasIdentity(signal: Partial<Signal>): boolean {
  if (typeof signal.sessionId !== 'string' || typeof signal.revision !== 'string') {
    return false
  }
  return typeof signal.bootId === 'string' && isPreviewFrameSide(signal.frameId)
}

function isPreviewFrameSide(frameId?: string): boolean {
  return frameId === 'left' || frameId === 'right'
}
