import * as Perf from '@perf'
import { Errors } from '@shared'
import type { MeasurementJob } from './Runner'

/** PreviewReport describes the complete raw workload required for a comparable independent session. */
export type PreviewReport = {
  version: number
  sessionId: string
  commit: string
  modified: boolean
  startupMs: number
  browser: string
  runtime: string
  fixtureSha256: string
  system: unknown
  measurement: Perf.PreviewMeasurement
  frameSizes: PreviewFrameSize[]
  results: PreviewReportResult[]
}

type PreviewFrameSize = { width: number; height: number }
type PreviewReportResult = {
  scenario: string
  sample: string
  parentClickToLastAppliedMs: number
  frames?: PreviewResultFrames
}
type PreviewResultFrames = Record<string, { bootId?: string }>
type PreviewFrameCount = Perf.PreviewFrameCount

/** requireReport verifies source, workload completeness and measurement conditions before accepting timings. */
export function requireReport(report: PreviewReport, job: MeasurementJob): void {
  if (!hasExpectedIdentity(report, job)) {
    Errors.ThrowUserInput('Sample source, fixture, session or schema differs from its job.')
  }
  if (!hasExpectedWorkload(report, job)) {
    Errors.ThrowUserInput('Sample workload is incomplete or differs from the configured measurement.')
  }
  const durations = [report.startupMs, ...report.results.map(result => result.parentClickToLastAppliedMs)]
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
    extraViews: Number(job.environment.TAO_PREVIEW_EXTRA_VIEWS ?? '0'),
    extraFileCount: Number(job.environment.TAO_PREVIEW_EXTRA_FILE_COUNT ?? '0'),
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
