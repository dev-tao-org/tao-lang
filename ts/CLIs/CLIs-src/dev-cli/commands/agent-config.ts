import { registerCommand, runLegacyDev } from './_command-runner'

/** agentConfigCommand regenerates root harness adapters through the retained generator. */
export default registerCommand({
  name: 'agent-config',
  description: 'Regenerate repository harness configuration from its canonical sources.',
  action: async () => {
    // The generator remains in the reference until the new harness tooling is implemented.
    return await runLegacyDev(['agent-config'])
  },
})
