import { IO, runCommand } from '@cli-kit'
import { Errors, Time, Try } from '@shared'
import { Env, FileSystem, Path, Platform, Repo, SessionLock, Storage } from '@shared/os'
import { runWithEvidence } from './Evidence'
import { captureGit, resolveCommit } from './Git'
import { JobsDirectory, PreviewReportsDirectory, TimingLockName } from './JobFiles'
import { type PreviewReport, requireReport } from './ReportContract'
import { collectSamples } from './RunnerSamples'

/** RunnerOptions selects saved source, a canonical fixture and independent preview sessions. */
export type RunnerOptions = { repo: string; fixture: string; samples: number; edits: number }

/** MeasurementJob retains source identity, conditions and completed samples even when a later sample fails. */
export type MeasurementJob = {
  version: 1
  status: 'running' | 'passed' | 'failed'
  startedAt: string
  finishedAt?: string
  commit: string
  tree: string
  fixtureSha256: string
  settings: RunnerOptions
  environment: Record<string, string | undefined>
  system: ReturnType<typeof Platform.systemInfo>
  samples: string[]
  error?: string
}

/** runMeasurements runs an immutable checkout under the account-wide timing lock and retains raw samples. */
export async function runMeasurements(options: RunnerOptions): Promise<string> {
  requireRunnerOptions(options)
  const path = Storage.resolveSupportDirectory('locks', TimingLockName)
  await FileSystem.mkdir(Path.dirname(path), { recursive: true })
  const lock = await SessionLock.acquire(path)
  if (!lock) {
    Errors.ThrowHostEnvironment(
      'Another performance investigation owns this account’s timing lock. Retry when it finishes.',
    )
  }
  return await Try(async () => {
    const fixture = await FileSystem.readFile(options.fixture, 'utf8')
    const job = await describeJob(options, fixture)
    const directory = Repo.resolvePath(JobsDirectory, Platform.randomUUID())
    await FileSystem.mkdir(directory, { recursive: true })
    const fixturePath = Path.join(directory, 'fixture.tao')
    await FileSystem.writeFile(fixturePath, fixture)
    IO.print(`Performance job: ${directory}`)
    await collectSamples(directory, job, () => measurePreview(job, fixturePath, directory))
    return directory
  }, { finally: () => lock.release() })
}

async function describeJob(options: RunnerOptions, fixture: string): Promise<MeasurementJob> {
  await requireCleanSource(options.repo)
  const commit = await resolveCommit(options.repo, 'HEAD')
  const tree = (await captureGit(options.repo, ['rev-parse', `${commit}^{tree}`])).trim()
  const fixtureSha256 = Platform.hashText(fixture)
  return {
    version: 1,
    status: 'running',
    startedAt: Time.date().toISOString(),
    commit,
    tree,
    fixtureSha256,
    settings: options,
    environment: {
      TAO_PREVIEW_FRAME_COUNT: Env.get('TAO_PREVIEW_FRAME_COUNT') ?? '2',
      TAO_PREVIEW_EXTRA_VIEWS: Env.get('TAO_PREVIEW_EXTRA_VIEWS') ?? '0',
      TAO_PREVIEW_EXTRA_FILE_COUNT: Env.get('TAO_PREVIEW_EXTRA_FILE_COUNT') ?? '0',
    },
    system: Platform.systemInfo(),
    samples: [],
  }
}

async function measurePreview(job: MeasurementJob, fixture: string, directory: string): Promise<string> {
  const options = job.settings
  await requireCleanSource(options.repo)
  const commit = await resolveCommit(options.repo, 'HEAD')
  const fixtureSha256 = Platform.hashText(await FileSystem.readFile(fixture, 'utf8'))
  if (commit !== job.commit || fixtureSha256 !== job.fixtureSha256) {
    Errors.ThrowUserInput('Job source or canonical fixture changed between sessions.')
  }
  const reports = Path.join(options.repo, PreviewReportsDirectory)
  const before = new Set(await listPreviewReports(reports))
  IO.progress(`Measuring ${commit.slice(0, 12)} (${options.edits} edits)…`)
  const sources = [
    { directory: reports, label: 'preview' },
    { directory: Path.join(options.repo, '.artifacts/logs/dev'), label: 'command' },
  ]
  return await runWithEvidence(directory, sources, async () => {
    await runCommand('./dev performance preview', {
      variadicArgs: ['--fixture', fixture],
      cwd: options.repo,
      env: { TAO_PREVIEW_EDIT_COUNT: String(options.edits), TERMINAL_UI: '0', TERMINAL_OUTPUT: '1' },
    })
    return await acceptPreviewReport(job, commit, reports, before)
  })
}

async function acceptPreviewReport(job: MeasurementJob, commit: string, reports: string, before: Set<string>) {
  const options = job.settings
  await requireCleanSource(options.repo)
  if (await resolveCommit(options.repo, 'HEAD') !== commit) {
    Errors.ThrowUserInput('Measured checkout HEAD changed during the run.')
  }
  const created = (await listPreviewReports(reports)).filter(name => !before.has(name))
  if (created.length !== 1) {
    Errors.ThrowUserInput('Expected one new raw preview report; inspect the candidate performance logs.')
  }
  const path = Path.join(reports, created[0])
  const report = JSON.parse(await FileSystem.readFile(path, 'utf8')) as PreviewReport
  requireReport(report, job)
  return path
}

async function listPreviewReports(directory: string): Promise<string[]> {
  return await FileSystem.exists(directory)
    ? (await FileSystem.readdir(directory)).filter(name => /^preview-.*\.json$/.test(name))
    : []
}

async function requireCleanSource(root: string): Promise<void> {
  const status = await captureGit(root, ['status', '--porcelain=v1', '-uall', '--ignore-submodules=none'])
  if (status) {
    Errors.ThrowUserInput('Measure a prepared immutable clone; its tracked and unignored source must be clean.')
  }
}

function requireRunnerOptions(options: RunnerOptions): void {
  if (!Number.isInteger(options.samples) || options.samples < 1) {
    Errors.ThrowUserInput('Sample count must be a positive integer.')
  }
  if (!isValidEditCount(options.edits)) {
    Errors.ThrowUserInput('Edit count must be a positive multiple of four.')
  }
}

function isValidEditCount(count: number): boolean {
  return Number.isInteger(count) && count >= 4 && count % 4 === 0
}
