import { runCommand } from '@cli-kit'

/** runSetup installs the TypeScript workspace dependencies, including the CLI's own dependencies. */
export async function runSetup(args: string[] = []): Promise<number> {
    return await runCommand([process.execPath, 'install', ...args])
}

if (import.meta.main) {
    process.exitCode = await runSetup(Bun.argv.slice(2))
}
