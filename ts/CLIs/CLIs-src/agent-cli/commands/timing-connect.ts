import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { describeTimingConnection } from '../../dev-cli/timing/TimingCommandOptions'
import { connectTiming } from '../../dev-cli/timing/TimingConnection'

/** timingConnectCommand authenticates a reusable ordinary SSH connection without opening a remote shell. */
export default registerCommand({
  name: 'timing-connect',
  description: 'Authenticate SSH to the selected timing Mac and return to the local prompt.',
  arguments: [{ name: 'host', required: true, description: 'Existing SSH alias or user@hostname.' }],
  options: [{ flags: '--dry-run', description: 'Print the connection plan without connecting.' }],
  async action(host: string, options: { dryRun?: boolean }) {
    const request = describeTimingConnection(host, options)
    await connectTiming(request)
  },
})
