import { setupSshKey } from '../timing/SshKey'
import { registerCommand } from './_command-runner'

/** sshKeySetupCommand installs a dedicated SSH public key on the selected machine. */
export default registerCommand({
  name: 'ssh-key-setup',
  description: 'Set up a dedicated SSH key on this Mac for an existing SSH login.',
  arguments: [{ name: 'host', required: true, description: 'Existing SSH alias or user@hostname.' }],
  options: [{ flags: '--dry-run', description: 'Show the key location and target without making changes.' }],
  async action(host: string, options: { dryRun?: boolean }) {
    await setupSshKey(host, options)
  },
})
