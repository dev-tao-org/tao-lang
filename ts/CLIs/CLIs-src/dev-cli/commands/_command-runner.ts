import '../../cli-kit/fatal-errors'
import { IO } from '@cli-kit'
import { Platform } from '@shared/os'

/** CommandDefinition declares a command's metadata and inline implementation. */
export type CommandDefinition<Args extends unknown[] = []> = {
  name: string
  description: string
  arguments?: readonly CommandArgument[]
  allowUnknownOptions?: boolean
  action: (...args: Args) => void | Promise<void>
}

/** RegisteredCommand exposes metadata and an awaited action that propagates failures. */
export type RegisteredCommand<Args extends unknown[]> = Omit<CommandDefinition<Args>, 'action'> & {
  action: (...args: Args) => Promise<void>
}

/** registerCommand adds one command to the shared CLI registry. */
export function registerCommand<Args extends unknown[]>(definition: CommandDefinition<Args>): RegisteredCommand<Args> {
  const registered = {
    ...definition,
    async action(...args: Args): Promise<void> {
      await definition.action(...args)
    },
  }
  commands.push({
    ...registered,
    action: (...args: unknown[]) => registered.action(...args as Args),
  })
  return registered
}

/** execute parses and executes the registered commands for one CLI invocation. */
export async function execute(name = 'dev'): Promise<void> {
  // Setup can register and invoke its action before Commander has been installed.
  const { Command } = await import('commander')
  const parser = new Command().name(name).configureOutput({
    writeOut(text) {
      IO.print(text.replace(/\n$/, ''))
    },
    writeErr(text) {
      IO.printToStdErr(text.replace(/\n$/, ''))
    },
  })
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
  await parser.parseAsync(Platform.argv)
}

type CommandArgument = {
  name: string
  description?: string
  required?: boolean
  variadic?: boolean
  defaultValue?: unknown
}

const commands: CommandDefinition<unknown[]>[] = []
