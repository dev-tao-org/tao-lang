import { Errors } from '@shared'
import { Terminal } from '@shared/os'
import { createFileOutput } from './output/Files'
import {
  createOutput,
  formatChannelCompletion,
  type OutputChannel,
  type OutputEvent,
  type OutputRenderer,
} from './output/Output'
import { createPlainOutput } from './output/Plain'

/** IO routes direct and process-scoped output through one presentation and file policy. */
export const IO = {
  print: (...values: unknown[]) => output.main.print(...values),
  warn: (...values: unknown[]) => output.main.warn(...values),
  printToStdErr: (...values: unknown[]) => output.main.printToStdErr(...values),
  progress: (message: string) => output.main.progress(message),
  channel: (options: { title: string }) => output.channel(options.title),
  config: configureOutput,
  finish: finishOutput,
}

/** IOConfiguration separates terminal routing from dashboard presentation. */
export type IOConfiguration = {
  stdout?: 'terminal' | 'log' | OutputPipe
  stderr?: 'terminal' | 'both' | OutputPipe
  progress?: 'terminal' | 'log' | 'both'
  logFile?: string
  logDirectory?: 'agent' | 'dev'
}

/** configuredCommandOutput captures child streams whenever a channel or dashboard owns their display. */
export function configuredCommandOutput(channel?: OutputChannel) {
  const selected = channel ?? output.main
  return {
    captureCommands: needsStreamCapture(channel),
    mirrorCommandStderr: configuration.stderr === 'both',
    stdoutPipe: selected.stdout,
    stderrPipe: selected.stderr,
    progressPipe: selected.progress,
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
let output = createOutput(writeOutput)

function needsStreamCapture(channel?: OutputChannel): boolean {
  return channel !== undefined || tui || configuration.stdout === 'log'
    || configuration.stderr === 'both' || typeof configuration.stdout === 'function'
    || typeof configuration.stderr === 'function'
}

function configureOutput(options: IOConfiguration): void {
  if (tui) {
    Errors.ThrowUnexpected('Cannot reconfigure output while a TUI is active.')
  }
  configuration = options
  lastMainOutput = ''
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
  if (typeof mode === 'function') {
    mode(event.text)
    return
  }
  if (mode === 'log' || mode === 'both' || tui) {
    files(event)
  }
  if (!tui && mode !== 'log') {
    plain.write(event)
  }
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
}
