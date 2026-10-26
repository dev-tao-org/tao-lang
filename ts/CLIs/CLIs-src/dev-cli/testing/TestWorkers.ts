import { IO, type OutputChannel, runCommand } from '@cli-kit'
import { Errors, Time, Try } from '@shared'
import { Artifacts, FileSystem, HeadlessBrowser, Http, Lifecycle, Path, Platform, Repo } from '@shared/os'
import { discoverProject } from '@workspace/projects/Projects'
import { execute } from '@workspace/Workflow'
import { workflowUI } from '../../tao-cli/WorkflowUI'
import { findTaoTestFiles } from './TaoTestDiscovery'
import * as TestPlanModule2 from './TestPlan'
import { runTypeScriptTests } from './TypeScriptShards'

/** TestExecutionOptions selects serial or bounded parallel test execution. */
export type { TestExecutionOptions } from './TestPlan'

/** runTestPlan executes selected TypeScript and Tao suites with bounded, independently reported workers. */
export async function runTestPlan(
  options:
    & { typescriptArgs?: readonly string[]; taoTarget?: string; slowSeconds?: number }
    & TestPlanModule2.TestExecutionOptions,
): Promise<void> {
  const controller = Http.createAbortController()
  const stop = Lifecycle.onTermination(() => controller.abort())
  const workerEnvironment = testWorkerEnvironment()
  await Try(() => executeTestPlan(options, controller.signal, workerEnvironment), { finally: stop })
}

/** runTaoTestFiles executes preselected Tao files without preparing shared compiler assets. */
export async function runTaoTestFiles(
  paths: readonly string[],
  signal?: ReturnType<typeof Http.createAbortController>['signal'],
): Promise<{ passed: number; failed: number }> {
  const progress = (message: string) => IO.progress(message)
  const results = await TestPlanModule2.runFilesSequentially(paths, signal, async file => {
    const relativePath = Path.relative(Repo.getWorkspaceRoot(), file)
    IO.progress(`Testing ${relativePath}…`)
    let passed = 0
    let failed = 0
    for (
      const result of await execute({
        kind: 'app-tests',
        entry: file,
        openBrowser: HeadlessBrowser.openTestBrowser,
        onProgress: progress,
        signal,
      }, workflowUI(false, signal))
    ) {
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

async function executeTestPlan(
  options: Parameters<typeof runTestPlan>[0],
  signal: TestPlanModule2.TestRunSignal,
  workerEnvironment: Record<string, string>,
): Promise<void> {
  const startedAtMs = Time.nowMs()
  const plan = TestPlanModule2.planTestExecution(options)
  const typeScriptChannel = plan.typescript ? IO.channel({ title: 'TypeScript tests' }) : undefined
  const taoChannels: OutputChannel[] = []
  const operations = {
    typescript: () => runTypeScriptTests(plan, typeScriptChannel, options.slowSeconds, signal, workerEnvironment),
    tao: () => runTaoTests(plan, taoChannels, signal, workerEnvironment, options.yes),
  }
  const outcomes = await TestPlanModule2.executeTestSections(plan, operations, signal)
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

async function runTaoTests(
  plan: TestPlanModule2.TestPlan,
  channels: OutputChannel[],
  signal: TestPlanModule2.TestRunSignal,
  workerEnvironment: Record<string, string>,
  yes?: boolean,
): Promise<void> {
  if (!plan.tao) {
    return
  }
  await Try(() => executeTaoTests(plan, channels, signal, workerEnvironment, yes), {
    catch(error) {
      channels.forEach((channel, index) => {
        channel.finish(error instanceof TaoWorkerFailure && !error.workerFailures.includes(index) ? 'passed' : 'failed')
      })
      Errors.Throw(error)
    },
  })
}

async function executeTaoTests(
  plan: TestPlanModule2.TestPlan,
  channels: OutputChannel[],
  signal: TestPlanModule2.TestRunSignal,
  workerEnvironment: Record<string, string>,
  yes?: boolean,
): Promise<void> {
  if (!plan.tao) {
    return
  }
  const files = await findTaoTestFiles(Path.resolve(plan.tao.target))
  TestPlanModule2.assertTestRunActive(signal)
  if (files.length === 0) {
    Errors.ThrowUserInput(`No Tao test suites found in ${plan.tao.target}.`)
  }
  for (const entry of files) {
    if (await discoverProject(entry)) {
      await execute({ kind: 'setup', entry, for: 'app-tests' }, workflowUI(yes, signal))
    }
  }
  channels.push(...Array.from(
    { length: Math.min(files.length, plan.tao.workers) },
    (_, index) => IO.channel({ title: `Tao worker ${index + 1}` }),
  ))
  const reportPaths = channels.map((_, index) => taoWorkerReportPath(index))
  await Artifacts.mkdir(Path.dirname(reportPaths[0] ?? Artifacts.resolvePath('logs', 'test')), { recursive: true })
  const workers = TestPlanModule2.planTaoWorkers(files, reportPaths)
  const results = await TestPlanModule2.runWorkerBatch(
    workers,
    worker => runTaoWorker(worker, channels[worker.index]!, signal, workerEnvironment),
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

async function runTaoWorker(
  worker: TestPlanModule2.TaoWorkerPlan,
  channel: OutputChannel,
  signal: TestPlanModule2.TestRunSignal,
  workerEnvironment: Record<string, string>,
): Promise<TestPlanModule2.TaoWorkerReport> {
  TestPlanModule2.assertTestRunActive(signal)
  channel.start()
  let commandFailure: string | undefined
  await Try(() =>
    runCommand('bun run', {
      variadicArgs: [
        Repo.resolvePath('ts/CLIs/CLIs-src/dev-cli/testing/TaoTestWorker.ts'),
        '--report',
        worker.reportPath,
        '--',
        ...worker.paths,
      ],
      structuredOutput: true,
      cwd: Repo.getWorkspaceRoot(),
      output: channel,
      signal,
      env: { ...workerEnvironment, TERMINAL_UI: '0', TERMINAL_OUTPUT: '1' },
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

async function readTaoWorkerReport(
  path: string,
  commandFailure: string | undefined,
): Promise<TestPlanModule2.TaoWorkerReport> {
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

function isTaoWorkerReport(value: unknown): value is TestPlanModule2.TaoWorkerReport {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const report = value as Partial<TestPlanModule2.TaoWorkerReport>
  return Number.isSafeInteger(report.passed) && (report.passed ?? -1) >= 0
    && Number.isSafeInteger(report.failed) && (report.failed ?? -1) >= 0
    && (report.error === undefined || typeof report.error === 'string')
}

function taoWorkerReportPath(index: number): string {
  return Artifacts.resolvePath('logs', 'test', `${Time.now()}-${index}-${Platform.randomUUID()}.json`)
}

function testWorkerEnvironment(): Record<string, string> {
  const root = Artifacts.resolvePath('tmp/test-workers', Platform.randomUUID())
  return { TAO_CACHE_DIR: Path.join(root, 'cache'), TAO_SUPPORT_DIR: Path.join(root, 'support') }
}

class TaoWorkerFailure extends Error {
  constructor(readonly workerFailures: readonly number[]) {
    super('Tao app tests failed.')
  }
}
