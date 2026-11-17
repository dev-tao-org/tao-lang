import { IO } from '@cli-kit'
import { Errors, Json, NewlineCharacter, Regxs, UserInput } from '@shared'
import { DevelopmentStorage, FS, Path, Platform } from '@shared/os'
import { JobFileName, JobsDirectory } from '../../agent-skills/performance-investigation/JobFiles'
import { describeTimingComparison } from './TimingComparison'
import { resolveTimingSocket } from './TimingConnection'
import { readTimingRemote, type TimingRemoteRequest } from './TimingRemote'
import type { TimingReport } from './TimingReportContract'
import { readTimingHistory } from './TimingReportHistory'

/** TimingReportRequest selects a tooling checkout and optional exact completed job. */
export type TimingReportRequest = { host: string; tooling: string; job?: string }

/** reportTiming prints a completed runner job without launching measurements. */
export async function reportTiming(request: TimingReportRequest): Promise<void> {
  const report = await readTimingReport(request, resolveTimingSocket(request.host))
  await presentTimingReport(report)
}

/** presentTimingReport saves the collected summary locally and prints its human-readable measurements. */
export async function presentTimingReport(
  report: TimingReport,
  print: (message: string) => void = IO.summary,
): Promise<void> {
  const directory = DevelopmentStorage.resolveDirectory('timing', 'reports')
  await FS.mkdir(directory)
  const history = await readTimingHistory(report, directory)
  const path = Path.join(directory, Path.posix.basename(report.directory) + '.json')
  const pending = `${path}.${Platform.randomUUID()}.pending`
  await FS.writeFile(pending, Json.Print(report) + NewlineCharacter)
  await FS.rename(pending, path)
  print([
    formatTimingReport(report),
    `Saved summary: ${path}`,
    '',
    describeTimingComparison(report, history),
  ].join(NewlineCharacter))
}

/** readTimingReport reads an exact job or the most recently modified job, refusing incomplete evidence. */
export async function readTimingReport(
  request: TimingReportRequest,
  controlPath: string,
): Promise<TimingReport> {
  const { parseTimingReport } = await import('./TimingReportContract')
  UserInput.Require(!!Path.posix.isAbsolute(request.tooling), 'Use an absolute runner tooling checkout path.')
  const remote = { host: request.host, directory: request.tooling, controlPath }
  const job = request.job ?? await readLatestJob(remote)
  requireJobPath(job, request.tooling)
  const summary = await readTimingRemote(withTimingArguments(remote, createTimingHelperArguments('summarize', [job])))
  const manifestPath = Path.posix.join(job, JobFileName)
  const manifest = await readTimingRemote(withTimingArguments(remote, ['/bin/cat', manifestPath]))
  return parseTimingReport({ summary, manifest, job, runner: request.host })
}

/** readTimingJobPath identifies the exact job announced by a completed measurement command. */
export function readTimingJobPath(text: string, tooling: string): string {
  const jobs = [...text.matchAll(Regxs.TimingJobAnnouncementRegx)].map(match => match[1].trim())
  if (jobs.length !== 1) {
    Errors.ThrowHostEnvironment('Expected one timing job identity in runner output; inspect the retained command log.')
  }
  requireJobPath(jobs[0], tooling)
  return jobs[0]
}

/** createTimingHelperArguments invokes the existing runner helper without requiring new runner code. */
export function createTimingHelperArguments(operation: string, args: readonly string[]): string[] {
  return [
    './agent',
    'skill-script',
    'agents/skills/performance-investigation/scripts/performance.ts',
    '--',
    operation,
    ...args,
  ]
}

function formatTimingReport(report: TimingReport): string {
  const lines = report.groups.map(group =>
    `${group.name.padEnd(30)} ${group.medianMs.toFixed(2).padStart(10)}  ${group.minMs.toFixed(2)}–${
      group.maxMs.toFixed(2)
    }`
  )
  return [
    `Preview timing · ${report.commit.slice(0, 12)}`,
    `${report.settings.samples} independent sessions × ${report.settings.edits} edits; warm groups exclude the first cycle`,
    '',
    'Scenario                        Median ms  Session range ms',
    ...lines,
    '',
    'Values summarize session medians of click-to-applied latency; startup is listed separately.',
    `Raw reports: ${report.directory}`,
  ].join(NewlineCharacter)
}

async function readLatestJob(remote: Omit<TimingRemoteRequest, 'args'>): Promise<string> {
  const jobs = Path.posix.join(remote.directory, JobsDirectory)
  const args = ['/bin/ls', '-1t', jobs]
  const listing = await readTimingRemote(withTimingArguments(remote, args))
  const latest = listing.split(Regxs.TimingListingLineBreakRegx).find(name => Regxs.TimingJobIdRegx.test(name))
  UserInput.Require(!!latest, 'No timing jobs were found in this tooling checkout.')
  return Path.posix.join(jobs, latest)
}

function withTimingArguments(remote: Omit<TimingRemoteRequest, 'args'>, args: readonly string[]): TimingRemoteRequest {
  return { ...remote, args }
}

function requireJobPath(job: string, tooling: string): void {
  const parent = Path.posix.join(tooling, JobsDirectory)
  UserInput.Require(
    !(Path.posix.dirname(job) !== parent || !Regxs.TimingJobIdRegx.test(Path.posix.basename(job))),
    'Select a job directly inside this tooling checkout’s retained jobs directory.',
  )
}
