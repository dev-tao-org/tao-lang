import { Errors, Regxs, Time, Try } from '@shared'
import { Exec, Process, Streams, Terminal } from '@shared/os'
import * as CommandInteraction from './CommandInteraction'
import { type ConfiguredCommandOutput, configuredCommandOutput, IO } from './io'
import { createProcessOutput } from './output/ProcessOutput'

/** runNonInteractiveCommand runs a supervised command with explicit file input or immediate EOF.
 *  Prefer strings without shell quoting or expansion; use an argv array to preserve spaces inside arguments.
 *  variadicArgs appends arguments unchanged after the command's own arguments.
 *  Output follows IO.config; tool-specific batch flags still own prompts outside stdin. */
export async function runNonInteractiveCommand(
  command: CommandInteraction.Command,
  options: CommandInteraction.CommandRunOptions = {},
): Promise<void> {
  await runners.runNonInteractiveCommand(command, options)
}

/** runInteractiveCommand lends the terminal to a supervised child and restores the dashboard afterward.
 *  Child input and output bypass capture so passwords remain outside command logs. */
export async function runInteractiveCommand(
  command: CommandInteraction.Command,
  options: CommandInteraction.InteractiveCommandOptions = {},
): Promise<void> {
  await runners.runInteractiveCommand(command, options)
}

type CommandStepResult = void | Promise<void>
/** runSteps awaits variadic workflow stages in order and stops when a stage throws. */
export async function runSteps(...steps: readonly (() => CommandStepResult)[]): Promise<void> {
  for (const step of steps) {
    await step()
  }
}

const runners = CommandInteraction.createCommandRunners({
  isInteractive: () => Terminal.isInteractive() && Terminal.stderr.isTTY === true,
  prompt: IO.prompt,
  execute: executeCommand,
})

async function executeCommand(
  command: CommandInteraction.Command,
  options: CommandInteraction.CommandRunOptions,
  mode: CommandInteraction.CommandInteractionMode,
): Promise<void> {
  const args = commandArguments(command, options)
  if (!args[0]) {
    Errors.ThrowUserInput('A command is required.')
  }
  const label = args.join(' ')
  if (options.signal?.aborted) {
    Errors.ThrowHostEnvironment('Command cancelled before starting.')
  }
  const output = configuredCommandOutput(options.output)
  options.output?.start()
  output.progressPipe(`RUN CMD: ${label}`)
  const started = Time.nowMs()
  await Try(async () => {
    await (shouldCaptureChildOutput(mode, options, output)
      ? runLoggedCommand(args, options, output)
      : runInheritedCommand(args, options, mode))
    if (options.signal?.aborted) {
      Errors.ThrowHostEnvironment('Command interrupted.')
    }
  }, {
    finally(_thrown, error) {
      options.output?.finish(error ? 'failed' : 'passed')
      output.progressPipe(`[${((Time.nowMs() - started) / 1000).toFixed(2)}s] (${label})`)
    },
  })
}

/** runForegroundCommand gives an interactive child its real terminal and drains cooperative shutdown on Ctrl+C. */
export async function runForegroundCommand(
  command: CommandInteraction.Command,
  options: ForegroundOptions = {},
): Promise<void> {
  await IO.prompt(async () => {
    const args = commandArguments(command, options)
    const spawnOptions = createForegroundOptions(options)
    const child = Exec.spawn(args[0], args.slice(1), spawnOptions)
    let stopping: ChildShutdown
    const stop = Process.onTermination(() => stopping ??= Exec.stopProcess(child, 10_000))
    await Try(async () => {
      const status = await child.exited
      if (!stopping) {
        requireCommandSuccess(args, options, status, child.signalCode)
      }
    }, {
      async finally() {
        stop()
        await stopping
      },
    })
  })
}

type ForegroundOption = 'variadicArgs' | 'cwd' | 'addEnv'
type ForegroundOptions = Pick<CommandInteraction.CommandRunOptions, ForegroundOption>

