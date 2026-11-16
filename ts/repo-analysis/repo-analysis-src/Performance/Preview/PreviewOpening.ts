import type * as Preview from '@shared/preview'

import type { PreviewSignal } from './PreviewSignal'

/** OpenedPreview describes the published revision and frame URL accompanying an open response. */
export type OpenedPreview = { baseline: Preview.PreviewExpectation; url: string }

type AppliedFrame = { signal: PreviewSignal; receivedAt: number }

/** PreviewOpening measures when every current frame has applied the latest published revision. */
export class PreviewOpening {
  private readonly appliedFrames = new Map<string, AppliedFrame>()

  constructor(
    private readonly startedAt: number,
    private readonly frameCount: number,
  ) {}

  recordApplied(signal: PreviewSignal, receivedAt: number): void {
    const previous = this.appliedFrames.get(signal.frameId)?.signal
    if (previous?.bootId === signal.bootId && previous.revision === signal.revision) {
      return
    }
    this.appliedFrames.set(signal.frameId, { signal, receivedAt })
  }

  measureCompletion(
    baseline: Preview.PreviewExpectation,
    isCurrentFrame: (signal: PreviewSignal) => boolean,
  ): number | undefined {
    const matching = [...this.appliedFrames.values()].filter(({ signal }) =>
      signal.revision === baseline.revision && isCurrentFrame(signal)
    )
    if (matching.length !== this.frameCount) {
      return undefined
    }
    return Math.max(...matching.map(receipt => receipt.receivedAt)) - this.startedAt
  }
}
