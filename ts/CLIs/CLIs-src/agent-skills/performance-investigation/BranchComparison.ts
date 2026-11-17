import { IO } from '@cli-kit'
import * as Performance from '@repo-analysis/performance'
import { Errors, Objects, Time, Try, UserInput } from '@shared'
import { FS, Path, Platform, Repo } from '@shared/os'
import * as Metrics from './BranchMetrics'
import { formatBranchComparison } from './BranchReport'
import { resolveCommit } from './Git'
import type { PreviewReport } from './ReportContract'
import * as Runner from './Runner'
import { describeMeasurementConditions, type MeasurementConditions, readCompletedJob } from './Summary'
import { appendTimingProgress, describeTimingLabel } from './TimingProgress'

/** BranchComparisonOptions selects prepared runner checkouts and independent pairs per round. */
export type BranchComparisonOptions = { baseline: string; candidate: string; pairs: number; label?: string }

type RoundStatus = 'running' | 'passed' | 'failed'
type Side = 'baseline' | 'candidate'
type SessionJobs = Record<Side, string[]>
type Round = {
  jobs: SessionJobs
  metrics: Metrics.BranchMetric[]
  quality: Record<Side, Metrics.PreviewQuality>
  work: Record<Side, Metrics.WarmPreviewWork>
}
type ScenarioSessions = { conditions?: MeasurementConditions; seenIds: Set<string> }
type ComparisonLoadField = 'extraViews' | 'extraFileCount'
type ComparisonLoad = Pick<Performance.PreviewMeasurement, ComparisonLoadField>

/** ComparisonScenario retains the measurements and job provenance for a fixed workload. */
export type ComparisonScenario = {
  name: string
  load: ComparisonLoad
  rounds: Round[]
}

/** BranchComparison retains the benchmark definition and all evidence from an invocation. */
export type BranchComparison = {
  directory: string
  status: RoundStatus
  startedAt: string
  options: BranchComparisonOptions
  commits: Record<Side, string>
  fixtureSha256: string
  scenarios: ComparisonScenario[]
  activeJobs?: SessionJobs
  error?: string
}

/** BranchReportStart separates the final report from runner progress output. */
export const BranchReportStart = 'Tao branch timing report:'

/** BranchReportEnd marks the end of the final report in runner output. */
export const BranchReportEnd = 'End Tao branch timing report.'

/** runBranchComparison measures the fixed project in pairs and confirms consistent shifts in a second round. */
export async function runBranchComparison(options: BranchComparisonOptions): Promise<void> {
  requireBranchPairCount(options.pairs)
  const label = describeTimingLabel(options.label)
  await Runner.withTimingLock(async () => {
    await Promise.all([
      Runner.requirePreviewProtocol(options.baseline),
      Runner.requirePreviewProtocol(options.candidate),
    ])
    const comparison = await createComparison(options)
    const fixture = Path.join(comparison.directory, 'fixture.tao')
    IO.print(`Performance comparison: ${comparison.directory}`)
    await saveComparison(comparison)
    await Try(async () => {
      const { extraViews, extraFileCount } = Performance.readPreviewMeasurement({
        editCount: EditsPerSession,
        frameCount: 2,
      })
      const scenario: ComparisonScenario = {
        name: 'Performance project',
        load: { extraViews, extraFileCount },
        rounds: [],
      }
      comparison.scenarios.push(scenario)
      await appendTimingProgress(`Comparing ${scenario.name} · ${label} · ${options.pairs} pairs`)
      await measureScenario(comparison, scenario, fixture)
      comparison.status = 'passed'
    }, {
      catch(error) {
        comparison.status = 'failed'
        comparison.error = String(error)
        Errors.Throw(error)
      },
      finally: () => saveComparison(comparison),
    })
    IO.print(BranchReportStart)
    IO.print(formatBranchComparison(comparison))
    IO.print(BranchReportEnd)
  })
}

/** requireBranchPairCount validates the sample count before connecting or measuring. */
export function requireBranchPairCount(pairs: number): void {
  if (!Number.isInteger(pairs) || pairs < Metrics.MinimumBranchPairs) {
    UserInput.Fail(`Use at least ${Metrics.MinimumBranchPairs} independent pairs per round.`)
  }
}

