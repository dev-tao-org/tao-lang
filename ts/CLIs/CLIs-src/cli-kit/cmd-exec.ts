import { Errors, Time, Try } from '@shared'
import { FileSystem, Platform, Streams } from '@shared/os'
import { configuredCommandOutput } from './io'

type OutputPipe = (text: string | Uint8Array) => void
type Command = string | readonly string[]
type RunOptions = {
  variadicArgs?: readonly string[]
  cwd?: string
  stdin?: FileSystem.File
  stdout?: 'inherit' | 'ignore'
  stderr?: 'inherit' | 'ignore'
}

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
  const output = configuredCommandOutput()
  output.progressPipe(`RUN CMD: ${label}`)
  const started = Time.nowMs()
  await Try(() =>
    output.captureCommands
      ? runLoggedCommand(command, options, output)
      : runInheritedCommand(command, options), {
    finally() {
      output.progressPipe(`[${((Time.nowMs() - started) / 1000).toFixed(2)}s] (${label})`)
    },
  })
}

async function runLoggedCommand(
  command: Command,
  options: RunOptions,
  output: ReturnType<typeof configuredCommandOutput>,
): Promise<void> {
  const child = Platform.spawn(command, {
    variadicArgs: options.variadicArgs,
    cwd: options.cwd,
    stdin: options.stdin ?? 'inherit',
    stdout: options.stdout === 'ignore' ? 'ignore' : 'pipe',
    stderr: 'pipe',
  })
  await Try(async () => {
    const [status] = await Promise.all([
      child.exited,
      forwardOutput(child.stderr, commandStderr(options, output)),
      child.stdout ? forwardOutput(child.stdout, output.stdoutPipe) : undefined,
    ])
    requireCommandSuccess(command, options, status, child.signalCode)
  }, {
    async catch(error) {
      await Platform.terminate(child)
      Errors.Throw(error)
    },
  })
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
    stdin: options.stdin ?? 'inherit',
    stdout: options.stdout === 'ignore' ? 'ignore' : 'inherit',
    stderr: options.stderr ?? 'inherit',
  })
  requireCommandSuccess(command, options, await child.exited, child.signalCode)
}

function requireCommandSuccess(command: Command, options: RunOptions, status: number, signal: string | null): void {
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
  return [...typeof command === 'string' ? command.trim().split(/ +/) : command, ...options.variadicArgs ?? []]
}

async function forwardOutput(stream: Streams.ByteStream, pipe: OutputPipe): Promise<void> {
  await Streams.consume(stream, pipe)
}

/** runSteps awaits variadic workflow stages in order and stops when a stage throws. */
export async function runSteps(...steps: readonly (() => void | Promise<void>)[]): Promise<void> {
  for (const step of steps) {
    await step()
  }
}
