import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** setupCommand installs the TypeScript development workspace dependencies. */
export default registerCommand({
  name: 'setup',
  description: 'Install the TypeScript development workspace dependencies.',
  arguments: [{ name: 'args', description: 'Bun install arguments.', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    await runCommand('bun install', { variadicArgs: args })
    // A new process resolves dependencies from the completed installation.
    await runCommand('bun run ./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts', { structuredOutput: true })
  },
})
