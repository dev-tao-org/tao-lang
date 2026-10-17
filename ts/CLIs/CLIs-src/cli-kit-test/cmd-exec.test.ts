import { Tests } from '@shared/os'
import { runSteps } from '../cli-kit/cli-kit'

Tests.test('awaits variadic void steps in order and stops at the original thrown failure', async () => {
  const events: string[] = []
  const failure = new Error('step failed')
  await Tests.expect(
    runSteps(
      async () => {
        events.push('first')
        await Promise.resolve()
        events.push('finished')
      },
      () => {
        events.push('second')
        throw failure
      },
      () => {
        events.push('third')
      },
    ),
  ).rejects.toBe(failure)
  Tests.expect(events).toEqual(['first', 'finished', 'second'])
  Tests.expect(await runSteps(() => {}, async () => {})).toBeUndefined()
})
