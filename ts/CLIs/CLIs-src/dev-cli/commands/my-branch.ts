import { registerCommand, runLegacyDev } from './_command-runner'

/** myBranchCommand selects and synchronizes a personal development branch. */
export const myBranchCommand = registerCommand({
  name: 'my-branch',
  description: 'Select a personal development branch and synchronize it with main.',
  arguments: [{ name: 'name', description: 'Branch name or suffix.', defaultValue: '' }],
  action: async (name: string = '') => {
    const selected = await runLegacyDev(['my-branch', name])
    process.exitCode = selected === 0 ? await runLegacyDev(['my-sync']) : selected
  },
})
