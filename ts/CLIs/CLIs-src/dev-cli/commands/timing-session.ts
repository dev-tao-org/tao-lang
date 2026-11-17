import * as TimingOptions from '../timing/TimingCommandOptions'
import { registerCommand } from './_command-runner'

/** timingSessionCommand owns one connect, measure, report and disconnect lifecycle. */
export default registerCommand({
  name: 'timing-session',
  description: 'Connect, measure, print the report and close this command’s private SSH connection.',
  arguments: TimingOptions.timingArguments,
  options: TimingOptions.timingOptions,
  async action(host: string, repo: string, options: TimingOptions.TimingCommandOptions) {
    const { runTimingSession } = await import('../timing/TimingSession')
    const request = TimingOptions.describeTimingRun(host, repo, options)
    await runTimingSession(request)
  },
})
