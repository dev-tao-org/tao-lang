import { IO } from '@cli-kit'
import * as Perf from '@perf'
import { Errors, S } from '@shared'
import { Path } from '@shared/os'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'
import { resolveTimingSocket } from './TimingConnection'
import { readTimingRemote } from './TimingRemote'
import { createTimingHelperArguments, presentTimingReport, readTimingJobPath, readTimingReport } from './TimingReport'

type TimingWorkload = { samples: number; edits: number }
/** TimingSnapshotTransfer identifies the staged runner inputs and expected measurement source. */
export type TimingSnapshotTransfer = { bundle: string; manifest: string; commit: string; tree: string }

/** TimingRun selects a prepared immutable runner checkout and repeated preview workload. */
export type TimingRun = TimingWorkload & {
  host: string
  repo: string
  tooling?: string
  fixture?: string
  dryRun?: boolean
  controlPath?: string
  snapshot?: TimingSnapshotTransfer
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
  IO.print('Measuring in an isolated runner checkout.')
  const controlPath = options.controlPath ?? resolveTimingSocket(options.host)
  const text = await readTimingRemote({
    host: options.host,
    directory: tooling,
    controlPath,
    args,
  })
  const job = readTimingJobPath(text, tooling)
  const report = await readTimingReport({ host: options.host, tooling, job }, controlPath)
  if (options.snapshot && (report.commit !== options.snapshot.commit || report.tree !== options.snapshot.tree)) {
    Errors.ThrowHostEnvironment('The timing runner reported different source from the submitted snapshot.')
  }
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
  requireTimingWorkload(options)
  if (options.fixture !== undefined && !Path.posix.isAbsolute(options.fixture)) {
    Errors.ThrowUserInput('Use an absolute runner fixture path.')
  }
}

/** requireTimingWorkload rejects empty sessions and incomplete edit cycles. */
export function requireTimingWorkload({ samples, edits }: TimingWorkload): void {
  if (!Number.isInteger(samples) || samples < 1 || !Perf.isValidEditCount(edits)) {
    Errors.ThrowUserInput(
      `Use a positive session count and an edit count that is a positive multiple of ${Perf.PreviewCycleSize}.`,
    )
  }
}

function createRunnerArguments(options: TimingRun, fixture: string): string[] {
  const { snapshot } = options
  const source = snapshot ? ['--bundle', snapshot.bundle, '--manifest', snapshot.manifest] : []
  return createTimingHelperArguments(snapshot ? 'run-snapshot' : 'run', [
    ...source,
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
