import { registerCommand } from '../../dev-cli/commands/_command-runner'

/** unsandboxedCommand dispatches an explicitly allowlisted operation through the host route. */
export default registerCommand({
  name: 'unsandboxed',
  description: 'Run an allowlisted host operation; the agent harness must grant execution outside its sandbox.',
  arguments: [{
    name: 'args',
    required: true,
    variadic: true,
    description: 'Allowlisted operation and its arguments.',
  }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    const { runHostCommand } = await import('../../cli-kit/host-commands')
    await runHostCommand(args)
  },
})
