import { registerCommand, runLegacyDev } from './_command-runner'

/** mySyncCommand synchronizes the current development branch. */
export default registerCommand({
  name: 'my-sync',
  description: 'Synchronize main and merge it into this development branch.',
  action: async () => {
    return await runLegacyDev(['my-sync'])
  },
})
