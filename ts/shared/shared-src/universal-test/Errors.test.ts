import { Errors, Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'

Describe('Errors throwing helpers', () => {
  Test('ThrowX preserves each error category, message and context', () => {
    const details = { field: 'input' }
    const cause = new Error('host')
    for (
      const [action, category, message] of [
        [() => Errors.ThrowUserInput('input', details), 'UserInputError', 'input'],
        [() => Errors.ThrowUnexpected('bug', { cause, details }), 'UnexpectedBehaviorError', 'bug'],
        [() => Errors.ThrowHostEnvironment('host', { cause, details }), 'HostEnvironmentError', 'host'],
      ] as const
    ) {
      const error = Try(action, { catch: value => value }) as Errors.TaoError
      Expect(error.name).toBe(category)
      Expect(error.details).toBe(details)
      Expect(error.message).toBe(message)
      if (category !== 'UserInputError') {
        Expect(error.cause).toBe(cause)
      }
    }
  })

  Test('ThrowCommandExecution retains the subprocess result and Throw retains normalized identity', () => {
    const result = { command: 'tool', args: ['with spaces'], status: 23, signal: null, stdout: 'out', stderr: 'err' }
    const error = Try(() => Errors.ThrowCommandExecution(result), { catch: value => value }) as Errors.TaoError
    Expect(error.name).toBe('CommandExecutionError')
    Expect(error.message).toBe('Command failed: tool "with spaces"')
    Expect(error.details).toMatchObject({ status: 23, stdout: 'out', stderr: 'err' })
    if (error.name === 'CommandExecutionError') {
      Expect(error.result).toBe(result)
    }
    Expect(Try(() => Errors.Throw(error), { catch: value => value })).toBe(error)
  })

  Test('error formatting recovers from unserializable details through Try', () => {
    const details: Errors.ErrorDetails = {}
    details.self = details
    const error = Try(() => Errors.ThrowUnexpected('formatting', { details }), { catch: value => value })
    Expect(Errors.formatForLog(error)).toContain('details=<safeJson: unserializable>')
  })
})
