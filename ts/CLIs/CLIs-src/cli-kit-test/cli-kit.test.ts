import { Test } from '@shared/os'
import { runSteps } from '../cli-kit/cli-kit'

Test.test('awaits variadic void steps in order and stops at the original thrown failure', async () => {
  const events: string[] = []
  const failure = new Error('step failed')
  await Test.expect(
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
  Test.expect(events).toEqual(['first', 'finished', 'second'])
  Test.expect(await runSteps(() => {}, async () => {})).toBeUndefined()
})
