import { Time } from '@shared'
import * as BrowserRuntime from '@shared/os/browser'
import * as Preview from '@shared/preview'
import { EventStream, Http } from '@shared/web'

import * as PreviewBrowserJson from './Preview/PreviewBrowserJson'
import { restoreFrameRecovery } from './Preview/PreviewFrameRecovery'
import { PreviewReceipts, type ReceiptPair } from './Preview/PreviewReceipts'
import { isPreviewSignal, type PreviewSignal } from './Preview/PreviewSignal'
import type { PreviewEditTrace } from './Preview/PreviewWork'

type SignalReceipt = { signal: PreviewSignal; receivedAt: number }
type OptionalSignalIdentity = Partial<PreviewSignal> | undefined
type PreviewOrigin = string | undefined
type PendingPreviewOpening = PreviewOpening | undefined
type OptionalPreviewExpectation = Preview.PreviewExpectation | undefined

type PreviewResult = {
  scenario: string
  revision: string
  clickTime: number
  clickTimestampMs: number
  timings: unknown[]
  editTrace: PreviewEditTrace
  stages?: unknown
  outcome?: Preview.PreviewOutcome
  frames: Record<string, {
    clickToHmrMs: number
    hmrToAppliedMs: number
    clickToAppliedMs: number
    hmrTimestampMs: number
    appliedTimestampMs: number
    hmrTimings: unknown[]
    appliedTimings: unknown[]
    metroDeltaModules?: number
  }>
}

const sessionId = BrowserRuntime.querySelector<HTMLMetaElement>('meta[name="tao-session"]')!.content
let previewOrigin: PreviewOrigin
const frames = new Map(['left', 'right'].flatMap(id => {
  const frame = BrowserRuntime.querySelector<HTMLIFrameElement>(`#${id}`)
  return frame ? [[id, frame] as const] : []
}))
const receipts = new PreviewReceipts<SignalReceipt>()
const previewTimeoutMs = Number(
  BrowserRuntime.querySelector<HTMLMetaElement>('meta[name="tao-preview-timeout-ms"]')!.content,
)
const recoveries = new Map<string, Preview.PreviewRecovery>()
const expected = new Set<string>()
const terminalOutcomes = new Map<string, Preview.PreviewOutcome>()
const pendingSignals: MessageEvent[] = []
const scenarios = PreviewBrowserJson.parsePreviewScenarios(
  BrowserRuntime.querySelector<HTMLMetaElement>('meta[name="tao-scenarios"]')!.content,
)
let scenarioIndex = 0
const result: BrowserRuntime.PageState & { results: PreviewResult[] } = {
  status: 'closed',
  results: [],
}
let opening: PendingPreviewOpening
let baseline: OptionalPreviewExpectation
let latestExpectation: OptionalPreviewExpectation
const openButton = BrowserRuntime.querySelector<HTMLButtonElement>('#open')!
const opensOnLoad = BrowserRuntime.querySelector<HTMLBodyElement>('body')!.dataset.openOnLoad === 'true'
BrowserRuntime.setPageState(result)
const events = EventStream.open('/events')

events.addEventListener('expected', event => {
  const expectation = PreviewBrowserJson.parsePreviewExpectation((event as MessageEvent<string>).data)
  latestExpectation = expectation
  const revision = expectation.revision
  for (const recovery of recoveries.values()) {
    recovery.expect(expectation)
  }
  expected.clear()
  expected.add(revision)
  for (const pending of pendingSignals.splice(0)) {
    receiveSignal(pending)
  }
})

events.addEventListener('outcome', event => {
  const outcome = PreviewBrowserJson.parsePreviewOutcome((event as MessageEvent<string>).data)
  terminalOutcomes.set(outcome.revision, outcome)
  if (terminalOutcomes.size > 64) {
    terminalOutcomes.delete(terminalOutcomes.keys().next().value!)
  }
  for (const recovery of recoveries.values()) {
    recovery.terminal(outcome)
  }
})

events.addEventListener('baseline', event => {
  baseline = PreviewBrowserJson.parsePreviewExpectation((event as MessageEvent<string>).data)
  for (const recovery of recoveries.values()) {
    recovery.setBaseline(baseline)
  }
  for (const pending of pendingSignals.splice(0)) {
    receiveSignal(pending)
  }
})