const ComparisonsDirectory = '.artifacts/notes/performance-investigation/comparisons'

async function createComparison(options: BranchComparisonOptions): Promise<BranchComparison> {
  const baseline = await resolveCommit(options.baseline, 'HEAD')
  const candidate = await resolveCommit(options.candidate, 'HEAD')
  const directory = Repo.resolvePath(ComparisonsDirectory, Platform.randomUUID())
  const source = await Performance.readPerformanceFixture()
  await FS.mkdir(directory)
  await FS.writeFile(Path.join(directory, 'fixture.tao'), source)
  return {
    directory,
    status: 'running',
    startedAt: Time.date().toISOString(),
    options,
    commits: { baseline, candidate },
    fixtureSha256: Platform.hashText(source),
    scenarios: [],
  }
}

function requiresConfirmation(round: Round): boolean {
  return round.metrics.some(metric => metric.change !== 'stable' && metric.change !== 'variable')
}

async function measureScenario(
  comparison: BranchComparison,
  scenario: ComparisonScenario,
  fixture: string,
): Promise<void> {
  const sessionHistory: ScenarioSessions = { seenIds: new Set() }
  const first = await measureRound(comparison, fixture, sessionHistory, 0)
  scenario.rounds.push(first)
  if (requiresConfirmation(first)) {
    await appendTimingProgress(`Confirming ${scenario.name} · ${comparison.options.pairs} fresh pairs`)
    const second = await measureRound(comparison, fixture, sessionHistory, 1)
    scenario.rounds.push(second)
  }
}

const EditsPerSession = 24

async function measureRound(
  comparison: BranchComparison,
  fixture: string,
  sessionHistory: ScenarioSessions,
  roundIndex: number,
): Promise<Round> {
  const jobs: SessionJobs = { baseline: [], candidate: [] }
  const sessions: Metrics.BranchSessions = { baseline: [], candidate: [] }
  comparison.activeJobs = jobs
  for (let pair = 0; pair < comparison.options.pairs; pair++) {
    const order: readonly Side[] = (pair + roundIndex) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']
    for (const side of order) {
      const repo = comparison.options[side]
      const path = Runner.allocateTimingJob(Path.join(comparison.directory, 'sessions'))
      jobs[side].push(path)
      await saveComparison(comparison)
      await Runner.runMeasurementJob({
        repo,
        fixture,
        samples: 1,
        edits: EditsPerSession,
        frameCount: 2,
        label: comparison.options.label,
      }, path)
      const report = await readComparableReport(path, comparison, side)
      requireComparableSession(report, sessionHistory)
      sessions[side].push(report)
    }
  }
  const baseline = Metrics.countPreviewQuality(sessions.baseline)
  const candidate = Metrics.countPreviewQuality(sessions.candidate)
  const metrics = Metrics.compareBranchMetrics(sessions)
  const work = {
    baseline: Metrics.describeWarmWork(sessions.baseline),
    candidate: Metrics.describeWarmWork(sessions.candidate),
  }
  delete comparison.activeJobs
  return { jobs, metrics, quality: { baseline, candidate }, work }
}

async function readComparableReport(path: string, comparison: BranchComparison, side: Side): Promise<PreviewReport> {
  const { job, reports } = await readCompletedJob(path)
  UserInput.Require(
    !(job.commit !== comparison.commits[side] || job.fixtureSha256 !== comparison.fixtureSha256),
    'The branch or fixture changed after the comparison started.',
  )
  return reports[0]
}

function requireComparableSession(report: PreviewReport, history: ScenarioSessions): void {
  UserInput.Require(
    !history.seenIds.has(report.sessionId),
    'Duplicate preview sessions cannot count as independent pairs.',
  )
  const conditions = describeMeasurementConditions(report)
  UserInput.Require(
    !(history.conditions && !Objects.equal(conditions, history.conditions)),
    'Runner, toolchain or preview conditions differ across paired sessions.',
  )
  history.conditions ??= conditions
  history.seenIds.add(report.sessionId)
}

async function saveComparison(comparison: BranchComparison): Promise<void> {
  const path = Path.join(comparison.directory, 'comparison.json')
  const pending = `${path}.pending`
  await FS.writeJson(pending, comparison)
  await FS.rename(pending, path)
}
