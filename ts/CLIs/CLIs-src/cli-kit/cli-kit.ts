import { Errors, Time, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Streams, Terminal, Text } from '@shared/os'

type OutputPipe = (text: string | Uint8Array) => void
type IOConfiguration = {
  stdout?: 'terminal' | 'log' | OutputPipe
  stderr?: 'terminal' | 'both' | OutputPipe
  logFile?: string
  logDirectory?: 'agent' | 'dev'
}

let stdoutPipe: OutputPipe = terminalStdout
let stderrPipe: OutputPipe = terminalStderr
let captureCommands = false
let mirrorCommandStderr = false
let agentLog: string | undefined
let logDirectory: 'agent' | 'dev' = 'dev'
let logUnavailable = false
let logAnnounced = false

/** TUI exposes terminal output independently of configured logging. */
export const TUI = outputMethods(terminalStdout, terminalStderr)

/** IO routes output through channels selected once by each CLI entrypoint. */
export const IO = {
  ...outputMethods(text => stdoutPipe(text), text => stderrPipe(text)),
  config: configureOutput,
}

const loggedOutput = outputMethods(loggedStdout, loggedStderr)

function configureOutput(configuration: IOConfiguration): void {
  stdoutPipe = typeof configuration.stdout === 'function'
    ? configuration.stdout
    : configuration.stdout === 'log'
    ? loggedStdout
    : terminalStdout
  stderrPipe = typeof configuration.stderr === 'function'
    ? configuration.stderr
    : configuration.stderr === 'both'
    ? loggedStderr
    : terminalStderr
  captureCommands = stdoutPipe !== terminalStdout || stderrPipe !== terminalStderr
  mirrorCommandStderr = configuration.stderr === 'both'
  agentLog = configuration.logFile ? Artifacts.resolvePath(Repo.resolvePath(configuration.logFile)) : undefined
  logDirectory = configuration.logDirectory ?? 'dev'
  logUnavailable = false
  logAnnounced = false
}

type Command = string | readonly string[]
type RunOptions = {
  variadicArgs?: readonly string[]
  cwd?: string
  stdin?: FileSystem.File
  stdout?: 'inherit' | 'ignore' | 'log'
  stderr?: 'inherit' | 'ignore'
}

/** runCommand runs a space-separated command and throws on failure.
 *  Prefer strings without shell quoting or expansion; use an argv array to preserve spaces inside arguments.
 *  variadicArgs appends arguments unchanged after the command's own arguments.
 *  Agent commands and stdout: 'log' write stdout to files and mirror stderr even for ignored probes. */
export async function runCommand(command: Command, options: RunOptions = {}): Promise<void> {
  const args = commandArguments(command, options)
  if (!args[0]) {
    Errors.ThrowUserInput('A command is required.')
  }
  const label = args.join(' ')
  const output = options.stdout === 'log' ? loggedOutput : IO
  output.info(`RUN CMD: ${label}`)
  const started = Time.nowMs()
  await Try(() =>
    captureCommands || options.stdout === 'log'
      ? runLoggedCommand(command, options)
      : runInheritedCommand(command, options), {
    finally() {
      return output.info(`[${((Time.nowMs() - started) / 1000).toFixed(2)}s] (${label})`)
    },
  })
}

async function runLoggedCommand(command: Command, options: RunOptions): Promise<void> {
  const child = Platform.spawn(command, {
    variadicArgs: options.variadicArgs,
    cwd: options.cwd,
    stdin: options.stdin ?? 'inherit',
    stdout: options.stdout === 'ignore' ? 'ignore' : 'pipe',
    stderr: 'pipe',
  })
  const [status] = await Promise.all([
    child.exited,
    forwardOutput(child.stderr, commandStderr(options)),
    child.stdout ? forwardOutput(child.stdout, options.stdout === 'log' ? loggedStdout : stdoutPipe) : undefined,
  ])
  requireCommandSuccess(command, options, status, child.signalCode)
}

function commandStderr(options: RunOptions): OutputPipe {
  if (options.stdout === 'log') {
    return loggedStderr
  }
  return options.stderr === 'ignore' && !mirrorCommandStderr ? () => {} : stderrPipe
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

function outputMethods(outputPipe: OutputPipe, errorPipe: OutputPipe) {
  const output = (...args: unknown[]): void => outputPipe(`${Text.format(...args)}\n`)
  const error = (...args: unknown[]): void => errorPipe(`${Text.format(...args)}\n`)
  return {
    info: output,
    debug: output,
    log: output,
    warn: error,
    error,
    stderr(text: string | Uint8Array): void {
      return errorPipe(text)
    },
  }
}

async function forwardOutput(stream: Streams.ByteStream, pipe: OutputPipe): Promise<void> {
  await Streams.consume(stream, pipe)
}

function loggedStdout(text: string | Uint8Array): void {
  if (!logToFile(text)) {
    terminalStdout(text)
  }
}

function loggedStderr(text: string | Uint8Array): void {
  logToFile(text)
  terminalStderr(text)
}

function terminalStdout(text: string | Uint8Array): void {
  Terminal.stdout.write(text)
}

function terminalStderr(text: string | Uint8Array): void {
  Terminal.stderr.write(text)
}

function logToFile(text: string | Uint8Array): boolean {
  if (logUnavailable) {
    return false
  }
  return Try(() => {
    agentLog ??= Artifacts.resolvePath(
      'logs',
      logDirectory,
      `${Time.date().toISOString().replaceAll(':', '-')}-${Platform.pid}.log`,
    )
    if (!logAnnounced) {
      Artifacts.mkdirSync(Path.dirname(agentLog), { recursive: true })
      const announcement = `Logs: ${
        Path.relative(Repo.getWorkspaceRoot(), Artifacts.realpathSync(Path.dirname(agentLog))) || '.'
      }/\n`
      Artifacts.appendFileSync(agentLog, announcement)
      Terminal.stderr.write(announcement)
      logAnnounced = true
    }
    Artifacts.appendFileSync(agentLog, text)
    return true
  }, {
    catch(error) {
      logUnavailable = true
      Terminal.stderr.write(`Command log unavailable: ${Text.format(error)}\n`)
      return false
    },
  })
}

/** runSteps awaits variadic workflow stages in order and stops when a stage throws. */
export async function runSteps(...steps: readonly (() => void | Promise<void>)[]): Promise<void> {
  for (const step of steps) {
    await step()
  }
}
