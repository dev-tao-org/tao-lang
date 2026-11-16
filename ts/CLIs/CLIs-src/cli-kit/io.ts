import { Errors, NewlineCharacter, Regxs } from '@shared'
import { Path, Repo, Terminal, Text } from '@shared/os'
import { createFileOutput } from './output/Files'
import * as Output from './output/Output'
import { createPlainOutput } from './output/Plain'
import { encodeOutputMessage } from './output/ProcessOutput'
import { createPromptLifecycle } from './output/PromptLifecycle'

/** IO routes direct and process-scoped output through one presentation and file policy. */
export const IO = {
  print: (...values: unknown[]) => output.main.print(...values),
  warn: (...values: unknown[]) => output.main.warn(...values),
  printToStdErr: (...values: unknown[]) => output.main.printToStdErr(...values),
  progress: (message: string) => output.main.progress(message),
  summary: (...values: unknown[]) => output.main.summary(...values),
  channel: (options: { title: string }) => output.channel(options.title),
  askConfirm: askConfirmation,
  askTerminalConfirmation,
  askSecret,
  prompt: withPrompt,
  setCommands(commands: readonly Output.OutputCommand[]) {
    output.setCommands(commands)
    if (!tui && !suspendedTui) {
      printCommands()
    }
  },
  setPromptRenderer(factory: () => Promise<Output.OutputRenderer>) {
    promptRenderer = factory
  },
  config: configureOutput,
  finish: finishOutput,
}

/** IOConfiguration separates terminal routing from dashboard presentation. */
export type IOConfiguration = {
  stdout?: OutputDestination
  stderr?: ErrorOutputDestination
  progress?: ProgressDestination
  logFile?: string
  logDirectory?: LogDirectory
  forwardEvents?: boolean
  passthrough?: boolean
  childEnvironment?: CommandEnvironment
}

/** configuredCommandOutput captures child streams whenever a channel or dashboard owns their display. */
export function configuredCommandOutput(channel?: Output.OutputChannel): ConfiguredCommandOutput {
  const selected = channel ?? output.main
  return {
    captureCommands: !configuration.passthrough,
    addEnv: configuration.childEnvironment,
    mirrorCommandStderr: configuration.stderr === 'both',
    stdoutPipe: selected.stdout,
    stderrPipe: selected.stderr,
    progressPipe: selected.progress,
    receive: selected.receive,
  }
}

/** ConfiguredCommandOutput exposes the active child-output pipes and routing policy. */
export type ConfiguredCommandOutput = {
  captureCommands: boolean
  addEnv?: CommandEnvironment
  mirrorCommandStderr: boolean
  stdoutPipe(text: Output.OutputText): void
  stderrPipe(text: Output.OutputText): void
  progressPipe(message: string): void
  receive(message: Output.OutputEventMessage): void
}

type EnvironmentValue = string | undefined
type CommandEnvironment = Readonly<Record<string, EnvironmentValue>>

/** renderOutput installs the sole terminal renderer for this process. */
export function renderOutput(renderer: Output.OutputRenderer): void {
  tui = true
  activeRenderer = renderer
  output.render(renderer)
}

type OutputText = string | Uint8Array
type OutputPipe = (text: OutputText) => void
type OutputDestination = 'terminal' | 'log' | OutputPipe
type ErrorOutputDestination = 'terminal' | 'both' | 'log' | OutputPipe
type ProgressDestination = 'terminal' | 'log' | 'both'
type LogDirectory = 'agent' | 'dev'
type OutputStatus = 'passed' | 'failed'
let configuration: IOConfiguration = {}
let plainOutput = createPlainOutput()
let writeFileOutput = createFileOutput({}, announceLog)
let tui = false
let suspendedTui = false
type ActiveOutputRenderer = Output.OutputRenderer | undefined
let activeRenderer: ActiveOutputRenderer
let diagnostics = { warn: 0, error: 0 }
let warningDetails: string[] = []
let output = Output.createOutput(writeOutput)
type PromptRendererFactory = (() => Promise<Output.OutputRenderer>) | undefined
let promptRenderer: PromptRendererFactory
const promptLifecycle = createPromptLifecycle({
  async suspend() {
    if (!tui) {
      return false
    }
    suspendedTui = true
    await output.finish()
    tui = false
    activeRenderer = undefined
    return true
  },
  async resume() {
    if (promptRenderer) {
      renderOutput(await promptRenderer())
      suspendedTui = false
    }
  },
  reportResumeFailure(error) {
    IO.warn('Could not restore terminal output after the prompt:', error)
  },
})

type ConfirmationArguments = Parameters<typeof Terminal.askConfirm>

function askConfirmation(...args: ConfirmationArguments): Promise<boolean> {
  const [options, terminal] = args
  const renderer = activeRenderer
  if (!terminal && renderer?.readInput) {
    return promptLifecycle.runEmbedded(() =>
      Terminal.askConfirm(options, {
        isInteractive: () => true,
        open: () => ({
          question: (message, request) => readPaneInput(renderer, { message, signal: request.signal }),
          close() {},
        }),
        write: message => IO.progress(message),
      })
    )
  }
  return withPrompt(() => Terminal.askConfirm(...args))
}

