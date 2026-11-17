import * as TimingOptions from '../timing/TimingCommandOptions'
import { registerCommand } from './_command-runner'

/** timingRunCommand repeats preview measurements in a prepared immutable runner checkout. */
export default registerCommand({
  name: 'timing-run',
  description: 'Repeat a preview benchmark over SSH in a prepared immutable checkout; no source sync.',
  arguments: TimingOptions.timingArguments,
  options: TimingOptions.timingOptions,
  async action(host: string, repo: string, options: TimingOptions.TimingCommandOptions) {
    const { runTiming } = await import('../timing/TimingRun')
    const request = TimingOptions.describeTimingRun(host, repo, options)
    await runTiming(request)
  },
})
