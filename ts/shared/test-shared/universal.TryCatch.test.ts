import { Errors, Try } from '@shared'
import * as Tests from '@shared-tests'

import * as ExternalErrors from '../shared-src/universal/Errors/external'

Tests.test('Try > recovers and finalizes even when a thrown object cannot be inspected', async () => {
  const revoked = Proxy.revocable({}, {})
  revoked.revoke()
  const hostile = new Proxy({}, {
    getPrototypeOf() {
      throw 'prototype inspection denied'
    },
  })
  for (const thrown of [revoked.proxy, hostile]) {
    for (const asynchronous of [false, true]) {
      const events: string[] = []
      const result = await Try(() => {
        if (asynchronous) {
          return Promise.reject(thrown)
        }
        throw thrown
      }, {
        catch(original) {
          Tests.expect(original).toBe(thrown)
          events.push('catch')
          return 'recovered'
        },
        finally(original, error) {
          Tests.expect(original).toBe(thrown)
          Tests.expect(Errors.isTaoError(error)).toBe(true)
          Tests.expect(error?.cause).toBe(thrown)
          events.push('finally')
        },
      })
      Tests.expect(result).toBe('recovered')
      Tests.expect(events).toEqual(['catch', 'finally'])
    }
  }
})

Tests.test('Try > preserves synchronous values', () => {
  const value = { id: 1 }
  const result: typeof value = Try(() => value)
  const recovered: number = Try.WithDefault(42, () => {
    throw 'input'
  })
  Tests.expect(result).toBe(value)
  Tests.expect(recovered).toBe(42)
  const failure = Errors.createHostEnvironmentError('synchronous failure')
  const recoveredFailure: Errors.TaoError = Try(() => Errors.Throw(failure), { catch: ExternalErrors.fromUnknown })
  Tests.expect(recoveredFailure).toBe(failure)
})

Tests.test('Try.IgnoreError > suppresses sync and async failures without a recovery value', async () => {
  const events: string[] = []
  Try.IgnoreError(() => {
    events.push('sync')
  })
  Try.IgnoreError(() => {
    throw 'ignored'
  })
  await Try.IgnoreError(async () => {
    events.push('async')
  })
  await Try.IgnoreError(async () => {
    throw 'ignored async'
  })
  Tests.expect(events).toEqual(['sync', 'async'])
})

Tests.test('Try.IgnoreError > discards values and waits for a deferred effect', async () => {
  const effect = Promise.withResolvers<number>()
  const completion = Try.IgnoreError(() => effect.promise)
  Tests.expect(Try.IgnoreError(() => 7)).toBeUndefined()
  Tests.expect(completion).toBeInstanceOf(Promise)
  const observed: void[] = []
  const completed = Promise.resolve(completion).then(value => observed.push(value))
  await Promise.resolve()
  Tests.expect(observed).toEqual([])
  effect.resolve(7)
  await completed
  Tests.expect(observed).toEqual([undefined])
})

Tests.test('Try.WithDefault > preserves success values and returns the fallback on sync or async failure', async () => {
  const fallback = { recovered: true }
  type RecoveredText = string | typeof fallback
  type RecoveredNumber = number | typeof fallback
  type DeferredNumberResult = typeof fallback | Promise<RecoveredNumber>
  type DeferredTextResult = typeof fallback | Promise<RecoveredText>
  const synchronous: RecoveredText = Try.WithDefault(fallback, () => 'value')
  const synchronousFailure: RecoveredNumber = Try.WithDefault(fallback, () => {
    throw new Error('sync failure')
  })
  const asynchronous: DeferredNumberResult = Try.WithDefault(fallback, async () => 7)
  const asynchronousFailure: DeferredTextResult = Try.WithDefault(
    fallback,
    () => Promise.reject(new Error('async failure')),
  )
  const asynchronousFallback: Promise<number> = Try.WithDefault(
    Promise.resolve(11),
    () => Promise.reject(new Error('async failure')),
  )
  Tests.expect(synchronous).toBe('value')
  Tests.expect(synchronousFailure).toBe(fallback)
  Tests.expect(await asynchronous).toBe(7)
  Tests.expect(await asynchronousFailure).toBe(fallback)
  Tests.expect(await asynchronousFallback).toBe(11)
})

Tests.test('Try.WithDefault > types mixed results without losing synchronous values or asynchronous recovery', async () => {
  type MixedActionResult = number | Promise<string>
  type SettledMixedValue = number | string | boolean
  type MixedDefaultResult = number | boolean | Promise<SettledMixedValue>
  const mixedFailure = Try.WithDefault(false, (): MixedActionResult => Promise.reject('mixed failure'))
  const promisedRecovery: Extract<typeof mixedFailure, Promise<unknown>> = Promise.resolve(false)
  const mixedSuccess: MixedDefaultResult = Try.WithDefault(
    false,
    (): MixedActionResult => 4,
  )
  Tests.expect(await mixedFailure).toBe(await promisedRecovery)
  Tests.expect(mixedSuccess).toBe(4)
  const earlyFailure = Try.WithDefault(false, (): Promise<string> => {
    throw 'before returning a promise'
  })
  const synchronousRecovery: Exclude<typeof earlyFailure, Promise<unknown>> = false
  Tests.expect(earlyFailure).toBe(synchronousRecovery)
})

Tests.test('Try > normalizes unknown failures and preserves structured error identity', () => {
  for (const thrown of [new Error('raw'), 'failure', null, undefined]) {
    Tests.throws(() =>
      Try(() => {
        throw thrown
      }), error => {
      Tests.expect(Errors.isTaoError(error)).toBe(true)
      Tests.expect((error as Errors.TaoError).name).toBe('UnexpectedBehaviorError')
      Tests.expect((error as Errors.TaoError).cause).toBe(thrown)
      return true
    })
  }
  const original = ExternalErrors.fromUnknown(new Error('structured failure'))
  Tests.throws(() =>
    Try(() => {
      throw original
    }), error => {
    Tests.expect(error).toBe(original)
    return true
  })
})

