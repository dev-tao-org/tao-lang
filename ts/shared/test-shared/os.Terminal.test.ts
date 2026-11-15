import * as Tests from '@shared-tests'
import { Streams, Terminal } from '@shared/os'
import { Cancellation } from '@shared/web'
import { Buffer as NodeBuffer } from '../shared-src/os/bridges/Bridge_node/Bridge_node'
import { ControlCCharacter } from '../shared-src/universal/Characters'

const ConfirmationCancelledRegx = /Confirmation cancelled/

Tests.test('single-key actions restore terminal input and stop receiving keys after disposal', () => {
  for (const initialFlowing of [null, false, true]) {
    const initiallyRaw = initialFlowing === true
    const input = Object.assign(Streams.createPassThrough(), {
      isTTY: true,
      isRaw: initiallyRaw,
      setRawMode(raw: boolean) {
        this.isRaw = raw
      },
    })
    if (initialFlowing === true) {
      input.resume()
    } else if (initialFlowing === false) {
      input.pause()
    }
    const keys: string[] = []
    const stop = Terminal.listenForKeys(key => keys.push(key), input)
    Tests.expect(input.isRaw).toBe(true)
    Tests.expect(input.isPaused()).toBe(false)
    input.emit('data', NodeBuffer.from('wq' + ControlCCharacter))
    Tests.expect(keys).toEqual(['w', 'q', '\u0003'])
    stop()
    Tests.expect(input.isRaw).toBe(initiallyRaw)
    Tests.expect(input.isPaused()).toBe(initialFlowing !== true)
    input.emit('data', NodeBuffer.from('w'))
    Tests.expect(keys).toEqual(['w', 'q', '\u0003'])
    input.resume()
    stop()
    Tests.expect(input.isPaused()).toBe(false)
    input.destroy()
  }
})

Tests.test('confirmation cancellation forwards the request signal and closes the active reader', async () => {
  const controller = Cancellation.createController()
  const events: string[] = []
  const confirmation = Terminal.askConfirm({ message: 'Set up?', defaultValue: true, signal: controller.signal }, {
    isInteractive: () => true,
    open: () => ({
      question(message, { signal }) {
        Tests.expect(message).toBe('Set up? [Y/n] ')
        Tests.expect(signal).toBe(controller.signal)
        events.push('question')
        return new Promise<string>((_resolve, reject) => {
          signal!.addEventListener('abort', () => reject(new Error('fixture interruption')), { once: true })
        })
      },
      close() {
        events.push('close')
      },
    }),
    write() {},
  })
  controller.abort()
  await Tests.rejects(confirmation, ConfirmationCancelledRegx)
  Tests.expect(events).toEqual(['question', 'close'])
})

Tests.test('an already cancelled confirmation never accepts a noninteractive default', async () => {
  const controller = Cancellation.createController()
  controller.abort()
  await Tests.rejects(
    Terminal.askConfirm({
      message: 'Set up?',
      defaultValue: true,
      signal: controller.signal,
    }, {
      isInteractive: () => false,
      open() {
        throw new Error('A cancelled confirmation must not open a reader.')
      },
      write() {},
    }),
    ConfirmationCancelledRegx,
  )
})
