import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import * as Performance from '@repo-analysis/performance'
import { Json, Schema } from '@shared'
import { Errors, NewlineCharacter, Regxs, Time, Try } from '@shared'
import { Env, FileLock, FS, Path, Platform, Repo, Storage } from '@shared/os'
import { runWithEvidence } from './Evidence'
import { captureGit, resolveCommit } from './Git'
import { JobsDirectory, PreviewReportsDirectory, TimingLockName } from './JobFiles'
import { parsePreviewReport, requireReport } from './ReportContract'
import { collectSamples } from './RunnerSamples'
import { assertMaterializedTree, readTreeEntries } from './SourceTree'
import { appendTimingProgress, describeTimingSample } from './TimingProgress'

/** RunnerOptions selects saved source, a canonical fixture and independent preview sessions. */
export type RunnerOptions = { repo: string; fixture: string; samples: number; edits: number; frameCount?: 2 }

type MeasurementJobStatus = 'running' | 'passed' | 'failed'
type MeasurementEnvironmentValue = string | undefined
type MeasurementEnvironment = Record<string, MeasurementEnvironmentValue>

/** MeasurementJob retains source identity, conditions and completed samples even when a later sample fails. */
export type MeasurementJob = {
  version: 1
  status: MeasurementJobStatus
  startedAt: string
  finishedAt?: string
  commit: string
  tree: string
  fixtureSha256: string
  settings: RunnerOptions
  environment: MeasurementEnvironment
  system: Platform.SystemInformation
  samples: string[]
  error?: string
}

/** parseMeasurementJob validates the retained job manifest at the file boundary. */
export function parseMeasurementJob(source: string, path: string): MeasurementJob {
  return Try(() => Json.Parse(source, { schema: measurementJobSchema }), {
    catch: () => Errors.ThrowUserInput(`Invalid timing job manifest at ${path}.`),
  })
}

const measurementJobSchema = Schema.object({
  version: Schema.literal(1),
  status: Schema.union([Schema.literal('running'), Schema.literal('passed'), Schema.literal('failed')]),
  startedAt: Schema.string(),
  finishedAt: Schema.string().optional(),
  commit: Schema.string(),
  tree: Schema.string(),
  fixtureSha256: Schema.string(),
  settings: Schema.object({
    repo: Schema.string(),
    fixture: Schema.string(),
    samples: Schema.number(),
    edits: Schema.number(),
    frameCount: Schema.literal(2).optional(),
  }),
  environment: Schema.record(Schema.string(), Schema.string()),
  system: Schema.object({ architecture: Schema.string(), kernel: Schema.string(), os: Schema.string() }),
  samples: Schema.array(Schema.string()),
  error: Schema.string().optional(),
})

/** runMeasurements runs an immutable checkout under the account-wide timing lock and retains raw samples. */
export async function runMeasurements(options: RunnerOptions): Promise<string> {
  const directory = allocateTimingJob()
  await withTimingLock(() => runMeasurementJob(options, directory))
  return directory
}

/** allocateTimingJob reserves an identity for a job before it is started. */
export const allocateTimingJob = (parent = Repo.resolvePath(JobsDirectory)): string =>
  Path.join(parent, Platform.randomUUID())

/** requirePreviewProtocol checks the measured source before launching any preview process. */
export async function requirePreviewProtocol(repo: string): Promise<void> {
  const source = await Try.WithDefault('', () => readPreviewMeasurementSource(repo))
  const declaration = `export const PreviewMeasurementProtocol = '${Performance.PreviewMeasurementProtocol}'`
  if (!source.split(NewlineCharacter).includes(declaration)) {
    Errors.ThrowUserInput(
      `Incompatible preview measurement protocol in ${repo}. Prepare both revisions with the same instrumentation.`,
    )
  }
}

const PreviewMeasurementSourceSuffix = '/Preview/PreviewMeasurement.ts'
async function readPreviewMeasurementSource(repo: string): Promise<string> {
  const entries = await readTreeEntries(repo, 'HEAD')
  const sources = entries.filter(entry => entry.path.endsWith(PreviewMeasurementSourceSuffix))
  if (sources.length !== 1) {
    return ''
  }
  return await captureGit(repo, ['show', `HEAD:${sources[0]!.path}`])
}

/** withTimingLock holds the account-wide lease through an entire measurement or comparison. */
export async function withTimingLock<Result>(run: () => Promise<Result>): Promise<Result> {
  const path = Storage.resolveSupportDirectory('locks', TimingLockName)
  await FS.mkdir(Path.dirname(path))
  const lock = await FileLock.tryAcquire(path)
  if (!lock) {
    Errors.ThrowHostEnvironment(
      'Another performance investigation owns this account’s timing lock. Retry when it finishes.',
    )
  }
  return await Try(run, { finally: () => lock.release() })
}

