import * as Performance from '@repo-analysis/performance'
import { UserInput } from '@shared'
import type { PreviewReport } from './ReportContract'
import { median } from './Summary'

/** BranchSessions holds independent sessions in baseline and candidate pair order. */
export type BranchSessions = { baseline: PreviewReport[]; candidate: PreviewReport[] }

type MetricChange = 'stable' | 'variable' | 'warning' | 'error' | 'faster' | 'much faster'
type ChangePercent = number | null
type SessionStats = { medianMs: number; minMs: number; maxMs: number; madMs: number }

/** BranchMetric reports the size and paired consistency of a change in one timing metric. */
export type BranchMetric = {
  name: string
  baseline: SessionStats
  candidate: SessionStats
  deltaMs: number
  changePercent: ChangePercent
  pairedDeltaMs: number
  pairedChangePercent: ChangePercent
  agreeingPairs: number
  pairs: number
  change: MetricChange
}

/** PreviewQuality counts warm budget misses and observed frame restarts across edits. */
export type PreviewQuality = {
  comparableTransitions: number
  warmEdits: number
  warmBudgetMisses: number
  observedTransitions: number
  frameRestartEdits: number
}

/** WarmEditBudgetMs is the preview target applied to warm click-to-applied latency. */
export const WarmEditBudgetMs = 100

/** MinimumBranchPairs is the minimum number of independent pairs for a comparison round. */
export const MinimumBranchPairs = 5

/** BranchTimingThresholds defines the difference and agreement needed for a meaningful movement. */
export const BranchTimingThresholds = {
  warningPercent: 10,
  errorPercent: 15,
  agreement: 0.8,
  startupFloorMs: 150,
  firstEditFloorMs: 5,
  warmEditFloorMs: 4,
} as const

type WorkKey = keyof PreviewReport['results'][number]['work']
type WorkCount = number | null

/** WarmPreviewWork describes median per-edit work across independent warm session medians. */
export type WarmPreviewWork = Record<WorkKey, WorkCount>

/** describeWarmWork summarizes work without treating unobserved counters as zero. */
export function describeWarmWork(reports: PreviewReport[]): WarmPreviewWork {
  return {
    moduleDiscoveries: medianWork(reports, 'moduleDiscoveries'),
    parses: medianWork(reports, 'parses'),
    modulesEmitted: medianWork(reports, 'modulesEmitted'),
    generatedPathsChanged: medianWork(reports, 'generatedPathsChanged'),
    metroDeltaModules: medianWork(reports, 'metroDeltaModules'),
  }
}

/** compareBranchMetrics uses whole sessions as units and validates equal pair counts. */
export function compareBranchMetrics(sessions: BranchSessions): BranchMetric[] {
  UserInput.require(
    !(sessions.baseline.length !== sessions.candidate.length || !sessions.baseline.length),
    'Branch comparison requires equal, nonempty sets of paired sessions.',
  )
  return Metrics.map(metric => compareMetric(metric, sessions))
}

/** measurePreviewTimings returns one session's startup and independent warm-step medians. */
export function measurePreviewTimings(report: PreviewReport): PreviewTiming[] {
  return Metrics.map(metric => ({ name: metric.name, ms: metric.measure(report) })).filter(row =>
    Number.isFinite(row.ms)
  )
}

/** PreviewTiming is one measured preview metric in milliseconds. */
export type PreviewTiming = { name: string; ms: number }

/** countPreviewQuality counts budget misses and detects frame instance changes after the first edit. */
export function countPreviewQuality(reports: PreviewReport[]): PreviewQuality {
  const quality = {
    comparableTransitions: 0,
    warmEdits: 0,
    warmBudgetMisses: 0,
    observedTransitions: 0,
    frameRestartEdits: 0,
  }
  for (const report of reports) {
    quality.comparableTransitions += report.results.length - 1
    const warm = readWarmDurations(report)
    quality.warmEdits += warm.length
    quality.warmBudgetMisses += warm.filter(ms => ms > WarmEditBudgetMs).length
    for (let index = 1; index < report.results.length; index++) {
      const first = report.results[index - 1].frames
      const second = report.results[index].frames
      const comparison = compareFrameInstances(first, second, report.measurement.frameCount)
      if (!comparison) {
        continue
      }
      quality.observedTransitions++
      quality.frameRestartEdits += Number(comparison === 'restarted')
    }
  }
  return quality
}

/** confirmMetricChange requires independent rounds to agree on direction and uses their lower tier. */
export function confirmMetricChange(first: BranchMetric, second: BranchMetric): MetricChange {
  if (first.change === 'stable' && second.change === 'stable') {
    return 'stable'
  }
  if (isSlowdown(first.change) && isSlowdown(second.change)) {
    return first.change === 'error' && second.change === 'error' ? 'error' : 'warning'
  }
  if (isSpeedup(first.change) && isSpeedup(second.change)) {
    return first.change === 'much faster' && second.change === 'much faster' ? 'much faster' : 'faster'
  }
  return 'variable'
}

type TimingMetric = { name: string; floorMs: number; measure: (report: PreviewReport) => number }
type PreviewFrames = NonNullable<PreviewReport['results'][number]['frames']>
type OptionalPreviewFrames = PreviewFrames | undefined
type FrameTransition = 'same' | 'restarted'