BrowserRuntime.onMessage(receiveSignal)
openButton.addEventListener('click', () => {
  if (result.status === 'closed') {
    void openPreviews(!opensOnLoad).then(undefined, failScenario)
  } else if (result.status === 'ready' || result.status === 'complete') {
    closePreviews()
  }
})
BrowserRuntime.querySelector<HTMLButtonElement>('#run')!.addEventListener('click', () => {
  if (result.status !== 'ready' || scenarioIndex >= scenarios.length) {
    return
  }
  result.status = 'running'
  refreshRunButton()
  setStatus('running')
  const clickTime = Time.nowMs()
  const clickTimestampMs = Time.timestampMs()
  void runScenario(scenarios[scenarioIndex]!, clickTime, clickTimestampMs).then(undefined, failScenario)
})
setStatus('closed')
if (opensOnLoad) {
  void openPreviews(false).then(undefined, failScenario)
} else {
  openButton.disabled = false
}

type PreviewOpening = { started: number; revision: string; applied: Set<string> }
type OpenedPreview = { revision: string; url: string }

async function openPreviews(measure: boolean): Promise<void> {
  const started = Time.nowMs()
  setStatus('opening')
  result.status = 'opening'
  openButton.disabled = true
  const preview = await Http.requestJson<OpenedPreview>('/open-preview', { method: 'POST' })
  const url = Http.url(preview.url)
  previewOrigin = url.origin
  if (measure) {
    opening = { started, revision: preview.revision, applied: new Set() }
  }
  for (const [id, frame] of frames) {
    url.searchParams.set('frameId', id)
    frame.hidden = false
    const recovery = new Preview.PreviewRecovery(frame, url.toString(), sessionId, id, previewTimeoutMs)
    recoveries.set(id, recovery)
    restoreFrameRecovery(recovery, baseline, latestExpectation, terminalOutcomes)
  }
  if (!measure) {
    markPreviewsReady()
  }
}

function closePreviews(): void {
  for (const [id, frame] of frames) {
    recoveries.get(id)?.dispose()
    frame.hidden = true
    frame.removeAttribute('src')
  }
  recoveries.clear()
  pendingSignals.length = 0
  previewOrigin = undefined
  delete result.previewOpenMs
  result.status = 'closed'
  openButton.textContent = 'Show previews'
  refreshRunButton()
  setStatus('closed')
}

function recordPreviewOpened(signal: PreviewSignal): void {
  if (!opening || signal.revision !== opening.revision) {
    return
  }
  opening.applied.add(signal.frameId)
  if (opening.applied.size === frames.size) {
    result.previewOpenMs = Time.nowMs() - opening.started
    opening = undefined
    markPreviewsReady()
  }
}

function markPreviewsReady(): void {
  result.status = 'ready'
  openButton.textContent = 'Close previews'
  refreshRunButton()
  setStatus('ready')
}

function receiveSignal(event: MessageEvent): void {
  if (event.origin !== previewOrigin || !isFrameMessage(event)) {
    return
  }
  if (recoveries.get(event.data.frameId)?.receiveControlSignal(event.data)) {
    return
  }
  if (!isPreviewSignal(event.data)) {
    return
  }
  const signal = event.data
  if (signal.type === 'tao.preview-applied') {
    recordPreviewOpened(signal)
    recoveries.get(signal.frameId)?.receive(signal, signal.revision, 'applied')
  }
  if (!expected.has(signal.revision)) {
    if (pendingSignals.length < 32) {
      pendingSignals.push(event)
    }
    return
  }
  const frame = frames.get(signal.frameId)
  if (!frame || event.source !== BrowserRuntime.frameWindow(frame)) {
    return
  }
  const milestone = signal.type === 'tao.preview-applied' ? 'applied' : 'hmr'
  if (receipts.record(milestone, signal, { signal, receivedAt: Time.nowMs() })) {
    relaySignal(signal)
  }
}

function isFrameMessage(event: MessageEvent): boolean {
  const identity = event.data as OptionalSignalIdentity
  if (!identity || identity.sessionId !== sessionId || typeof identity.frameId !== 'string') {
    return false
  }
  const frame = frames.get(identity.frameId)
  if (!frame || event.source !== BrowserRuntime.frameWindow(frame)) {
    return false
  }
  return typeof identity.bootId === 'string' && !!recoveries.get(identity.frameId)?.matchesInstance(identity.bootId)
}

