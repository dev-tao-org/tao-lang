import { Regxs, UserInput } from '@shared'

/** JobFileName identifies the durable measurement manifest. */
export const JobFileName = 'job.json'

/** JobsDirectory identifies retained jobs relative to the tooling checkout. */
export const JobsDirectory = '.artifacts/notes/performance-investigation/jobs'

/** TimingLockName identifies the account-wide measurement lease. */
export const TimingLockName = 'performance-investigation.lock'

/** PreviewReportsDirectory identifies raw preview reports and associated service logs. */
export const PreviewReportsDirectory = '.artifacts/logs/performance'

/** createSampleName creates the local evidence filename for one independent session. */
export const createSampleName = (index: number): string => `sample-${index + 1}.json`

/** requireSampleName rejects paths outside the job's local sample representation. */
export function requireSampleName(name: string): void {
  UserInput.Require(!!Regxs.PerformanceJobSampleNameRegx.test(name), 'Unexpected sample path in job manifest.')
}