function askTerminalConfirmation(options: ConfirmationArguments[0]): Promise<boolean> {
  return withPrompt(() => Terminal.askConfirm(options))
}

function askSecret(message: string): Promise<string> {
  const renderer = activeRenderer
  if (renderer?.readInput) {
    return promptLifecycle.runEmbedded(() => readPaneInput(renderer, { message, secret: true }))
  }
  return withPrompt(() => Terminal.askSecret(message))
}

async function readPaneInput(renderer: Output.OutputRenderer, request: Output.OutputInputRequest): Promise<string> {
  IO.progress(request.message)
  return await renderer.readInput!(request)
}

function withPrompt<T>(prompt: () => Promise<T>): Promise<T> {
  return promptLifecycle.run(prompt)
}

function configureOutput(options: IOConfiguration): void {
  if (tui) {
    Errors.ThrowShouldNeverHappen('Cannot reconfigure output while a TUI is active.')
  }
  configuration = options
  diagnostics = { warn: 0, error: 0 }
  warningDetails = []
  plainOutput = createPlainOutput()
  writeFileOutput = createFileOutput(options, announceLog)
  output = Output.createOutput(writeOutput)
  output.main.start()
}

function announceLog(message: string): void {
  if (tui || suspendedTui) {
    output.main.progress(message.trimEnd())
  } else {
    Terminal.stderr.write(message)
  }
}

function writeOutput(event: Output.OutputEvent): void {
  const mode = configuration[event.stream] ?? 'terminal'
  if (configuration.passthrough) {
    plainOutput.write(event)
    return
  }
  writeFileOutput(event)
  countDiagnostic(event)
  if (configuration.forwardEvents) {
    Terminal.stdout.write(encodeOutputMessage(event))
    return
  }
  if (typeof mode === 'function') {
    mode(event.text)
    return
  }
  const visiblePlainOutput = !tui && !suspendedTui
  if (visiblePlainOutput && (mode !== 'log' || event.summary)) {
    plainOutput.write(event)
    printCommands()
  }
}

function printCommands(): void {
  const commands = output.snapshot().commands
  if (commands.length && configuration.stderr !== 'log') {
    Terminal.stderr.write(Output.formatCommands(commands, Terminal.stderr.isTTY === true) + NewlineCharacter)
  }
}

function countDiagnostic(event: Output.OutputEvent): void {
  if (event.level === 'info') {
    return
  }
  diagnostics[event.level]++
  if (event.level === 'warn') {
    if (!configuration.forwardEvents) {
      warningDetails.push(formatWarningDetail(event))
    }
  } else if (shouldReportQuietError()) {
    Terminal.stderr.write('Error recorded: See the log for details.' + NewlineCharacter)
  } else {
    // Other errors are already routed, or the quiet-mode notice was printed for the first error.
  }
}

function shouldReportQuietError(): boolean {
  const isFirstQuietError = diagnostics.error === 1 && isQuiet()
  const isLocalOutput = !configuration.forwardEvents && !tui && !suspendedTui
  return isFirstQuietError && isLocalOutput
}

function formatWarningDetail(event: Output.OutputEvent): string {
  const channel = event.main ? '' : `[${event.channel.title}] `
  const message = Text.stripAnsi(event.text).replace(Regxs.DiagnosticWhitespaceRunsRegx, ' ').trim()
  return `Warning: ${channel}${message}`.slice(0, 240)
}

function isQuiet(): boolean {
  return configuration.stdout === 'log' && configuration.stderr === 'log'
}

async function finishOutput(status: OutputStatus = 'passed'): Promise<void> {
  const wasTui = tui
  if (wasTui) {
    writeChannelCompletions()
    writeCompletionNotices(status)
  }
  output.main.finish(status)
  await output.finish()
  tui = false
  suspendedTui = false
  activeRenderer = undefined
  if (wasTui) {
    // The final pane snapshots already include partial lines buffered by plain presentation.
    plainOutput = createPlainOutput()
  } else {
    plainOutput.finish()
    writeCompletionNotices(status)
  }
}

function writeChannelCompletions(): void {
  for (const state of output.snapshot().channels) {
    output.main.progress('[' + state.title + '] ' + Output.formatChannelCompletion(state))
  }
}

function writeCompletionNotices(status: OutputStatus): void {
  if (configuration.forwardEvents || configuration.passthrough) {
    return
  }
  const hasDiagnostics = diagnostics.warn > 0 || diagnostics.error > 0
  if (!isQuiet() && !hasDiagnostics) {
    return
  }
  const notice = formatCompletionNotice(status)
  if (tui) {
    for (const warning of warningDetails) {
      output.main.progress(warning)
    }
    output.main.progress(notice)
  } else {
    Terminal.stderr.write(notice + NewlineCharacter)
    for (const warning of warningDetails) {
      Terminal.stderr.write(warning + NewlineCharacter)
    }
  }
}

function formatCompletionNotice(status: OutputStatus): string {
  const verdict = status === 'passed' ? 'Completed' : 'Failed'
  const notices = diagnostics.warn + ' warning(s), ' + diagnostics.error + ' error(s)'
  const logPath = Path.relative(Repo.getWorkspaceRoot(), writeFileOutput.path)
  return verdict + ': ' + notices + '. Logs: ' + logPath
}
