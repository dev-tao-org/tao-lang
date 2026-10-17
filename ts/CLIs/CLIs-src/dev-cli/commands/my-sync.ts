import { registerCommand, runLegacyDev } from './_command-runner'

/** mySyncCommand synchronizes the current development branch. */
export default registerCommand({
  name: 'my-sync',
  description: 'Synchronize main and merge it into this development branch.',
  async action() {
    await runLegacyDev('my-sync')
  },
})
