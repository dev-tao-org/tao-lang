import { Errors } from '@shared'
import type { Exec, FS } from '@shared/os'
import type { OutputChannel } from './output/Output'

/** Command identifies an executable with optional space-separated arguments or explicit argv. */
export type Command = string | readonly string[]

type InheritedOutputMode = 'inherit' | 'ignore'
type InteractiveOption = 'variadicArgs' | 'cwd' | 'addEnv' | 'signal'

/** CommandRunOptions controls a supervised command with optional explicit file input. */
export type CommandRunOptions = Exec.CommandOptions & {
  variadicArgs?: readonly string[]
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
  execute: (command: Command, options: CommandRunOptions, mode: CommandInteractionMode) => Promise<void>
}

/** createCommandRunners makes terminal handoff mandatory for interactive subprocesses. */
export function createCommandRunners(operations: CommandInteractionOperations) {
  return {
    async runInteractiveCommand(command: Command, options: InteractiveCommandOptions = {}): Promise<void> {
      if (!operations.isInteractive()) {
        Errors.ThrowUserInput('Interactive commands require a terminal. Run this operation in Terminal.')
      }
      await operations.prompt(() => operations.execute(command, options, 'interactive'))
    },
    runNonInteractiveCommand: (command: Command, options: CommandRunOptions = {}) =>
      operations.execute(command, options, 'noninteractive'),
  }
}
