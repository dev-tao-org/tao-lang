import { runCommand } from '@cli-kit'
import { Errors, Try } from '@shared'
import { fileURLToPath } from 'node:url'

/** CommandArgument describes one positional command argument. */
export type CommandArgument = {
  name: string
  description?: string
  required?: boolean
  variadic?: boolean
  defaultValue?: unknown
}

/** CommandDefinition declares a command's metadata and inline implementation. */
export type CommandDefinition<Args extends unknown[] = []> = {
  name: string
  description: string
  arguments?: readonly CommandArgument[]
  allowUnknownOptions?: boolean
  action: (...args: Args) => void | Promise<void>
}

/** RegisteredCommand exposes metadata and an action with centralized failure handling. */
export type RegisteredCommand<Args extends unknown[]> = Omit<CommandDefinition<Args>, 'action'> & {
  action: (...args: Args) => Promise<void>
}

const commands: CommandDefinition<unknown[]>[] = []
/** repositoryRoot locates the active checkout independently of the caller's directory. */
export const repositoryRoot = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/\/$/, '')
/** legacyRoot locates the reference implementation's workflow directory. */
export const legacyRoot = `${repositoryRoot}/old-tao-v1`

/** registerCommand adds one command to the shared CLI registry. */
export function registerCommand<Args extends unknown[]>(definition: CommandDefinition<Args>): RegisteredCommand<Args> {
  const registered = {
    ...definition,
    action: async (...args: Args): Promise<void> => {
      await Try(() => definition.action(...args), {
        catch: error => {
          process.exitCode = 1
          const message = Try(
            () => Errors.isTaoError(error) ? Errors.formatForUser(error) : Errors.messageOf(error),
            { catch: () => 'Command failed.' },
          )
          console.error(message)
        },
      })
    },
  }
  commands.push({ ...registered, action: (...args: unknown[]) => registered.action(...args as Args) })
  return registered
}

/** execute parses and executes the registered commands for one CLI invocation. */
export async function execute(name = 'dev'): Promise<void> {
  // Setup can register and invoke its action before Commander has been installed.
  const { Command } = await import('commander')
  const parser = new Command().name(name)
  for (const definition of commands) {
    const command = parser.command(definition.name).description(definition.description)
    for (const argument of definition.arguments ?? []) {
      const label = `${argument.name}${argument.variadic ? '...' : ''}`
      command.argument(argument.required ? `<${label}>` : `[${label}]`, argument.description, argument.defaultValue)
    }
    command.allowUnknownOption(definition.allowUnknownOptions ?? false)
    command.action(async (...args: unknown[]) => {
      await definition.action(...args.slice(0, definition.arguments?.length ?? 0))
    })
  }
  await parser.parseAsync(Bun.argv)
}

/** runLegacyDev delegates existing CLI workflows to the reference implementation. */
export async function runLegacyDev(args: string[]): Promise<number> {
  return await runCommand([`${legacyRoot}/dev`, ...args], { cwd: legacyRoot })
}

/** runLegacyRecipe retains legacy prerequisites, workflow ordering and exit status. */
export async function runLegacyRecipe(args: string[]): Promise<number> {
  return await runCommand(['just', '--justfile', `${legacyRoot}/Justfile`, ...args], { cwd: legacyRoot })
}

/** workspaceTypes checks the new workspace without invoking reference gates twice. */
export async function workspaceTypes(): Promise<number> {
  return await runCommand([process.execPath, 'node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'], {
    cwd: `${repositoryRoot}/ts`,
  })
}

/** workspaceFormat formats or checks the new workspace and shared repository files. */
export async function workspaceFormat(mode: 'fmt' | 'check'): Promise<number> {
  return await runCommand([
    'dprint',
    mode,
    '--config',
    '.dprint.jsonc',
    '--incremental=false',
    '**/*',
    '--excludes',
    'old-tao-v1/**',
  ], { cwd: repositoryRoot })
}
