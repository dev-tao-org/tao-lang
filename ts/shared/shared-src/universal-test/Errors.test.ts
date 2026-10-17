import { Errors } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { throws as ExpectThrows } from 'node:assert/strict'

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
      ExpectThrows(action, thrown => {
        const error = thrown as Errors.TaoError
        Expect(error.name).toBe(category)
        Expect(error.details).toBe(details)
        Expect(error.message).toBe(message)
        if (category !== 'UserInputError') {
          Expect(error.cause).toBe(cause)
        }
        return true
      })
    }
  })

  Test('ThrowCommandExecution retains the subprocess result and Throw retains normalized identity', () => {
    const result = { command: 'tool', args: ['with spaces'], status: 23, signal: null, stdout: 'out', stderr: 'err' }
    ExpectThrows(() => Errors.ThrowCommandExecution(result), thrown => {
      const error = thrown as Errors.TaoError
      Expect(error.name).toBe('CommandExecutionError')
      Expect(error.message).toBe('Command failed: tool "with spaces"')
      Expect(error.details).toMatchObject({ status: 23, stdout: 'out', stderr: 'err' })
      if (error.name === 'CommandExecutionError') {
        Expect(error.result).toBe(result)
      }
      ExpectThrows(() => Errors.Throw(error), propagated => {
        Expect(propagated).toBe(error)
        return true
      })
      return true
    })
  })
})
