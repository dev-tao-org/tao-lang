import { NewlineCharacter } from '@shared'
import type { BranchComparison, ComparisonScenario } from './BranchComparison'
import * as Metrics from './BranchMetrics'

/** formatBranchComparison leads with meaningful changes, then shows the timings and reliability of each workload. */
export function formatBranchComparison(comparison: BranchComparison): string {
  const workloads = comparison.scenarios.map(describeWorkload)
  const findings = workloads.flatMap(formatFindings)
  return [
    describeVerdict(workloads.flatMap(workload => workload.metrics)),
    ...findings,
    `Candidate ${comparison.commits.candidate.slice(0, 12)} · baseline ${comparison.commits.baseline.slice(0, 12)}`,
    'Measures harness launch with previews closed, then preview open and edit-to-render time.',
    ...workloads.flatMap(formatWorkload),
    '',
    'Timing rows use the first round. Variation is median absolute deviation, this run / baseline.',
    'A change must repeat at 10% or more in both rounds with 80% pair agreement.',
    'Minimum changes are 150 ms for launch or first open, 5 ms for reopen or first edit and 4 ms for warm edits.',
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

function formatWorkload(workload: Workload): string[] {
  const { scenario, metrics } = workload
  const { extraViews, extraFileCount } = scenario.load
  const size = extraFileCount ? ` · ${extraViews} extra compiled views across ${extraFileCount} files` : ''
  const rounds = scenario.rounds.map(round => round.jobs.candidate.length)
  const coverage = rounds.map(pairs => describeCount(pairs, 'pair')).join(' + ')
  return [
    '',
    `${scenario.name}${size} · ${coverage}`,
    '  Change    This run    Baseline  Metric',
    ...metrics.filter(metric => isHeadline(metric.first.name)).map(formatMetric),
    formatWorkCounts(scenario.rounds[0]),
    ...formatQuality(scenario.rounds),
  ]
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
  const percent = formatPercent(first)
  const current = formatMs(first.candidate.medianMs)
  const baseline = formatMs(first.baseline.medianMs)
  const name = formatMetricName(first.name)
  const variation = `typical session variation ${first.candidate.madMs.toFixed(1)} / ${
    first.baseline.madMs.toFixed(1)
  } ms`
  return `${percent.padStart(8)}${current}${baseline}  ${name} · ${variation}`
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
      return `Only ${first.agreeingPairs} of ${first.pairs} pairs agreed.`
    }
    return `Repeat measured ${formatMovement(confirmation)}. The change did not hold up across rounds.`
  }
  const severity = isSlowdown(change) ? `Slowdown (${change})` : `Speedup (${change})`
  return confirmation ? `${severity}. Repeat measured ${formatMovement(confirmation)}.` : severity + '.'
}

function formatMovement(metric: BranchMetric): string {
  const percent = formatPercent(metric)
  const delta = signed(metric.deltaMs, 2)
  return `${percent} (${delta} ms)`
}

function formatPercent(metric: BranchMetric): string {
  return metric.changePercent === null ? '—' : signed(metric.changePercent, 1) + '%'
}

function formatMs(ms: number): string {
  return `${ms.toFixed(2)} ms`.padStart(12)
}

function signed(value: number, places: number): string {
  const number = value.toFixed(places)
  return value < 0 ? number : '+' + number
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
