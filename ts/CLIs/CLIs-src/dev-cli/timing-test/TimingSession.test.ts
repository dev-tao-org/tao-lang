import { Errors } from '@shared'
import { Tests } from '@shared/os'
import type { TimingRun } from '../timing/TimingRun'
import { runTimingSession, type TimingSessionIO } from '../timing/TimingSession'

Tests.test('one-shot timing closes only its owned socket before displaying the final report', async () => {
  const fixture = createSessionFixture()
  const cleanupStarted = Promise.withResolvers<void>()
  const releaseCleanup = Promise.withResolvers<void>()
  fixture.io.disconnect = async options => {
    fixture.events.push('disconnect')
    fixture.sockets.push(options.controlPath)
    cleanupStarted.resolve()
    await releaseCleanup.promise
    fixture.events.push('closed')
  }
  let completed = false
  const session = runTimingSession(request, fixture.io).then(() => {
    completed = true
  })
  await cleanupStarted.promise
  await Promise.resolve()
  Tests.expect(fixture.messages).toEqual([])
  Tests.expect(completed).toBe(false)
  releaseCleanup.resolve()
  await session
  Tests.expect(fixture.events).toEqual(['connect', 'run', 'disconnect', 'closed', 'print'])
  Tests.expect(fixture.sockets).toEqual([
    '/private/tmp/owned.sock',
    '/private/tmp/owned.sock',
    '/private/tmp/owned.sock',
  ])
  Tests.expect(fixture.messages).toEqual(['Timing report fixture'])
})

Tests.test('one-shot timing cleans up partial authentication and failed jobs while preserving the original failure', async () => {
  for (const failAt of ['connect', 'run'] as const) {
    const fixture = createSessionFixture(failAt)
    await Tests.expect(runTimingSession(request, fixture.io)).rejects.toBe(fixture.failure)
    const expected = failAt === 'connect' ? ['connect', 'disconnect'] : ['connect', 'run', 'disconnect']
    Tests.expect(fixture.events).toEqual(expected)
    Tests.expect(fixture.messages).toEqual([])
  }
  const fixture = createSessionFixture('run', true)
  await Tests.expect(runTimingSession(request, fixture.io)).rejects.toBe(fixture.failure)
  Tests.expect(fixture.events).toEqual(['connect', 'run', 'disconnect', 'warn'])
  const cleanupFailure = createSessionFixture(undefined, true)
  await Tests.expect(runTimingSession(request, cleanupFailure.io)).rejects.toThrow('fixture cleanup failed')
  Tests.expect(cleanupFailure.events).toEqual(['connect', 'run', 'disconnect'])
})

Tests.test('one-shot timing validates before authentication and previews without opening or closing connections', async () => {
  const fixture = createSessionFixture()
  await Tests.expect(runTimingSession({ ...request, edits: 3 }, fixture.io)).rejects.toThrow('positive multiple')
  await Tests.expect(runTimingSession({ ...request, fixture: '' }, fixture.io)).rejects.toThrow(
    'absolute runner fixture',
  )
  Tests.expect(fixture.events).toEqual([])
  await runTimingSession({ ...request, dryRun: true }, fixture.io)
  Tests.expect(fixture.events).toEqual(['run', 'print', 'print'])
})

const request: TimingRun = { host: 'fixture.local', repo: '/fixture', samples: 5, edits: 24 }

function createSessionFixture(failAt?: 'connect' | 'run', failCleanup = false) {
  const events: string[] = []
  const sockets: (string | undefined)[] = []
  const messages: string[] = []
  const failure = Errors.fromUnknown(new Error('fixture failed'))
  const io: TimingSessionIO = {
    createSocket: () => '/private/tmp/owned.sock',
    async connect(options) {
      events.push('connect')
      sockets.push(options.controlPath)
      if (failAt === 'connect') {
        Errors.Throw(failure)
      }
    },
    async run(options, summary) {
      events.push('run')
      sockets.push(options.controlPath)
      if (failAt === 'run') {
        Errors.Throw(failure)
      }
      summary('Timing report fixture')
    },
    async disconnect(options) {
      events.push('disconnect')
      sockets.push(options.controlPath)
      if (failCleanup) {
        Errors.ThrowUserInput('fixture cleanup failed')
      }
    },
    print(message) {
      events.push('print')
      messages.push(message)
    },
    warn() {
      events.push('warn')
    },
  }
  return { io, events, sockets, messages, failure }
}
