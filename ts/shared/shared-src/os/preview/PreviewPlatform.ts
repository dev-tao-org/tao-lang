import * as Time from '../../universal/Time'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import { clearPreviewError, showPreviewError } from './PreviewErrors'

/** initializePreviewClient observes browser failures without changing Metro application. */
export function initializePreviewClient(): void {
  const state = previewState()
  if (!state || state.listening) {
    return
  }
  state.listening = true
  WebHost.getBrowserWindow().addEventListener('error', event => reportPreviewError('runtime-error', event.message))
  WebHost.getBrowserWindow().addEventListener(
    'unhandledrejection',
    event => reportPreviewError('runtime-error', String(event.reason)),
  )
}

type PreviewErrorKind = 'runtime-error' | 'build-error'
/** reportPreviewError exposes a reported failure without automatically reloading. */
export function reportPreviewError(kind: PreviewErrorKind, message: string, revision?: string): void {
  showPreviewError(message, () => {
    if (previewState()) {
      postPreviewMessage({ type: 'tao.preview-reload' })
    } else {
      WebHost.getBrowserWindow().location.reload()
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

type PreviewEventType = 'tao.preview-applied' | 'tao.update-done'
/** reportPreviewEvent sends one revision-specific client event to its configured parent. */
export function reportPreviewEvent(type: PreviewEventType, revision?: string, metroDeltaModules?: number): void {
  const state = previewState()
  if (!state?.revision || (revision && revision !== state.revision)) {
    return
  }
  if (type === 'tao.preview-applied') {
    clearPreviewError()
  }
  WebHost.getBrowserWindow().parent.postMessage({
    type,
    sessionId: state.sessionId,
    frameId: state.frameId,
    bootId: state.bootId,
    revision: revision ?? state.revision,
    timestampMs: Time.timestampMs(),
    localTime: Time.nowMs(),
    timeOrigin: WebHost.performance.timeOrigin,
    moduleAppliedAtMs: state.moduleAppliedAtMs,
    metroDeltaModules,
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
  if (!WebHost.hasWindow()) {
    return undefined
  }
  const host = WebHost.getBrowserWindow() as WebHost.Window & { __taoPreview?: PreviewState }
  if (!host.parent || host.parent === WebHost.getBrowserWindow()) {
    return undefined
  }
  if (host.__taoPreview) {
    return host.__taoPreview
  }
  const search = host.location?.search
  if (!search) {
    return undefined
  }
  const query = new WebHost.URLSearchParams(search)
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
    bootId: query.get('bootId') ?? WebHost.crypto.randomUUID(),
    timings: [],
  }
  return host.__taoPreview
}

function postPreviewMessage(message: object): void {
  const state = previewState()
  if (state) {
    WebHost.getBrowserWindow().parent.postMessage(
      { ...message, sessionId: state.sessionId, frameId: state.frameId, bootId: state.bootId },
      state.parentOrigin,
    )
  }
}
