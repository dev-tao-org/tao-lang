import { registerCommand } from './_command-runner'
import { runTypecheck } from './typecheck'

/** checkCommand checks the TypeScript workspace. */
export const checkCommand = registerCommand('check')
    .description('Check the TypeScript workspace.')
    .action(async () => {
        process.exitCode = await runTypecheck()
    })
