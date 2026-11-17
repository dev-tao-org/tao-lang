import { Errors, Regxs, Schema, Sort } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import type { NativeTestPlatform } from './NativeTestDevice'
import { packTestShards } from './ShardPlan'
import { planTypeScriptShards, type TestDurationEstimates } from './TypeScriptShardPlan'

/** TestShard carries a one-based index and the total number of jobs in the suite. */
export type TestShard = { index: number; count: number }

const PositiveShardRegx = /^([1-9]\d*)\/([1-9]\d*)$/u

/** parseTestShard validates the shard identity used by every runner in the suite. */
export function parseTestShard(spec: string): TestShard {
  const match = PositiveShardRegx.exec(spec)
  const index = Number(match?.[1])
  const count = Number(match?.[2])
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count) {
    Errors.ThrowUserInput('--shard requires a one-based index and count such as 1/3.')
  }
  return { index, count }
}

/** selectHostedTypeScriptFiles plans the same full test inventory on every CI worker. */
export async function selectHostedTypeScriptFiles(shard: TestShard): Promise<string[]> {
  const root = Repo.getWorkspaceRoot()
  const source = await FS.listSourceFiles(Repo.resolvePath('ts'))
  const files = source.filter(file => Regxs.TestSourceSuffix.test(file)).map(file => Path.relative(root, file))
  const plan = planTypeScriptShards(files, shard.count, await readHostedTimings('typescript'))
  return selectTestShard(plan, shard).map(file => Repo.resolvePath(file))
}

/** selectHostedNativeFiles balances authored files and the compiled consumer as distinct native units. */
export async function selectHostedNativeFiles(
  files: readonly string[],
  platform: NativeTestPlatform,
  shard: TestShard,
): Promise<string[]> {
  const root = Repo.getWorkspaceRoot()
  const relative = files.map(file => Path.relative(root, file))
  const plan = planHostedNativeShards(relative, shard.count, await readHostedTimings(platform))
  return selectTestShard(plan, shard).map(file => Repo.resolvePath(file))
}

function planHostedNativeShards(
  files: readonly string[],
  count: number,
  timings: TestDurationEstimates,
): string[][] {
  const batches = [...files].sort(Sort.CompareStrings).map(file => ({
    files: [file],
    durationMs: timings.get(file) ?? 20_000,
  }))
  return packTestShards(batches, Math.min(count, batches.length))
}

type HostedTestSuite = 'typescript' | NativeTestPlatform
const timingSchema = Schema.record(Schema.string(), Schema.number().positive())

function selectTestShard(plan: readonly string[][], { index, count }: TestShard): string[] {
  const files = plan[index - 1]
  if (!files || files.length === 0 || plan.length !== count) {
    Errors.ThrowUserInput(`Cannot assign ${count} non-empty test shards.`)
  }
  return files
}

async function readHostedTimings(suite: HostedTestSuite): Promise<TestDurationEstimates> {
  const timingFile = Repo.resolvePath('.github', 'verify', suite + '-shards.json')
  const timings = await FS.readJson(timingFile, { schema: timingSchema })
  return new Map(Object.entries(timings))
}
