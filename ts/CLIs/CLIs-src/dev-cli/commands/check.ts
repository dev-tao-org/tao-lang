import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** checkCommand checks the TypeScript workspace. */
export const checkCommand = registerCommand({
  name: 'check',
  description: 'Check the TypeScript workspace.',
  action: async () => {
    process.exitCode = await runCommand([
      process.execPath,
      'node_modules/typescript/bin/tsc',
      '--project',
      'tsconfig.json',
    ])
  },
})
