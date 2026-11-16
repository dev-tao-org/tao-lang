import { IO } from '@cli-kit'
import * as Perf from '@perf'
import { Errors, S } from '@shared'
import { Path } from '@shared/os'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'
import { resolveTimingSocket } from './TimingConnection'
import { readTimingRemote } from './TimingRemote'
import { createTimingHelperArguments, presentTimingReport, readTimingJobPath, readTimingReport } from './TimingReport'

/** TimingRun selects a prepared immutable runner checkout and repeated preview workload. */
export type TimingRun = {
  host: string
  repo: string
  tooling?: string
  fixture?: string
  samples: number
  edits: number
  dryRun?: boolean
  controlPath?: string
}

/** runTiming repeats measurements through existing SSH and retains complete raw reports on the runner. */
export async function runTiming(options: TimingRun, summary: (message: string) => void = IO.summary): Promise<void> {
  requireTimingRun(options)
  const tooling = options.tooling ?? options.repo
  const fixture = options.fixture ?? Path.posix.join(options.repo, 'ts/perf/perf-fixtures/Performance/Performance.tao')
  const args = createRunnerArguments(options, fixture)
  if (options.dryRun) {
    IO.print(
      `Would run ${options.samples} sessions × ${options.edits} edits on ${options.host}, checkout ${options.repo}.`,
    )
    IO.print(S`
      Tooling: ${tooling}
      Fixture: ${fixture}
    `)
    return
  }
  IO.print('Measuring the named immutable checkout; this command does not sync or modify its source.')
  const controlPath = options.controlPath ?? resolveTimingSocket(options.host)
  const text = await readTimingRemote({
    host: options.host,
    directory: tooling,
    controlPath,
    args,
  })
  const job = readTimingJobPath(text, tooling)
  const report = await readTimingReport({ host: options.host, tooling, job }, controlPath)
  await presentTimingReport(report, summary)
}

/** requireTimingRun rejects invalid workloads and paths before authentication or measurement. */
export function requireTimingRun(options: TimingRun): void {
  requireHost(options.host)
  if (!Path.posix.isAbsolute(options.repo)) {
    Errors.ThrowUserInput('Use absolute paths for the runner checkout and optional tooling checkout.')
  }
  if (options.tooling !== undefined && !Path.posix.isAbsolute(options.tooling)) {
    Errors.ThrowUserInput('Use absolute paths for the runner checkout and optional tooling checkout.')
  }
  if (!hasValidWorkload(options)) {
    Errors.ThrowUserInput(
      `Use a positive session count and an edit count that is a positive multiple of ${Perf.PreviewCycleSize}.`,
    )
  }
  if (options.fixture !== undefined && !Path.posix.isAbsolute(options.fixture)) {
    Errors.ThrowUserInput('Use an absolute runner fixture path.')
  }
}

function hasValidWorkload(options: TimingRun): boolean {
  return Number.isInteger(options.samples) && options.samples >= 1 && Perf.isValidEditCount(options.edits)
}

function createRunnerArguments(options: TimingRun, fixture: string): string[] {
  return createTimingHelperArguments('run', [
    '--repo',
    options.repo,
    '--fixture',
    fixture,
    '--samples',
    String(options.samples),
    '--edits',
    String(options.edits),
  ])
}
