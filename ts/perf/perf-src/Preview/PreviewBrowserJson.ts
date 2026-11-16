import { Json, Schema } from '@shared'
import type * as Preview from '@shared/preview'
import { Http } from '@shared/web'
import type { OpenedPreview } from './PreviewOpening'
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

const previewExpectationSchema = Schema.object({ revision: Schema.string(), sequence: Schema.number().int() })
const openedPreviewSchema = Schema.object({ baseline: previewExpectationSchema, url: Schema.string() })

/** parseOpenedPreview validates the publication accompanying the preview URL. */
export function parseOpenedPreview(source: string): OpenedPreview {
  return Json.Parse(source, { schema: openedPreviewSchema })
}

const savedPreviewStatusSchema = Schema.union([
  Schema.object({ status: Schema.enum(['invalid', 'published', 'superseded']) }),
  Schema.object({ status: Schema.literal('failed'), error: Schema.string() }),
])

type CompiledPreviewSaveStatus = 'invalid' | 'published' | 'superseded'

/** SavedPreviewStatus is the compiler verdict shown by the editor after a source save. */
export type SavedPreviewStatus =
  | { status: CompiledPreviewSaveStatus }
  | { status: 'failed'; error: string }

/** parseSavedPreviewStatus validates the compiler status the source editor displays. */
export function parseSavedPreviewStatus(source: string): SavedPreviewStatus {
  return Json.Parse(source, { schema: savedPreviewStatusSchema })
}

const scenarioUpdateSchema = Schema.object({
  status: Schema.string(),
  revision: Schema.string(),
  timings: Schema.array(Schema.unknown()),
  stages: Schema.unknown().optional(),
  editTrace: Schema.object({
    receivedAtMs: Schema.number(),
    writeStartedAtMs: Schema.number(),
    writtenAtMs: Schema.number(),
    changes: Schema.object({ added: Schema.number(), modified: Schema.number(), deleted: Schema.number() }).optional(),
  }),
})

/** requestScenarioUpdate submits one saved scenario and decodes the reply. */
export async function requestScenarioUpdate(scenario: string): Promise<ScenarioResponse> {
  const response = await Http.request('/edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: serializeEditScenario(scenario),
  })
  return response.ok
    ? { ok: true, update: Json.Parse(await response.text(), { schema: scenarioUpdateSchema }) }
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
