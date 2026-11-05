import { describeTimingConnection } from '../timing/TimingCommandOptions'
import { disconnectTiming } from '../timing/TimingConnection'
import { registerCommand } from './_command-runner'

/** timingDisconnectCommand closes the saved Tao SSH master for the selected host. */
export default registerCommand({
  name: 'timing-disconnect',
  description: 'Close the saved reusable SSH connection to the selected timing Mac.',
  arguments: [{ name: 'host', required: true, description: 'Existing SSH alias or user@hostname.' }],
  options: [{ flags: '--dry-run', description: 'Print the connection to close without changing it.' }],
  async action(host: string, options: { dryRun?: boolean }) {
    const request = describeTimingConnection(host, options)
    await disconnectTiming(request)
  },
})
