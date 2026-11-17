import { Sort } from '@shared'

type Batch = { files: string[]; durationMs: number }

/** packTestShards assigns the longest batches first to the lightest available shards. */
export function packTestShards(batches: readonly Batch[], count: number): string[][] {
  if (count === 0) {
    return []
  }
  const shards = Array.from({ length: count }, (): Batch => ({ files: [], durationMs: 0 }))
  const ordered = [...batches].sort((left, right) => right.durationMs - left.durationMs)
  for (const batch of ordered) {
    const shard = shards.reduce((lightest, candidate) =>
      candidate.durationMs < lightest.durationMs ? candidate : lightest
    )
    shard.files.push(...batch.files)
    shard.durationMs += batch.durationMs
  }
  return shards.map(shard => shard.files.sort(Sort.CompareStrings))
}
