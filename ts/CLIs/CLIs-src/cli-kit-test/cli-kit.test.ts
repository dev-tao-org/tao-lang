import { Try } from '@shared'
import { Test } from '@shared/os'
import { IO, runSteps } from '../cli-kit/cli-kit'

Test.test('configures output channels once and replaces them without changing message formatting or raw diagnostics', () => {
  const output: (string | Uint8Array)[] = []
  const errors: (string | Uint8Array)[] = []
  const replacement: (string | Uint8Array)[] = []
  const raw = new Uint8Array([65, 10])
  Try(() => {
    IO.config({
      stdout(text) {
        return output.push(text)
      },
      stderr(text) {
        return errors.push(text)
      },
    })
    IO.info('hello %s', 'world')
    IO.debug('debug')
    IO.log('message')
    IO.warn('warning')
    IO.error('failure')
    IO.stderr(raw)
    Test.expect(output).toEqual(['hello world\n', 'debug\n', 'message\n'])
    Test.expect(errors).toEqual(['warning\n', 'failure\n', raw])
    Test.expect(errors[2]).toBe(raw)

    IO.config({
      stdout(text) {
        return replacement.push(text)
      },
      stderr(text) {
        return replacement.push(text)
      },
    })
    IO.info('next')
    IO.stderr('raw')
    Test.expect(replacement).toEqual(['next\n', 'raw'])
    Test.expect(output).toHaveLength(3)
    Test.expect(errors).toHaveLength(3)
  }, {
    finally() {
      return IO.config({})
    },
  })
})

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
