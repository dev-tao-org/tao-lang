import { NewlineCharacter } from '@shared'
import type { BranchComparison, ComparisonScenario } from './BranchComparison'
import { type BranchMetric, confirmMetricChange, type PreviewQuality, WarmEditBudgetMs } from './BranchMetrics'

/** formatBranchComparison reports the measured scenario changes alongside independent-session variability. */
export function formatBranchComparison(comparison: BranchComparison): string {
  const scenarios = comparison.scenarios.map(formatScenario)
  return [
    `Candidate ${comparison.commits.candidate} · baseline ${comparison.commits.baseline}`,
    describeVerdict(comparison.scenarios),
    'Thresholds: 10% warning, 15% error; minimum 150 ms startup, 5 ms first edit, 4 ms warm.',
    'A change needs 80% pair agreement and confirmation in a fresh round. Faster rows use the same thresholds.',
    'Variability is session range and median absolute deviation (MAD). Warm edits exclude the first four.',
    ...scenarios,
    '',
    `Raw job index: ${comparison.directory}/comparison.json`,
  ].join(NewlineCharacter)
}

type Round = ComparisonScenario['rounds'][number]

function formatScenario(scenario: ComparisonScenario): string {
  const { extraViews, extraFileCount } = scenario.load
  const lines = [
    '',
    `${scenario.name} · ${extraViews} extra views across ${extraFileCount} extra files`,
    '  Change    This run    Baseline  Metric',
  ]
  for (const [index, round] of scenario.rounds.entries()) {
    const first = index === 0
    lines.push(first ? '  First round' : '  Confirmation')
    lines.push(...round.metrics.map((metric, metricIndex) => {
      const change = first ? metric.change : confirmMetricChange(scenario.rounds[0].metrics[metricIndex], metric)
      return formatMetric(metric, change)
    }))
    lines.push(formatQuality(round))
  }
  return lines.join(NewlineCharacter)
}

function formatMetric(metric: BranchMetric, change: BranchMetric['change']): string {
  const percent = metric.changePercent === null ? '—' : signed(metric.changePercent, 1) + '%'
  const current = formatMs(metric.candidate.medianMs)
  const baseline = formatMs(metric.baseline.medianMs)
  const delta = signed(metric.deltaMs, 2)
  const spread = `${formatSpread(metric.candidate)} / ${formatSpread(metric.baseline)}`
  const agreement = `${metric.agreeingPairs}/${metric.pairs} agree`
  return `${
    percent.padStart(8)
  }${current}${baseline}  ${metric.name} · ${delta} ms · ${change} · ${agreement} · ${spread}`
}

function formatSpread(stats: BranchMetric['candidate']): string {
  return `${stats.minMs.toFixed(1)}–${stats.maxMs.toFixed(1)} ms (MAD ${stats.madMs.toFixed(1)})`
}

function formatMs(ms: number): string {
  return `${ms.toFixed(2)} ms`.padStart(12)
}

function signed(value: number, places: number): string {
  const number = value.toFixed(places)
  return value < 0 ? number : '+' + number
}

function formatQuality(round: Round): string {
  const { candidate, baseline } = round.quality
  const candidateBudget = formatBudget(candidate)
  const baselineBudget = formatBudget(baseline)
  const candidateRestarts = formatRestarts(candidate)
  const baselineRestarts = formatRestarts(baseline)
  return [
    `  Warm edits > ${WarmEditBudgetMs} ms (candidate / baseline): ${candidateBudget} / ${baselineBudget}`,
    `  Edits with frame restarts after first edit: ${candidateRestarts} / ${baselineRestarts}`,
  ].join(NewlineCharacter)
}

function formatBudget(quality: PreviewQuality): string {
  return `${quality.warmBudgetMisses} of ${quality.warmEdits}`
}

function formatRestarts(quality: PreviewQuality): string {
  return quality.observedTransitions
    ? `${quality.frameRestartEdits} of ${quality.observedTransitions} observed (${quality.comparableTransitions} total)`
    : 'unavailable'
}

function describeVerdict(scenarios: ComparisonScenario[]): string {
  const changes = scenarios.flatMap(describeScenarioChanges)
  const counts = [
    `${changes.filter(change => change === 'error').length} errors`,
    `${changes.filter(change => change === 'warning').length} warnings`,
    `${changes.filter(change => change === 'faster' || change === 'much faster').length} speedups`,
    `${changes.filter(change => change === 'variable').length} inconclusive`,
  ]
  return `Timing verdict: ${counts.join(', ')}.`
}

function describeScenarioChanges(scenario: ComparisonScenario): BranchMetric['change'][] {
  const [first, second] = scenario.rounds
  return first.metrics.map((metric, index) =>
    second ? confirmMetricChange(metric, second.metrics[index]) : metric.change
  )
}
