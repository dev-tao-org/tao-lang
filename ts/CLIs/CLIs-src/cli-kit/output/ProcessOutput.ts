import { Try } from '@shared'
import { Streams } from '@shared/os'
import type { OutputEvent } from './Output'

/** OutputMessage retains severity across captured Tao subprocesses independently of stdio. */
export type OutputMessage = Pick<OutputEvent, 'stream' | 'level' | 'text' | 'summary'>

/** encodeOutputMessage frames a Tao event without interpreting arbitrary tool output as diagnostics. */
export function encodeOutputMessage(event: OutputMessage): string {
  return '\u001e'
    + JSON.stringify({ stream: event.stream, level: event.level, text: event.text, summary: event.summary }) + '\n'
}

/** createProcessOutput decodes Tao event frames and forwards ordinary tool bytes unchanged. */
export function createProcessOutput(raw: (text: string) => void, receive: (message: OutputMessage) => void) {
  const decode = Streams.createDecoder()
  let pending = ''
  return {
    write(chunk: Uint8Array): void {
      pending += decode(chunk)
      while (pending) {
        const marker = pending.indexOf('\u001e')
        if (marker !== 0) {
          const end = marker < 0 ? pending.length : marker
          raw(pending.slice(0, end))
          pending = pending.slice(end)
          continue
        }
        const end = pending.indexOf('\n')
        if (end < 0) {
          return
        }
        const frame = pending.slice(0, end + 1)
        pending = pending.slice(end + 1)
        const message: unknown = Try.WithDefault(undefined, () => JSON.parse(frame.slice(1)))
        if (isOutputMessage(message)) {
          receive(message)
        } else {
          raw(frame)
        }
      }
    },
    finish(): void {
      if (pending) {
        raw(pending)
        pending = ''
      }
    },
  }
}

function isOutputMessage(value: unknown): value is OutputMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const event = value as Partial<OutputMessage>
  return ['info', 'warn', 'error'].includes(event.level ?? '')
    && ['stdout', 'stderr', 'progress'].includes(event.stream ?? '')
    && typeof event.text === 'string'
    && (event.summary === undefined || typeof event.summary === 'boolean')
}
