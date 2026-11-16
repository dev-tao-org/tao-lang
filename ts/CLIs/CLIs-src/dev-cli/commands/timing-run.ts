import * as CLIKit from '@cli-kit'
import { runCheckoutTiming } from '../timing/TimingCheckout'
import { type TimingWorkloadOptions, timingWorkloadOptions } from '../timing/TimingCommandOptions'
import { registerCommand } from './_command-runner'

type TimingCheckoutOptions = TimingWorkloadOptions & { ref?: string }
type OptionalTimingCheckout = string | undefined

/** timingRunCommand times a snapshot of the selected local worktree on the configured runner. */
export default registerCommand({
  name: 'timing-run',
  description: 'Time the saved files in a local worktree on the configured SSH runner.',
  arguments: [{ name: 'checkout', description: 'Local checkout or subdirectory; defaults to the invoking directory.' }],
  options: [
    ...timingWorkloadOptions,
    { flags: '--ref <revision>', description: 'Select a committed revision instead of saved working files.' },
  ],
  async action(checkout: OptionalTimingCheckout, options: TimingCheckoutOptions) {
    await runCheckoutTiming({
      directory: CLIKit.resolveCallerPath(checkout ?? '.'),
      samples: Number(options.samples),
      edits: Number(options.edits),
      dryRun: options.dryRun,
      ref: options.ref,
    })
  },
})
