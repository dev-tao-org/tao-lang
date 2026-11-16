import { Errors } from '@shared'

/** TestExecutionOptions selects serial or bounded parallel test execution. */
export type TestExecutionOptions = { serial?: boolean; parallel?: ParallelBudget; yes?: boolean }

/** TestPlan describes the selected suites and worker budget for one test run. */
export type TestPlan = {
  typescript: OptionalTypeScriptPlan
  tao: OptionalTaoPlan
  serial: boolean
}

/** TaoWorkerPlan assigns an ordered file chunk and a unique machine-readable result path. */
export type TaoWorkerPlan = { index: number; paths: readonly string[]; reportPath: string }

/** TestSectionOperations runs one selected suite group for the plan scheduler. */
export type TestSectionOperations = { typescript: () => Promise<void>; tao: () => Promise<void> }

/** TestSectionFailures retains each selected section's failure after every selected section finishes. */
export type TestSectionFailures = { typescript?: string; tao?: string }

/** TestRunSignal carries cancellation through scheduling and subprocess execution. */
export type TestRunSignal = AbortSignal

type ParallelBudget = string | boolean
type OptionalTypeScriptPlan = { args: readonly string[]; workers: number } | undefined
type OptionalTaoPlan = { target: string; workers: number } | undefined
type TestSection = 'typescript' | 'tao'
type SelectedTestSection = { section: TestSection; run: () => Promise<void> }
type OptionalTestRunSignal = TestRunSignal | undefined

/** TestExecutionRequest carries selected suites and test-worker controls. */
export type TestExecutionRequest = { typescriptArgs?: readonly string[]; taoTarget?: string } & TestExecutionOptions

/** TaoWorkerReport is the shared subprocess result protocol for completed Tao cases. */
export type TaoWorkerReport = { passed: number; failed: number; error?: string }

const DefaultTypeScriptWorkers = 5

/** planTestExecution validates test options and assigns worker budgets deterministically. */
export function planTestExecution(options: TestExecutionRequest): TestPlan {
  const serial = options.serial ?? false
  const parallel = options.parallel
  if (serial && parallel !== undefined) {
    Errors.ThrowUserInput('--serial cannot be combined with --parallel.')
  }
  const typescriptSelected = options.typescriptArgs !== undefined
  const taoSelected = options.taoTarget !== undefined
  const sections = Number(typescriptSelected) + Number(taoSelected)
  const budget = parallel === undefined || parallel === true
    ? DefaultTypeScriptWorkers + 1
    : parseParallelBudget(parallel)
  const [typescriptWorkers, taoWorkers] = serial || budget === 1
    ? [1, 1]
    : splitWorkerBudget(budget, sections, typescriptSelected, parallel === undefined || parallel === true)
  return {
    typescript: typescriptSelected
      ? { args: options.typescriptArgs ?? [], workers: typescriptWorkers }
      : undefined,
    tao: taoSelected ? { target: options.taoTarget ?? '', workers: taoWorkers } : undefined,
    serial: serial || budget === 1,
  }
}

/** planTaoWorkers creates deterministic contiguous chunks and pairs each with its result path. */
export function planTaoWorkers(paths: readonly string[], reportPaths: readonly string[]): TaoWorkerPlan[] {
  const workerCount = Math.min(paths.length, reportPaths.length)
  const baseSize = Math.floor(paths.length / workerCount)
  const extra = paths.length % workerCount
  let offset = 0
  return Array.from({ length: workerCount }, (_, index) => {
    const size = baseSize + Number(index < extra)
    const worker = { index, paths: paths.slice(offset, offset + size), reportPath: reportPaths[index] ?? '' }
    offset += size
    return worker
  })
}

/** executeTestSections runs selected groups in parallel or in TypeScript-then-Tao serial order. */
export async function executeTestSections(
  plan: TestPlan,
  operations: TestSectionOperations,
  signal?: TestRunSignal,
): Promise<TestSectionFailures> {
  const selected = [
    plan.typescript ? { section: 'typescript' as const, run: operations.typescript } : undefined,
    plan.tao ? { section: 'tao' as const, run: operations.tao } : undefined,
  ].filter((run): run is SelectedTestSection => run !== undefined)
  const results: { section: TestSection; failure?: string }[] = []
  if (plan.serial) {
    for (const section of selected) {
      assertTestRunActive(signal)
      results.push(await runSection(section.section, section.run, signal))
    }
  } else {
    results.push(...await Promise.all(selected.map(section => runSection(section.section, section.run, signal))))
  }
  assertTestRunActive(signal)
  return Object.fromEntries(results.flatMap(result => result.failure ? [[result.section, result.failure]] : []))
}

/** runWorkerBatch starts every bounded worker and waits for all reports, including rejected runs. */
export async function runWorkerBatch<Entry, Result>(
  workers: readonly Entry[],
  execute: (worker: Entry) => Promise<Result>,
  failed: (worker: Entry, error: unknown) => Result,
): Promise<Result[]> {
  return await Promise.all(workers.map(worker => execute(worker).catch(error => failed(worker, error))))
}

/** runFilesSequentially stops before the next file and rejects partial success when cancelled. */
export async function runFilesSequentially<Item, Result>(
  files: readonly Item[],
  signal: OptionalTestRunSignal,
  execute: (file: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = []
  for (const file of files) {
    assertTestRunActive(signal)
    results.push(await execute(file))
  }
  assertTestRunActive(signal)
  return results
}

/** assertTestRunActive rejects scheduling or partial success after cancellation. */
export function assertTestRunActive(signal: OptionalTestRunSignal): void {
  if (signal?.aborted) {
    Errors.ThrowHostEnvironment('Tao test run interrupted.')
  }
}

function parseParallelBudget(value: ParallelBudget): number {
  if (value === false || value === true) {
    return DefaultTypeScriptWorkers + 1
  }
  const budget = Number(value)
  if (!Number.isSafeInteger(budget) || budget < 1) {
    Errors.ThrowUserInput('--parallel requires a positive whole-number worker budget.')
  }
  return budget
}

function splitWorkerBudget(
  budget: number,
  sections: number,
  typescriptSelected: boolean,
  defaultBudget: boolean,
): [number, number] {
  if (sections < 2) {
    const workers = resolveSingleSectionWorkerBudget(defaultBudget, typescriptSelected, budget)
    return typescriptSelected ? [workers, 0] : [0, workers]
  }
  return [defaultBudget ? DefaultTypeScriptWorkers : budget - 1, 1]
}

function resolveSingleSectionWorkerBudget(defaultBudget: boolean, typescriptSelected: boolean, budget: number): number {
  if (!typescriptSelected) {
    return 1
  }
  return defaultBudget ? DefaultTypeScriptWorkers : budget
}

function runSection(section: TestSection, run: () => Promise<void>, signal?: TestRunSignal) {
  return Promise.resolve().then(() => {
    assertTestRunActive(signal)
    return run()
  }).then(
    () => ({ section }),
    error => ({ section, failure: String(error) }),
  )
}
