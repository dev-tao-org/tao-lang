import { Json } from '@shared'
import type * as Preview from '@shared/preview'
import type { PreviewSignal } from './PreviewSignal'

export {
  parsePreviewExpectation,
  parsePreviewOutcome,
  parsePreviewScenarios,
  serializeEditScenario,
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

/** serializeEditScenario encodes the scenario selected for the next harness edit. */
function serializeEditScenario(scenario: string): string {
  const request: EditScenarioRequest = { scenario }
  return Json.Print(request)
}
