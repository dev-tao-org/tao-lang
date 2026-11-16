import { registerCommand } from '../../dev-cli/commands/_command-runner'
import * as TimingOptions from '../../dev-cli/timing/TimingCommandOptions'
import { runTimingSession } from '../../dev-cli/timing/TimingSession'

/** timingSessionCommand owns one connect, measure, report and disconnect lifecycle. */
export default registerCommand({
  name: 'timing-session',
  description: 'Connect, measure, print the report and close this command’s private SSH connection.',
  arguments: TimingOptions.timingArguments,
  options: TimingOptions.timingOptions,
  async action(host: string, repo: string, options: TimingOptions.TimingCommandOptions) {
    const request = TimingOptions.describeTimingRun(host, repo, options)
    await runTimingSession(request)
  },
})
