import { Errors, UserInput } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'

Tests.describe('Errors diagnostics', () => {
  Tests.test('describe separates aggregate stacks and retains details while stopping cause cycles', () => {
    const cause = Object.assign(new Error('inner'), { context: 'retained' })
    cause.cause = cause
    cause.stack = Shared.joinTextLines('Error: inner', '    at inner-frame')
    const error = new AggregateError([cause, 'raw failure'], 'outer')
    error.stack = Shared.joinTextLines('AggregateError: outer', '    at outer-frame')
    Tests.expect(Errors.describe(error)).toEqual({
      stacks: ['    at outer-frame', '    at inner-frame'],
      details: {
        name: 'AggregateError',
        message: 'outer',
        errors: [
          { name: 'Error', message: 'inner', context: 'retained', cause: '[Circular error cause]' },
          'raw failure',
        ],
      },
    })
    Tests.expect(Errors.describe('raw failure')).toEqual({ stacks: [], details: 'raw failure' })
  })
})

Tests.test('host failures can be constructed synchronously for deferred rejection', () => {
  const cause = new Error('host')
  const details = { operation: 'preview edit' }
  const error: Errors.TaoError = Errors.createHostEnvironmentError('edit failed', { cause, details })
  Tests.expect(Errors.isTaoError(error)).toBe(true)
  Tests.expect(error.name).toBe('HostEnvironmentError')
  Tests.expect(error.message).toBe('edit failed')
  Tests.expect(error.messageForUser).toBe('edit failed')
  Tests.expect(error.cause).toBe(cause)
  Tests.expect(error.details).toBe(details)
})

Tests.describe('Errors throwing helpers', () => {
  Tests.test('ThrowX preserves each error category, message and context', () => {
    const details = { field: 'input' }
    const cause = new Error('host')
    for (
      const [action, category, message] of [
        [() => UserInput.fail('input', details), 'UserInputError', 'input'],
        [() => Errors.ThrowShouldNeverHappen('bug', { cause, details }), 'UnexpectedBehaviorError', 'bug'],
        [() => Errors.ThrowHostEnvironment('host', { cause, details }), 'HostEnvironmentError', 'host'],
      ] as const
    ) {
      Tests.throws(action, thrown => {
        const error = thrown as Errors.TaoError
        Tests.expect(error.name).toBe(category)
        Tests.expect(error.details).toBe(details)
        Tests.expect(error.message).toBe(message)
        Tests.expect(Errors.describe(error).details).not.toHaveProperty('messageForUser')
        Tests.expect(Errors.isCommandExecutionError(error)).toBe(false)
        if (category !== 'UserInputError') {
          Tests.expect(error.cause).toBe(cause)
        }
        return true
      })
    }
  })

  Tests.test('ThrowCommandExecution retains the subprocess result and Throw retains normalized identity', () => {
    const result = { command: 'tool', args: ['with spaces'], status: 23, signal: null, stdout: 'out', stderr: 'err' }
    Tests.throws(() => Errors.ThrowCommandExecution(result), thrown => {
      Tests.expect(Errors.isCommandExecutionError(thrown)).toBe(true)
      const error = thrown as Errors.TaoError
      Tests.expect(error.name).toBe('CommandExecutionError')
      Tests.expect(error.message).toBe('Command failed: tool "with spaces"')
      Tests.expect(error.details).toMatchObject({ status: 23, stdout: 'out', stderr: 'err' })
      if (Errors.isCommandExecutionError(error)) {
        Tests.expect(error.result).toBe(result)
      }
      Tests.throws(() => Errors.Throw(error), propagated => {
        Tests.expect(propagated).toBe(error)
        return true
      })
      return true
    })
    Tests.expect(Errors.isCommandExecutionError({ name: 'CommandExecutionError' })).toBe(false)
  })
})
