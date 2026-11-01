import * as MetroPlatform from '../../../shared/shared-src/os/MetroPlatform'

/** limitHmrSocketQueue expires only the lagging HMR instance instead of dropping dependent deltas.
 *  One arbitrarily large message may enter an empty queue; further queued payloads obey the cap. */
export function limitHmrSocketQueue(socket: HmrSocket, limit = 4 * 1024 * 1024): void {
  const send = socket.send
  socket.send = (...arguments_) => {
    if (socket.readyState !== 1) {
      return
    }
    const size = MetroPlatform.messageByteLength(arguments_[0])
    if (socket.bufferedAmount > 0 && socket.bufferedAmount + size > limit) {
      socket.terminate()
      return
    }
    return send.apply(socket, arguments_)
  }
}

/** HmrSocket describes the pinned websocket queue boundary used by Metro's HMR factory. */
export type HmrSocket = {
  bufferedAmount: number
  readyState: number
  send(...arguments_: unknown[]): unknown
  terminate(): void
}
