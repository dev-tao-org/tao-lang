import { registerCommand, runLegacyDev } from './_command-runner'

/** mySyncCommand synchronizes the current development branch. */
export const mySyncCommand = registerCommand({
  name: 'my-sync',
  description: 'Synchronize main and merge it into this development branch.',
  action: async () => {
    process.exitCode = await runLegacyDev(['my-sync'])
  },
})
