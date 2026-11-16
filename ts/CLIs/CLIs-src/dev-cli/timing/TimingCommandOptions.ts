import type { TimingConnection } from './TimingConnection'
import type { TimingReportRequest } from './TimingReport'
import type { TimingRun } from './TimingRun'

/** TimingWorkloadOptions records human workload options before number conversion. */
export type TimingWorkloadOptions = {
  samples: string
  edits: string
  dryRun?: boolean
}

/** TimingCommandOptions selects the workload and tooling for an already prepared checkout. */
export type TimingCommandOptions = TimingWorkloadOptions & { tooling?: string; fixture?: string }

/** timingArguments selects the same explicit host and candidate for reusable and one-shot runs. */
export const timingArguments = [
  { name: 'host', required: true, description: 'Existing SSH alias or user@hostname.' },
  { name: 'repo', required: true, description: 'Absolute immutable candidate checkout path on the runner.' },
]

/** timingWorkloadOptions declares the optional sample, edit and preview controls. */
export const timingWorkloadOptions = [
  { flags: '--samples <count>', description: 'Independent preview sessions.', defaultValue: '5' },
  {
    flags: '--edits <count>',
    description: 'Edits per session, excluding the first complete cycle from warm analysis.',
    defaultValue: '24',
  },
  { flags: '--dry-run', description: 'Print the workload and connection plan without connecting.' },
]

/** timingOptions declares the controls for timing an already prepared checkout. */
export const timingOptions = [
  { flags: '--tooling <path>', description: 'Absolute prepared tooling checkout; defaults to the candidate.' },
  {
    flags: '--fixture <path>',
    description: 'Absolute runner fixture; defaults to the candidate’s performance fixture.',
  },
  ...timingWorkloadOptions,
]

/** describeTimingRun converts human count options into the typed workload request. */
export function describeTimingRun(host: string, repo: string, options: TimingCommandOptions): TimingRun {
  return { ...options, host, repo, samples: Number(options.samples), edits: Number(options.edits) }
}

/** describeTimingConnection combines the selected endpoint with its connection flags. */
export function describeTimingConnection(host: string, options: Pick<TimingConnection, 'dryRun'>): TimingConnection {
  return { host, ...options }
}

/** describeTimingReport combines runner and tooling positions with report selection flags. */
export function describeTimingReport(
  host: string,
  tooling: string,
  options: Pick<TimingReportRequest, 'job'>,
): TimingReportRequest {
  return { host, tooling, ...options }
}
