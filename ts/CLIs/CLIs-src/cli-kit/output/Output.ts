import { Time } from '@shared'
import { Streams, Text } from '@shared/os'

/** ChannelState describes a bounded presentation snapshot for one independently owned stream. */
export type ChannelState = {
  title: string
  status: 'idle' | 'running' | 'passed' | 'failed'
  lines: readonly string[]
  startedAtMs?: number
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
}

/** OutputChannel owns direct logging handles for one task or child process. */
export type OutputChannel = {
  stdout(text: string | Uint8Array): void
  stderr(text: string | Uint8Array): void
  print(...values: unknown[]): void
  warn(...values: unknown[]): void
  printToStdErr(...values: unknown[]): void
  progress(message: string): void
  start(): void
  finish(status: 'passed' | 'failed'): void
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

function createChannel(
  state: ChannelState,
  main: boolean,
  write: (event: OutputEvent) => void,
  update: () => void,
): OutputChannel {
  const stdout = Streams.createDecoder()
  const stderr = Streams.createDecoder()
  const emit = (stream: OutputEvent['stream'], text: string) => {
    if (!text) {
      return
    }
    appendTail(state, Text.stripAnsi(text))
    write({ channel: state, main, stream, text })
    update()
  }
  return {
    stdout: text => emit('stdout', stdout(text)),
    stderr: text => emit('stderr', stderr(text)),
    print: (...values) => emit('stdout', Text.format(...values) + '\n'),
    warn: (...values) => emit('stdout', '\u001b[33m' + Text.format(...values) + '\u001b[0m\n'),
    printToStdErr: (...values) => emit('stderr', '\u001b[31m' + Text.format(...values) + '\u001b[0m\n'),
    progress: message => emit('progress', '\u001b[90m' + message + '\u001b[0m\n'),
    start(): void {
      state.status = 'running'
      state.startedAtMs = Time.nowMs()
      update()
    },
    finish(status): void {
      state.status = status
      update()
    },
  }
}

function appendTail(state: ChannelState, text: string): void {
  const lines = [...state.lines]
  const partial = lines.pop() ?? ''
  lines.push(...(partial + text.replaceAll('\r', '\n')).split('\n'))
  state.lines = lines.slice(-80).map(line => line.slice(-16000))
}
