import { Errors } from '../universal/universal'
import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
import { Buffer as NodeBuffer } from './bridges/Bridge_node/Bridge_node'
import { AsyncLocalStorage, type IncomingRequest } from './bridges/Bridge_node/Bridge_node'
import * as Process from './Process'

/** createOperationContext retains one admitted Metro operation through asynchronous work. */
export function createOperationContext<Value>(): OperationContext<Value> {
  const storage = new AsyncLocalStorage<Value>()
  return { current: () => storage.getStore(), run: (value, operation) => storage.run(value, operation) }
}

/** OperationContext associates nested Metro calls with their admitted revision. */
export type OperationContext<Value> = {
  current(): Value | undefined
  run<Result>(value: Value, operation: () => Result): Result
}

/** currentDirectory returns the dedicated Metro process working directory. */
export function currentDirectory(): string {
  return Process.cwd()
}

/** messageByteLength measures the immutable serialized websocket payload before queue admission. */
export function messageByteLength(message: unknown): number {
  if (typeof message === 'string') {
    return NodeBuffer.byteLength(message)
  }
  if (NodeBuffer.isBuffer(message)) {
    return message.byteLength
  }
  return 0
}

/** openWebSocket opens the runtime websocket used by the real Metro protocol acceptance fixture. */
export function openWebSocket(url: string): WebHost.WebSocket {
  return new WebHost.WebSocket(url)
}

/** synchronizeBuiltinExports updates captured ESM filesystem exports after installing a router. */
export { syncBuiltinESMExports as synchronizeBuiltinExports } from './bridges/Bridge_node/Bridge_node'

/** IncomingRequest describes the publication endpoint's bounded request stream. */
export type { IncomingRequest } from './bridges/Bridge_node/Bridge_node'

/** OutgoingResponse describes Metro's existing HTTP response. */
export type { OutgoingResponse } from './bridges/Bridge_node/Bridge_node'

/** readRequestText rejects an oversized publication before allocating its full body. */
export async function readRequestText(request: IncomingRequest, limit: number): Promise<string> {
  const chunks: NodeBuffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = NodeBuffer.isBuffer(chunk) ? chunk : NodeBuffer.from(chunk)
    size += bytes.length
    if (size > limit) {
      request.destroy()
      Errors.ThrowUserInput('Generated publication exceeds its supported size.')
    }
    chunks.push(bytes)
  }
  return NodeBuffer.concat(chunks).toString('utf8')
}

export { default as Env } from './Env'
export * as FS from './FS'
export * as GeneratedFileSystem from './FS/GeneratedFileSystem'
export * as Path from './Path'
