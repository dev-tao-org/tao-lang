import { NewlineCharacter } from '@shared'
import { Path } from '@shared/os'
import { formatTimingColumns, TimingComparisonHeader } from '../../agent-skills/performance-investigation/TimingColumns'
import type { TimingReport } from './TimingReportContract'
import { MinimumComparisonSessions, type TimingHistory } from './TimingReportHistory'

/** describeTimingComparison screens comparable independent jobs without asserting statistical significance. */
export function describeTimingComparison(current: TimingReport, history: TimingHistory): string {
  const { baseline } = history
  const skipped = history.unusable
    ? `Skipped ${history.unusable} saved report(s) lacking valid provenance or measurements.${NewlineCharacter}`
    : ''
  if (!baseline) {
    return skipped + 'Timing deviation: NOT ASSESSED — no previous comparable report on this runner.'
  }
  const deltas = compareGroups(current, baseline)
  return skipped + [
    `Baseline: ${Path.posix.basename(baseline.directory)} · ${baseline.startedAt} · ${baseline.commit.slice(0, 12)}`,
    `Runner address: ${current.runner}; independent sessions: ${baseline.settings.samples} → ${current.settings.samples}`,
    TimingComparisonHeader,
    ...deltas.map(formatDelta),
    'Screen only: at least 5% and 2 ms; session ranges describe variability, not statistical significance.',
    describeDriftAttribution(current, baseline),
    '',
    describeDeviation(current, baseline, deltas),
  ].join(NewlineCharacter)
}

const MinimumRelativeChange = 0.05

type TimingDelta = {
  name: string
  deltaMs: number
  currentMs: number
  baselineMs: number
  material: boolean
  overlaps: boolean
}

const MinimumAbsoluteChangeMs = 2
function compareGroups(current: TimingReport, baseline: TimingReport): TimingDelta[] {
  return current.groups.map(group => {
    const previous = baseline.groups.find(candidate => candidate.name === group.name)!
    const deltaMs = group.medianMs - previous.medianMs
    const material = Math.abs(deltaMs) >= MinimumAbsoluteChangeMs
      && Math.abs(deltaMs) >= previous.medianMs * MinimumRelativeChange
    const overlaps = group.minMs <= previous.maxMs && previous.minMs <= group.maxMs
    return {
      name: group.name,
      deltaMs,
      currentMs: group.medianMs,
      baselineMs: previous.medianMs,
      material,
      overlaps,
    }
  })
}

function formatDelta(delta: TimingDelta): string {
  const percent = delta.baselineMs > 0 ? delta.deltaMs / delta.baselineMs * 100 : null
  const columns = formatTimingColumns(percent, delta.currentMs, delta.baselineMs)
  const variability = delta.overlaps ? 'session ranges overlap' : 'session ranges do not overlap'
  return `${columns}  ${delta.name} · ${variability}`
}

function describeDriftAttribution(current: TimingReport, baseline: TimingReport): string {
  return current.tree === baseline.tree
    ? 'Machine drift control: measured source tree is unchanged; any detected shift requires confirmation.'
    : 'Machine drift cannot be isolated: measured source tree changed.'
}

function describeDeviation(current: TimingReport, baseline: TimingReport, deltas: TimingDelta[]): string {
  if (current.settings.samples < MinimumComparisonSessions || baseline.settings.samples < MinimumComparisonSessions) {
    return 'Timing deviation: NOT ASSESSED — at least 5 independent sessions per job are required.'
  }
  const changes = deltas.filter(delta => delta.material)
  if (changes.length === 0) {
    return 'Timing deviation: NO MATERIAL MEDIAN CHANGE — no scenario meets both 5% and 2 ms; smaller changes remain possible.'
  }
  const status = describeChangeDirection(changes)
  const scenarios = changes.length === 1 ? '1 scenario meets' : `${changes.length} scenarios meet`
  return `Timing deviation: ${status} — ${scenarios} both 5% and 2 ms; unconfirmed.`
}

function describeChangeDirection(changes: TimingDelta[]): string {
  if (changes.every(delta => delta.deltaMs > 0)) {
    return 'POSSIBLE SLOWDOWN'
  }
  if (changes.every(delta => delta.deltaMs < 0)) {
    return 'POSSIBLE SPEEDUP'
  }
  return 'MIXED CHANGES'
}
