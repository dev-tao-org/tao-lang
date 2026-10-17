import { Errors, Time, Try } from '@shared'
import { appendFileSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'node:util'

/** repositoryRoot locates the active checkout independently of the caller's directory. */
export const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')

let agentLog: string | undefined
let logUnavailable = false

/** TUI exposes terminal output methods independently of the active agent mode. */
export const TUI = outputMethods(true)

/** IO writes developer output to the terminal and agent output to .artifacts/logs/agent.
 *  Set TAO_AGENT=1 for agent mode; stderr always reaches both the terminal and log in that mode.
 *  TAO_AGENT_LOG optionally selects the log file; file logging announces its repo-relative directory once. */
export const IO = outputMethods()

function outputMethods(terminalOnly = false, fileOnly = false) {
  const output = (...args: unknown[]): void => writeOutput(`${format(...args)}\n`, false, terminalOnly, fileOnly)
  const error = (...args: unknown[]): void => writeOutput(`${format(...args)}\n`, true, terminalOnly, fileOnly)
  return {
    info: output,
    debug: output,
    log: output,
    warn: error,
    error,
    stderr: (text: string | Uint8Array): void => writeOutput(text, true, terminalOnly, fileOnly),
  }
}

function writeOutput(text: string | Uint8Array, stderr = false, terminalOnly = false, fileOnly = false): void {
  const logging = fileOnly || process.env.TAO_AGENT === '1'
  if (stderr) {
    if (logging) {
      logToFile(text)
    }
    process.stderr.write(text)
    return
  }
  if (terminalOnly || !logging) {
    process.stdout.write(text)
  } else if (!logToFile(text)) {
    process.stdout.write(text)
  }
}

function logToFile(text: string | Uint8Array): boolean {
  if (logUnavailable) {
    return false
  }
  return Try(() => {
    if (!agentLog) {
      agentLog = process.env.TAO_AGENT_LOG
        ?? `${repositoryRoot}/.artifacts/logs/${process.env.TAO_AGENT === '1' ? 'agent' : 'dev'}/${
          new Date().toISOString().replaceAll(':', '-')
        }-${process.pid}.log`
      mkdirSync(dirname(agentLog), { recursive: true })
      const announcement = `Logs: ${relative(realpathSync(repositoryRoot), realpathSync(dirname(agentLog))) || '.'}/\n`
      appendFileSync(agentLog, announcement)
      process.stderr.write(announcement)
    }
    appendFileSync(agentLog, text)
    return true
  }, {
    catch: error => {
      logUnavailable = true
      process.stderr.write(`Command log unavailable: ${Errors.messageOf(error)}\n`)
      return false
    },
  })
}

/** setAgentIO enables agent logging, including for direct agent CLI invocation. */
export function setAgentIO(): void {
  process.env.TAO_AGENT = '1'
}

/** runCommand runs a space-separated command and throws on failure.
 *  Prefer strings without shell quoting or expansion; use an argv array to preserve spaces inside arguments.
 *  Agent commands and stdout: 'log' write stdout to files and mirror stderr even for ignored probes. */
export async function runCommand(command: string | readonly string[], options: {
  cwd?: string
  stdout?: 'inherit' | 'ignore' | 'log'
  stderr?: 'inherit' | 'ignore'
} = {}): Promise<void> {
  const args = typeof command === 'string' ? command.trim().split(/ +/) : [...command]
  if (!args[0]) {
    Errors.ThrowUserInput('A command is required.')
  }
  const label = args.join(' ')
  const output = options.stdout === 'log' ? outputMethods(false, true) : IO
  output.info(`RUN CMD: ${label}`)
  const started = Time.nowMs()
  await Try(async () => {
    const logging = process.env.TAO_AGENT === '1' || options.stdout === 'log'
    const spawnOptions = { cwd: options.cwd, stdin: 'inherit' as const }
    let status: number
    let signal: string | null
    if (logging) {
      const child = Bun.spawn(args, {
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
      const child = Bun.spawn(args, {
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
    catch: error => {
      if (Errors.isTaoError(error)) {
        Errors.Throw(error)
      }
      Errors.ThrowHostEnvironment(`Unable to run ${label}: ${Errors.messageOf(error)}`)
    },
    finally: () => output.info(`[${((Time.nowMs() - started) / 1000).toFixed(2)}s] (${label})`),
  })
}

async function forwardOutput(stream: ReadableStream<Uint8Array>, stderr: boolean): Promise<void> {
  const reader = stream.getReader()
  await Try(async () => {
    while (true) {
      const result = await reader.read()
      if (result.done) {
        return
      }
      writeOutput(result.value, stderr, false, true)
    }
  }, { finally: () => reader.releaseLock() })
}

/** runSteps awaits variadic workflow stages in order and stops when a stage throws. */
export async function runSteps(...steps: readonly (() => void | Promise<void>)[]): Promise<void> {
  for (const step of steps) {
    await step()
  }
}
