import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** setupCommand installs the TypeScript development workspace dependencies. */
export default registerCommand({
  name: 'setup',
  description: 'Install the TypeScript development workspace dependencies.',
  arguments: [{ name: 'args', description: 'Bun install arguments.', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    // Keep registration dependency-free; load build tooling only after installation succeeds.
    await runCommand('bun install', { variadicArgs: args })
    const { prepareParser } = await import('../../cli-checks/parser-build')
    await prepareParser()
  },
})
