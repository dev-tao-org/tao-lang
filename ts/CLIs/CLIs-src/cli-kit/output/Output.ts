import { CarriageReturnCharacter, EscapeCharacter, NewlineCharacter, Time } from '@shared'
import { Streams, Text } from '@shared/os'

/** ChannelState describes a bounded presentation snapshot for one independently owned stream. */
export type ChannelState = {
  title: string
  status: ChannelStatus
  lines: readonly string[]
  startedAtMs?: number
  finishedAtMs?: number
}

/** OutputCommand describes a persistent command with its shortcut in the label. */
export type OutputCommand = { key: string; label: string }

/** OutputSnapshot describes root progress, worker panes and persistent commands without exposing the renderer. */
export type OutputSnapshot = {
  main: ChannelState
  channels: readonly ChannelState[]
  commands: readonly OutputCommand[]
  prompt?: string
}

/** OutputRenderer updates a terminal view and releases its resources when the command ends. */
export type OutputRenderer = {
  update(snapshot: OutputSnapshot): void
  dispose(): Promise<void>
  readInput?(request: OutputInputRequest): Promise<string>
}

/** OutputInputRequest describes pane-owned input; secret values never enter output events. */
export type OutputInputRequest = { message: string; secret?: boolean; signal?: AbortSignal }

/** OutputEvent retains the channel and original text for independent file and terminal sinks. */
export type OutputEvent = {
  channel: ChannelState
  stream: OutputStream
  text: string
  main: boolean
  level: OutputLevel
  summary?: boolean
}

/** OutputChannel owns direct logging handles for one task or child process. */
export type OutputChannel = {
  stdout(text: OutputText): void
  stderr(text: OutputText): void
  print(...values: unknown[]): void
  warn(...values: unknown[]): void
  printToStdErr(...values: unknown[]): void
  progress(message: string): void
  summary(...values: unknown[]): void
  receive(message: Pick<OutputEvent, OutputEventMessageFields>): void
  start(): void
  finish(status: OutputCompletion): void
  completion(): string
}

type ChannelStatus = 'idle' | 'running' | 'passed' | 'failed'
type OutputStream = 'stdout' | 'stderr' | 'progress'
type OutputLevel = 'info' | 'warn' | 'error'
/** OutputText is one complete or partial output chunk from a process or terminal. */
export type OutputText = string | Uint8Array
type OutputCompletion = 'passed' | 'failed'
type OutputEventMessageFields = 'stream' | 'text' | 'level' | 'summary'
/** OutputEventMessage contains the child-process fields accepted by output sinks. */
export type OutputEventMessage = Pick<OutputEvent, OutputEventMessageFields>
type OptionalOutputRenderer = OutputRenderer | undefined

/** createOutput routes complete output to sinks while bounding only the visible channel tails. */
export function createOutput(write: (event: OutputEvent) => void) {
  const states: ChannelState[] = []
  let renderer: OptionalOutputRenderer
  let commands: readonly OutputCommand[] = []
  const snapshot = (): OutputSnapshot => ({ main: states[0]!, channels: states.slice(1), commands })
  const update = () => renderer?.update(snapshot())
  const channel = (title: string): OutputChannel => {
    const state: ChannelState = { title, status: 'idle', lines: [] }
    states.push(state)
    return createChannel(state, states[0] === state, write, update)
  }
  const main = channel('Run')
  return {
    main,
    channel,
    snapshot,
    setCommands(next: readonly OutputCommand[]): void {
      commands = [...next]
      update()
    },
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

/** formatCommands formats persistent shortcuts, optionally emphasizing their key. */
export function formatCommands(commands: readonly OutputCommand[], emphasize = false): string {
  const labels = commands.map(command => {
    const key = command.key
    return emphasize
      ? command.label.replace(key, `${EscapeCharacter}[1;4;36m${key}${EscapeCharacter}[0m`)
      : command.label
  })
  return 'Commands: ' + labels.join(' | ')
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
    print: (...values) => emit('stdout', Text.format(...values) + NewlineCharacter),
    warn: (...values) =>
      emit(
        'stdout',
        (EscapeCharacter + '[33m') + Text.format(...values) + (EscapeCharacter + '[0m' + NewlineCharacter),
        'warn',
      ),
    printToStdErr: (...values) =>
      emit(
        'stderr',
        (EscapeCharacter + '[31m') + Text.format(...values) + (EscapeCharacter + '[0m' + NewlineCharacter),
        'error',
      ),
    progress: message =>
      emit('progress', (EscapeCharacter + '[90m') + message + (EscapeCharacter + '[0m' + NewlineCharacter)),
    summary: (...values) => emit('stdout', Text.format(...values) + NewlineCharacter, 'info', true),
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
  lines.push(...(partial + text.replaceAll(CarriageReturnCharacter, NewlineCharacter)).split(NewlineCharacter))
  state.lines = lines.slice(-80).map(line => line.slice(-16000))
}
