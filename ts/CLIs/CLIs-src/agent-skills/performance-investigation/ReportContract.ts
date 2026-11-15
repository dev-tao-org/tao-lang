import * as Perf from '@perf'
import { Errors, Json, Schema, Try } from '@shared'
import type { MeasurementJob } from './Runner'

/** PreviewReport describes the complete raw workload required for a comparable independent session. */
export type PreviewReport = {
  version: number
  sessionId: string
  commit: string
  modified: boolean
  startupMs: number
  opening: Perf.PreviewOpeningTimings
  browser: string
  runtime: string
  fixtureSha256: string
  system: unknown
  measurement: Perf.PreviewMeasurement & { protocol: string }
  frameSizes: PreviewFrameSize[]
  results: PreviewReportResult[]
}

type PreviewFrameSize = { width: number; height: number }
type PreviewReportResult = {
  scenario: string
  sample: string
  parentClickToLastAppliedMs: number
  frames?: PreviewResultFrames
  work: Perf.PreviewWork
}
type PreviewResultFrames = Record<string, { bootId?: string }>
type PreviewFrameCount = Perf.PreviewFrameCount

/** parsePreviewReport validates the raw preview measurement before workload and provenance checks. */
export function parsePreviewReport(source: string, path: string): PreviewReport {
  return Try(() => Json.Parse(source, { schema: previewReportSchema }), {
    catch: () => Errors.ThrowUserInput(`Invalid preview report at ${path}. Use the tooling that recorded this job.`),
  })
}

const previewReportSchema = Schema.looseObject({
  version: Schema.number(),
  sessionId: Schema.string(),
  commit: Schema.string(),
  modified: Schema.boolean(),
  startupMs: Schema.number(),
  opening: Schema.object({ firstMs: Schema.number(), reopenMs: Schema.array(Schema.number()) }),
  browser: Schema.string(),
  runtime: Schema.string(),
  fixtureSha256: Schema.string(),
  system: Schema.unknown(),
  measurement: Schema.looseObject({
    protocol: Schema.string(),
    editCount: Schema.number(),
    frameCount: Schema.union([Schema.literal(1), Schema.literal(2)]),
    extraViews: Schema.number(),
    extraFileCount: Schema.number(),
  }),
  frameSizes: Schema.array(Schema.looseObject({ width: Schema.number(), height: Schema.number() })),
  results: Schema.array(Schema.looseObject({
    scenario: Schema.string(),
    sample: Schema.string(),
    parentClickToLastAppliedMs: Schema.number(),
    frames: Schema.record(Schema.string(), Schema.looseObject({ bootId: Schema.string().optional() })).optional(),
    work: Schema.looseObject({
      moduleDiscoveries: Schema.number(),
      parses: Schema.number(),
      modulesEmitted: Schema.number(),
      generatedPathsChanged: Schema.number().optional(),
      metroDeltaModules: Schema.number().optional(),
    }),
  })),
})

/** requireReport verifies source, workload completeness and measurement conditions before accepting timings. */
export function requireReport(report: PreviewReport, job: MeasurementJob): void {
  if (!hasExpectedIdentity(report, job)) {
    Errors.ThrowUserInput('Sample source, fixture, session or schema differs from its job.')
  }
  if (!hasExpectedWorkload(report, job)) {
    Errors.ThrowUserInput('Sample workload is incomplete or differs from the configured measurement.')
  }
  if (!report.opening || report.opening.reopenMs?.length !== Perf.PreviewReopenCount) {
    Errors.ThrowUserInput('Sample is missing the first preview open or successive warm opens.')
  }
  if (!report.results.every(result => result.work && Number.isInteger(result.work.modulesEmitted))) {
    Errors.ThrowUserInput('Sample is missing module work observations.')
  }
  const durations = [report.startupMs, report.opening.firstMs, ...report.opening.reopenMs]
  durations.push(...report.results.map(result => result.parentClickToLastAppliedMs))
  if (durations.some(duration => !Number.isFinite(duration) || duration < 0)) {
    Errors.ThrowUserInput('Sample contains a missing or invalid measured duration.')
  }
}

function hasExpectedIdentity(report: PreviewReport, job: MeasurementJob): boolean {
  if (report.version !== 1 || report.commit !== job.commit || report.modified !== false) {
    return false
  }
  if (report.fixtureSha256 !== job.fixtureSha256 || !isNonemptyText(report.sessionId)) {
    return false
  }
  if (!isNonemptyText(report.runtime) || !isNonemptyText(report.browser)) {
    return false
  }
  return hasSystemInformation(report.system)
}

function hasExpectedWorkload(report: PreviewReport, job: MeasurementJob): boolean {
  const settings = Perf.readPreviewMeasurement({
    editCount: job.settings.edits,
    frameCount: Number(job.environment.TAO_PREVIEW_FRAME_COUNT ?? '2') as PreviewFrameCount,
  })
  if (!hasExpectedSettings(report, settings) || !Array.isArray(report.results)) {
    return false
  }
  const scenarios = Perf.createMeasurementScenarios(settings)
  if (report.results.length !== scenarios.length) {
    return false
  }
  return report.results.every((result, index) => hasExpectedScenarioResult(result, index, scenarios[index].name))
}

function hasExpectedSettings(report: PreviewReport, settings: Perf.PreviewMeasurement): boolean {
  if (!report.measurement || !Array.isArray(report.frameSizes)) {
    return false
  }
  if (report.measurement.protocol !== Perf.PreviewMeasurementProtocol) {
    Errors.ThrowUserInput('Preview measurement protocol differs. Use tooling from the revision that recorded this job.')
  }
  if (report.measurement.editCount !== settings.editCount || report.measurement.frameCount !== settings.frameCount) {
    return false
  }
  if (
    report.measurement.extraViews !== settings.extraViews
    || report.measurement.extraFileCount !== settings.extraFileCount
  ) {
    return false
  }
  if (report.frameSizes.length !== settings.frameCount) {
    return false
  }
  return report.frameSizes.every(hasMeasuredSize)
}

function hasExpectedScenarioResult(
  result: PreviewReportResult,
  index: number,
  scenario: string,
): boolean {
  return result.scenario === scenario
    && result.sample === Perf.classifyMeasurementSample(index)
}

function hasMeasuredSize(size: PreviewFrameSize): boolean {
  const hasValidWidth = Number.isFinite(size.width) && size.width > 0
  const hasValidHeight = Number.isFinite(size.height) && size.height > 0
  return hasValidWidth && hasValidHeight
}

function isNonemptyText(value: unknown): value is string {
  return typeof value === 'string' && !!value
}

function hasSystemInformation(value: unknown): boolean {
  return !!value && typeof value === 'object'
}
