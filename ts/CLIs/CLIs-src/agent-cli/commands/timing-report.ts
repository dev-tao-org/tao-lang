import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { describeTimingReport } from '../../dev-cli/timing/TimingCommandOptions'
import { reportTiming } from '../../dev-cli/timing/TimingReport'

/** timingReportCommand prints a retained runner report without launching measurements. */
export default registerCommand({
  name: 'timing-report',
  description: 'Print a retained timing job and compare with the previous comparable saved report.',
  arguments: [
    { name: 'host', required: true, description: 'Existing SSH alias or user@hostname.' },
    { name: 'tooling', required: true, description: 'Absolute tooling checkout containing the retained jobs.' },
  ],
  options: [{ flags: '--job <path>', description: 'Exact absolute retained job directory.' }],
  async action(host: string, tooling: string, options: { job?: string }) {
    const request = describeTimingReport(host, tooling, options)
    await reportTiming(request)
  },
})
