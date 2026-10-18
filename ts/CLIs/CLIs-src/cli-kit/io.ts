import { Time } from '@shared'
import { Artifacts, Path, Platform, Repo, Terminal, Text } from '@shared/os'

/** IO routes output through channels selected once by each CLI entrypoint. */
export const IO = {
  ...outputMethods(text => stdoutPipe(text), text => stderrPipe(text)),
  config: configureOutput,
  progress: printProgress,
}

/** configuredCommandOutput exposes the configured command streams to cmd-exec. */
export function configuredCommandOutput() {
  return { captureCommands, mirrorCommandStderr, stdoutPipe, stderrPipe, progressPipe: printProgress }
}

type OutputPipe = (text: string | Uint8Array) => void
type IOConfiguration = {
  stdout?: 'terminal' | 'log' | OutputPipe
  stderr?: 'terminal' | 'both' | OutputPipe
  progress?: 'terminal' | 'log' | 'both'
  logFile?: string
  logDirectory?: 'agent' | 'dev'
}

let stdoutPipe: OutputPipe = terminalStdout
let stderrPipe: OutputPipe = terminalStderr
let progressPipe: OutputPipe = terminalStderr
let captureCommands = false
let mirrorCommandStderr = false
let agentLog: string

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
  progressPipe = configuration.progress === 'log'
    ? loggedStdout
    : configuration.progress === 'both'
    ? loggedStderr
    : terminalStderr
  captureCommands = stdoutPipe !== terminalStdout || stderrPipe !== terminalStderr
  mirrorCommandStderr = configuration.stderr === 'both'
  agentLog = configuration.logFile
    ? Repo.resolvePath(configuration.logFile)
    : Artifacts.resolvePath(
      'logs',
      configuration.logDirectory ?? 'dev',
      `${Time.date().toISOString().replaceAll(':', '-')}-${Platform.pid}.log`,
    )
  if (usesLogFiles(configuration)) {
    Artifacts.mkdirSync(Path.dirname(agentLog), { recursive: true })
    const logPath = Path.join(Artifacts.realpathSync(Path.dirname(agentLog)), Path.basename(agentLog))
    const announcement = `Logs: ${Path.relative(Repo.getWorkspaceRoot(), logPath)}\n`
    Artifacts.trackTemporary(agentLog)
    Artifacts.appendFileSync(agentLog, announcement)
    Terminal.stderr.write(announcement)
  }
}

function usesLogFiles(configuration: IOConfiguration): boolean {
  const modes = [configuration.stdout, configuration.stderr, configuration.progress]
  return modes.some(mode => mode === 'log' || mode === 'both')
}

function printProgress(text: string): void {
  progressPipe(`\u001b[90m${text}\u001b[0m\n`)
}

function outputMethods(outputPipe: OutputPipe, errorPipe: OutputPipe) {
  return {
    print(...args: unknown[]): void {
      outputPipe(`${Text.format(...args)}\n`)
    },
    warn(...args: unknown[]): void {
      outputPipe(`\u001b[33m${Text.format(...args)}\u001b[0m\n`)
    },
    printToStdErr(...args: unknown[]): void {
      errorPipe(`\u001b[31m${Text.format(...args)}\u001b[0m\n`)
    },
  }
}

function loggedStdout(text: string | Uint8Array): void {
  logToFile(text)
}

function loggedStderr(text: string | Uint8Array): void {
  terminalStderr(text)
  logToFile(text)
}

function terminalStdout(text: string | Uint8Array): void {
  Terminal.stdout.write(text)
}

function terminalStderr(text: string | Uint8Array): void {
  Terminal.stderr.write(text)
}

function logToFile(text: string | Uint8Array): void {
  Artifacts.appendFileSync(agentLog, text)
}
