import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { JobFileName, requireSampleName } from './JobFiles'
import { type PreviewReport, requireReport } from './ReportContract'
import type { MeasurementJob } from './Runner'

/** summarizeJob retains independent-session medians and conditions without issuing an automatic significance verdict. */
export async function summarizeJob(directory: string) {
  const job = JSON.parse(await FileSystem.readFile(Path.join(directory, JobFileName), 'utf8')) as MeasurementJob
  if (!isCompleteJob(job)) {
    Errors.ThrowUserInput('Summarize a complete passed job; failed and interrupted jobs remain evidence gaps.')
  }
  const reports = await Promise.all(job.samples.map(name => readReport(directory, name, job)))
  if (new Set(reports.map(report => report.sessionId)).size !== reports.length) {
    Errors.ThrowUserInput('Duplicate session identities cannot count as independent measurements.')
  }
  const conditions = reports.map(report =>
    JSON.stringify({
      system: report.system,
      runtime: report.runtime,
      browser: report.browser,
      measurement: report.measurement,
      frameSizes: report.frameSizes,
    })
  )
  if (new Set(conditions).size !== 1) {
    Errors.ThrowUserInput('Job conditions changed between sessions; split the comparison before interpreting timings.')
  }
  const groups = collectGroups(reports)
  const summaries = [...groups].map(([name, values]) => describeGroup(name, values))
  return {
    directory,
    commit: job.commit,
    tree: job.tree,
    fixtureSha256: job.fixtureSha256,
    settings: job.settings,
    conditions: JSON.parse(conditions[0]) as unknown,
    groups: summaries,
    interpretation: 'Run medians are independent session units. Edit counts are not independent process counts.',
  }
}

function isCompleteJob(job: MeasurementJob): boolean {
  return job.version === 1 && job.status === 'passed' && job.samples.length === job.settings.samples
    && job.samples.length > 0 && new Set(job.samples).size === job.samples.length
}

async function readReport(directory: string, name: string, job: MeasurementJob): Promise<PreviewReport> {
  requireSampleName(name)
  const report = JSON.parse(await FileSystem.readFile(Path.join(directory, name), 'utf8')) as PreviewReport
  requireReport(report, job)
  return report
}

function collectGroups(reports: PreviewReport[]): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  for (const report of reports) {
    const session = new Map<string, number[]>([['startup', [report.startupMs]]])
    for (const result of report.results) {
      const name = `${result.sample}/${result.scenario.replace(/-\d+$/, '')}`
      session.set(name, [...session.get(name) ?? [], result.parentClickToLastAppliedMs])
    }
    for (const [name, values] of session) {
      groups.set(name, [...groups.get(name) ?? [], median(values)])
    }
  }
  return groups
}

function describeGroup(name: string, values: number[]) {
  return {
    name,
    sessions: values.length,
    medianMs: median(values),
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
    runMediansMs: values,
  }
}

function median(values: number[]): number {
  const sorted = values.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
