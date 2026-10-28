import { Http, Streams, Terminal, Tests } from '@shared/os'

const ConfirmationCancelledRegx = /Confirmation cancelled/

Tests.test('single-key actions restore terminal input and stop receiving keys after disposal', () => {
  for (const initiallyRaw of [false, true]) {
    const input = Object.assign(Streams.createPassThrough(), {
      isTTY: true,
      isRaw: initiallyRaw,
      setRawMode(raw: boolean) {
        this.isRaw = raw
      },
    })
    input.pause()
    const keys: string[] = []
    const stop = Terminal.listenForKeys(key => keys.push(key), input)
    Tests.expect(input.isRaw).toBe(true)
    Tests.expect(input.isPaused()).toBe(false)
    input.emit('data', Buffer.from('wq\u0003'))
    Tests.expect(keys).toEqual(['w', 'q', '\u0003'])
    stop()
    Tests.expect(input.isRaw).toBe(initiallyRaw)
    Tests.expect(input.isPaused()).toBe(true)
    input.emit('data', Buffer.from('w'))
    Tests.expect(keys).toEqual(['w', 'q', '\u0003'])
    input.resume()
    stop()
    Tests.expect(input.isPaused()).toBe(false)
    input.destroy()
  }
})

Tests.test('confirmation cancellation forwards the request signal and closes the active reader', async () => {
  const controller = Http.createAbortController()
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
  const controller = Http.createAbortController()
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
