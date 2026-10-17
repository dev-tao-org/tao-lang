import { Errors } from '@shared'
import { Test } from '@shared/os'

Test.describe('Errors throwing helpers', () => {
  Test.test('ThrowX preserves each error category, message and context', () => {
    const details = { field: 'input' }
    const cause = new Error('host')
    for (
      const [action, category, message] of [
        [() => Errors.ThrowUserInput('input', details), 'UserInputError', 'input'],
        [() => Errors.ThrowUnexpected('bug', { cause, details }), 'UnexpectedBehaviorError', 'bug'],
        [() => Errors.ThrowHostEnvironment('host', { cause, details }), 'HostEnvironmentError', 'host'],
      ] as const
    ) {
      Test.throws(action, thrown => {
        const error = thrown as Errors.TaoError
        Test.expect(error.name).toBe(category)
        Test.expect(error.details).toBe(details)
        Test.expect(error.message).toBe(message)
        if (category !== 'UserInputError') {
          Test.expect(error.cause).toBe(cause)
        }
        return true
      })
    }
  })

  Test.test('ThrowCommandExecution retains the subprocess result and Throw retains normalized identity', () => {
    const result = { command: 'tool', args: ['with spaces'], status: 23, signal: null, stdout: 'out', stderr: 'err' }
    Test.throws(() => Errors.ThrowCommandExecution(result), thrown => {
      const error = thrown as Errors.TaoError
      Test.expect(error.name).toBe('CommandExecutionError')
      Test.expect(error.message).toBe('Command failed: tool "with spaces"')
      Test.expect(error.details).toMatchObject({ status: 23, stdout: 'out', stderr: 'err' })
      if (error.name === 'CommandExecutionError') {
        Test.expect(error.result).toBe(result)
      }
      Test.throws(() => Errors.Throw(error), propagated => {
        Test.expect(propagated).toBe(error)
        return true
      })
      return true
    })
  })
})
