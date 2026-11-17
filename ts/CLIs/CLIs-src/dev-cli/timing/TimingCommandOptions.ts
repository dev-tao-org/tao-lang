import type { TimingConnection } from './TimingConnection'
import type { TimingReportRequest } from './TimingReport'
import type { TimingRun } from './TimingRun'
import type { TimingSetup } from './TimingSetup'

/** TimingCommandOptions records human workload options before number conversion. */
export type TimingCommandOptions = {
  tooling?: string
  fixture?: string
  samples: string
  edits: string
  label?: string
  dryRun?: boolean
}

/** TimingSetupCommandOptions records Commander's positive browser key for its negated option. */
export type TimingSetupCommandOptions = {
  dryRun?: boolean
  browser?: boolean
}

/** timingArguments selects the same explicit host and candidate for reusable and one-shot runs. */
export const timingArguments = [
  { name: 'host', required: true, description: 'Existing SSH alias or user@hostname.' },
  { name: 'repo', required: true, description: 'Absolute immutable candidate checkout path on the runner.' },
]

/** DefaultTimingSamples sets the number of independent preview sessions in a standard runner job. */
export const DefaultTimingSamples = 5

/** DefaultTimingEdits sets the number of edits in each standard runner session. */
export const DefaultTimingEdits = 24

/** timingOptions declares the shared workload and preview flags for both run lifecycles. */
export const timingOptions = [
  { flags: '--label <name>', description: 'Agent or chat name to print in the runner’s live log.' },
  { flags: '--tooling <path>', description: 'Absolute prepared tooling checkout; defaults to the candidate.' },
  {
    flags: '--fixture <path>',
    description: 'Absolute runner fixture; defaults to the candidate’s performance fixture.',
  },
  {
    flags: '--samples <count>',
    description: 'Independent preview sessions.',
    defaultValue: String(DefaultTimingSamples),
  },
  {
    flags: '--edits <count>',
    description: 'Edits per session, excluding the first complete cycle from warm analysis.',
    defaultValue: String(DefaultTimingEdits),
  },
  { flags: '--dry-run', description: 'Print the workload and connection plan without connecting.' },
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

/** describeTimingSetup combines the command's network role with setup flags. */
export function describeTimingSetup(role: TimingSetup['role'], options: TimingSetupCommandOptions): TimingSetup {
  return { role, dryRun: options.dryRun, noBrowser: options.browser === false }
}