function relaySignal(signal: PreviewSignal): void {
  void Http.requestJson('/receipt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: PreviewBrowserJson.serializePreviewReceipt(signal),
  }).then(undefined, failScenario)
}

async function runScenario(scenario: string, clickTime: number, clickTimestampMs: number): Promise<void> {
  const update = await Http.requestJson<
    { status: string; revision: string; timings: unknown[]; stages?: unknown; editTrace: PreviewEditTrace }
  >(
    '/edit',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: PreviewBrowserJson.serializeEditScenario(scenario),
    },
  )
  if (update.status !== 'published') {
    return failScenario(`The ${scenario} source was ${update.status}.`)
  }
  expected.add(update.revision)
  const frameReceipts = await waitForFrames(update.revision)
  result.results.push({
    scenario,
    revision: update.revision,
    clickTime,
    clickTimestampMs,
    timings: update.timings,
    editTrace: update.editTrace,
    stages: update.stages,
    outcome: terminalOutcomes.get(update.revision),
    frames: Object.fromEntries([...frameReceipts].map(([id, receipt]) => [id, frameTimings(receipt, clickTime)])),
  })
  scenarioIndex++
  result.currentScenario = scenario
  result.status = scenarioIndex === scenarios.length ? 'complete' : 'ready'
  refreshRunButton()
  setStatus(result.status)
}

function refreshRunButton(): void {
  const runButton = BrowserRuntime.querySelector<HTMLButtonElement>('#run')!
  const complete = scenarioIndex >= scenarios.length
  runButton.disabled = complete || result.status !== 'ready'
  openButton.disabled = result.status === 'running' || result.status === 'failed'
  runButton.textContent = resolveRunButtonLabel(complete, result.status, scenarioIndex, scenarios)
}

function resolveRunButtonLabel(
  complete: boolean,
  status: string,
  scenarioIndex: number,
  scenarios: readonly string[],
): string {
  if (complete) {
    return 'Complete'
  }
  if (status === 'running') {
    return `Running ${scenarios[scenarioIndex]}…`
  }
  if (scenarioIndex === 0) {
    return 'Run edit scenarios'
  }
  return `Run ${scenarios[scenarioIndex]}`
}

function failScenario(reason: unknown): void {
  result.status = 'failed'
  result.error = String(reason)
  refreshRunButton()
  setStatus('failed')
}

function frameTimings(receipt: ReceiptPair<SignalReceipt>, clickTime: number) {
  return {
    bootId: receipt.applied.signal.bootId,
    clickToHmrMs: receipt.hmr.receivedAt - clickTime,
    hmrToAppliedMs: receipt.applied.signal.timestampMs - receipt.hmr.signal.timestampMs,
    clickToAppliedMs: receipt.applied.receivedAt - clickTime,
    hmrTimestampMs: receipt.hmr.signal.timestampMs,
    appliedTimestampMs: receipt.applied.signal.timestampMs,
    hmrTimings: receipt.hmr.signal.timings,
    appliedTimings: receipt.applied.signal.timings,
    metroDeltaModules: receipt.hmr.signal.metroDeltaModules,
  }
}

type FrameReceiptResult = Map<string, ReceiptPair<SignalReceipt>> | string

async function waitForFrames(revision: string): Promise<Map<string, ReceiptPair<SignalReceipt>>> {
  const result = await Time.waitFor<FrameReceiptResult>(success => {
    const terminal = terminalOutcomes.get(revision)
    const collected = receipts.complete(revision)
    if (terminal?.kind === 'noop' || terminal?.kind === 'superseded') {
      return success(new Map())
    }
    if (terminal) {
      return success(terminal.message ?? `Preview ${terminal.kind}.`)
    }
    return collected.size === frames.size ? success(collected) : undefined
  }, { timeout: 90_000 })
  if (result === undefined) {
    return await Promise.reject(`Timed out waiting for both preview receipts for ${revision}.`)
  }
  if (typeof result === 'string') {
    return await Promise.reject(result)
  }
  return result
}

function setStatus(status: string): void {
  BrowserRuntime.setStatus(status)
}
