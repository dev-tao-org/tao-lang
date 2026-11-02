import { Errors, Regxs, Time, Try } from '@shared'
import { Lifecycle, Platform, Streams, Terminal } from '@shared/os'
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
      ? runLoggedCommand(command, options, output)
      : runInheritedCommand(command, options, mode))
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
    const spawnOptions = createForegroundOptions(options)
    const child = Platform.spawnInherited(command, spawnOptions)
    let stopping: ChildShutdown
    const stop = Lifecycle.onTermination(() => stopping ??= Lifecycle.stopProcess(child, 10_000))
    await Try(async () => {
      const status = await child.exited
      if (!stopping) {
        requireCommandSuccess(command, options, status, child.signalCode)
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
  return { ...options, stdin: 'inherit' as const }
}

type OutputText = string | Uint8Array

type OutputPipe = (text: OutputText) => void
type EnvironmentValue = string | undefined
type InheritedStreamMode = 'inherit' | 'ignore'
type CapturedStreamMode = 'ignore' | 'pipe'
type ChildShutdown = Promise<void> | undefined
type ProcessSignal = string | null
type ChildSpawnOptions<In extends Platform.ChildProcessInput> = {
  variadicArgs?: readonly string[]
  cwd?: string
  addEnv?: Record<string, EnvironmentValue>
  stdin?: In
}
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
  command: CommandInteraction.Command,
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
  const spawnOptions: ChildSpawnOptions<Platform.ChildProcessInput> = {
    variadicArgs: options.variadicArgs,
    cwd: options.cwd,
    addEnv: environment,
    stdin: options.stdin ?? 'ignore',
  }
  const stdout = options.stdout === 'ignore' ? 'ignore' : 'pipe'
  const child = spawnLoggedCommand(command, spawnOptions, stdout)
  const shutdown = manageShutdown(child, options.signal)
  await Try(async () => {
    const [status] = await Promise.all([
      child.exited,
      forwardOutput(child.stderr, commandStderr(options, output), output.receive),
      child.stdout ? forwardOutput(child.stdout, output.stdoutPipe, output.receive) : undefined,
    ])
    requireCommandSuccess(command, options, status, child.signalCode)
    shutdown.assertCompleted()
  }, {
    async catch(error) {
      await Lifecycle.stopProcess(child, 10_000)
      Errors.Throw(error)
    },
    finally: () => shutdown.dispose(),
  })
}

function spawnLoggedCommand<In extends Platform.ChildProcessInput>(
  command: CommandInteraction.Command,
  options: ChildSpawnOptions<In>,
  stdout: CapturedStreamMode,
) {
  if (stdout === 'ignore') {
    return Platform.spawnStderrPiped(command, options)
  }
  return Platform.spawnPiped(command, options)
}

function manageShutdown(child: Platform.ChildProcess, signal?: AbortSignal) {
  let stopping: ChildShutdown
  const stop = () => {
    stopping ??= Lifecycle.stopProcess(child, 10_000)
  }
  const unsubscribe = Lifecycle.onTermination(stop)
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
  command: CommandInteraction.Command,
  options: CommandInteraction.CommandRunOptions,
  mode: CommandInteraction.CommandInteractionMode,
): Promise<void> {
  const output = configuredCommandOutput(options.output)
  const environment = { ...output.addEnv, ...options.addEnv }
  const spawnOptions: ChildSpawnOptions<Platform.ChildProcessInput> = {
    variadicArgs: options.variadicArgs,
    cwd: options.cwd,
    stdin: mode === 'interactive' ? 'inherit' : options.stdin ?? 'ignore',
    addEnv: environment,
  }
  const stdout = options.stdout === 'ignore' ? 'ignore' : 'inherit'
  const stderr = options.stderr ?? 'inherit'
  const child = spawnInheritedCommand(command, spawnOptions, stdout, stderr)
  const shutdown = manageShutdown(child, options.signal)
  await Try(async () => {
    requireCommandSuccess(command, options, await child.exited, child.signalCode)
    shutdown.assertCompleted()
  }, { finally: () => shutdown.dispose() })
}

function spawnInheritedCommand<In extends Platform.ChildProcessInput>(
  command: CommandInteraction.Command,
  options: ChildSpawnOptions<In>,
  stdout: InheritedStreamMode,
  stderr: InheritedStreamMode,
) {
  if (stdout === 'inherit') {
    if (stderr === 'inherit') {
      return Platform.spawnInherited(command, options)
    }
    return Platform.spawnStdoutInherited(command, options)
  }
  if (stderr === 'inherit') {
    return Platform.spawnStderrInherited(command, options)
  }
  return Platform.spawnSilent(command, options)
}

function requireCommandSuccess(
  command: CommandInteraction.Command,
  options: CommandInteraction.CommandRunOptions,
  status: number,
  signal: ProcessSignal,
): void {
  if (status !== 0) {
    const args = commandArguments(command, options)
    Errors.ThrowCommandExecution({
      command: args[0],
      args: args.slice(1),
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
