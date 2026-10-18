import { IO, type OutputChannel, runCommand } from '@cli-kit'
import { Errors, Time, Try } from '@shared'
import { Artifacts, FileSystem, HeadlessBrowser, Http, Path, Platform, Repo } from '@shared/os'
import { withTestTimings } from '../../cli-checks/slow-tests'
import { findTaoTestFiles } from './TaoTests'
import {
  executeTestSections,
  planTaoWorkers,
  planTestExecution,
  runFilesSequentially,
  runWorkerBatch,
  type TaoWorkerPlan,
  type TestExecutionOptions,
  type TestPlan,
} from './TestPlan'

/** TestExecutionOptions selects serial or bounded parallel test execution. */
export type { TestExecutionOptions } from './TestPlan'

/** runTestPlan executes selected TypeScript and Tao suites with bounded, independently reported workers. */
export async function runTestPlan(
  options: { typescriptArgs?: readonly string[]; taoTarget?: string; slowSeconds?: number } & TestExecutionOptions,
): Promise<void> {
  const startedAtMs = Time.nowMs()
  const plan = planTestExecution(options)
  const typeScriptChannel = plan.typescript ? IO.channel({ title: 'TypeScript tests' }) : undefined
  const taoChannels: OutputChannel[] = []
  const operations = {
    typescript: () => runTypeScriptTests(plan, typeScriptChannel, options.slowSeconds),
    tao: () => runTaoTests(plan, taoChannels),
  }
  const outcomes = await executeTestSections(plan, operations)
  typeScriptChannel?.finish(outcomes.typescript ? 'failed' : 'passed')
  for (const channel of [...typeScriptChannel ? [typeScriptChannel] : [], ...taoChannels]) {
    channel.summary(channel.completion())
  }
  const failures = [outcomes.typescript, outcomes.tao].filter((failure): failure is string => !!failure)
  if (failures.length > 0) {
    if (!plan.typescript && outcomes.tao) {
      Errors.ThrowUserInput('Tao app tests failed.')
    }
    Errors.ThrowUserInput(`Test execution failed:\n${failures.join('\n')}`)
  }
  IO.summary(`\n\t\u001b[32mAll tests passed in ${((Time.nowMs() - startedAtMs) / 1000).toFixed(2)}s\u001b[0m\n`)
}

/** runTaoTestFiles executes preselected Tao files without preparing shared compiler assets. */
export async function runTaoTestFiles(
  paths: readonly string[],
  signal?: ReturnType<typeof Http.createAbortController>['signal'],
): Promise<{ passed: number; failed: number }> {
  const { runAppTests } = await import('@workspace/testing/AppTests')
  const progress = (message: string) => IO.progress(message)
  const results = await runFilesSequentially(paths, signal, async file => {
    const relativePath = Path.relative(Repo.getWorkspaceRoot(), file)
    IO.progress(`Testing ${relativePath}…`)
    let passed = 0
    let failed = 0
    for (const result of await runAppTests(file, HeadlessBrowser.openTestBrowser, progress, signal)) {
      const location = `${relativePath}:${result.line}`
      IO.print(
        `${result.status === 'passed' ? 'PASS' : 'FAIL'} ${result.label} (${location}, ${
          result.durationMs.toFixed(0)
        }ms)`,
      )
      if (result.status === 'passed') {
        passed++
      } else {
        failed++
        IO.print(result.error)
      }
    }
    return { passed, failed }
  })
  return results.reduce(
    (total, result) => ({ passed: total.passed + result.passed, failed: total.failed + result.failed }),
    {
      passed: 0,
      failed: 0,
    },
  )
}

type TaoWorkerReport = { passed: number; failed: number; error?: string }

async function runTypeScriptTests(
  plan: TestPlan,
  channel: OutputChannel | undefined,
  slowSeconds: number | undefined,
): Promise<void> {
  if (!plan.typescript || !channel) {
    return
  }
  channel.start()
  const { args, workers } = plan.typescript
  await withTestTimings(
    reportPath =>
      runCommand(`bun test --parallel=${workers}`, {
        cwd: Repo.resolvePath('ts'),
        variadicArgs: reportPath ? [...args, '--reporter=junit', '--reporter-outfile', reportPath] : [...args],
        output: channel,
        env: { TERMINAL_UI: '0', TERMINAL_OUTPUT: '1' },
      }),
    slowSeconds,
    channel,
  )
}

