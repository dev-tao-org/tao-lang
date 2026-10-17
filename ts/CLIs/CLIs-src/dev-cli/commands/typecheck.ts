import { runCommand } from '@cli-kit'
import { registerCommand } from './_command-runner'

/** runTypecheck checks the TypeScript workspace types and returns the compiler's verdict. */
export async function runTypecheck(): Promise<number> {
    return await runCommand([
        process.execPath,
        'node_modules/typescript/bin/tsc',
        '--project',
        'tsconfig.json'
    ])
}

/** typecheckCommand checks the TypeScript workspace types. */
export const typecheckCommand = registerCommand('typecheck')
    .description('Check TypeScript workspace types.')
    .action(async () => {
        process.exitCode = await runTypecheck()
    })
