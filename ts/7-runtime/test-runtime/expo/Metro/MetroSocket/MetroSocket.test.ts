import * as Tests from '@shared-tests'

import { type HmrSocket, limitHmrSocketQueue } from '../../../../runtime-src/expo/Metro/MetroSocket'

Tests.test('slow HMR clients expire before a dependent delta enters their full queue', () => {
  const sent: unknown[] = []
  const socket: HmrSocket = {
    bufferedAmount: 0,
    readyState: 1,
    send: message => sent.push(message),
    terminate() {
      this.readyState = 3
    },
  }
  limitHmrSocketQueue(socket, 4)
  socket.send('single large message')
  Tests.expect(sent).toEqual(['single large message'])
  socket.bufferedAmount = 3
  socket.send('ok')
  Tests.expect(socket.readyState).toBe(3)
  socket.send('never enqueue after expiry')
  Tests.expect(sent).toEqual(['single large message'])
})
