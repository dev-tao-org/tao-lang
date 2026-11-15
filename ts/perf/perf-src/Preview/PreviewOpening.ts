import { Time } from '@shared'
import type * as Preview from '@shared/preview'

import type { PreviewSignal } from './PreviewSignal'

/** OpenedPreview describes the published revision and frame URL accompanying an open response. */
export type OpenedPreview = { baseline: Preview.PreviewExpectation; url: string }

type AppliedFrame = { signal: PreviewSignal; receivedAt: number }

/** PreviewOpening measures when every current frame has applied the latest published revision. */
export class PreviewOpening {
  private readonly appliedFrames = new Map<string, AppliedFrame>()

  constructor(
    private readonly initialBaseline: Preview.PreviewExpectation,
    private readonly startedAt: number,
    private readonly frameCount: number,
  ) {}

  recordApplied(signal: PreviewSignal): void {
    this.appliedFrames.set(signal.frameId, { signal, receivedAt: Time.nowMs() })
  }

  measureCompletion(
    isCurrentFrame: (signal: PreviewSignal) => boolean,
    baseline?: Preview.PreviewExpectation,
  ): number | undefined {
    const newerBaseline = baseline && baseline.sequence > this.initialBaseline.sequence
    const published = newerBaseline ? baseline : this.initialBaseline
    const matching = [...this.appliedFrames.values()].filter(({ signal }) =>
      signal.revision === published.revision && isCurrentFrame(signal)
    )
    if (matching.length !== this.frameCount) {
      return undefined
    }
    return Math.max(...matching.map(receipt => receipt.receivedAt)) - this.startedAt
  }
}
