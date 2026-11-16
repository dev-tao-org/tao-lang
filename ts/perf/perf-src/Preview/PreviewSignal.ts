/** PreviewSignal carries a measured milestone from one exact frame instance. */
export type PreviewSignal = {
  type: PreviewSignalType
  sessionId: string
  frameId: string
  bootId: string
  revision: string
  timestampMs: number
  timings: unknown[]
  metroDeltaModules?: number
}

/** PreviewSignalType identifies the measured HMR and React milestones. */
export type PreviewSignalType = 'tao.preview-applied' | 'tao.update-done'

/** isPreviewSignal validates an untrusted measured receipt at the host boundary. */
export function isPreviewSignal(value: unknown): value is PreviewSignal {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const signal = value as Partial<PreviewSignal>
  return hasSignalType(signal) && hasSignalIdentity(signal) && hasSignalTiming(signal)
}

function hasSignalType(signal: Partial<PreviewSignal>): boolean {
  return signal.type === 'tao.preview-applied' || signal.type === 'tao.update-done'
}

function hasSignalIdentity(signal: Partial<PreviewSignal>): boolean {
  const hasFrameIdentity = typeof signal.sessionId === 'string' && typeof signal.frameId === 'string'
  return hasFrameIdentity && typeof signal.bootId === 'string' && typeof signal.revision === 'string'
}

function hasSignalTiming(signal: Partial<PreviewSignal>): boolean {
  return typeof signal.timestampMs === 'number' && Array.isArray(signal.timings)
}
