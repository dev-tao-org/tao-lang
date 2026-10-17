import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** setupCommand installs the TypeScript development workspace dependencies. */
export const setupCommand = registerCommand({
  name: 'setup',
  description: 'Install the TypeScript development workspace dependencies.',
  arguments: [{ name: 'args', description: 'Bun install arguments.', variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    process.exitCode = await runCommand([process.execPath, 'install', ...args])
  },
})
