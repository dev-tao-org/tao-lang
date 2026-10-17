import { registerCommand, runLegacyDev } from './_command-runner'

/** runMySync synchronizes main and merges it into the current development branch. */
export async function runMySync(run = runLegacyDev): Promise<number> {
    return await run(['my-sync'])
}

/** mySyncCommand synchronizes the current development branch. */
export const mySyncCommand = registerCommand('my-sync')
    .description('Synchronize main and merge it into this development branch.')
    .action(async () => {
        process.exitCode = await runMySync()
    })
