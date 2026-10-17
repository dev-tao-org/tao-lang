import { registerCommand, runLegacyDev } from './_command-runner'

/** myBranchCommand selects and synchronizes a personal development branch. */
export const myBranchCommand = registerCommand('my-branch')
  .description('Select a personal development branch and synchronize it with main.')
  .argument('[name]', 'Branch name or suffix.')
  .action(async (name = '') => {
    const selected = await runLegacyDev(['my-branch', name])
    process.exitCode = selected === 0 ? await runLegacyDev(['my-sync']) : selected
  })
