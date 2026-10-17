import { Errors, Time, Try } from '@shared'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'node:util'

/** repositoryRoot locates the active checkout independently of the caller's directory. */
export const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')

let agentLog: string | undefined
let logUnavailable = false

function logToFile(text: string | Uint8Array): boolean {
  if (logUnavailable) {
    return false
  }
  return Try(() => {
    if (!agentLog) {
      agentLog = process.env.TAO_AGENT_LOG
        ?? `${repositoryRoot}/.artifacts/logs/agent/${new Date().toISOString().replaceAll(':', '-')}-${process.pid}.log`
      mkdirSync(dirname(agentLog), { recursive: true })
    }
    appendFileSync(agentLog, text)
    return true
  }, {
    catch: error => {
      logUnavailable = true
      process.stderr.write(`Agent log unavailable: ${Errors.messageOf(error)}\n`)
      return false
    },
  })
}

function writeOutput(text: string | Uint8Array, stderr = false, terminalOnly = false): void {
  const agent = process.env.TAO_AGENT === '1'
  if (stderr) {
    process.stderr.write(text)
    if (agent) {
      logToFile(text)
    }
    return
  }
  if (terminalOnly || !agent) {
    process.stdout.write(text)
  } else if (!logToFile(text)) {
    process.stdout.write(text)
  }
}

function outputMethods(terminalOnly = false) {
  const output = (...args: unknown[]): void => writeOutput(`${format(...args)}\n`, false, terminalOnly)
  const error = (...args: unknown[]): void => writeOutput(`${format(...args)}\n`, true, terminalOnly)
  return {
    info: output,
    debug: output,
    log: output,
    warn: error,
    error,
    stderr: (text: string | Uint8Array): void => writeOutput(text, true, terminalOnly),
  }
}

/** TUI exposes terminal output methods independently of the active agent mode. */
export const TUI = outputMethods(true)

/** IO writes developer output to the terminal and agent output to .artifacts/logs/agent.
 Set TAO_AGENT=1 for agent mode; stderr always reaches both the terminal and log in that mode.
 TAO_AGENT_LOG optionally selects the log file, primarily for isolated command probes. */
export const IO = outputMethods()

/** setAgentIO enables agent logging, including for direct agent CLI invocation. */
export function setAgentIO(): void {
  process.env.TAO_AGENT = '1'
}

async function forwardStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader()
  await Try(async () => {
    while (true) {
      const result = await reader.read()
      if (result.done) {
        return
      }
      IO.stderr(result.value)
    }
  }, { finally: () => reader.releaseLock() })
}

/** runCommand runs argv or a space-separated command and throws on failure.
 Strings have no shell quoting or expansion; use an array to preserve spaces inside arguments.
 Agent stderr is always mirrored, even when a developer probe requests stderr: 'ignore'. */
export async function runCommand(command: string | readonly string[], options: {
  cwd?: string
  stdout?: 'inherit' | 'ignore'
  stderr?: 'inherit' | 'ignore'
} = {}): Promise<void> {
  const args = typeof command === 'string' ? command.trim().split(/ +/) : [...command]
  if (!args[0]) {
    Errors.ThrowUserInput('A command is required.')
  }
  const label = args.join(' ')
  IO.info(`RUN CMD: ${label}`)
  const started = Time.nowMs()
  await Try(async () => {
    const agent = process.env.TAO_AGENT === '1'
    const spawnOptions = { cwd: options.cwd, stdin: 'inherit' as const, stdout: options.stdout ?? 'inherit' }
    let status: number
    let signal: string | null
    if (agent) {
      const child = Bun.spawn(args, { ...spawnOptions, stderr: 'pipe' })
      const [completed] = await Promise.all([child.exited, forwardStderr(child.stderr)])
      status = completed
      signal = child.signalCode
    } else {
      const child = Bun.spawn(args, { ...spawnOptions, stderr: options.stderr ?? 'inherit' })
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
    finally: () => IO.info(`[${((Time.nowMs() - started) / 1000).toFixed(2)}s] (${label})`),
  })
}

/** runSteps awaits variadic workflow stages in order and stops when a stage throws. */
export async function runSteps(...steps: readonly (() => void | Promise<void>)[]): Promise<void> {
  for (const step of steps) {
    await step()
  }
}
