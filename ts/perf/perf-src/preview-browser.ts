import * as Browser from '../../shared/shared-src/os/BrowserRuntime'

type PreviewSignal = {
  type: 'tao.preview-applied' | 'tao.update-done'
  sessionId: string
  frameId: string
  bootId: string
  revision: string
  timestampMs: number
  timings: unknown[]
}

type SignalReceipt = { signal: PreviewSignal; receivedAt: number }
type FrameState = { applied: Map<string, SignalReceipt>; hmr: Map<string, SignalReceipt> }

type PreviewResult = {
  scenario: string
  revision: string
  clickTime: number
  clickTimestampMs: number
  timings: unknown[]
  stages?: unknown
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

const sessionId = Browser.querySelector<HTMLMetaElement>('meta[name="tao-session"]')!.content
const previewOrigin = new URL(Browser.querySelector<HTMLMetaElement>('meta[name="tao-preview-url"]')!.content).origin
const frames = new Map<string, HTMLIFrameElement>([
  ['left', Browser.querySelector<HTMLIFrameElement>('#left')!],
  ['right', Browser.querySelector<HTMLIFrameElement>('#right')!],
])
const states = new Map<string, FrameState>([...frames.keys()].map(id => [id, { applied: new Map(), hmr: new Map() }]))
const expected = new Set<string>()
const pendingSignals: MessageEvent[] = []
const scenarios = ['text', 'add-text', 'row'] as const
let latestExpected = 0
let scenarioIndex = 0
const result: { status: string; currentScenario?: string; results: PreviewResult[]; error?: string } = {
  status: 'ready',
  results: [],
}
Browser.setPageState(result)
const events = Browser.eventStream('/events')

events.addEventListener('expected', event => {
  const revision = (JSON.parse((event as MessageEvent<string>).data) as { revision: string }).revision
  expected.clear()
  expected.add(revision)
  latestExpected = Math.max(latestExpected, revisionNumber(revision))
  pruneReceiptHistory()
  for (const pending of pendingSignals.splice(0)) {
    receiveSignal(pending)
  }
})

Browser.onMessage(receiveSignal)
Browser.querySelector<HTMLButtonElement>('#run')!.addEventListener('click', () => {
  if (result.status !== 'ready' || scenarioIndex >= scenarios.length) {
    return
  }
  result.status = 'running'
  setStatus('running')
  const clickTime = Browser.now()
  const clickTimestampMs = Browser.timestampMs()
  void runScenario(scenarios[scenarioIndex]!, clickTime, clickTimestampMs).then(undefined, failScenario)
})

function receiveSignal(event: MessageEvent): void {
  if (event.origin !== previewOrigin || !isSignal(event.data)) {
    return
  }
  const signal = event.data
  if (!isCurrentSignal(signal)) {
    return
  }
  if (!expected.has(signal.revision)) {
    if (pendingSignals.length < 32) {
      pendingSignals.push(event)
    }
    return
  }
  const frame = frames.get(signal.frameId)
  const frameState = states.get(signal.frameId)
  if (!frame || !frameState || event.source !== Browser.frameWindow(frame)) {
    return
  }
  const collection = signal.type === 'tao.preview-applied' ? frameState.applied : frameState.hmr
  if (!collection.has(signal.revision)) {
    collection.set(signal.revision, { signal, receivedAt: Browser.now() })
    relaySignal(signal)
  }
}

function relaySignal(signal: PreviewSignal): void {
  const { type, sessionId, frameId, bootId, revision, timestampMs } = signal
  void Browser.requestJson('/receipt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, sessionId, frameId, bootId, revision, timestampMs }),
  }).then(undefined, failScenario)
}

async function runScenario(
  scenario: typeof scenarios[number],
  clickTime: number,
  clickTimestampMs: number,
): Promise<void> {
  const update = await Browser.requestJson<{ status: string; revision: string; timings: unknown[]; stages?: unknown }>(
    '/edit',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario }),
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
    frames: Object.fromEntries([...frameReceipts].map(([id, receipt]) => [id, frameTimings(receipt, clickTime)])),
  })
  scenarioIndex++
  result.currentScenario = scenario
  result.status = scenarioIndex === scenarios.length ? 'complete' : 'ready'
  Browser.querySelector<HTMLButtonElement>('#run')!.textContent = scenarioIndex === scenarios.length
    ? 'Complete'
    : `Run ${scenarios[scenarioIndex]}`
  setStatus(result.status)
}

function failScenario(reason: unknown): void {
  result.status = 'failed'
  result.error = String(reason)
  setStatus('failed')
}

function isSignal(value: unknown): value is PreviewSignal {
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
  return typeof signal.sessionId === 'string'
    && typeof signal.frameId === 'string'
    && typeof signal.bootId === 'string'
    && typeof signal.revision === 'string'
}

function hasSignalTiming(signal: Partial<PreviewSignal>): boolean {
  return typeof signal.timestampMs === 'number' && Array.isArray(signal.timings)
}

function isCurrentSignal(signal: PreviewSignal): boolean {
  return signal.sessionId === sessionId
    && revisionNumber(signal.revision) >= latestExpected
    && (signal.type === 'tao.preview-applied' || signal.type === 'tao.update-done')
}

function frameTimings(receipt: { hmr: SignalReceipt; applied: SignalReceipt }, clickTime: number) {
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

function waitForFrames(revision: string): Promise<Map<string, { hmr: SignalReceipt; applied: SignalReceipt }>> {
  return new Promise((resolve, reject) => {
    const deadline = Browser.now() + 90_000
    const poll = () => {
      const collected = new Map<string, { hmr: SignalReceipt; applied: SignalReceipt }>()
      for (const [id, state] of states) {
        const hmr = state.hmr.get(revision)
        const applied = state.applied.get(revision)
        if (hmr && applied) {
          if (hmr.signal.bootId === applied.signal.bootId) {
            collected.set(id, { hmr, applied })
          }
        }
      }
      if (collected.size === frames.size) {
        resolve(collected)
      } else if (Browser.now() >= deadline) {
        reject(`Timed out waiting for both preview receipts for ${revision}.`)
      } else {
        void Browser.sleep(25).then(poll)
      }
    }
    poll()
  })
}

function revisionNumber(revision: string): number {
  return Number(revision.replace(/^r/, '')) || 0
}

function pruneReceiptHistory(): void {
  for (const state of states.values()) {
    for (const collection of [state.applied, state.hmr]) {
      for (const revision of collection.keys()) {
        if (revisionNumber(revision) < latestExpected) {
          collection.delete(revision)
        }
      }
    }
  }
}

function setStatus(status: string): void {
  Browser.setStatus(status)
}
