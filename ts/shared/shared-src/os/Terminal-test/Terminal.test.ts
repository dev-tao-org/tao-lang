import { Http, Terminal, Tests } from '@shared/os'

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
  await Tests.rejects(confirmation, /Confirmation cancelled/)
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
    /Confirmation cancelled/,
  )
})
