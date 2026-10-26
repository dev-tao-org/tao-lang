import * as Time from '../universal/Time'
import { clearPreviewError, showPreviewError } from './PreviewErrors'

/** initializePreviewClient observes browser failures without changing Metro application. */
export function initializePreviewClient(): void {
  const state = previewState()
  if (!state || state.listening) {
    return
  }
  state.listening = true
  window.addEventListener('error', event => reportPreviewError('runtime-error', event.message))
  window.addEventListener('unhandledrejection', event => reportPreviewError('runtime-error', String(event.reason)))
}

/** reportPreviewError exposes a reported failure without automatically reloading. */
export function reportPreviewError(kind: 'runtime-error' | 'build-error', message: string, revision?: string): void {
  showPreviewError(message, () => {
    if (previewState()) {
      postPreviewMessage({ type: 'tao.preview-reload' })
    } else {
      window.location.reload()
    }
  })
  postPreviewMessage({ type: 'tao.preview-error', kind, message, revision })
}

/** reportPreviewConnection exposes Metro connection events independently of application. */
export function reportPreviewConnection(connected: boolean): void {
  postPreviewMessage({ type: 'tao.preview-connection', connected })
}

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
  if (type === 'tao.preview-applied') {
    clearPreviewError()
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
  listening?: boolean
}

function previewState(): PreviewState | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  const host = window as Window & { __taoPreview?: PreviewState }
  if (!host.parent || host.parent === window) {
    return undefined
  }
  if (host.__taoPreview) {
    return host.__taoPreview
  }
  const search = host.location?.search
  if (!search) {
    return undefined
  }
  const query = new URLSearchParams(search)
  const sessionId = query.get('sessionId')
  const frameId = query.get('frameId')
  const parentOrigin = query.get('parentOrigin')
  if (!sessionId || !frameId || !parentOrigin) {
    return undefined
  }
  host.__taoPreview = {
    sessionId,
    frameId,
    parentOrigin,
    bootId: query.get('bootId') ?? crypto.randomUUID(),
    timings: [],
  }
  return host.__taoPreview
}

function postPreviewMessage(message: object): void {
  const state = previewState()
  if (state) {
    window.parent.postMessage(
      { ...message, sessionId: state.sessionId, frameId: state.frameId, bootId: state.bootId },
      state.parentOrigin,
    )
  }
}
