import { Schema, Try } from '@shared'
import { Artifacts, FileLock, FS, Hash, Path, Platform, Repo } from '@shared/os'
import type { TestFileTiming } from '../../cli-checks/slow-tests'
import type { TestDurationEstimates } from './TypeScriptShardPlan'

type TimingSample = Record<string, number>
const SampleLimit = 3
const cacheSchema = Schema.object({
  version: Schema.literal(1),
  samples: Schema.array(Schema.record(Schema.string(), Schema.number().positive())).max(SampleLimit),
})

/** resolveShardTimings selects a checkout cache for comparable runtime and worker budgets. */
export function resolveShardTimings(workers: number, taoWorkers: number): string {
  const identity = Hash.Of({
    host: Platform.systemInfo(),
    runtime: Platform.runtimeVersion(),
    workers,
    taoWorkers,
  })
  return Artifacts.resolvePath('cache/typescript-shards', identity + '.json')
}

/** readShardEstimates returns the rolling median per file, or empty estimates on a cold checkout. */
export async function readShardEstimates(cachePath: string): Promise<TestDurationEstimates> {
  const medians = new Map<string, number>()
  const values = collectFileSamples(await readSamples(cachePath))
  for (const [file, durations] of values) {
    const ordered = durations.sort((left, right) => left - right)
    const middle = Math.floor(ordered.length / 2)
    const median = ordered.length % 2 === 0 ? (ordered[middle - 1]! + ordered[middle]!) / 2 : ordered[middle]!
    medians.set(file, median)
  }
  return medians
}

/** rememberShardTimings updates history only when a successful run reports every planned file once. */
export async function rememberShardTimings(
  cachePath: string,
  files: readonly string[],
  timings: readonly TestFileTiming[],
): Promise<void> {
  const sample = completeSample(files, timings)
  if (!sample) {
    return
  }
  await Try.IgnoreError(async () => {
    await FS.mkdir(Path.dirname(cachePath))
    const lock = await FileLock.tryAcquire(cachePath + '.lock')
    if (lock) {
      await Try(() => appendSample(cachePath, sample), { finally: lock.release })
    }
  })
}

async function readSamples(cachePath: string): Promise<TimingSample[]> {
  return await Try.WithDefault([], async () => {
    const cache = await FS.readJson(cachePath, { schema: cacheSchema })
    return cache.samples
  })
}

function collectFileSamples(samples: TimingSample[]): Map<string, number[]> {
  const values = new Map<string, number[]>()
  for (const sample of samples) {
    for (const [file, duration] of Object.entries(sample)) {
      const durations = values.get(file)
      if (durations) {
        durations.push(duration)
      } else {
        values.set(file, [duration])
      }
    }
  }
  return values
}

function completeSample(files: readonly string[], timings: readonly TestFileTiming[]): TimingSample | undefined {
  if (files.length !== timings.length) {
    return undefined
  }
  const root = Repo.getWorkspaceRoot()
  const remaining = new Set(files)
  const values = new Map<string, number>()
  for (const { file, durationMs } of timings) {
    const relative = Path.relative(root, Repo.resolvePath('ts', file))
    if (!remaining.delete(relative)) {
      return undefined
    }
    values.set(relative, durationMs)
  }
  return remaining.size === 0 ? Object.fromEntries(values) : undefined
}

async function appendSample(cachePath: string, sample: TimingSample): Promise<void> {
  const samples = [...await readSamples(cachePath), sample].slice(-SampleLimit)
  const pending = cachePath + '.pending'
  await Try(async () => {
    await FS.writeJson(pending, { version: 1, samples })
    await FS.rename(pending, cachePath)
  }, { finally: () => FS.rm(pending, { force: true }) })
}
