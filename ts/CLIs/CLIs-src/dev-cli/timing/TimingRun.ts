import { IO } from '@cli-kit'
import * as Performance from '@repo-analysis/performance'
import { Errors, S } from '@shared'
import { Path } from '@shared/os'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'
import { isRegularTreeFile, parseTreeEntries } from '../../agent-skills/performance-investigation/SourceTree'
import { resolveTimingSocket } from './TimingConnection'
import { readTimingRemote, type TimingRemoteRequest } from './TimingRemote'
import { createTimingHelperArguments, presentTimingReport, readTimingJobPath, readTimingReport } from './TimingReport'

/** TimingRun selects a prepared immutable runner checkout and repeated preview workload. */
export type TimingRun = {
  host: string
  repo: string
  tooling?: string
  fixture?: string
  samples: number
  edits: number
  label?: string
  dryRun?: boolean
  controlPath?: string
}

/** runTiming repeats measurements through existing SSH and retains complete raw reports on the runner. */
export async function runTiming(options: TimingRun, summary: (message: string) => void = IO.summary): Promise<void> {
  requireTimingRun(options)
  const tooling = options.tooling ?? options.repo
  if (options.dryRun) {
    IO.print(
      `Would run ${options.samples} sessions × ${options.edits} edits on ${options.host}, checkout ${options.repo}.`,
    )
    IO.print(S`
      Tooling: ${tooling}
      Fixture: ${options.fixture ?? 'The candidate’s committed performance fixture'}
    `)
    return
  }
  IO.print('Measuring the named immutable checkout; this command does not sync or modify its source.')
  const controlPath = options.controlPath ?? resolveTimingSocket(options.host)
  const remote = { host: options.host, directory: tooling, controlPath }
  const fixture = options.fixture ?? await readCandidateFixture(options.repo, remote)
  const args = createRunnerArguments(options, fixture)
  const text = await readTimingRemote({ ...remote, args })
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
      `Use a positive session count and an edit count that is a positive multiple of ${Performance.PreviewCycleSize}.`,
    )
  }
  if (options.fixture !== undefined && !Path.posix.isAbsolute(options.fixture)) {
    Errors.ThrowUserInput('Use an absolute runner fixture path.')
  }
}

function hasValidWorkload(options: TimingRun): boolean {
  return Number.isInteger(options.samples) && options.samples >= 1 && Performance.isValidEditCount(options.edits)
}

const PerformanceFixtureSuffix = '/' + Performance.PerformanceFixturePath.split('/').slice(-2).join('/')
type TimingRunner = Omit<TimingRemoteRequest, 'args'>

async function readCandidateFixture(repo: string, remote: TimingRunner): Promise<string> {
  const args = ['git', '-C', repo, 'ls-tree', '-rz', 'HEAD', '--', 'ts']
  const listing = await readTimingRemote({ ...remote, args, streamOutput: false })
  const candidates = parseTreeEntries(listing).filter(entry =>
    isRegularTreeFile(entry) && entry.path.endsWith(PerformanceFixtureSuffix)
  )
  if (candidates.length !== 1) {
    Errors.ThrowUserInput(`Expected one committed performance fixture in ${repo}. Supply --fixture to select it.`)
  }
  return Path.posix.join(repo, candidates[0]!.path)
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
    ...options.label === undefined ? [] : ['--label', options.label],
  ])
}