Tests.test('Try > finalizes once with the original failure even after catch recovery or failure', () => {
  const original = { reason: 'body failed' }
  const handlerFailure = new Error('handler failed')
  for (const handlerFails of [false, true]) {
    const contexts: unknown[][] = []
    const action = () =>
      Try(() => {
        throw original
      }, {
        catch(thrown) {
          Tests.expect(thrown).toBe(original)
          if (handlerFails) {
            throw handlerFailure
          }
          return 'recovered'
        },
        finally(thrown, error) {
          contexts.push([thrown, error])
        },
      })
    if (handlerFails) {
      Tests.throws(action, error => {
        Tests.expect((error as Errors.TaoError).cause).toBe(handlerFailure)
        return true
      })
    } else {
      Tests.expect(action()).toBe('recovered')
    }
    Tests.expect(contexts).toHaveLength(1)
    Tests.expect(contexts[0]![0]).toBe(original)
    Tests.expect((contexts[0]![1] as Errors.TaoError).cause).toBe(original)
  }
})

Tests.test('Try > finalizes successful callbacks with empty context and ignores finalizer values', () => {
  const contexts: unknown[][] = []
  const result: number = Try(() => 7, {
    finally(thrown, error) {
      contexts.push([thrown, error])
      return 99
    },
  })
  Tests.expect(result).toBe(7)
  Tests.expect(contexts).toEqual([[undefined, undefined]])
})

Tests.test('Try > awaits callback, recovery and cleanup in order before resolving', async () => {
  const events: string[] = []
  const original = new Error('body failed')
  const body = Promise.withResolvers<never>()
  const recovery = Promise.withResolvers<number>()
  const cleanup = Promise.withResolvers<void>()
  const enteredCatch = Promise.withResolvers<void>()
  const enteredFinally = Promise.withResolvers<void>()
  let settled = false
  const result: Promise<number> = Try(() => body.promise, {
    catch(thrown) {
      Tests.expect(thrown).toBe(original)
      events.push('catch')
      enteredCatch.resolve()
      return recovery.promise
    },
    finally(thrown, error) {
      Tests.expect(thrown).toBe(original)
      Tests.expect(error?.cause).toBe(original)
      events.push('finally')
      enteredFinally.resolve()
      return cleanup.promise
    },
  })
  const observed = result.then(value => {
    settled = true
    events.push('settled')
    return value
  })
  Tests.expect(events).toEqual([])
  body.reject(original)
  await enteredCatch.promise
  Tests.expect(events).toEqual(['catch'])
  Tests.expect(settled).toBe(false)
  recovery.resolve(42)
  await enteredFinally.promise
  Tests.expect(events).toEqual(['catch', 'finally'])
  Tests.expect(settled).toBe(false)
  cleanup.resolve()
  Tests.expect(await observed).toBe(42)
  Tests.expect(events).toEqual(['catch', 'finally', 'settled'])
})

Tests.test('Try > normalizes asynchronous body and catch failures', async () => {
  const original = new Error('async body')
  const replacement = ExternalErrors.fromUnknown(new Error('async handler'))
  await Tests.rejects(
    Try(async () => {
      throw original
    }),
    error => {
      Tests.expect((error as Errors.TaoError).cause).toBe(original)
      return true
    },
  )
  const contexts: unknown[][] = []
  await Tests.expect(
    Try(async () => {
      throw original
    }, {
      async catch() {
        throw replacement
      },
      finally(thrown, error) {
        contexts.push([thrown, error])
      },
    }),
  ).rejects.toBe(replacement)
  Tests.expect(contexts).toHaveLength(1)
  Tests.expect(contexts[0]![0]).toBe(original)
  Tests.expect((contexts[0]![1] as Errors.TaoError).cause).toBe(original)
})

Tests.test('Try > normalizes finalizer failures and lets them override pending results or errors', async () => {
  for (const bodyFails of [false, true]) {
    for (const asynchronous of [false, true]) {
      const cleanupFailure = new Error('cleanup failed')
      let calls = 0
      const cleanup = () => {
        calls++
        throw cleanupFailure
      }
      await Tests.rejects(async () =>
        Try(() => {
          if (bodyFails) {
            throw 'body failed'
          }
          return 7
        }, { finally: asynchronous ? async () => cleanup() : cleanup }), error => {
        Tests.expect((error as Errors.TaoError).cause).toBe(cleanupFailure)
        return true
      })
      Tests.expect(calls).toBe(1)
    }
  }
})

Tests.test('Try > awaits finalizers and WithDefault awaits recovery for synchronous callbacks', async () => {
  const result: Promise<number> = Try(() => 3, { async finally() {} })
  Tests.expect(result).toBeInstanceOf(Promise)
  Tests.expect(await result).toBe(3)
  const asynchronousRecovery: Promise<number> = Try.WithDefault(Promise.resolve(8), () => {
    throw 'body'
  })
  Tests.expect(await asynchronousRecovery).toBe(8)
})

Tests.test('Try > assimilates thenables and normalizes a throwing then getter', async () => {
  const thenable: PromiseLike<number> = {
    then: (resolve, reject) => Promise.resolve(9).then(resolve, reject),
  }
  const result: Promise<number> = Try(() => thenable)
  Tests.expect(await result).toBe(9)
  const failure = new Error('then getter')
  Tests.throws(() =>
    Try(() => ({
      get then() {
        throw failure
      },
    })), error => {
    Tests.expect((error as Errors.TaoError).cause).toBe(failure)
    return true
  })
})
