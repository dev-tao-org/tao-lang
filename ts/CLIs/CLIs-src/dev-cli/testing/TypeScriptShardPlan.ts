import { Regxs } from '@shared'
import { Path } from '@shared/os'

/** planTypeScriptShards separates install/build, refresh and remaining tests within one process budget. */
export function planTypeScriptShards(files: readonly string[], workers: number): string[][] {
  const shardCount = Math.min(3, workers, files.length)
  const shards: string[][] = Array.from({ length: shardCount }, () => [])
  for (const file of [...files].sort()) {
    const index = chooseShard(file) % shards.length
    shards[index]!.push(file)
  }
  return shards.filter(shard => shard.length > 0)
}

function chooseShard(file: string): number {
  const name = Path.basename(file)
  if (Regxs.ManagedTestShardRegx.test(name)) {
    return 0
  }
  if (Regxs.LargeTestShardRegx.test(name)) {
    return 1
  }
  return 2
}
