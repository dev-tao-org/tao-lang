import { Errors, Time, Try } from '@shared'
import { Env, FileSystem, Path, Platform, Streams, Terminal, Text } from '@shared/os'

/** repositoryRoot locates the active checkout independently of the caller's directory. */
export const repositoryRoot = Path.fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')

let agentLog: string | undefined
let logUnavailable = false

/** TUI exposes terminal output methods independently of the active agent mode. */
export const TUI = outputMethods(true)

/** IO writes developer output to the terminal and agent output to .artifacts/logs/agent.
 *  Set TAO_AGENT=1 for agent mode; stderr always reaches both the terminal and log in that mode.
 *  TAO_AGENT_LOG optionally selects the log file; file logging announces its repo-relative directory once. */
export const IO = outputMethods()

/** setAgentIO enables agent logging, including for direct agent CLI invocation. */
export function setAgentIO(): void {
  Env.set('TAO_AGENT', '1')
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
  const output = options.stdout === 'log' ? outputMethods(false, true) : IO
  output.info(`RUN CMD: ${label}`)
  const started = Time.nowMs()
  await Try(async () => {
    const logging = Env.is('TAO_AGENT', '1') || options.stdout === 'log'
    const spawnOptions = { cwd: options.cwd, stdin: options.stdin ?? 'inherit' as const }
    let status: number
    let signal: string | null
    if (logging) {
      const child = Platform.spawn(args, {
        ...spawnOptions,
        stdout: options.stdout === 'ignore' ? 'ignore' : 'pipe',
        stderr: 'pipe',
      })
      const [completed] = await Promise.all([
        child.exited,
        forwardOutput(child.stderr, true),
        child.stdout ? forwardOutput(child.stdout, false) : undefined,
      ])
      status = completed
      signal = child.signalCode
    } else {
      const child = Platform.spawn(args, {
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

function outputMethods(terminalOnly = false, fileOnly = false) {
  const output = (...args: unknown[]): void => writeOutput(`${Text.format(...args)}\n`, false, terminalOnly, fileOnly)
  const error = (...args: unknown[]): void => writeOutput(`${Text.format(...args)}\n`, true, terminalOnly, fileOnly)
  return {
    info: output,
    debug: output,
    log: output,
    warn: error,
    error,
    stderr: (text: string | Uint8Array): void => writeOutput(text, true, terminalOnly, fileOnly),
  }
}

async function forwardOutput(stream: Streams.ByteStream, stderr: boolean): Promise<void> {
  await Streams.consume(stream, value => writeOutput(value, stderr, false, true))
}

function writeOutput(text: string | Uint8Array, stderr = false, terminalOnly = false, fileOnly = false): void {
  const logging = fileOnly || Env.is('TAO_AGENT', '1')
  if (stderr) {
    if (logging) {
      logToFile(text)
    }
    Terminal.stderr.write(text)
    return
  }
  if (terminalOnly || !logging) {
    Terminal.stdout.write(text)
  } else if (!logToFile(text)) {
    Terminal.stdout.write(text)
  }
}

function logToFile(text: string | Uint8Array): boolean {
  if (logUnavailable) {
    return false
  }
  return Try(() => {
    if (!agentLog) {
      agentLog = Env.get('TAO_AGENT_LOG')
        ?? `${repositoryRoot}/.artifacts/logs/${Env.is('TAO_AGENT', '1') ? 'agent' : 'dev'}/${
          Time.date().toISOString().replaceAll(':', '-')
        }-${Platform.pid}.log`
      FileSystem.mkdirSync(Path.dirname(agentLog), { recursive: true })
      const announcement = `Logs: ${
        Path.relative(FileSystem.realpathSync(repositoryRoot), FileSystem.realpathSync(Path.dirname(agentLog))) || '.'
      }/\n`
      FileSystem.appendFileSync(agentLog, announcement)
      Terminal.stderr.write(announcement)
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
