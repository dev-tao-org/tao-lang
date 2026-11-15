import { Json } from '@shared'
import type * as Preview from '@shared/preview'
import { Http } from '@shared/web'
import type { PreviewSignal } from './PreviewSignal'
import type { PreviewEditTrace } from './PreviewWork'

export {
  parsePreviewExpectation,
  parsePreviewOutcome,
  parsePreviewScenarios,
  serializePreviewReceipt,
}

type PreviewExpectation = { revision: string; sequence: number }
type PreviewReceipt = {
  type: PreviewSignal['type']
  sessionId: string
  frameId: string
  bootId: string
  revision: string
  timestampMs: number
}
type EditScenarioRequest = { scenario: string }

/** ScenarioUpdate is the edit receipt used before waiting for the rendered frames. */
export type ScenarioUpdate = {
  status: string
  revision: string
  timings: unknown[]
  stages?: unknown
  editTrace: PreviewEditTrace
}

type ScenarioResponse = { ok: true; update: ScenarioUpdate } | { ok: false; status: number; message: string }

/** requestScenarioUpdate submits one saved scenario and decodes the reply. */
export async function requestScenarioUpdate(scenario: string): Promise<ScenarioResponse> {
  const response = await Http.request('/edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: serializeEditScenario(scenario),
  })
  return response.ok
    ? { ok: true, update: Json.Parse(await response.text()) as ScenarioUpdate }
    : { ok: false, status: response.status, message: await response.text() }
}

/** parsePreviewScenarios decodes the harness-owned scenario metadata. */
function parsePreviewScenarios(source: string): string[] {
  return Json.Parse(source) as string[]
}

/** parsePreviewExpectation decodes the harness-owned expected or baseline revision event. */
function parsePreviewExpectation(source: string): PreviewExpectation {
  return Json.Parse(source) as PreviewExpectation
}

/** parsePreviewOutcome decodes a terminal outcome published by the harness. */
function parsePreviewOutcome(source: string): Preview.PreviewOutcome {
  return Json.Parse(source) as Preview.PreviewOutcome
}

/** serializePreviewReceipt encodes only the receipt identity and timestamp fields. */
function serializePreviewReceipt(signal: PreviewSignal): string {
  const { type, sessionId, frameId, bootId, revision, timestampMs } = signal
  const receipt: PreviewReceipt = { type, sessionId, frameId, bootId, revision, timestampMs }
  return Json.Print(receipt)
}

function serializeEditScenario(scenario: string): string {
  const request: EditScenarioRequest = { scenario }
  return Json.Print(request)
}
