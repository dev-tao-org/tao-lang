import type * as Preview from '@shared/preview'

import type { PreviewSignal } from './PreviewSignal'

/** OpenedPreview describes the published revision and frame URL accompanying an open response. */
export type OpenedPreview = { baseline: Preview.PreviewExpectation; url: string }

/** selectPublishedBaseline chooses the newest publication from the open response and the live stream. */
export function selectPublishedBaseline(
  initial: Preview.PreviewExpectation,
  observed?: Preview.PreviewExpectation,
): Preview.PreviewExpectation {
  const newer = observed && observed.sequence > initial.sequence
  return newer ? observed : initial
}

type AppliedFrame = { signal: PreviewSignal; receivedAt: number }

/** PreviewOpening measures when every current frame has applied the latest published revision. */
export class PreviewOpening {
  private readonly appliedFrames = new Map<string, AppliedFrame>()

  constructor(
    private readonly initialBaseline: Preview.PreviewExpectation,
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
    isCurrentFrame: (signal: PreviewSignal) => boolean,
    baseline?: Preview.PreviewExpectation,
  ): number | undefined {
    const published = selectPublishedBaseline(this.initialBaseline, baseline)
    const matching = [...this.appliedFrames.values()].filter(({ signal }) =>
      signal.revision === published.revision && isCurrentFrame(signal)
    )
    if (matching.length !== this.frameCount) {
      return undefined
    }
    return Math.max(...matching.map(receipt => receipt.receivedAt)) - this.startedAt
  }
}
