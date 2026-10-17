import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** setupCommand installs the TypeScript development workspace dependencies. */
export default registerCommand({
  name: 'setup',
  description: 'Install the TypeScript development workspace dependencies.',
  arguments: [{ name: 'args', description: 'Bun install arguments.', variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    // The legacy shell/tool profile stays separately bootstrapped with old-tao-v1's setup-tools.
    // Its former _setup also generated parser/native bindings, app dependencies and completion;
    // new equivalents await those implementations. Keep this runner dependency-free for fresh setup.
    return await runCommand([process.execPath, 'install', ...args])
  },
})
