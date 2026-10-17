import { Try } from '../universal/TryCatch'

/** ByteStream represents runtime output delivered as byte chunks. */
export type ByteStream = ReadableStream<Uint8Array>

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
  }, { finally: () => reader.releaseLock() })
}
