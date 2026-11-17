import * as CLIKit from '@cli-kit'
import { IO } from '@cli-kit'

import { Errors, NewlineCharacter, Try, UserInput } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { type TestFileTiming, withTestTimings } from '../../cli-checks/slow-tests'
import * as TestBalance from './TestBalance'
import { assertTestRunActive, runWorkerBatch, type TestPlan, type TestRunSignal } from './TestPlan'
import { planTypeScriptShards } from './TypeScriptShardPlan'
import { readShardEstimates, rememberShardTimings, resolveShardTimings } from './TypeScriptShardTimings'

/** TestWorkerEnvironment carries isolated cache and support paths into test subprocesses. */
export type TestWorkerEnvironment = Record<string, string>

type OptionalOutputChannel = CLIKit.OutputChannel | undefined
type ShardResult = TestFileTiming[] | string
/** runTypeScriptTests executes disjoint full-suite shards or preserves Bun's focused selection semantics. */
export async function runTypeScriptTests(
  plan: TestPlan,
  channel: OptionalOutputChannel,
  slowSeconds: OptionalSlowSeconds,
  signal: TestRunSignal,
  workerEnvironment: TestWorkerEnvironment,
  timings: TestBalance.TestTimingGroup,
): Promise<void> {
  if (!plan.typescript || !channel) {
    return
  }
  channel.start()
  const { args, workers } = plan.typescript
  const { shards, cachePath, files } = await selectShards(args, workers, plan.tao?.workers ?? 0)
  const results = await runWorkerBatch(shards, async (paths): Promise<ShardResult> => {
    const index = shards.indexOf(paths)
    const output = shards.length === 1 ? channel : IO.channel({ title: `TypeScript shard ${index + 1}` })
    const shardWorkers = shards.length === 1 ? workers : 1
    output.start()
    const durations = await TestBalance.recordTestWorker(timings, index, () =>
      Try(
        () => runShard(paths, shardWorkers, output, slowSeconds, signal, workerEnvironment),
        {
          catch(error) {
            output.finish('failed')
            Errors.Throw(error)
          },
        },
      ))
    output.finish('passed')
    return durations
  }, (_, error) => String(error))
  assertTestRunActive(signal)
  const failures = results.filter((failure): failure is string => typeof failure === 'string')
  if (failures.length > 0) {
    UserInput.Fail(`TypeScript shards failed:${NewlineCharacter}${failures.join(NewlineCharacter)}`)
  }
  if (cachePath && files) {
    await rememberShardTimings(cachePath, files, results.flatMap(result => typeof result === 'string' ? [] : result))
  }
}

type ShardSelection = { shards: readonly (readonly string[])[]; cachePath?: string; files?: string[] }

async function selectShards(args: readonly string[], workers: number, taoWorkers: number): Promise<ShardSelection> {
  if (!isFullSuiteSelection(args) || workers < 2) {
    return { shards: [args] }
  }
  const sources = await FS.listSourceFiles(Repo.resolvePath('ts'))
  const root = Repo.getWorkspaceRoot()
  const files = sources.filter(path => path.endsWith('.test.ts')).map(path => Path.relative(root, path))
  if (files.length === 0) {
    Errors.ThrowHostEnvironment('No TypeScript test files found.')
  }
  const cachePath = resolveShardTimings(workers, taoWorkers)
  const planned = planTypeScriptShards(files, workers, await readShardEstimates(cachePath))
  const shards = planned.map(shard => shard.map(file => Repo.resolvePath(file)))
  return shards.length > 1 ? { shards, cachePath, files } : { shards }
}

function isFullSuiteSelection(args: readonly string[]): boolean {
  return args.length === 0 || args.length === 1 && args[0] === Repo.resolvePath('ts')
}

async function runShard(
  args: readonly string[],
  workers: number,
  output: CLIKit.OutputChannel,
  slowSeconds: OptionalSlowSeconds,
  signal: TestRunSignal,
  workerEnvironment: TestWorkerEnvironment,
): Promise<TestFileTiming[]> {
  assertTestRunActive(signal)
  return await withTestTimings(
    reportPath => {
      const reportArgs = reportPath ? ['--reporter=junit', '--reporter-outfile', reportPath] : []
      return CLIKit.runNonInteractiveCommand('bun', ['test', `--parallel=${workers}`, ...args, ...reportArgs], {
        cwd: Repo.resolvePath('ts'),
        output,
        signal,
        addEnv: { ...workerEnvironment, TERMINAL_UI: '0', TERMINAL_OUTPUT: '1' },
      })
    },
    slowSeconds,
    output,
  )
}

type OptionalSlowSeconds = number | undefined
