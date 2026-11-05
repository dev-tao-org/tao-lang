import { NewlineCharacter } from '@shared'
import { Terminal } from '@shared/os'
import type { ChannelState, OutputEvent } from './Output'

/** createPlainOutput keeps partial worker lines separate until they can be printed with a prefix. */
export function createPlainOutput(print = printTerminal) {
  const fragments = new Map<ChannelState, Map<OutputEvent['stream'], string>>()
  return {
    write(event: OutputEvent): void {
      if (event.main) {
        print(event.stream, event.text)
        return
      }
      const streams = fragments.get(event.channel) ?? new Map<OutputEvent['stream'], string>()
      fragments.set(event.channel, streams)
      const lines = ((streams.get(event.stream) ?? '') + event.text).split(NewlineCharacter)
      const partial = lines.pop() ?? ''
      for (const line of lines) {
        print(event.stream, `[${event.channel.title}] ${line}${NewlineCharacter}`)
      }
      if (partial.length > 16000) {
        print(event.stream, `[${event.channel.title}] ${partial}${NewlineCharacter}`)
        streams.delete(event.stream)
      } else {
        streams.set(event.stream, partial)
      }
    },
    finish(): void {
      for (const [channel, streams] of fragments) {
        for (const [stream, text] of streams) {
          if (text) {
            print(stream, `[${channel.title}] ${text}${NewlineCharacter}`)
          }
        }
      }
      fragments.clear()
    },
  }
}

function printTerminal(stream: OutputEvent['stream'], text: string): void {
  ;(stream === 'stdout' ? Terminal.stdout : Terminal.stderr).write(text)
}
