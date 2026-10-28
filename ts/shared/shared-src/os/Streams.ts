import { Try } from '../universal/TryCatch'
import * as Node from './NodeBuiltins'

/** ByteStream represents runtime output delivered as byte chunks. */
export type ByteStream = ReadableStream<Uint8Array>

/** createPassThrough creates a Node stream fixture through the owned stream boundary. */
export function createPassThrough(): Node.nodeStream.PassThrough {
  return new Node.nodeStream.PassThrough()
}

/** createDecoder preserves UTF-8 characters split across streamed process chunks. */
export function createDecoder(): (chunk: StreamChunk) => string {
  const decoder = new TextDecoder()
  return chunk => typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
}

/** consume delivers every byte chunk and releases the reader after completion or failure. */
export async function consume(stream: ByteStream, accept: (chunk: Uint8Array) => void): Promise<void> {
  const reader = stream.getReader()
  await Try(async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        return
      }
      accept(value)
    }
  }, {
    finally: () => reader.releaseLock(),
  })
}

type StreamChunk = string | Uint8Array
