import { Errors } from '@shared'
import * as PreviewMeasurement from '../../../../perf/perf-src/PreviewMeasurement'
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
  measurement: PreviewMeasurement.PreviewMeasurement
  frameSizes: { width: number; height: number }[]
  results: { scenario: string; sample: string; parentClickToLastAppliedMs: number }[]
}

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
  return report.version === 1 && report.commit === job.commit && report.modified === false
    && report.fixtureSha256 === job.fixtureSha256 && typeof report.sessionId === 'string' && !!report.sessionId
    && typeof report.runtime === 'string' && !!report.runtime && typeof report.browser === 'string' && !!report.browser
    && !!report.system && typeof report.system === 'object'
}

function hasExpectedWorkload(report: PreviewReport, job: MeasurementJob): boolean {
  const settings = PreviewMeasurement.readPreviewMeasurement({
    editCount: job.settings.edits,
    frameCount: Number(job.environment.TAO_PREVIEW_FRAME_COUNT ?? '2') as 1 | 2,
    extraViews: Number(job.environment.TAO_PREVIEW_EXTRA_VIEWS ?? '0'),
    extraFileCount: Number(job.environment.TAO_PREVIEW_EXTRA_FILE_COUNT ?? '0'),
  })
  if (!hasExpectedSettings(report, settings) || !Array.isArray(report.results)) {
    return false
  }
  const scenarios = PreviewMeasurement.createMeasurementScenarios(settings)
  return report.results.length === scenarios.length
    && report.results.every((result, index) =>
      result.scenario === scenarios[index].name && result.sample === PreviewMeasurement.classifyMeasurementSample(index)
    )
}

function hasExpectedSettings(report: PreviewReport, settings: PreviewMeasurement.PreviewMeasurement): boolean {
  if (!report.measurement || !Array.isArray(report.frameSizes)) {
    return false
  }
  return report.measurement.editCount === settings.editCount && report.measurement.frameCount === settings.frameCount
    && report.measurement.extraViews === settings.extraViews
    && report.measurement.extraFileCount === settings.extraFileCount
    && report.frameSizes.length === settings.frameCount && report.frameSizes.every(hasMeasuredSize)
}

function hasMeasuredSize(size: { width: number; height: number }): boolean {
  return Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0
}
