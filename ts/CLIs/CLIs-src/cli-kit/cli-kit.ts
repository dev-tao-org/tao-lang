import { Errors, Time, Try } from '@shared'
import { FileSystem, Path, Platform, Streams, Terminal, Text } from '@shared/os'

/** repositoryRoot locates the active checkout independently of the caller's directory. */
export const repositoryRoot = Path.fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')

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
  agentLog = configuration.logFile ? Path.resolve(repositoryRoot, configuration.logFile) : undefined
  logDirectory = configuration.logDirectory ?? 'dev'
  logUnavailable = false
  logAnnounced = false
}

/** runCommand runs a space-separated command and throws on failure.
 *  Prefer strings without shell quoting or expansion; use an argv array to preserve spaces inside arguments.
 *  variadicArgs appends arguments unchanged after the command's own arguments.
 *  Agent commands and stdout: 'log' write stdout to files and mirror stderr even for ignored probes. */
export async function runCommand(command: string | readonly string[], options: {
  variadicArgs?: readonly string[]
  cwd?: string
  stdin?: FileSystem.File
  stdout?: 'inherit' | 'ignore' | 'log'
  stderr?: 'inherit' | 'ignore'
} = {}): Promise<void> {
  const args = typeof command === 'string' ? command.trim().split(/ +/) : [...command]
  if (!args[0]) {
    Errors.ThrowUserInput('A command is required.')
  }
  args.push(...options.variadicArgs ?? [])
  const label = args.join(' ')
  const output = options.stdout === 'log' ? loggedOutput : IO
  output.info(`RUN CMD: ${label}`)
  const started = Time.nowMs()
  await Try(async () => {
    const logging = captureCommands || options.stdout === 'log'
    const spawnOptions = { cwd: options.cwd, stdin: options.stdin ?? 'inherit' as const }
    let status: number
    let signal: string | null
    if (logging) {
      const child = Platform.spawn(command, {
        variadicArgs: options.variadicArgs,
        ...spawnOptions,
        stdout: options.stdout === 'ignore' ? 'ignore' : 'pipe',
        stderr: 'pipe',
      })
      const [completed] = await Promise.all([
        child.exited,
        forwardOutput(
          child.stderr,
          options.stdout === 'log'
            ? loggedStderr
            : options.stderr === 'ignore' && !mirrorCommandStderr
            ? () => {}
            : stderrPipe,
        ),
        child.stdout ? forwardOutput(child.stdout, options.stdout === 'log' ? loggedStdout : stdoutPipe) : undefined,
      ])
      status = completed
      signal = child.signalCode
    } else {
      const child = Platform.spawn(command, {
        variadicArgs: options.variadicArgs,
        ...spawnOptions,
        stdout: options.stdout === 'ignore' ? 'ignore' : 'inherit',
        stderr: options.stderr ?? 'inherit',
      })
      status = await child.exited
      signal = child.signalCode
    }
    if (status !== 0) {
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
  }, {
    finally: () => output.info(`[${((Time.nowMs() - started) / 1000).toFixed(2)}s] (${label})`),
  })
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
    stderr: (text: string | Uint8Array): void => errorPipe(text),
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
    agentLog ??= `${repositoryRoot}/.artifacts/logs/${logDirectory}/${
      Time.date().toISOString().replaceAll(':', '-')
    }-${Platform.pid}.log`
    if (!logAnnounced) {
      FileSystem.mkdirSync(Path.dirname(agentLog), { recursive: true })
      const announcement = `Logs: ${
        Path.relative(FileSystem.realpathSync(repositoryRoot), FileSystem.realpathSync(Path.dirname(agentLog))) || '.'
      }/\n`
      FileSystem.appendFileSync(agentLog, announcement)
      Terminal.stderr.write(announcement)
      logAnnounced = true
    }
    FileSystem.appendFileSync(agentLog, text)
    return true
  }, {
    catch: error => {
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
