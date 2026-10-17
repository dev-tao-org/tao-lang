import { Errors } from '@shared'
import { registerCommand, runLegacyRecipe } from './_command-runner'

/** stopCommand stops a supported repository service without deleting its data volumes. */
export const stopCommand = registerCommand({
  name: 'stop',
  description: 'Stop a repository service, preserving its data.',
  arguments: [{ name: 'service', required: true }],
  action: async (service: string) => {
    if (service !== 'local-instantdb') {
      Errors.ThrowUserInput('Supported service: local-instantdb.')
    }
    // Use the reference compose project until a new app/backend exists; its down keeps volumes.
    process.exitCode = await runLegacyRecipe(['stop-local-instantdb'])
  },
})