const Metrics: readonly TimingMetric[] = [
  { name: 'Harness launch', floorMs: BranchTimingThresholds.startupFloorMs, measure: report => report.startupMs },
  {
    name: 'First preview open',
    floorMs: BranchTimingThresholds.startupFloorMs,
    measure: report => report.opening.firstMs,
  },
  {
    name: 'Warm preview reopen',
    floorMs: BranchTimingThresholds.firstEditFloorMs,
    measure: report => median(report.opening.reopenMs),
  },
  {
    name: 'First edit',
    floorMs: BranchTimingThresholds.firstEditFloorMs,
    measure: report => report.results[0].parentClickToLastAppliedMs,
  },
  {
    name: 'Warm p50',
    floorMs: BranchTimingThresholds.warmEditFloorMs,
    measure: report => median(readWarmDurations(report)),
  },
  {
    name: 'Warm p95',
    floorMs: BranchTimingThresholds.warmEditFloorMs,
    measure: report => readP95(readWarmDurations(report)),
  },
  ...Performance.PreviewRenderSteps.map(step => ({
    name: step.label,
    floorMs: BranchTimingThresholds.warmEditFloorMs,
    measure: (report: PreviewReport) => median(readWarmDurations(report, step.name)),
  })),
]

function readWarmDurations(report: PreviewReport, scenario?: string): number[] {
  return report.results
    .filter(edit =>
      edit.sample === 'warm' && (!scenario || Performance.previewRenderStepName(edit.scenario) === scenario)
    )
    .map(edit => edit.parentClickToLastAppliedMs)
}

function readP95(values: number[]): number {
  return values.toSorted((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]
}

function medianWork(reports: PreviewReport[], key: WorkKey): WorkCount {
  const perSession: number[] = []
  for (const report of reports) {
    const values = report.results.filter(edit => edit.sample === 'warm').map(edit => edit.work[key])
    const observed = values.filter(value => value !== undefined)
    if (!observed.length || observed.length !== values.length) {
      return null
    }
    perSession.push(median(observed))
  }
  return median(perSession)
}

function compareMetric(metric: TimingMetric, sessions: BranchSessions): BranchMetric {
  const baselineValues = sessions.baseline.map(metric.measure)
  const candidateValues = sessions.candidate.map(metric.measure)
  const baseline = describeSessionStats(baselineValues)
  const candidate = describeSessionStats(candidateValues)
  const deltaMs = candidate.medianMs - baseline.medianMs
  const changePercent = baseline.medianMs ? deltaMs / baseline.medianMs * 100 : null
  const pairDeltas = candidateValues.map((current, index) => current - baselineValues[index])
  const pairedDeltaMs = median(pairDeltas)
  const pairedChangePercent = measurePairedPercentage(pairDeltas, baselineValues, pairedDeltaMs)
  const agreeingPairs = pairDeltas.filter(delta => Math.sign(delta) === Math.sign(pairedDeltaMs) && delta !== 0).length
  const pairs = baselineValues.length
  const change = classifyMetricChange(pairedDeltaMs, pairedChangePercent, metric.floorMs, agreeingPairs, pairs)
  return {
    name: metric.name,
    baseline,
    candidate,
    deltaMs,
    changePercent,
    pairedDeltaMs,
    pairedChangePercent,
    agreeingPairs,
    pairs,
    change,
  }
}

function measurePairedPercentage(deltas: number[], baselines: number[], medianDelta: number): ChangePercent {
  if (baselines.some(ms => ms === 0)) {
    return null
  }
  const percentage = median(deltas.map((delta, index) => 100 * delta / baselines[index]))
  return Math.sign(percentage) === Math.sign(medianDelta) ? percentage : null
}

function describeSessionStats(values: number[]): SessionStats {
  const medianMs = median(values)
  const deviations = values.map(value => Math.abs(value - medianMs))
  return { medianMs, minMs: Math.min(...values), maxMs: Math.max(...values), madMs: median(deviations) }
}

function classifyMetricChange(
  deltaMs: number,
  changePercent: ChangePercent,
  floorMs: number,
  agreeingPairs: number,
  pairs: number,
): MetricChange {
  if (Math.abs(deltaMs) < floorMs || Math.abs(changePercent ?? Infinity) < BranchTimingThresholds.warningPercent) {
    return 'stable'
  }
  const consistent = agreeingPairs / pairs >= BranchTimingThresholds.agreement && pairs >= MinimumBranchPairs
  if (!consistent || changePercent === null) {
    return 'variable'
  }
  const large = Math.abs(changePercent) >= BranchTimingThresholds.errorPercent
  if (deltaMs > 0) {
    return large ? 'error' : 'warning'
  }
  return large ? 'much faster' : 'faster'
}

function isSlowdown(change: MetricChange): boolean {
  return change === 'warning' || change === 'error'
}

function isSpeedup(change: MetricChange): boolean {
  return change === 'faster' || change === 'much faster'
}

function compareFrameInstances(
  first: OptionalPreviewFrames,
  second: OptionalPreviewFrames,
  frameCount: number,
): FrameTransition | undefined {
  if (!first || !second || Object.keys(first).length !== frameCount) {
    return undefined
  }
  const frameIds = Object.keys(first)
  if (!frameIds.every(id => !!first[id]?.bootId && !!second[id]?.bootId)) {
    return undefined
  }
  return frameIds.some(id => first[id].bootId !== second[id].bootId) ? 'restarted' : 'same'
}
