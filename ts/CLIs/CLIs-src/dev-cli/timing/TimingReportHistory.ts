import { Json, Regxs, Sort, Try } from '@shared'
import { FS, Path } from '@shared/os'
import type { TimingReport } from './TimingReportContract'

/** TimingHistory identifies the previous comparable measurement and unusable saved evidence. */
export type TimingHistory = { baseline?: TimingReport; unusable: number }

/** MinimumComparisonSessions sets the independent-session count required for a usable comparison. */
export const MinimumComparisonSessions = 5

/** readTimingHistory selects an earlier completed job by measurement time, never by collection time. */
export async function readTimingHistory(current: TimingReport, directory: string): Promise<TimingHistory> {
  const history: TimingHistory = { unusable: 0 }
  for (const name of await FS.readdir(directory)) {
    if (!name.endsWith('.json')) {
      continue
    }
    const path = Path.join(directory, name)
    const value: unknown = await Try.WithDefault(
      undefined,
      async () => FS.readJson(path),
    )
    if (!isValidTimingReport(value)) {
      history.unusable++
      continue
    }
    if (isPreviousComparableReport(current, value)) {
      if (!history.baseline || value.startedAt > history.baseline.startedAt) {
        history.baseline = value
      }
    }
  }
  return history
}

/** isValidTimingReport rejects missing provenance, invalid JSON conditions and incomplete or nonfinite measurements. */
export function isValidTimingReport(value: unknown): value is TimingReport {
  if (!value || typeof value !== 'object') {
    return false
  }
  const report = value as Partial<TimingReport>
  return hasReportIdentity(report) && hasMeasurementConditions(report) && hasValidGroups(report)
}

function hasReportIdentity(report: Partial<TimingReport>): boolean {
  const fields = [report.directory, report.runner, report.commit, report.tree, report.fixtureSha256]
  return hasCompleteReportIdentity(fields) && hasValidMeasurementInterval(report)
}

function hasCompleteReportIdentity(fields: readonly unknown[]): boolean {
  return fields.every(value => typeof value === 'string' && value.length > 0)
}

function hasValidMeasurementInterval(report: Partial<TimingReport>): boolean {
  const startedAt = report.startedAt
  const finishedAt = report.finishedAt
  if (!isMeasurementTime(startedAt) || !isMeasurementTime(finishedAt)) {
    return false
  }
  return startedAt <= finishedAt
}

function isMeasurementTime(value: unknown): value is string {
  return typeof value === 'string' && Regxs.TimingReportTimestampRegx.test(value)
}

function hasMeasurementConditions(report: Partial<TimingReport>): boolean {
  const settings = report.settings
  if (!settings) {
    return false
  }
  return hasValidSampleCount(settings.samples) && hasValidEditCount(settings.edits)
    && hasComparableConditions(report.conditions)
}

function hasValidSampleCount(samples: number): boolean {
  return Number.isInteger(samples) && samples > 0
}

function hasValidEditCount(edits: number): boolean {
  return Number.isInteger(edits) && edits >= 4 && edits % 4 === 0
}

function hasComparableConditions(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  if (!hasCanonicalConditionData(value)) {
    return false
  }
  const conditions = value as Record<string, unknown>
  return hasNamedRuntime(conditions) && hasNamedBrowserAndConditionObjects(conditions) && hasFrameSizes(conditions)
}

function hasCanonicalConditionData(value: object): boolean {
  return Try.WithDefault(false, () => {
    Json.Canonical(value)
    return true
  })
}

function hasNamedRuntime(conditions: Record<string, unknown>): boolean {
  return typeof conditions.runtime === 'string' && conditions.runtime.length > 0
}

function hasNamedBrowserAndConditionObjects(conditions: Record<string, unknown>): boolean {
  return hasNamedBrowser(conditions) && hasSystemAndMeasurement(conditions)
}

function hasNamedBrowser(conditions: Record<string, unknown>): boolean {
  return typeof conditions.browser === 'string' && conditions.browser.length > 0
}

function hasSystemAndMeasurement(conditions: Record<string, unknown>): boolean {
  return isObjectRecord(conditions.system) && isObjectRecord(conditions.measurement)
}

function isObjectRecord(value: unknown): boolean {
  return !!value && typeof value === 'object'
}

function hasFrameSizes(conditions: Record<string, unknown>): boolean {
  return Array.isArray(conditions.frameSizes) && conditions.frameSizes.length > 0
}

function hasValidGroups(report: Partial<TimingReport>): boolean {
  if (!Array.isArray(report.groups) || report.groups.length === 0) {
    return false
  }
  return new Set(report.groups.map(group => group?.name)).size === report.groups.length
    && report.groups.every(group => isValidGroup(group, report.settings?.samples))
}

type ExpectedSessionCount = number | undefined

function isValidGroup(group: TimingReport['groups'][number], samples: ExpectedSessionCount): boolean {
  if (!group || typeof group.name !== 'string' || group.sessions !== samples) {
    return false
  }
  return hasOrderedGroupValues(group) && hasExpectedRunMedians(group, samples)
}

function hasOrderedGroupValues(group: TimingReport['groups'][number]): boolean {
  const values = [group.medianMs, group.minMs, group.maxMs]
  return values.every(value => Number.isFinite(value) && value >= 0)
    && group.minMs <= group.medianMs && group.medianMs <= group.maxMs
}

function hasExpectedRunMedians(group: TimingReport['groups'][number], samples: ExpectedSessionCount): boolean {
  return Array.isArray(group.runMediansMs) && group.runMediansMs.length === samples
    && group.runMediansMs.every(value => Number.isFinite(value) && value >= group.minMs && value <= group.maxMs)
}

function isPreviousComparableReport(current: TimingReport, candidate: TimingReport): boolean {
  return isEligibleBaseline(current, candidate)
    && hasMatchingMeasurementSettings(current, candidate)
    && hasMatchingConditionsAndGroups(current, candidate)
}

function isEligibleBaseline(current: TimingReport, candidate: TimingReport): boolean {
  return candidate.settings.samples >= MinimumComparisonSessions && isEarlierUniqueRunnerReport(current, candidate)
}

function isEarlierUniqueRunnerReport(current: TimingReport, candidate: TimingReport): boolean {
  if (candidate.directory === current.directory || candidate.runner !== current.runner) {
    return false
  }
  return candidate.startedAt < current.startedAt && candidate.finishedAt <= current.startedAt
}

function hasMatchingMeasurementSettings(current: TimingReport, candidate: TimingReport): boolean {
  return candidate.fixtureSha256 === current.fixtureSha256 && candidate.settings.edits === current.settings.edits
}

function hasMatchingConditionsAndGroups(current: TimingReport, candidate: TimingReport): boolean {
  return encodeConditions(candidate.conditions) === encodeConditions(current.conditions)
    && encodeGroupNames(candidate) === encodeGroupNames(current)
}

function encodeConditions(value: TimingReport['conditions']): string {
  return Json.Canonical(value)
}

function encodeGroupNames(report: TimingReport): string {
  return Json.Print(report.groups.map(group => group.name).sort(Sort.CompareStrings))
}
