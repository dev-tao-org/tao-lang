import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Errors, Json, Schema } from '@shared'
import { Artifacts, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { registerCommand } from './_command-runner'

type RequestedRun = string | undefined
const TaoRepository = 'tao-dev-org/tao-lang'
/** verifyCICommand dispatches and inspects hosted Verify for the Tao repository. */
export default registerCommand({
  name: 'verify-ci',
  description: 'Dispatch hosted Verify or inspect a GitHub Actions run.',
  arguments: [{ name: 'run', description: 'Run ID to inspect. With no run or options, dispatch Verify.' }],
  options: [
    { flags: '--status', description: 'Show run status. With no run ID, find the latest dispatch for HEAD.' },
    { flags: '--diagnostics', description: 'Show workflow and job annotations for an exact run.' },
    { flags: '--wait', description: 'Watch the run until it completes and return its verdict.' },
    { flags: '--rate-limit', description: 'Show the GitHub API quota and reset time.' },
    {
      flags: '--shards <ts/ios/android>',
      description: 'Dispatch with explicit TypeScript, iOS and Android shard counts.',
    },
    { flags: '--compare <baseline>', description: 'Compare job and step times with a baseline run ID.' },
    { flags: '--logs', description: 'Print hosted job logs.' },
    { flags: '--failed-logs', description: 'Print hosted logs for failed steps.' },
    { flags: '--job <id>', description: 'Limit logs to one hosted job ID.' },
    { flags: '--artifact <name>', description: 'Download a named artifact into .artifacts/notes/hosted-verify.' },
  ],
  async action(runId: RequestedRun, options: VerifyOptions) {
    const cwd = Repo.getWorkspaceRoot()
    const modes = [
      options.status,
      options.diagnostics,
      options.wait,
      options.rateLimit,
      options.compare !== undefined,
      options.logs,
      options.failedLogs,
      options.artifact !== undefined,
    ]
    if (modes.filter(Boolean).length > 1) {
      Errors.ThrowUserInput('Choose one Verify operation.')
    }
    requireLogJobOption(options)
    if (options.shards !== undefined && (runId !== undefined || modes.some(Boolean))) {
      Errors.ThrowUserInput('--shards applies to a new Verify dispatch.')
    }
    if (options.rateLimit) {
      if (runId !== undefined) {
        Errors.ThrowUserInput('Use --rate-limit without a run ID.')
      }
      await CLIKit.runNonInteractiveCommand('gh', [
        'api',
        'rate_limit',
        '--hostname',
        'github.com',
        '--jq',
        '.resources.core',
      ], { cwd })
      return
    }
    if (runId !== undefined) {
      requireIdentifier(runId, 'Run')
      await inspectRun(cwd, runId, options)
      return
    }
    if (modes.some(Boolean) && !options.status) {
      Errors.ThrowUserInput('Name the GitHub Actions run ID.')
    }
    await useCurrentBranch(cwd, options.status, options.shards)
  },
})

type VerifyOptions = {
  status?: boolean
  diagnostics?: boolean
  wait?: boolean
  rateLimit?: boolean
  compare?: string
  logs?: boolean
  failedLogs?: boolean
  job?: string
  artifact?: string
  shards?: string
}

const IdentifierRegx = /^[1-9]\d*$/u

function requireIdentifier(id: string, label: string): void {
  if (!IdentifierRegx.test(id)) {
    Errors.ThrowUserInput(`${label} ID must be a positive integer.`)
  }
}

function requireLogJobOption(options: VerifyOptions): void {
  if (options.job === undefined) {
    return
  }
  requireIdentifier(options.job, 'Job')
  if (!options.logs && !options.failedLogs) {
    Errors.ThrowUserInput('Use --job with --logs or --failed-logs.')
  }
}

async function inspectRun(cwd: string, runId: string, options: VerifyOptions): Promise<void> {
  if (options.diagnostics) {
    await runGitHub(cwd, ['run', 'view', runId])
    return
  }
  if (options.wait) {
    await runGitHub(cwd, ['run', 'watch', runId, '--interval', '30', '--compact', '--exit-status'])
    return
  }
  if (options.logs || options.failedLogs) {
    const job = options.job === undefined ? [] : ['--job', options.job]
    await runGitHub(cwd, ['run', 'view', runId, options.logs ? '--log' : '--log-failed', ...job])
    return
  }
  if (options.artifact !== undefined) {
    await downloadArtifact(cwd, runId, options.artifact)
    return
  }
  if (options.status) {
    await runGitHub(cwd, ['run', 'view', runId, '--json', StatusFields])
    return
  }
  await printRunTimings(cwd, runId, options.compare)
}

const ArtifactNameRegx = /^[a-zA-Z0-9_-]+$/u
async function downloadArtifact(cwd: string, runId: string, name: string): Promise<void> {
  if (!ArtifactNameRegx.test(name)) {
    Errors.ThrowUserInput('Artifact names can contain letters, digits, hyphens and underscores.')
  }
  const directory = Artifacts.resolvePath('notes', 'hosted-verify', runId, name)
  await runGitHub(cwd, ['run', 'download', runId, '--name', name, '--dir', directory])
  IO.print(directory)
}

async function useCurrentBranch(cwd: string, status?: boolean, shardCounts?: string): Promise<void> {
  const { branch, commit } = await requirePushedFeature(cwd)
  if (status) {
    await runGitHub(cwd, [
      'run',
      'list',
      '--workflow',
      'verify.yml',
      '--event',
      'workflow_dispatch',
      '--branch',
      branch,
      '--commit',
      commit,
      '--limit',
      '1',
      '--json',
      StatusFields,
    ])
    return
  }
  IO.print(`Dispatching Verify for ${branch} at ${commit}.`)
  await runGitHub(cwd, ['workflow', 'run', 'verify.yml', '--ref', branch, ...dispatchShardInputs(shardCounts)])
}

async function requirePushedFeature(cwd: string) {
  const branch = await Exec.captureStdout('git', ['symbolic-ref', '--short', 'HEAD'], { cwd })
  if (!branch.startsWith('feat/')) {
    Errors.ThrowUserInput('Hosted Verify dispatch requires a checked-out feat/ branch.')
  }
  const origin = await Exec.captureStdout('git', ['remote', 'get-url', 'origin'], { cwd })
  if (origin !== `https://github.com/${TaoRepository}.git`) {
    Errors.ThrowUserInput(`Hosted Verify dispatch expects the official origin at ${TaoRepository}.`)
  }
  const commit = await Exec.captureStdout('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd })
  const ref = `refs/heads/${branch}`
  const remote = await Exec.captureStdout('git', ['ls-remote', '--heads', 'origin', ref], { cwd })
  if (remote !== `${commit}\t${ref}`) {
    Errors.ThrowUserInput(`Push ${branch} to origin before dispatching Verify for ${commit}.`)
  }
  return { branch, commit }
}

function runGitHub(cwd: string, args: string[]): Promise<void> {
  return CLIKit.runNonInteractiveCommand('gh', [...args, '--repo', TaoRepository], { cwd })
}

const StatusFields = 'databaseId,headSha,status,conclusion,url'
const SpanFields = {
  startedAt: Schema.string().nullable(),
  completedAt: Schema.string().nullable(),
  conclusion: Schema.string().nullable(),
  name: Schema.string(),
}
const SpanSchema = Schema.object(SpanFields)
const RunSchema = Schema.object({
  databaseId: Schema.number(),
  url: Schema.string(),
  headSha: Schema.string(),
  status: Schema.string(),
  conclusion: Schema.string(),
  createdAt: Schema.string(),
  updatedAt: Schema.string(),
  jobs: Schema.array(Schema.object({ ...SpanFields, steps: Schema.array(SpanSchema).nullable() })),
})
type Run = Schema.infer<typeof RunSchema>
type Span = Schema.infer<typeof SpanSchema>

async function printRunTimings(cwd: string, runId: string, baselineId?: string): Promise<void> {
  if (baselineId !== undefined) {
    requireIdentifier(baselineId, 'Baseline run')
  }
  const [run, baseline] = await Promise.all([
    readRun(cwd, runId),
    baselineId === undefined ? undefined : readRun(cwd, baselineId),
  ])
  printRunIdentity(run)
  if (baseline !== undefined) {
    printRunIdentity(baseline)
  }
  printTimingRows(timingRows(run), baseline === undefined ? undefined : timingRows(baseline))
}

async function readRun(cwd: string, runId: string): Promise<Run> {
  const source = await Exec.captureStdout('gh', [
    'run',
    'view',
    runId,
    '--repo',
    TaoRepository,
    '--json',
    StatusFields + ',createdAt,updatedAt,jobs',
  ], { cwd, timeoutMs: 30_000 })
  return Json.Parse(source, { schema: RunSchema, sourceName: `GitHub Actions run ${runId}` })
}

function printRunIdentity(run: Run): void {
  IO.print(`Run ${run.databaseId} at ${run.headSha.slice(0, 10)} (${run.conclusion || run.status}) ${run.url}`)
}

type TimingRows = Map<string, number>

function timingRows(run: Run): TimingRows {
  const rows: TimingRows = new Map()
  if (run.status === 'completed') {
    rows.set('Workflow (created to last update)', elapsedSeconds(run.createdAt, run.updatedAt))
  }
  for (const job of run.jobs) {
    recordSpan(rows, job.name, job)
    for (const step of job.steps ?? []) {
      recordSpan(rows, `${job.name} / ${step.name}`, step)
    }
  }
  return rows
}

function recordSpan(rows: TimingRows, label: string, span: Span): void {
  if (!span.startedAt || !span.completedAt) {
    return
  }
  if (span.conclusion && span.conclusion !== 'skipped') {
    rows.set(label, elapsedSeconds(span.startedAt, span.completedAt))
  }
}

function elapsedSeconds(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 1000
}

function printTimingRows(rows: TimingRows, baseline?: TimingRows): void {
  if (baseline === undefined) {
    for (const [name, seconds] of rows) {
      IO.print(`${seconds}s  ${name}`)
    }
    return
  }
  IO.print('| Job or step | This run | Baseline | Change |')
  IO.print('| --- | ---: | ---: | ---: |')
  for (const name of new Set([...rows.keys(), ...baseline.keys()])) {
    const current = rows.get(name)
    const before = baseline.get(name)
    const change = current === undefined || before === undefined ? undefined : current - before
    IO.print(
      `| ${name.replaceAll('|', '\\|')} | ${formatSeconds(current)} | ${formatSeconds(before)} | ${
        formatSeconds(change)
      } |`,
    )
  }
}

function formatSeconds(value?: number): string {
  return value === undefined ? '—' : `${value}s`
}

type OptionalShardCounts = string | undefined
const DispatchShardsRegx = /^([1-8])\/([1-7])\/([1-7])$/u
function dispatchShardInputs(counts: OptionalShardCounts): string[] {
  if (counts === undefined) {
    return []
  }
  const match = DispatchShardsRegx.exec(counts)
  if (!match) {
    Errors.ThrowUserInput('--shards requires TypeScript/iOS/Android counts (up to 8/7/7).')
  }
  return ['-f', 'typescript_shards=' + match[1], '-f', 'ios_shards=' + match[2], '-f', 'android_shards=' + match[3]]
}
