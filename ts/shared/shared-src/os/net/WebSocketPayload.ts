import { Buffer as NodeBuffer } from '../bridges/Bridge_node/Bridge_node'

/** byteLength measures a serialized Node WebSocket payload before queue admission. */
export function byteLength(message: unknown): number {
  if (typeof message === 'string') {
    return NodeBuffer.byteLength(message)
  }
  return NodeBuffer.isBuffer(message) ? message.byteLength : 0
}
