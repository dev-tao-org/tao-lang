import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** setupCommand installs the TypeScript development workspace dependencies. */
export const setupCommand = registerCommand('setup')
  .description('Install the TypeScript development workspace dependencies.')
  .argument('[args...]', 'Bun install arguments.')
  .allowUnknownOption()
  .action(async (args: string[]) => {
    process.exitCode = await runCommand([process.execPath, 'install', ...args])
  })
