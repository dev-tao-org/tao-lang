import * as Perf from '@perf'
import { NewlineCharacter } from '@shared'
import type { BranchComparison, ComparisonScenario } from './BranchComparison'
import * as Metrics from './BranchMetrics'
import * as TimingColumns from './TimingColumns'

/** formatBranchComparison leads with meaningful changes, then shows the timings and reliability of each workload. */
export function formatBranchComparison(comparison: BranchComparison): string {
  const workloads = comparison.scenarios.map(describeWorkload)
  const findings = workloads.flatMap(formatFindings)
  return [
    describeVerdict(workloads.flatMap(workload => workload.metrics)),
    ...findings,
    `Candidate ${comparison.commits.candidate} · baseline ${comparison.commits.baseline}`,
    comparison.options.firstEditOnly
      ? 'Measures the first edit after fresh preview startup.'
      : 'Measures harness launch with previews closed, then preview open and edit-to-render time.',
    ...workloads.flatMap(workload => formatWorkload(workload, comparison.options.firstEditOnly === true)),
    '',
    'Timing rows show first-round session medians. Findings use paired changes. Variation is median absolute deviation.',
    ...describeThresholds(),
    `Full measurements and phase timings on the runner: ${comparison.directory}/comparison.json`,
  ].join(NewlineCharacter)
}

type Round = ComparisonScenario['rounds'][number]
type BranchMetric = Metrics.BranchMetric
type PreviewQuality = Metrics.PreviewQuality
type ComparedMetric = { first: BranchMetric; confirmation?: BranchMetric; change: BranchMetric['change'] }
type Workload = { scenario: ComparisonScenario; metrics: ComparedMetric[] }

function describeWorkload(scenario: ComparisonScenario): Workload {
  const [first, second] = scenario.rounds
  const metrics = first.metrics.map((metric, index) => {
    const confirmation = second?.metrics[index]
    const change = confirmation ? Metrics.confirmMetricChange(metric, confirmation) : metric.change
    return { first: metric, confirmation, change }
  })
  return { scenario, metrics }
}

function describeVerdict(metrics: ComparedMetric[]): string {
  const slower = metrics.filter(metric => isSlowdown(metric.change)).length
  const faster = metrics.filter(metric => metric.change === 'faster' || metric.change === 'much faster').length
  const uncertain = metrics.filter(metric => metric.change === 'variable').length
  const confirmed = [describeCount(slower, 'slowdown'), describeCount(faster, 'speedup')].filter(Boolean)
  const verdict = confirmed.length ? `Confirmed ${confirmed.join(' and ')}.` : 'No confirmed preview speed change.'
  return uncertain ? verdict + ` ${describeCount(uncertain, 'result')} inconclusive.` : verdict
}

function formatFindings(workload: Workload): string[] {
  const findings = workload.metrics.filter(metric => metric.change !== 'stable')
  return findings.map(metric => {
    const name = formatMetricName(metric.first.name)
    const movement = formatMovement(metric.first)
    const outcome = describeOutcome(metric)
    return `  ${workload.scenario.name}, ${name} — ${movement}. ${outcome}`
  })
}

function formatWorkload(workload: Workload, fixedRounds: boolean): string[] {
  const { scenario, metrics } = workload
  const { extraViews, extraFileCount } = scenario.load
  const size = extraFileCount ? ` · ${extraViews} extra compiled views across ${extraFileCount} files` : ''
  const rounds = scenario.rounds.map(round => round.jobs.candidate.length)
  const coverage = rounds.map(pairs => describeCount(pairs, 'pair')).join(' + ')
  return [
    '',
    `${scenario.name}${size} · ${coverage}`,
    TimingColumns.TimingComparisonHeader,
    ...metrics.filter(metric => isHeadline(metric.first.name)).flatMap(metric => [
      formatMetric(metric),
      formatPairEvidence(metric, fixedRounds),
    ]),
    ...formatStepChanges(metrics),
    ...formatWarmEvidence(scenario),
  ]
}

function formatStepChanges(metrics: ComparedMetric[]): string[] {
  const steps = metrics.filter(metric => Perf.PreviewRenderSteps.some(step => step.label === metric.first.name))
  if (!steps.length) {
    return []
  }
  return [
    '  Change  Warm render steps',
    ...steps.map(({ first }) => `  ${TimingColumns.formatPercentage(first.changePercent).padStart(7)}  ${first.name}`),
  ]
}

function formatWarmEvidence(scenario: ComparisonScenario): string[] {
  const round = scenario.rounds[0]
  return round.quality.candidate.warmEdits ? [formatWorkCounts(round), ...formatQuality(scenario.rounds)] : []
}

function formatWorkCounts({ work }: Round): string {
  const quantities = [
    ['module discoveries', work.candidate.moduleDiscoveries, work.baseline.moduleDiscoveries],
    ['parses', work.candidate.parses, work.baseline.parses],
    ['module emissions', work.candidate.modulesEmitted, work.baseline.modulesEmitted],
    ['generated paths changed', work.candidate.generatedPathsChanged, work.baseline.generatedPathsChanged],
    ['Metro delta modules', work.candidate.metroDeltaModules, work.baseline.metroDeltaModules],
  ]
  const counts = quantities.map(([name, current, baseline]) => `${name} ${current ?? '—'} / ${baseline ?? '—'}`)
  return `  Work per warm edit (this run / baseline): ${counts.join(' · ')}`
}

const HeadlineMetrics = [
  'Harness launch',
  'First preview open',
  'Warm preview reopen',
  'First edit',
  'Warm p50',
  'Warm p95',
]

