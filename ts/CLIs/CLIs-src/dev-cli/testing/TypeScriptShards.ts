import { IO, type OutputChannel, runCommand } from '@cli-kit'
import { Errors, Try } from '@shared'
import { FileSystem, Repo } from '@shared/os'
import { withTestTimings } from '../../cli-checks/slow-tests'
import { assertTestRunActive, runWorkerBatch, type TestPlan, type TestRunSignal } from './TestPlan'
import { planTypeScriptShards } from './TypeScriptShardPlan'

/** runTypeScriptTests executes disjoint full-suite shards or preserves Bun's focused selection semantics. */
export async function runTypeScriptTests(
  plan: TestPlan,
  channel: OptionalOutputChannel,
  slowSeconds: OptionalSlowSeconds,
  signal: TestRunSignal,
  workerEnvironment: Record<string, string>,
): Promise<void> {
  if (!plan.typescript || !channel) {
    return
  }
  channel.start()
  const { args, workers } = plan.typescript
  const shards = await selectShards(args, workers)
  const results = await runWorkerBatch(shards, async (paths) => {
    const index = shards.indexOf(paths)
    const output = shards.length === 1 ? channel : IO.channel({ title: `TypeScript shard ${index + 1}` })
    const shardWorkers = shards.length === 1 ? workers : 1
    output.start()
    await Try(
      () => runShard(paths, shardWorkers, output, slowSeconds, signal, workerEnvironment),
      {
        catch(error) {
          output.finish('failed')
          Errors.Throw(error)
        },
      },
    )
    output.finish('passed')
    return undefined
  }, (_, error) => String(error))
  assertTestRunActive(signal)
  const failures = results.filter((failure): failure is string => failure !== undefined)
  if (failures.length > 0) {
    Errors.ThrowUserInput(`TypeScript shards failed:\n${failures.join('\n')}`)
  }
}

async function selectShards(args: readonly string[], workers: number): Promise<readonly (readonly string[])[]> {
  if (!isFullSuiteSelection(args) || workers < 3) {
    return [args]
  }
  const sources = await FileSystem.listSourceFiles(Repo.resolvePath('ts'))
  const files = sources.filter(path => path.endsWith('.test.ts'))
  if (files.length === 0) {
    Errors.ThrowHostEnvironment('No TypeScript test files found.')
  }
  return planTypeScriptShards(files, workers)
}

function isFullSuiteSelection(args: readonly string[]): boolean {
  return args.length === 0 || args.length === 1 && args[0] === Repo.resolvePath('ts')
}

async function runShard(
  args: readonly string[],
  workers: number,
  output: OutputChannel,
  slowSeconds: OptionalSlowSeconds,
  signal: TestRunSignal,
  workerEnvironment: Record<string, string>,
): Promise<void> {
  assertTestRunActive(signal)
  await withTestTimings(
    reportPath =>
      runCommand(`bun test --parallel=${workers}`, {
        variadicArgs: [...args, ...reportPath ? ['--reporter=junit', '--reporter-outfile', reportPath] : []],
        cwd: Repo.resolvePath('ts'),
        output,
        signal,
        env: { ...workerEnvironment, TERMINAL_UI: '0', TERMINAL_OUTPUT: '1' },
      }),
    slowSeconds,
    output,
  )
}

type OptionalOutputChannel = OutputChannel | undefined
type OptionalSlowSeconds = number | undefined
