import { Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { TimingReport } from './TimingReport'

/** TimingHistory identifies the previous comparable measurement and unusable saved evidence. */
export type TimingHistory = { baseline?: TimingReport; unusable: number }

/** MinimumComparisonSessions sets the independent-session count required for a usable comparison. */
export const MinimumComparisonSessions = 5

/** readTimingHistory selects an earlier completed job by measurement time, never by collection time. */
export async function readTimingHistory(current: TimingReport, directory: string): Promise<TimingHistory> {
  const history: TimingHistory = { unusable: 0 }
  for (const name of await FileSystem.readdir(directory)) {
    if (!name.endsWith('.json')) {
      continue
    }
    const path = Path.join(directory, name)
    const value: unknown = await Try.WithDefault(
      undefined,
      async () => JSON.parse(await FileSystem.readFile(path, 'utf8')),
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

/** isValidTimingReport rejects missing provenance and incomplete or nonfinite saved measurements. */
export function isValidTimingReport(value: unknown): value is TimingReport {
  if (!value || typeof value !== 'object') {
    return false
  }
  const report = value as Partial<TimingReport>
  return hasReportIdentity(report) && hasMeasurementConditions(report) && hasValidGroups(report)
}

function hasReportIdentity(report: Partial<TimingReport>): boolean {
  const fields = [report.directory, report.runner, report.commit, report.tree, report.fixtureSha256]
  return fields.every(value => typeof value === 'string' && value.length > 0)
    && isMeasurementTime(report.startedAt) && isMeasurementTime(report.finishedAt)
    && report.startedAt! <= report.finishedAt!
}

function isMeasurementTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
}

function hasMeasurementConditions(report: Partial<TimingReport>): boolean {
  const settings = report.settings
  return !!settings && Number.isInteger(settings.samples) && settings.samples > 0
    && Number.isInteger(settings.edits) && settings.edits >= 4 && settings.edits % 4 === 0
    && hasComparableConditions(report.conditions)
}

function hasComparableConditions(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const conditions = value as Record<string, unknown>
  return typeof conditions.runtime === 'string' && conditions.runtime.length > 0
    && typeof conditions.browser === 'string' && conditions.browser.length > 0
    && !!conditions.system && typeof conditions.system === 'object'
    && !!conditions.measurement && typeof conditions.measurement === 'object'
    && Array.isArray(conditions.frameSizes) && conditions.frameSizes.length > 0
}

function hasValidGroups(report: Partial<TimingReport>): boolean {
  if (!Array.isArray(report.groups) || report.groups.length === 0) {
    return false
  }
  return new Set(report.groups.map(group => group?.name)).size === report.groups.length
    && report.groups.every(group => isValidGroup(group, report.settings?.samples))
}

function isValidGroup(group: TimingReport['groups'][number], samples: number | undefined): boolean {
  if (!group || typeof group.name !== 'string' || group.sessions !== samples) {
    return false
  }
  const values = [group.medianMs, group.minMs, group.maxMs]
  return values.every(value => Number.isFinite(value) && value >= 0)
    && group.minMs <= group.medianMs && group.medianMs <= group.maxMs
    && Array.isArray(group.runMediansMs) && group.runMediansMs.length === samples
    && group.runMediansMs.every(value => Number.isFinite(value) && value >= group.minMs && value <= group.maxMs)
}

function isPreviousComparableReport(current: TimingReport, candidate: TimingReport): boolean {
  return candidate.settings.samples >= MinimumComparisonSessions
    && candidate.directory !== current.directory && candidate.runner === current.runner
    && candidate.startedAt < current.startedAt && candidate.finishedAt <= current.startedAt
    && candidate.fixtureSha256 === current.fixtureSha256 && candidate.settings.edits === current.settings.edits
    && encodeConditions(candidate.conditions) === encodeConditions(current.conditions)
    && encodeGroupNames(candidate) === encodeGroupNames(current)
}

function encodeConditions(value: unknown): string {
  return JSON.stringify(canonicalizeConditions(value))
}

function canonicalizeConditions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeConditions)
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonicalizeConditions(record[key])]))
  }
  return value
}

function encodeGroupNames(report: TimingReport): string {
  return JSON.stringify(report.groups.map(group => group.name).sort())
}