function isHeadline(name: string): boolean {
  return HeadlineMetrics.includes(name)
}

function formatMetric({ first }: ComparedMetric): string {
  const columns = TimingColumns.formatTimingColumns(
    first.changePercent,
    first.candidate.medianMs,
    first.baseline.medianMs,
  )
  const name = formatMetricName(first.name)
  const variation = `typical session variation ${first.candidate.madMs.toFixed(1)} / ${
    first.baseline.madMs.toFixed(1)
  } ms`
  return `${columns}  ${name} · ${variation}`
}

function formatPairEvidence({ first, confirmation }: ComparedMetric, fixedRounds: boolean): string {
  const initial = describePairedRound(first)
  if (!confirmation) {
    const low = Math.min(...first.pairedDeltasMs)
    const high = Math.max(...first.pairedDeltasMs)
    return `             ${initial} · observed pair range ${formatBounds(low, high)}`
  }
  const interval = Metrics.pairedMetricInterval(first, confirmation)
  const repeat = describePairedRound(confirmation)
  const ciLabel = fixedRounds ? 'CI' : 'nominal CI after screening'
  const bounds = interval
    ? ` · paired median ${(interval.coverage * 100).toFixed(1)}% ${ciLabel} ${
      formatBounds(interval.lowerMs, interval.upperMs)
    }`
    : ''
  return `             ${initial} · repeat ${repeat}${bounds}`
}

function describePairedRound(metric: BranchMetric): string {
  return `paired ${formatMovement(metric)} (${metric.agreeingPairs}/${metric.pairs} same direction)`
}

function formatBounds(lower: number, upper: number): string {
  return `[${TimingColumns.formatSignedNumber(lower, 1)}, ${TimingColumns.formatSignedNumber(upper, 1)}] ms`
}

function formatMetricName(name: string): string {
  if (name === 'Warm p50') {
    return 'Typical warm edit'
  }
  if (name === 'Warm p95') {
    return 'Slow warm edit (p95)'
  }
  if (name.startsWith('Warm ')) {
    return name.replace(' p50', '').replace('add-text', 'add text').replace('row', 'layout')
  }
  return name
}

function describeOutcome({ first, confirmation, change }: ComparedMetric): string {
  if (change === 'variable') {
    if (!confirmation) {
      const agreement = `${first.agreeingPairs} of ${first.pairs} pairs agreed.`
      if (first.pairedChangePercent === null) {
        return `Paired percentage unavailable. ${agreement}`
      }
      return agreement
    }
    return `Repeat measured ${formatMovement(confirmation)}. The effect remains uncertain.`
  }
  const severity = isSlowdown(change) ? `Slowdown (${change})` : `Speedup (${change})`
  return confirmation ? `${severity}. Repeat measured ${formatMovement(confirmation)}.` : severity + '.'
}

function formatMovement(metric: BranchMetric): string {
  const percent = TimingColumns.formatPercentage(metric.pairedChangePercent)
  const delta = TimingColumns.formatSignedNumber(metric.pairedDeltaMs, 2)
  return `${percent} (${delta} ms)`
}

function describeThresholds(): string[] {
  const rules = Metrics.BranchTimingThresholds
  const agreementPercent = rules.agreement * 100
  return [
    `Confirmation requires ${rules.warningPercent}% movement (${rules.firstEditWarningPercent}% for first edit) and ${agreementPercent}% pair agreement in both rounds.`,
    'The paired median confidence interval must also clear the material change threshold.',
    `The error tier needs ${rules.errorPercent}% movement in both rounds and an interval beyond that share of the baseline median in milliseconds.`,
    `Minimum changes: ${rules.startupFloorMs} ms launch/first open, ${rules.firstEditFloorMs} ms reopen/first edit, ${rules.warmEditFloorMs} ms warm edits.`,
  ]
}

function formatQuality(rounds: Round[]): string[] {
  const candidate = sumQuality(rounds.map(round => round.quality.candidate))
  const baseline = sumQuality(rounds.map(round => round.quality.baseline))
  return [
    `  Warm edits over ${Metrics.WarmEditBudgetMs} ms: ${formatBudget(candidate)} vs ${
      formatBudget(baseline)
    } baseline`,
    `  Edits with a frame restart: ${formatRestarts(candidate)} vs ${formatRestarts(baseline)} baseline`,
  ]
}

function sumQuality(qualities: PreviewQuality[]): PreviewQuality {
  return {
    warmEdits: sum(qualities.map(quality => quality.warmEdits)),
    warmBudgetMisses: sum(qualities.map(quality => quality.warmBudgetMisses)),
    comparableTransitions: sum(qualities.map(quality => quality.comparableTransitions)),
    observedTransitions: sum(qualities.map(quality => quality.observedTransitions)),
    frameRestartEdits: sum(qualities.map(quality => quality.frameRestartEdits)),
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function formatBudget(quality: PreviewQuality): string {
  return `${quality.warmBudgetMisses}/${quality.warmEdits}`
}

function formatRestarts(quality: PreviewQuality): string {
  if (quality.observedTransitions === 0) {
    return 'unavailable'
  }
  const restarts = `${quality.frameRestartEdits}/${quality.observedTransitions}`
  if (quality.observedTransitions < quality.comparableTransitions) {
    return `${restarts} (${quality.observedTransitions} of ${quality.comparableTransitions} transitions observed)`
  }
  return restarts
}

function describeCount(count: number, noun: string): string {
  if (count === 0) {
    return ''
  }
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function isSlowdown(change: BranchMetric['change']): boolean {
  return change === 'warning' || change === 'error'
}
