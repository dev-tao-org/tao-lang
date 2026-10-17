import { Errors } from '@shared'
import { registerCommand, runLegacyRecipe } from './_command-runner'

/** startCommand starts a supported repository service with its complete setup. */
export default registerCommand({
  name: 'start',
  description: 'Start a repository service.',
  arguments: [{ name: 'service', required: true }],
  action: async (service: string) => {
    if (service !== 'local-instantdb') {
      Errors.ThrowUserInput('Supported service: local-instantdb.')
    }
    // The compose stack and WordFlower seed remain in the reference; no new app owns them yet.
    return await runLegacyRecipe(['start-local-instantdb'])
  },
})
