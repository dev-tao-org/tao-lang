import { Try } from '../universal/TryCatch'
import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
import * as Node from './bridges/Bridge_node/Bridge_node'

/** ByteStream represents runtime output delivered as byte chunks. */
export type ByteStream = WebHost.ReadableStream<Uint8Array>

/** createPassThrough creates a Node stream fixture through the owned stream boundary. */
export function createPassThrough(): Node.nodeStream.PassThrough {
  return new Node.nodeStream.PassThrough()
}

/** createDecoder preserves UTF-8 characters split across streamed process chunks. */
export function createDecoder(): (chunk: string | Uint8Array) => string {
  const decoder = new WebHost.TextDecoder()
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
