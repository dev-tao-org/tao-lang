import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** testCommand runs the TypeScript workspace tests and preserves their verdict. */
export const testCommand = registerCommand('test')
    .description('Run TypeScript workspace tests, optionally limited to a path.')
    .argument('[target]', 'Test file or directory.')
    .action(async (target?: string) => {
        process.exitCode = await runCommand([process.execPath, 'test', ...(target ? [target] : [])])
    })