async function runTaoTests(plan: TestPlan, channels: OutputChannel[]): Promise<void> {
  if (!plan.tao) {
    return
  }
  await Try(() => executeTaoTests(plan, channels), {
    catch(error) {
      channels.forEach((channel, index) => {
        channel.finish(error instanceof TaoWorkerFailure && !error.workerFailures.includes(index) ? 'passed' : 'failed')
      })
      Errors.Throw(error)
    },
  })
}

async function executeTaoTests(plan: TestPlan, channels: OutputChannel[]): Promise<void> {
  if (!plan.tao) {
    return
  }
  const files = await findTaoTestFiles(Path.resolve(plan.tao.target))
  if (files.length === 0) {
    Errors.ThrowUserInput(`No Tao test suites found in ${plan.tao.target}.`)
  }
  channels.push(...Array.from(
    { length: Math.min(files.length, plan.tao.workers) },
    (_, index) => IO.channel({ title: `Tao worker ${index + 1}` }),
  ))
  const reportPaths = channels.map((_, index) => taoWorkerReportPath(index))
  await Artifacts.mkdir(Path.dirname(reportPaths[0] ?? Artifacts.resolvePath('logs', 'test')), { recursive: true })
  const workers = planTaoWorkers(files, reportPaths)
  const results = await runWorkerBatch(
    workers,
    worker => runTaoWorker(worker, channels[worker.index]!),
    (worker, error) => ({ passed: 0, failed: 0, error: `Tao worker ${worker.index + 1} failed: ${String(error)}` }),
  )
  const failures = results.flatMap((result, index) => result.failed > 0 || result.error ? [index] : [])
  const passed = results.reduce((sum, result) => sum + result.passed, 0)
  const failed = results.reduce(
    (sum, result) => sum + result.failed + Number(Boolean(result.error) && result.failed === 0),
    0,
  )
  IO.print(`Tao tests (headless web): ${passed} passed, ${failed} failed.`)
  if (failures.length > 0) {
    Errors.Throw(new TaoWorkerFailure(failures))
  }
}

async function runTaoWorker(worker: TaoWorkerPlan, channel: OutputChannel): Promise<TaoWorkerReport> {
  channel.start()
  let commandFailure: string | undefined
  await Try(() =>
    runCommand('bun run', {
      structuredOutput: true,
      cwd: Repo.getWorkspaceRoot(),
      variadicArgs: [
        Repo.resolvePath('ts/CLIs/CLIs-src/dev-cli/testing/TaoTestWorker.ts'),
        '--report',
        worker.reportPath,
        '--',
        ...worker.paths,
      ],
      output: channel,
      env: { TERMINAL_UI: '0', TERMINAL_OUTPUT: '1' },
    }), {
    catch(error) {
      commandFailure = String(error)
    },
  })
  const report = await readTaoWorkerReport(worker.reportPath, commandFailure)
  if (report.error) {
    channel.printToStdErr(report.error)
  }
  channel.finish(report.failed > 0 || report.error ? 'failed' : 'passed')
  return report
}

async function readTaoWorkerReport(path: string, commandFailure: string | undefined): Promise<TaoWorkerReport> {
  return await Try(async () => {
    const value: unknown = JSON.parse(await FileSystem.readFile(path, 'utf8'))
    if (!isTaoWorkerReport(value)) {
      Errors.ThrowHostEnvironment(`Tao worker wrote an invalid result report: ${path}`)
    }
    if (commandFailure && !value.error) {
      value.error = commandFailure
    }
    return value
  }, {
    catch: error => ({
      passed: 0,
      failed: 0,
      error: `Missing or invalid Tao worker report ${path}: ${String(error)}${
        commandFailure ? `; worker command: ${commandFailure}` : ''
      }`,
    }),
    finally: () => FileSystem.rm(path, { force: true }),
  })
}

function isTaoWorkerReport(value: unknown): value is TaoWorkerReport {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const report = value as Partial<TaoWorkerReport>
  return Number.isSafeInteger(report.passed) && (report.passed ?? -1) >= 0
    && Number.isSafeInteger(report.failed) && (report.failed ?? -1) >= 0
    && (report.error === undefined || typeof report.error === 'string')
}

function taoWorkerReportPath(index: number): string {
  return Artifacts.resolvePath('logs', 'test', `${Time.now()}-${index}-${Platform.randomUUID()}.json`)
}

class TaoWorkerFailure extends Error {
  constructor(readonly workerFailures: readonly number[]) {
    super('Tao app tests failed.')
  }
}
