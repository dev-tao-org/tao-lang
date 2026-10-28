import { Errors, Regxs, Time, Try } from '@shared'
import { Env, FileSystem, Lifecycle, Platform, Streams } from '@shared/os'
import { configuredCommandOutput } from './io'
import type { OutputChannel } from './output/Output'
import { createProcessOutput } from './output/ProcessOutput'

/** runCommand runs a space-separated command and throws on failure.
 *  Prefer strings without shell quoting or expansion; use an argv array to preserve spaces inside arguments.
 *  variadicArgs appends arguments unchanged after the command's own arguments.
 *  Output follows IO.config; logged commands mirror stderr even for ignored probes. */
export async function runCommand(command: Command, options: RunOptions = {}): Promise<void> {
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
    await (output.captureCommands || options.signal
      ? runLoggedCommand(command, options, output)
      : runInheritedCommand(command, options))
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

/** runSteps awaits variadic workflow stages in order and stops when a stage throws. */
export async function runSteps(...steps: readonly (() => CommandStepResult)[]): Promise<void> {
  for (const step of steps) {
    await step()
  }
}

type OutputText = string | Uint8Array
type CommandStepResult = void | Promise<void>
type OutputPipe = (text: OutputText) => void
type Command = string | readonly string[]
type EnvironmentValue = string | undefined
type InheritedStreamMode = 'inherit' | 'ignore'
type ChildShutdown = Promise<void> | undefined
type ProcessSignal = string | null
type RunOptions = {
  variadicArgs?: readonly string[]
  cwd?: string
  env?: Record<string, EnvironmentValue>
  stdin?: FileSystem.File
  stdout?: InheritedStreamMode
  stderr?: InheritedStreamMode
  output?: OutputChannel
  signal?: AbortSignal
  structuredOutput?: boolean
}

async function runLoggedCommand(
  command: Command,
  options: RunOptions,
  output: ReturnType<typeof configuredCommandOutput>,
): Promise<void> {
  const child = Platform.spawn(command, {
    variadicArgs: options.variadicArgs,
    cwd: options.cwd,
    env: {
      ...Env.snapshot(),
      ...options.env,
      TERMINAL_UI: '0',
      TERMINAL_OUTPUT: '1',
      OUTPUT_LOG_FILE: undefined,
      CLI_OUTPUT_EVENTS: options.structuredOutput ? '1' : undefined,
    },
    stdin: options.stdin ?? (options.output ? 'ignore' : 'inherit'),
    stdout: options.stdout === 'ignore' ? 'ignore' : 'pipe',
    stderr: 'pipe',
  })
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
  options: RunOptions,
  output: ReturnType<typeof configuredCommandOutput>,
): OutputPipe {
  return options.stderr === 'ignore' && !output.mirrorCommandStderr ? () => {} : output.stderrPipe
}

async function runInheritedCommand(command: Command, options: RunOptions): Promise<void> {
  const child = Platform.spawn(command, {
    variadicArgs: options.variadicArgs,
    cwd: options.cwd,
    env: { ...Env.snapshot(), ...options.env },
    stdin: options.stdin ?? 'inherit',
    stdout: options.stdout === 'ignore' ? 'ignore' : 'inherit',
    stderr: options.stderr ?? 'inherit',
  })
  const shutdown = manageShutdown(child, options.signal)
  await Try(async () => {
    requireCommandSuccess(command, options, await child.exited, child.signalCode)
    shutdown.assertCompleted()
  }, { finally: () => shutdown.dispose() })
}

function requireCommandSuccess(command: Command, options: RunOptions, status: number, signal: ProcessSignal): void {
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

function commandArguments(command: Command, options: RunOptions): string[] {
  return [
    ...typeof command === 'string' ? command.trim().split(Regxs.SpacesRegx) : command,
    ...options.variadicArgs ?? [],
  ]
}

async function forwardOutput(
  stream: Streams.ByteStream,
  pipe: OutputPipe,
  receive: ReturnType<typeof configuredCommandOutput>['receive'],
): Promise<void> {
  const output = createProcessOutput(pipe, receive)
  await Streams.consume(stream, output.write)
  output.finish()
}
