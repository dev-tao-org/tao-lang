import { Objects, Regxs, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { JobFileName, requireSampleName } from './JobFiles'
import { parsePreviewReport, type PreviewReport, requireReport } from './ReportContract'
import { type MeasurementJob, parseMeasurementJob } from './Runner'

/** MeasurementSummary retains grouped results and the conditions attached to a completed job. */
export type MeasurementSummary = {
  directory: string
  commit: string
  tree: string
  fixtureSha256: string
  settings: MeasurementJob['settings']
  conditions: MeasurementConditions
  groups: MeasurementGroupSummary[]
  interpretation: string
}

type MeasurementConditionField = 'system' | 'runtime' | 'browser' | 'measurement' | 'frameSizes'
/** MeasurementConditions identifies environment and workload fields that must match. */
export type MeasurementConditions = Pick<PreviewReport, MeasurementConditionField>
type MeasurementGroupSummary = {
  name: string
  sessions: number
  medianMs: number
  minMs: number
  maxMs: number
  runMediansMs: number[]
}

/** summarizeJob retains independent-session medians and conditions without issuing an automatic significance verdict. */
export async function summarizeJob(directory: string): Promise<MeasurementSummary> {
  const { job, reports } = await readCompletedJob(directory)
  const conditions = describeMeasurementConditions(reports[0])
  const sameConditions = reports.every(report => Objects.equal(describeMeasurementConditions(report), conditions))
  UserInput.Require(
    !!sameConditions,
    'Job conditions changed between sessions; split the comparison before interpreting timings.',
  )
  const groups = collectGroups(reports)
  const summaries = [...groups].map(([name, values]) => describeGroup(name, values))
  return {
    directory,
    commit: job.commit,
    tree: job.tree,
    fixtureSha256: job.fixtureSha256,
    settings: job.settings,
    conditions,
    groups: summaries,
    interpretation: 'Run medians are independent session units. Edit counts are not independent process counts.',
  }
}

/** readCompletedJob loads and validates the raw sessions from a passed job. */
export async function readCompletedJob(directory: string): Promise<{ job: MeasurementJob; reports: PreviewReport[] }> {
  const jobPath = Path.join(directory, JobFileName)
  const job = parseMeasurementJob(await FS.readFile(jobPath, 'utf8'), jobPath)
  UserInput.Require(
    !!isCompleteJob(job),
    'Summarize a complete passed job; failed and interrupted jobs remain evidence gaps.',
  )
  const reports = await Promise.all(job.samples.map(name => readReport(directory, name, job)))
  UserInput.Require(
    new Set(reports.map(report => report.sessionId)).size === reports.length,
    'Duplicate session identities cannot count as independent measurements.',
  )
  return { job, reports }
}

/** describeMeasurementConditions selects the report fields that must match across comparisons. */
export function describeMeasurementConditions(report: PreviewReport): MeasurementConditions {
  return {
    system: report.system,
    runtime: report.runtime,
    browser: report.browser,
    measurement: report.measurement,
    frameSizes: report.frameSizes,
  }
}

/** median returns the middle of a nonempty set of measured durations. */
export function median(values: readonly number[]): number {
  const sorted = values.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function isCompleteJob(job: MeasurementJob): boolean {
  if (job.version !== 1 || job.status !== 'passed') {
    return false
  }
  if (job.samples.length !== job.settings.samples || job.samples.length === 0) {
    return false
  }
  return new Set(job.samples).size === job.samples.length
}

async function readReport(directory: string, name: string, job: MeasurementJob): Promise<PreviewReport> {
  requireSampleName(name)
  const path = Path.join(directory, name)
  const report = parsePreviewReport(await FS.readFile(path, 'utf8'), path)
  requireReport(report, job)
  return report
}

function collectGroups(reports: PreviewReport[]): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  for (const report of reports) {
    const session = new Map<string, number[]>([
      ['harness launch', [report.startupMs]],
      ['first preview open', [report.opening.firstMs]],
      ['warm preview reopen', report.opening.reopenMs],
    ])
    for (const result of report.results) {
      const scenario = result.scenario.replace(Regxs.MeasurementScenarioCycleSuffixRegx, '')
      const name = `${result.sample}/${scenario}`
      session.set(name, [...session.get(name) ?? [], result.parentClickToLastAppliedMs])
    }
    for (const [name, values] of session) {
      groups.set(name, [...groups.get(name) ?? [], median(values)])
    }
  }
  return groups
}

function describeGroup(name: string, values: number[]): MeasurementGroupSummary {
  return {
    name,
    sessions: values.length,
    medianMs: median(values),
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
    runMediansMs: values,
  }
}
