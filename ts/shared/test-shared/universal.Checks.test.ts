import { Errors, Invariant, Try, UserInput } from '@shared'
import * as Tests from '@shared-tests'
import type { UncheckedCheck } from './universal.test-fixtures.Checks.Types'

Tests.test('boolean checks return void or propagate their existing Tao error through Try', () => {
  for (const [check, category] of Checks) {
    Tests.expect(check(true, 'Accepted.')).toBeUndefined()
    let observed: unknown
    Tests.throws(() =>
      Try(() => check(false, 'Rejected.'), {
        finally(thrown) {
          observed = thrown
        },
      }), error => {
      Tests.expect(error).toBe(observed)
      return expectCheckError(error, category, 'Rejected.')
    })
  }
})

Tests.test('malformed boolean-check arguments fail internally without touching or retaining input', () => {
  let propertyReads = 0
  const hostile = new Proxy({}, {
    get() {
      propertyReads++
    },
  })
  const invalidArguments: readonly CheckArguments[] = [
    [1, 'Rejected.'],
    [0, 'Rejected.'],
    [hostile, 'Rejected.'],
    [Promise.resolve(true), 'Rejected.'],
    [true, hostile],
    [false, hostile],
  ]
  for (const [check] of Checks) {
    for (const args of invalidArguments) {
      Tests.throws(
        () => check(...args),
        error =>
          expectCheckError(
            error,
            'UnexpectedBehaviorError',
            'A condition check requires a boolean and a string message.',
          ),
      )
    }
  }
  Tests.expect(propertyReads).toBe(0)
})

Tests.test('unconditional input failures retain details and cause through the Tao error boundary', () => {
  const details = { field: 'Name' }
  const cause = new Error('Rejected by provider')
  Tests.throws(() => UserInput.fail('Provide a valid name.', details, { cause }), thrown => {
    Tests.expect(Errors.isTaoError(thrown)).toBe(true)
    Tests.expect(thrown).toMatchObject({ name: 'UserInputError', message: 'Provide a valid name.' })
    const error = thrown as Errors.TaoError
    Tests.expect(error.details).toBe(details)
    Tests.expect(error.cause).toBe(cause)
    return true
  })
})

Tests.test('unconditional input failures reject nontext messages without inspecting them', () => {
  let reads = 0
  const message = new Proxy({}, {
    get() {
      reads++
      return undefined
    },
  })
  const failUnchecked = UserInput.fail as (message: unknown) => never
  Tests.throws(
    () => failUnchecked(message),
    error => expectCheckError(error, 'UnexpectedBehaviorError', 'An input failure requires a string message.'),
  )
  Tests.expect(reads).toBe(0)
})

type CheckArguments = Parameters<UncheckedCheck>
type CheckErrorName = 'UnexpectedBehaviorError' | 'UserInputError'

const Checks: readonly (readonly [check: UncheckedCheck, category: CheckErrorName])[] = [
  [Invariant as UncheckedCheck, 'UnexpectedBehaviorError'],
  [UserInput.require as UncheckedCheck, 'UserInputError'],
]

function expectCheckError(error: unknown, category: CheckErrorName, message: string): boolean {
  Tests.expect(Errors.isTaoError(error)).toBe(true)
  Tests.expect(error).toMatchObject({ name: category, message, details: undefined, cause: undefined })
  return true
}
