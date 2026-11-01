import { NewlineCharacter, RecordSeparatorCharacter, Try } from '@shared'
import { Streams } from '@shared/os'
import type { OutputEvent } from './Output'

/** OutputMessage retains severity across captured Tao subprocesses independently of stdio. */
export type OutputMessage = Pick<OutputEvent, OutputMessageFields>

/** encodeOutputMessage frames a Tao event without interpreting arbitrary tool output as diagnostics. */
export function encodeOutputMessage(event: OutputMessage): string {
  return RecordSeparatorCharacter
    + JSON.stringify({ stream: event.stream, level: event.level, text: event.text, summary: event.summary })
    + NewlineCharacter
}

/** createProcessOutput decodes Tao event frames and forwards ordinary tool bytes unchanged. */
export function createProcessOutput(raw: (text: string) => void, receive: (message: OutputMessage) => void) {
  const decode = Streams.createDecoder()
  let pending = ''
  return {
    write(chunk: Uint8Array): void {
      pending += decode(chunk)
      while (pending) {
        const marker = pending.indexOf(RecordSeparatorCharacter)
        if (marker !== 0) {
          const end = marker < 0 ? pending.length : marker
          raw(pending.slice(0, end))
          pending = pending.slice(end)
          continue
        }
        const end = pending.indexOf(NewlineCharacter)
        if (end < 0) {
          return
        }
        const frame = pending.slice(0, end + 1)
        pending = pending.slice(end + 1)
        const message = decodeOutputFrame(frame)
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

type OutputMessageFields = 'stream' | 'level' | 'text' | 'summary'

function decodeOutputFrame(frame: string): unknown {
  return Try.WithDefault(undefined, () => JSON.parse(frame.slice(1)) as unknown)
}

function isOutputMessage(value: unknown): value is OutputMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const event = value as Partial<OutputMessage>
  const hasKnownLevel = ['info', 'warn', 'error'].includes(event.level ?? '')
  const hasKnownStream = ['stdout', 'stderr', 'progress'].includes(event.stream ?? '')
  const hasText = typeof event.text === 'string'
  const hasValidSummary = event.summary === undefined || typeof event.summary === 'boolean'
  const hasKnownEvent = hasKnownLevel && hasKnownStream
  const hasValidPayload = hasText && hasValidSummary
  return hasKnownEvent && hasValidPayload
}
