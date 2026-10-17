import { registerCommand } from './_command-runner'
import { runSetup } from './_setup'

/** setupCommand installs the TypeScript development workspace dependencies. */
export const setupCommand = registerCommand('setup')
        .description('Install the TypeScript development workspace dependencies.')
        .argument('[args...]', 'Bun install arguments.')
        .allowUnknownOption()
        .action(async (args: string[]) => {
            process.exitCode = await runSetup(args)
        })
