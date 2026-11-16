import { Time, Try } from '@shared'

/** TestTimingGroup records completed worker wall times for one homogeneous test group. */
export type TestTimingGroup = { title: string; workerDurationsMs: number[] }

/** recordTestWorker measures worker wall time through success or failure, preserving its allocation index. */
export async function recordTestWorker<Value>(
  group: TestTimingGroup,
  index: number,
  run: () => Promise<Value>,
): Promise<Value> {
  const started = Time.nowMs()
  return await Try(run, {
    finally() {
      group.workerDurationsMs[index] = Time.nowMs() - started
    },
  })
}

/** describeTestTimings reports every measured group's worker times and spread, even below the warning limit. */
export function describeTestTimings(groups: readonly TestTimingGroup[], complete: boolean): string[] {
  const measured = groups.filter(group => group.workerDurationsMs.length > 0)
  if (measured.length === 0) {
    return ['Test shard timings: unavailable (no worker timings).']
  }
  return measured.map(group => describeGroupTimings(group, complete))
}

const BalanceEvidenceAdvice =
  ' Ignore contention-affected timings; confirm on repeated uncontended runs before changing allocation.'

/** describeTestBalance reports peer-worker skew and optional concurrent-group resource savings.
 *  Call only after every selected worker succeeds; partial runs cannot establish balance. */
export function describeTestBalance(groups: readonly TestTimingGroup[], concurrent: boolean): string[] {
  const imbalance = groups.flatMap(group => {
    const warning = describeGroupImbalance(group)
    return warning ? [warning] : []
  })
  const warnings = [...imbalance, ...concurrent ? describeResourceSavings(groups) : []]
  return warnings.map(warning => warning + BalanceEvidenceAdvice)
}

const MinimumSpreadMs = 5000
const RelativeSpreadLimit = 0.10
const FasterGroupFraction = 0.5
const WorkerDurationSeparator = ' / '

function describeGroupTimings(group: TestTimingGroup, complete: boolean): string {
  const durations = group.workerDurationsMs
  const workers = durations.map(formatSeconds).join(WorkerDurationSeparator)
  if (!complete) {
    return `${group.title} shard timings: ${workers}; spread unavailable (incomplete run).`
  }
  const spread = measureWorkerSpread(durations)
  return `${group.title} shard timings: ${workers}; spread ${formatSeconds(spread.durationMs)} (${
    spread.percentOfMean.toFixed(1)
  }% of mean).`
}

function describeGroupImbalance(group: TestTimingGroup): string | undefined {
  const durations = group.workerDurationsMs
  if (durations.length < 2) {
    return undefined
  }
  const spread = measureWorkerSpread(durations)
  const allowance = Math.max(MinimumSpreadMs, RelativeSpreadLimit * spread.meanMs)
  if (spread.durationMs <= allowance) {
    return undefined
  }
  const workers = durations.map(formatSeconds).join(WorkerDurationSeparator)
  const relativePercent = RelativeSpreadLimit * 100
  const minimumSeconds = MinimumSpreadMs / 1000
  return `${group.title} shards are unbalanced: ${workers}; spread ${formatSeconds(spread.durationMs)} exceeds ${
    formatSeconds(allowance)
  } (${relativePercent}% of mean, minimum ${minimumSeconds}s). Rebalance tests and/or create more shards within the available worker budget.`
}

type WorkerSpread = { meanMs: number; durationMs: number; percentOfMean: number }

function measureWorkerSpread(durations: readonly number[]): WorkerSpread {
  const meanMs = durations.reduce((sum, duration) => sum + duration, 0) / durations.length
  const durationMs = Math.max(...durations) - Math.min(...durations)
  const percentOfMean = meanMs === 0 ? 0 : durationMs / meanMs * 100
  return { meanMs, durationMs, percentOfMean }
}

function describeResourceSavings(groups: readonly TestTimingGroup[]): string[] {
  const slowest = [...groups].sort((left, right) => slowestWorkerMs(right) - slowestWorkerMs(left))[0]
  if (!slowest) {
    return []
  }
  return groups.flatMap(group => {
    const warning = describeFewerShards(group, slowest)
    return warning ? [warning] : []
  })
}

function describeFewerShards(group: TestTimingGroup, slowest: TestTimingGroup): string | undefined {
  const slowestMs = slowestWorkerMs(slowest)
  const target = slowestMs * FasterGroupFraction
  const durations = group.workerDurationsMs
  if (group === slowest || durations.length < 2 || slowestWorkerMs(group) > target) {
    return undefined
  }
  for (let count = 1; count < durations.length; count++) {
    const estimatedMs = estimateCombinedShards(durations, count)
    if (estimatedMs <= target) {
      return `${group.title} finishes much sooner than ${slowest.title}: ${
        formatSeconds(slowestWorkerMs(group))
      } versus ${formatSeconds(slowestMs)}. Use fewer shards (${durations.length} → ${count}; estimated ${
        formatSeconds(estimatedMs)
      }) to free parallel resources for slower groups.`
    }
  }
  return undefined
}

function estimateCombinedShards(durations: readonly number[], count: number): number {
  const loads = Array<number>(count).fill(0)
  for (const duration of [...durations].sort((left, right) => right - left)) {
    const lightest = loads.indexOf(Math.min(...loads))
    loads[lightest] = loads[lightest]! + duration
  }
  return Math.max(...loads)
}

function slowestWorkerMs(group: TestTimingGroup): number {
  return Math.max(0, ...group.workerDurationsMs)
}

function formatSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(2)}s`
}
