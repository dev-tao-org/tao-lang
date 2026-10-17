import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** typecheckCommand checks the TypeScript workspace types. */
export const typecheckCommand = registerCommand('typecheck')
  .description('Check TypeScript workspace types.')
  .action(async () => {
    process.exitCode = await runCommand([
      process.execPath,
      'node_modules/typescript/bin/tsc',
      '--project',
      'tsconfig.json',
    ])
  })
