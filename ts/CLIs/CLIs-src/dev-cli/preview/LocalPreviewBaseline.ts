import { IO } from '@cli-kit'
import * as Perf from '@perf'
import { Errors, Json, NewlineCharacter, Objects, Schema } from '@shared'
import { Artifacts, Exec, FS, Path, Platform, Repo } from '@shared/os'

import { measurePreviewTimings, type PreviewTiming } from '../../agent-skills/performance-investigation/BranchMetrics'
import { parsePreviewReport, type PreviewReport } from '../../agent-skills/performance-investigation/ReportContract'
import { withTimingLock } from '../../agent-skills/performance-investigation/Runner'
import { describeMeasurementConditions, median } from '../../agent-skills/performance-investigation/Summary'
import { formatPercentage } from '../../agent-skills/performance-investigation/TimingColumns'

/** PreviewPerformanceReportPrefix marks an absolute raw report path printed by the measurement command. */
export const PreviewPerformanceReportPrefix = 'Preview performance report: '

const BaselineSessions = 5
const BaselinePath = Artifacts.resolvePath('notes/preview-baselines', 'current.json')
const baselineSchema = Schema.object({ paths: Schema.array(Schema.string()) })

/** recordLocalPreviewBaseline retains five fresh sessions and promotes them after validation. */
export async function recordLocalPreviewBaseline(): Promise<void> {
  await withTimingLock(async () => {
    const directory = Path.join(Path.dirname(BaselinePath), Platform.randomUUID())
    await FS.mkdir(directory)
    const paths: string[] = []
    for (let index = 0; index < BaselineSessions; index++) {
      IO.progress(`Recording preview baseline session ${index + 1} of ${BaselineSessions}…`)
      const path = await measureFreshProcess()
      const destination = Path.join(directory, `sample-${index + 1}.json`)
      await FS.copyFile(path, destination)
      paths.push(destination)
    }
    const reports = await Promise.all(paths.map(readReport))
    requireComparableSessions(reports)
    const pending = Path.join(directory, 'baseline.json')
    await FS.writeFile(pending, Json.Print({ paths }))
    await FS.rename(pending, BaselinePath)
    IO.summary(`Preview baseline recorded from ${reports.length} independent sessions.`)
    IO.summary(`Baseline reports: ${directory}`)
  })
}

async function measureFreshProcess(): Promise<string> {
  const output = await Exec.captureStdout(Repo.resolvePath('dev'), ['performance', 'preview', '--report-only'], {
    cwd: Repo.getWorkspaceRoot(),
    addEnv: {
      TAO_PREVIEW_EDIT_COUNT: String(Perf.DefaultPreviewEditCount),
      TAO_PREVIEW_FRAME_COUNT: '2',
    },
  })
  const line = output.split(NewlineCharacter).findLast(text => text.startsWith(PreviewPerformanceReportPrefix))
  if (!line) {
    Errors.ThrowUserInput('Preview process did not print its raw report path.')
  }
  return line.slice(PreviewPerformanceReportPrefix.length)
}

/** printLocalPreviewChanges prints only the percentage movement of each comparable metric. */
export async function printLocalPreviewChanges(path: string): Promise<void> {
  if (!await FS.exists(BaselinePath)) {
    IO.summary('Capture a baseline with ./dev performance preview --baseline.')
    return
  }
  const baseline = Json.Parse(await FS.readFile(BaselinePath, 'utf8'), { schema: baselineSchema })
  const reports = await Promise.all(baseline.paths.map(readReport))
  const current = await readReport(path)
  if (!reports.length || !sameConditions(reports[0]!, current)) {
    IO.summary('No comparable local baseline. Capture one with ./dev performance preview --baseline.')
    return
  }
  const rows = measurePreviewTimings(current)
  const previous = reports.map(measurePreviewTimings)
  IO.summary('  Change  Preview timing vs local baseline')
  for (const row of rows) {
    IO.summary(`  ${formatChange(row, previous).padStart(7)}  ${row.name}`)
  }
}

async function readReport(path: string): Promise<PreviewReport> {
  return parsePreviewReport(await FS.readFile(path, 'utf8'), path)
}

function requireComparableSessions(reports: PreviewReport[]): void {
  const first = reports[0]!
  const uniqueSessions = new Set(reports.map(report => report.sessionId))
  const valid = reports.every(report =>
    sameConditions(first, report) && report.results.length === Perf.DefaultPreviewEditCount
  )
  if (!valid || uniqueSessions.size !== BaselineSessions) {
    Errors.ThrowUserInput('Baseline needs five independent sessions of the same complete workload.')
  }
}

function sameConditions(first: PreviewReport, second: PreviewReport): boolean {
  return first.fixtureSha256 === second.fixtureSha256
    && Objects.equal(describeMeasurementConditions(first), describeMeasurementConditions(second))
}

function formatChange(current: PreviewTiming, previous: PreviewTiming[][]): string {
  const values = previous.map(session => session.find(row => row.name === current.name)?.ms ?? 0)
  if (values.some(value => value <= 0)) {
    return formatPercentage(null)
  }
  const baseline = median(values)
  return formatPercentage((current.ms / baseline - 1) * 100)
}
