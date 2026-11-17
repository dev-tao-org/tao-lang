import { Regxs, Sort } from '@shared'
import { Path } from '@shared/os'
import { packTestShards } from './ShardPlan'

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
  const batches = groupTestFiles(files, estimates)
  return packTestShards(batches, Math.min(shardCount, batches.length))
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