function createForegroundOptions(options: ForegroundOptions) {
  const { cwd, addEnv } = options
  return { cwd, addEnv, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' } as const
}

type OutputText = string | Uint8Array

type OutputPipe = (text: OutputText) => void
type CapturedStreamMode = 'pipe' | 'ignore'
type InheritedStreamMode = 'inherit' | 'ignore'
type ChildShutdown = Promise<void> | undefined
type ProcessSignal = string | null
function shouldCaptureChildOutput(
  mode: CommandInteraction.CommandInteractionMode,
  options: CommandInteraction.CommandRunOptions,
  output: ConfiguredCommandOutput,
): boolean {
  if (mode === 'interactive') {
    return false
  }
  return output.captureCommands || options.signal !== undefined
}

async function runLoggedCommand(
  args: readonly string[],
  options: CommandInteraction.CommandRunOptions,
  output: ConfiguredCommandOutput,
): Promise<void> {
  const environment = {
    ...output.addEnv,
    ...options.addEnv,
    TERMINAL_UI: '0',
    TERMINAL_OUTPUT: '1',
    OUTPUT_LOG_FILE: undefined,
    CLI_OUTPUT_EVENTS: options.structuredOutput ? '1' : undefined,
  }
  const spawnOptions: Exec.SpawnOptions<Exec.ChildProcessInput, CapturedStreamMode> = {
    cwd: options.cwd,
    addEnv: environment,
    stdin: options.stdin ?? 'ignore',
    stdout: options.stdout === 'ignore' ? 'ignore' : 'pipe',
  }
  const child = Exec.spawn(args[0], args.slice(1), spawnOptions)
  const shutdown = manageShutdown(child, options.signal)
  await Try(async () => {
    const [status] = await Promise.all([
      child.exited,
      forwardOutput(child.stderr, commandStderr(options, output), output.receive),
      child.stdout ? forwardOutput(child.stdout, output.stdoutPipe, output.receive) : undefined,
    ])
    requireCommandSuccess(args, options, status, child.signalCode)
    shutdown.assertCompleted()
  }, {
    async catch(error) {
      await Exec.stopProcess(child, 10_000)
      Errors.Throw(error)
    },
    finally: () => shutdown.dispose(),
  })
}

function manageShutdown(child: Exec.ChildProcess, signal?: AbortSignal) {
  let stopping: ChildShutdown
  const stop = () => {
    stopping ??= Exec.stopProcess(child, 10_000)
  }
  const unsubscribe = Process.onTermination(stop)
  signal?.addEventListener('abort', stop, { once: true })
  if (signal?.aborted) {
    stop()
  }
  return {
    assertCompleted(): void {
      if (stopping) {
        Errors.ThrowHostEnvironment('Command interrupted.')
      }
    },
    async dispose(): Promise<void> {
      unsubscribe()
      signal?.removeEventListener('abort', stop)
      await stopping
    },
  }
}

function commandStderr(
  options: CommandInteraction.CommandRunOptions,
  output: ConfiguredCommandOutput,
): OutputPipe {
  return options.stderr === 'ignore' && !output.mirrorCommandStderr ? () => {} : output.stderrPipe
}

async function runInheritedCommand(
  args: readonly string[],
  options: CommandInteraction.CommandRunOptions,
  mode: CommandInteraction.CommandInteractionMode,
): Promise<void> {
  const output = configuredCommandOutput(options.output)
  const environment = { ...output.addEnv, ...options.addEnv }
  const spawnOptions: Exec.SpawnOptions<Exec.ChildProcessInput, InheritedStreamMode, InheritedStreamMode> = {
    cwd: options.cwd,
    stdin: mode === 'interactive' ? 'inherit' : options.stdin ?? 'ignore',
    addEnv: environment,
    stdout: options.stdout === 'ignore' ? 'ignore' : 'inherit',
    stderr: options.stderr ?? 'inherit',
  }
  const child = Exec.spawn(args[0], args.slice(1), spawnOptions)
  const shutdown = manageShutdown(child, options.signal)
  await Try(async () => {
    requireCommandSuccess(args, options, await child.exited, child.signalCode)
    shutdown.assertCompleted()
  }, { finally: () => shutdown.dispose() })
}

function requireCommandSuccess(
  [command, ...args]: readonly string[],
  options: CommandInteraction.CommandRunOptions,
  status: number,
  signal: ProcessSignal,
): void {
  if (status !== 0) {
    Errors.ThrowCommandExecution({
      command,
      args,
      cwd: options.cwd,
      status,
      signal,
      stdout: '',
      stderr: '',
    })
  }
}

function commandArguments(
  command: CommandInteraction.Command,
  options: CommandInteraction.CommandRunOptions,
): string[] {
  return [
    ...typeof command === 'string' ? command.trim().split(Regxs.SpacesRegx) : command,
    ...options.variadicArgs ?? [],
  ]
}

async function forwardOutput(
  stream: Streams.ByteStream,
  pipe: OutputPipe,
  receive: ConfiguredCommandOutput['receive'],
): Promise<void> {
  const output = createProcessOutput(pipe, receive)
  await Streams.consume(stream, output.write)
  output.finish()
}
