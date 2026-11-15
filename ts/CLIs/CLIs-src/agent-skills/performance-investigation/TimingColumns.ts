/** TimingComparisonHeader labels the shared median comparison columns. */
export const TimingComparisonHeader = '  Change    This run    Baseline  Metric'

type PercentageChange = number | null

/** formatTimingColumns aligns the signed change and the two time values before a metric description. */
export function formatTimingColumns(change: PercentageChange, currentMs: number, baselineMs: number): string {
  return `${formatPercentage(change).padStart(8)}${formatMilliseconds(currentMs)}${formatMilliseconds(baselineMs)}`
}

/** formatPercentage renders the signed change or a dash when no percent is available. */
export function formatPercentage(change: PercentageChange): string {
  return change === null ? '—' : formatSignedNumber(change, 1) + '%'
}

/** formatSignedNumber formats a difference with an explicit sign. */
export function formatSignedNumber(value: number, places: number): string {
  const number = value.toFixed(places)
  return value < 0 ? number : '+' + number
}

function formatMilliseconds(ms: number): string {
  return `${ms.toFixed(2)} ms`.padStart(12)
}
