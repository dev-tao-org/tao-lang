import { UserInput } from '@shared'
import type { FS } from '@shared/os'
import type { Command, CommandArgs, CommandOptions } from '@shared/os/exec'
import type { OutputChannel } from './output/Output'

type InheritedOutputMode = 'inherit' | 'ignore'
type InteractiveOption = 'cwd' | 'addEnv' | 'signal'

/** CommandRunOptions controls a supervised command with optional explicit file input. */
export type CommandRunOptions = CommandOptions & {
  stdin?: FS.File
  stdout?: InheritedOutputMode
  stderr?: InheritedOutputMode
  output?: OutputChannel
  signal?: AbortSignal
  structuredOutput?: boolean
}

/** InteractiveCommandOptions preserves direct terminal ownership without captured output or supplied input. */
export type InteractiveCommandOptions = Pick<CommandRunOptions, InteractiveOption>

/** CommandInteractionMode selects terminal ownership independently of output routing. */
export type CommandInteractionMode = 'interactive' | 'noninteractive'

/** CommandInteractionOperations supplies prompt ownership and shared process execution. */
export type CommandInteractionOperations = {
  isInteractive: () => boolean
  prompt: <T>(action: () => Promise<T>) => Promise<T>
  execute: (
    command: Command,
    args: CommandArgs,
    options: CommandRunOptions,
    mode: CommandInteractionMode,
  ) => Promise<void>
}

/** createCommandRunners makes terminal handoff mandatory for interactive subprocesses. */
export function createCommandRunners(operations: CommandInteractionOperations) {
  return {
    async runInteractiveCommand(
      command: Command,
      args: CommandArgs = [],
      options: InteractiveCommandOptions = {},
    ): Promise<void> {
      UserInput.Require(
        !!operations.isInteractive(),
        'Interactive commands require a terminal. Run this operation in Terminal.',
      )
      await operations.prompt(() => operations.execute(command, args, options, 'interactive'))
    },
    runNonInteractiveCommand: (command: Command, args: CommandArgs = [], options: CommandRunOptions = {}) =>
      operations.execute(command, args, options, 'noninteractive'),
  }
}
