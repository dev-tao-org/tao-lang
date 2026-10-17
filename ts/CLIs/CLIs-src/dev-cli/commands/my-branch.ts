import { registerCommand, runLegacyDev } from './_command-runner'

/** myBranchCommand selects and synchronizes a personal development branch. */
export default registerCommand({
  name: 'my-branch',
  description: 'Select a personal development branch and synchronize it with main.',
  arguments: [{ name: 'name', description: 'Branch name or suffix.', defaultValue: '' }],
  async action(name: string = '') {
    await runLegacyDev('my-branch', { variadicArgs: [name] })
    await runLegacyDev('my-sync')
  },
})
