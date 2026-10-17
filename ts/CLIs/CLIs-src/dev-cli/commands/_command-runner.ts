import { runCommand } from '@cli-kit'
import { Command } from 'commander'
import { fileURLToPath } from 'node:url'

const commands = new Command().name('dev')
const legacyDev = fileURLToPath(new URL('../../../../../old-tao-v1/dev', import.meta.url))

/** registerCommand adds one command to the shared CLI registry. */
export function registerCommand(name: string): Command {
    return commands.command(name)
}

/** execute parses and executes the registered commands for one CLI invocation. */
export async function execute(name = 'dev'): Promise<void> {
    commands.name(name)
    await commands.parseAsync(Bun.argv)
}

/** runLegacyDev delegates repository Git workflows to the PoC until those workflows are ported. */
export async function runLegacyDev(args: string[]): Promise<number> {
    return await runCommand([legacyDev, ...args])
}
