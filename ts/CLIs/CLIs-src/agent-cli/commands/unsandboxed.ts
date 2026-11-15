import { runHostCommand } from '../../cli-kit/host-commands'
import { registerCommand } from '../../dev-cli/commands/_command-runner'

/** unsandboxedCommand dispatches an explicitly allowlisted operation through the host route. */
export default registerCommand({
  name: 'unsandboxed',
  description:
    'Run an allowlisted host operation with host access. Use unsandboxed setup to install pinned dependencies.',
  arguments: [{
    name: 'args',
    required: true,
    variadic: true,
    description: 'Allowlisted operation and its arguments.',
  }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    await runHostCommand(args)
  },
})
