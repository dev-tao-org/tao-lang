import { registerCommand, runLegacyDev } from './_command-runner'
import { runMySync } from './my-sync'

/** runMyBranch selects a developer branch and synchronizes it after a successful selection. */
export async function runMyBranch(name = '', run = runLegacyDev): Promise<number> {
    const selected = await run(['my-branch', name])
    return selected === 0 ? await runMySync(run) : selected
}

/** myBranchCommand selects and synchronizes a personal development branch. */
export const myBranchCommand = registerCommand('my-branch')
    .description('Select a personal development branch and synchronize it with main.')
    .argument('[name]', 'Branch name or suffix.')
    .action(async (name = '') => {
        process.exitCode = await runMyBranch(name)
    })
