import * as Time from '../universal/Time'

/** beginPreviewRevision records evaluation of the generated app module in preview mode. */
export function beginPreviewRevision(revision: string): void {
  const state = previewState()
  if (!state) {
    return
  }
  state.revision = revision
  state.moduleAppliedAtMs = Time.timestampMs()
  state.timings = []
}

/** reportPreviewEvent sends one revision-specific client event to its configured parent. */
export function reportPreviewEvent(type: 'tao.preview-applied' | 'tao.update-done', revision?: string): void {
  const state = previewState()
  if (!state?.revision || (revision && revision !== state.revision)) {
    return
  }
  window.parent.postMessage({
    type,
    sessionId: state.sessionId,
    frameId: state.frameId,
    bootId: state.bootId,
    revision: revision ?? state.revision,
    timestampMs: Time.timestampMs(),
    localTime: Time.nowMs(),
    timeOrigin: performance.timeOrigin,
    moduleAppliedAtMs: state.moduleAppliedAtMs,
    timings: [...state.timings],
  }, state.parentOrigin)
}

/** previewTiming records bounded runtime operation measurements for the current revision. */
export function previewTiming(timing: { phase: string; durationMs: number }): void {
  const state = previewState()
  if (state && state.timings.length < 1000) {
    state.timings.push(timing)
  }
}

/** isPreview reports whether this document has the harness's explicit preview configuration. */
export function isPreview(): boolean {
  return previewState() !== undefined
}

type PreviewState = {
  sessionId: string
  frameId: string
  parentOrigin: string
  bootId: string
  revision?: string
  moduleAppliedAtMs?: number
  timings: { phase: string; durationMs: number }[]
}

function previewState(): PreviewState | undefined {
  if (typeof window === 'undefined' || window.parent === window) {
    return undefined
  }
  const host = window as Window & { __taoPreview?: PreviewState }
  if (host.__taoPreview) {
    return host.__taoPreview
  }
  const query = new URLSearchParams(window.location.search)
  const sessionId = query.get('sessionId')
  const frameId = query.get('frameId')
  const parentOrigin = query.get('parentOrigin')
  if (!sessionId || !frameId || !parentOrigin) {
    return undefined
  }
  host.__taoPreview = { sessionId, frameId, parentOrigin, bootId: crypto.randomUUID(), timings: [] }
  return host.__taoPreview
}
