import { Regxs, Sort } from '@shared'
import { Path } from '@shared/os'

type TestBatch = { files: string[]; durationMs: number }

/** TestDurationEstimates maps repository-relative test paths to measured wall times. */
export type TestDurationEstimates = ReadonlyMap<string, number>

/** planTypeScriptShards packs measured test costs within a worker budget, preserving resource groups. */
export function planTypeScriptShards(
  files: readonly string[],
  workers: number,
  estimates: TestDurationEstimates = new Map(),
): string[][] {
  const shardCount = Math.min(workers, files.length)
  if (shardCount < 1) {
    return []
  }
  const shards = Array.from({ length: shardCount }, (): TestBatch => ({ files: [], durationMs: 0 }))
  const batches = groupTestFiles(files, estimates).sort((left, right) => right.durationMs - left.durationMs)
  for (const batch of batches) {
    const lightest = shards.reduce((best, shard) => shard.durationMs < best.durationMs ? shard : best)
    lightest.files.push(...batch.files)
    lightest.durationMs += batch.durationMs
  }
  return shards.filter(shard => shard.files.length > 0).map(shard => shard.files.sort(Sort.CompareStrings))
}

const UnmeasuredTestMs = 36

function groupTestFiles(files: readonly string[], estimates: TestDurationEstimates): TestBatch[] {
  const managed: TestBatch = { files: [], durationMs: 0 }
  const refresh: TestBatch = { files: [], durationMs: 0 }
  const batches = [managed, refresh]
  for (const file of [...files].sort(Sort.CompareStrings)) {
    const name = Path.basename(file)
    const durationMs = estimates.get(file) ?? UnmeasuredTestMs
    if (Regxs.ManagedTestShardRegx.test(name)) {
      managed.files.push(file)
      managed.durationMs += durationMs
    } else if (Regxs.LargeTestShardRegx.test(name)) {
      refresh.files.push(file)
      refresh.durationMs += durationMs
    } else {
      batches.push({ files: [file], durationMs })
    }
  }
  return batches.filter(batch => batch.files.length > 0)
}
