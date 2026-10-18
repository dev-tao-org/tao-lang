import { Time } from '@shared'
import { Streams, Text } from '@shared/os'

/** ChannelState describes a bounded presentation snapshot for one independently owned stream. */
export type ChannelState = {
  title: string
  status: 'idle' | 'running' | 'passed' | 'failed'
  lines: readonly string[]
  startedAtMs?: number
  finishedAtMs?: number
}

/** OutputSnapshot describes root progress and worker panes without exposing the renderer. */
export type OutputSnapshot = { main: ChannelState; channels: readonly ChannelState[] }

/** OutputRenderer updates a terminal view and releases its resources when the command ends. */
export type OutputRenderer = { update(snapshot: OutputSnapshot): void; dispose(): Promise<void> }

/** OutputEvent retains the channel and original text for independent file and terminal sinks. */
export type OutputEvent = {
  channel: ChannelState
  stream: 'stdout' | 'stderr' | 'progress'
  text: string
  main: boolean
  level: 'info' | 'warn' | 'error'
  summary?: boolean
}

/** OutputChannel owns direct logging handles for one task or child process. */
export type OutputChannel = {
  stdout(text: string | Uint8Array): void
  stderr(text: string | Uint8Array): void
  print(...values: unknown[]): void
  warn(...values: unknown[]): void
  printToStdErr(...values: unknown[]): void
  progress(message: string): void
  summary(...values: unknown[]): void
  receive(message: Pick<OutputEvent, 'stream' | 'text' | 'level' | 'summary'>): void
  start(): void
  finish(status: 'passed' | 'failed'): void
  completion(): string
}

/** createOutput routes complete output to sinks while bounding only the visible channel tails. */
export function createOutput(write: (event: OutputEvent) => void) {
  const states: ChannelState[] = []
  let renderer: OutputRenderer | undefined
  const update = () => renderer?.update({ main: states[0]!, channels: states.slice(1) })
  const channel = (title: string): OutputChannel => {
    const state: ChannelState = { title, status: 'idle', lines: [] }
    states.push(state)
    return createChannel(state, states[0] === state, write, update)
  }
  const main = channel('Run')
  return {
    main,
    channel,
    snapshot: (): OutputSnapshot => ({ main: states[0]!, channels: states.slice(1) }),
    render(view: OutputRenderer): void {
      renderer = view
      update()
    },
    async finish(): Promise<void> {
      await renderer?.dispose()
      renderer = undefined
    },
  }
}

/** formatChannelCompletion renders a channel verdict with its completed duration in seconds. */
export function formatChannelCompletion(state: ChannelState): string {
  return state.startedAtMs === undefined
    ? state.status
    : `${state.status} in ${(Math.max(0, (state.finishedAtMs ?? Time.nowMs()) - state.startedAtMs) / 1000).toFixed(2)}s`
}

function createChannel(
  state: ChannelState,
  main: boolean,
  write: (event: OutputEvent) => void,
  update: () => void,
): OutputChannel {
  const stdout = Streams.createDecoder()
  const stderr = Streams.createDecoder()
  const emit = (stream: OutputEvent['stream'], text: string, level: OutputEvent['level'] = 'info', summary = false) => {
    if (!text) {
      return
    }
    appendTail(state, Text.stripAnsi(text))
    write({ channel: state, main, stream, text, level, summary })
    update()
  }
  return {
    stdout: text => emit('stdout', stdout(text)),
    stderr: text => emit('stderr', stderr(text)),
    print: (...values) => emit('stdout', Text.format(...values) + '\n'),
    warn: (...values) => emit('stdout', '\u001b[33m' + Text.format(...values) + '\u001b[0m\n', 'warn'),
    printToStdErr: (...values) => emit('stderr', '\u001b[31m' + Text.format(...values) + '\u001b[0m\n', 'error'),
    progress: message => emit('progress', '\u001b[90m' + message + '\u001b[0m\n'),
    summary: (...values) => emit('stdout', Text.format(...values) + '\n', 'info', true),
    receive: message => emit(message.stream, message.text, message.level, message.summary),
    start(): void {
      state.status = 'running'
      state.startedAtMs = Time.nowMs()
      state.finishedAtMs = undefined
      update()
    },
    finish(status): void {
      state.status = status
      state.finishedAtMs ??= Time.nowMs()
      update()
    },
    completion: () => formatChannelCompletion(state),
  }
}

function appendTail(state: ChannelState, text: string): void {
  const lines = [...state.lines]
  const partial = lines.pop() ?? ''
  lines.push(...(partial + text.replaceAll('\r', '\n')).split('\n'))
  state.lines = lines.slice(-80).map(line => line.slice(-16000))
}
