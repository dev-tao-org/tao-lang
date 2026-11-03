import { Time } from '@shared'
import * as BrowserRuntime from '@shared/os/browser'
import * as Preview from '@shared/preview'

import * as WebHost from '../../shared/shared-src/os/bridges/Bridge_browser/Bridge_browser'
import * as PreviewBrowserJson from './Preview/PreviewBrowserJson'
import { PreviewReceipts, type ReceiptPair } from './Preview/PreviewReceipts'
import { isPreviewSignal, type PreviewSignal } from './Preview/PreviewSignal'

type SignalReceipt = { signal: PreviewSignal; receivedAt: number }
type OptionalSignalIdentity = Partial<PreviewSignal> | undefined

type PreviewResult = {
  scenario: string
  revision: string
  clickTime: number
  clickTimestampMs: number
  timings: unknown[]
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
  }>
}

const sessionId = BrowserRuntime.querySelector<HTMLMetaElement>('meta[name="tao-session"]')!.content
const previewOrigin =
  new WebHost.URL(BrowserRuntime.querySelector<HTMLMetaElement>('meta[name="tao-preview-url"]')!.content).origin
const frames = new Map(['left', 'right'].flatMap(id => {
  const frame = BrowserRuntime.querySelector<HTMLIFrameElement>(`#${id}`)
  return frame ? [[id, frame] as const] : []
}))
const receipts = new PreviewReceipts<SignalReceipt>()
const previewTimeoutMs = Number(
  BrowserRuntime.querySelector<HTMLMetaElement>('meta[name="tao-preview-timeout-ms"]')!.content,
)
const recoveries = new Map(
  [...frames].map((
    [frameId, frame],
  ) => [frameId, new Preview.PreviewRecovery(frame, sessionId, frameId, previewTimeoutMs)]),
)
const expected = new Set<string>()
const terminalOutcomes = new Map<string, Preview.PreviewOutcome>()
const pendingSignals: MessageEvent[] = []
const scenarios = PreviewBrowserJson.parsePreviewScenarios(
  BrowserRuntime.querySelector<HTMLMetaElement>('meta[name="tao-scenarios"]')!.content,
)
let scenarioIndex = 0
const result: { status: string; currentScenario?: string; results: PreviewResult[]; error?: string } = {
  status: 'ready',
  results: [],
}
BrowserRuntime.setPageState(result)
const events = BrowserRuntime.eventStream('/events')

events.addEventListener('expected', event => {
  const expectation = PreviewBrowserJson.parsePreviewExpectation((event as MessageEvent<string>).data)
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
  const baseline = PreviewBrowserJson.parsePreviewExpectation((event as MessageEvent<string>).data)
  for (const recovery of recoveries.values()) {
    recovery.setBaseline(baseline)
  }
  for (const pending of pendingSignals.splice(0)) {
    receiveSignal(pending)
  }
})

BrowserRuntime.onMessage(receiveSignal)
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
  void BrowserRuntime.requestJson('/receipt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: PreviewBrowserJson.serializePreviewReceipt(signal),
  }).then(undefined, failScenario)
}

async function runScenario(scenario: string, clickTime: number, clickTimestampMs: number): Promise<void> {
  const update = await BrowserRuntime.requestJson<
    { status: string; revision: string; timings: unknown[]; stages?: unknown }
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
  runButton.disabled = complete || result.status === 'running'
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
  }
}

function waitForFrames(revision: string): Promise<Map<string, ReceiptPair<SignalReceipt>>> {
  return new Promise((resolve, reject) => {
    const deadline = Time.nowMs() + 90_000
    const poll = () => {
      const terminal = terminalOutcomes.get(revision)
      const collected = receipts.complete(revision)
      if (terminal?.kind === 'noop' || terminal?.kind === 'superseded') {
        resolve(new Map())
      } else if (terminal) {
        reject(terminal.message ?? `Preview ${terminal.kind}.`)
      } else if (collected.size === frames.size) {
        resolve(collected)
      } else if (Time.nowMs() >= deadline) {
        reject(`Timed out waiting for both preview receipts for ${revision}.`)
      } else {
        void Time.sleep(25).then(poll)
      }
    }
    poll()
  })
}

function setStatus(status: string): void {
  BrowserRuntime.setStatus(status)
}