/** runMeasurementJob measures one retained job while its caller holds the timing lease. */
export async function runMeasurementJob(options: RunnerOptions, directory: string): Promise<void> {
  requireRunnerOptions(options)
  const fixture = await FS.readFile(options.fixture, 'utf8')
  const job = await describeJob(options, fixture)
  await FS.mkdir(directory)
  const fixturePath = Path.join(directory, 'fixture.tao')
  await FS.writeFile(fixturePath, fixture)
  IO.print(`Performance job: ${directory}`)
  await appendTimingProgress(
    `Starting ${job.commit.slice(0, 12)} · ${options.samples} sessions × ${options.edits} edits`,
  )
  await Try(() => collectSamples(directory, job, () => measurePreview(job, fixturePath, directory)), {
    finally: (_thrown, error) =>
      appendTimingProgress(error ? `Failed: ${error.message}` : `Finished ${job.commit.slice(0, 12)} · ${directory}`),
  })
}

async function describeJob(options: RunnerOptions, fixture: string): Promise<MeasurementJob> {
  await requireCleanSource(options.repo)
  await requirePreviewProtocol(options.repo)
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
    environment: describeEnvironment(options),
    system: Platform.systemInfo(),
    samples: [],
  }
}

function describeEnvironment(options: RunnerOptions): MeasurementEnvironment {
  const frameCount = options.frameCount === undefined
    ? Env.get('TAO_PREVIEW_FRAME_COUNT') ?? '2'
    : String(options.frameCount)
  return { TAO_PREVIEW_FRAME_COUNT: frameCount }
}

async function measurePreview(job: MeasurementJob, fixture: string, directory: string): Promise<string> {
  const options = job.settings
  await requireCleanSource(options.repo)
  const commit = await resolveCommit(options.repo, 'HEAD')
  const fixtureSha256 = Platform.hashText(await FS.readFile(fixture, 'utf8'))
  if (commit !== job.commit || fixtureSha256 !== job.fixtureSha256) {
    Errors.ThrowUserInput('Job source or canonical fixture changed between sessions.')
  }
  const reports = Path.join(options.repo, PreviewReportsDirectory)
  const before = new Set(await listPreviewReports(reports))
  IO.progress(`Measuring ${commit.slice(0, 12)} (${options.edits} edits)…`)
  await appendTimingProgress(`Session ${job.samples.length + 1}/${options.samples} · ${commit.slice(0, 12)}`)
  const sources = [
    { directory: reports, label: 'preview' },
    { directory: Path.join(options.repo, '.artifacts/logs/dev'), label: 'command' },
  ]
  return await runWithEvidence(directory, sources, async () => {
    await CLIKit.runNonInteractiveCommand('./dev', ['performance', 'preview', '--fixture', fixture], {
      cwd: options.repo,
      addEnv: describePreviewEnvironment(job),
    })
    return await acceptPreviewReport(job, commit, reports, before)
  })
}

function describePreviewEnvironment(job: MeasurementJob): MeasurementEnvironment {
  return {
    ...job.environment,
    TAO_PREVIEW_EDIT_COUNT: String(job.settings.edits),
    TERMINAL_UI: '0',
    TERMINAL_OUTPUT: '1',
  }
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
  const report = parsePreviewReport(await FS.readFile(path, 'utf8'), path)
  requireReport(report, job)
  await appendTimingProgress(describeTimingSample(report))
  return path
}

async function listPreviewReports(directory: string): Promise<string[]> {
  return await FS.exists(directory)
    ? (await FS.readdir(directory)).filter(name => Regxs.PreviewReportFilenameRegx.test(name))
    : []
}

async function requireCleanSource(root: string): Promise<void> {
  const status = await captureGit(root, ['status', '--porcelain=v1', '-uall', '--ignore-submodules=none'])
  if (status) {
    Errors.ThrowUserInput('Measure a prepared immutable clone; its tracked and unignored source must be clean.')
  }
  const entries = await readTreeEntries(root, 'HEAD')
  await assertMaterializedTree(root, entries)
}

function requireRunnerOptions(options: RunnerOptions): void {
  if (!Number.isInteger(options.samples) || options.samples < 1) {
    Errors.ThrowUserInput('Sample count must be a positive integer.')
  }
  if (!Performance.isValidEditCount(options.edits)) {
    Errors.ThrowUserInput(`Edit count must be a positive multiple of ${Performance.PreviewCycleSize}.`)
  }
}
