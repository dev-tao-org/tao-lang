import { Errors } from '@shared'
import { Path, Repo, Terminal, Text } from '@shared/os'
import { createFileOutput } from './output/Files'
import {
  createOutput,
  formatChannelCompletion,
  type OutputChannel,
  type OutputEvent,
  type OutputRenderer,
} from './output/Output'
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
  prompt: withPrompt,
  setPromptRenderer(factory: () => Promise<OutputRenderer>) {
    promptRenderer = factory
  },
  config: configureOutput,
  finish: finishOutput,
}

/** IOConfiguration separates terminal routing from dashboard presentation. */
export type IOConfiguration = {
  stdout?: 'terminal' | 'log' | OutputPipe
  stderr?: 'terminal' | 'both' | 'log' | OutputPipe
  progress?: 'terminal' | 'log' | 'both'
  logFile?: string
  logDirectory?: 'agent' | 'dev'
  forwardEvents?: boolean
  passthrough?: boolean
}

/** configuredCommandOutput captures child streams whenever a channel or dashboard owns their display. */
export function configuredCommandOutput(channel?: OutputChannel) {
  const selected = channel ?? output.main
  return {
    captureCommands: !configuration.passthrough,
    mirrorCommandStderr: configuration.stderr === 'both',
    stdoutPipe: selected.stdout,
    stderrPipe: selected.stderr,
    progressPipe: selected.progress,
    receive: selected.receive,
  }
}

/** renderOutput installs the sole terminal renderer for this process. */
export function renderOutput(renderer: OutputRenderer): void {
  tui = true
  output.render(renderer)
}

type OutputPipe = (text: string | Uint8Array) => void
let configuration: IOConfiguration = {}
let plain = createPlainOutput()
let files = createFileOutput({})
let tui = false
let lastMainOutput = ''
let diagnostics = { warn: 0, error: 0 }
let warningDetails: string[] = []
let output = createOutput(writeOutput)
let promptRenderer: (() => Promise<OutputRenderer>) | undefined
const promptLifecycle = createPromptLifecycle({
  async suspend() {
    if (!tui) {
      return false
    }
    await output.finish()
    tui = false
    return true
  },
  async resume() {
    if (promptRenderer) {
      renderOutput(await promptRenderer())
    }
  },
})

function withPrompt<T>(prompt: () => Promise<T>): Promise<T> {
  return promptLifecycle.run(prompt)
}

function configureOutput(options: IOConfiguration): void {
  if (tui) {
    Errors.ThrowUnexpected('Cannot reconfigure output while a TUI is active.')
  }
  configuration = options
  lastMainOutput = ''
  diagnostics = { warn: 0, error: 0 }
  warningDetails = []
  plain = createPlainOutput()
  files = createFileOutput(options)
  output = createOutput(writeOutput)
  output.main.start()
}

function writeOutput(event: OutputEvent): void {
  if (event.main && event.stream === 'stdout') {
    lastMainOutput = event.text
  }
  const mode = configuration[event.stream] ?? 'terminal'
  if (configuration.passthrough) {
    plain.write(event)
    return
  }
  files(event)
  countDiagnostic(event)
  if (configuration.forwardEvents) {
    Terminal.stdout.write(encodeOutputMessage(event))
    return
  }
  if (typeof mode === 'function') {
    mode(event.text)
    return
  }
  if (!tui && (mode !== 'log' || event.summary)) {
    plain.write(event)
  }
}

function countDiagnostic(event: OutputEvent): void {
  if (event.level === 'info') {
    return
  }
  diagnostics[event.level]++
  if (event.level === 'warn') {
    if (!configuration.forwardEvents) {
      warningDetails.push(formatWarningDetail(event))
    }
  } else if (diagnostics.error === 1 && isQuiet() && !configuration.forwardEvents && !tui) {
    Terminal.stderr.write('Error recorded: See the log for details.\n')
  }
}

function formatWarningDetail(event: OutputEvent): string {
  const channel = event.main ? '' : `[${event.channel.title}] `
  const message = Text.stripAnsi(event.text).replace(/\s+/g, ' ').trim()
  return `Warning: ${channel}${message}`.slice(0, 240)
}

function isQuiet(): boolean {
  return configuration.stdout === 'log' && configuration.stderr === 'log'
}

async function finishOutput(status: 'passed' | 'failed' = 'passed'): Promise<void> {
  const wasTui = tui
  output.main.finish(status)
  await output.finish()
  tui = false
  plain.finish()
  if (wasTui) {
    const snapshot = output.snapshot()
    for (const state of snapshot.channels) {
      Terminal.stderr.write(`[${state.title}] ${formatChannelCompletion(state)}\n`)
      if (state.status === 'failed') {
        Terminal.stderr.write(state.lines.slice(-12).join('\n') + '\n')
      }
    }
    const summary = lastMainOutput || snapshot.main.lines.filter(Boolean).at(-1)
    if (summary) {
      Terminal.stderr.write(summary.endsWith('\n') ? summary : summary + '\n')
    }
  }
  if (!configuration.forwardEvents && !configuration.passthrough) {
    const notices = `${diagnostics.warn} warning(s), ${diagnostics.error} error(s)`
    if (isQuiet() || diagnostics.warn || diagnostics.error) {
      Terminal.stderr.write(
        `${status === 'passed' ? 'Completed' : 'Failed'}: ${notices}. Logs: ${
          Path.relative(Repo.getWorkspaceRoot(), files.path)
        }\n`,
      )
      for (const warning of warningDetails) {
        Terminal.stderr.write(warning + '\n')
      }
    }
  }
}
