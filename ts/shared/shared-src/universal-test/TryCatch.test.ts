import { Errors, Try } from '@shared'
import { Test } from '@shared/os'

Test.test('Try > recovers and finalizes even when a thrown object cannot be inspected', async () => {
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
          Test.expect(original).toBe(thrown)
          events.push('catch')
          return 'recovered'
        },
        finally(original, error) {
          Test.expect(original).toBe(thrown)
          Test.expect(Errors.isTaoError(error)).toBe(true)
          Test.expect(error?.cause).toBe(thrown)
          events.push('finally')
        },
      })
      Test.expect(result).toBe('recovered')
      Test.expect(events).toEqual(['catch', 'finally'])
    }
  }
})

Test.test('Try > preserves synchronous values and allows catch to recover synchronously', () => {
  const value = { id: 1 }
  const result: typeof value = Try(() => value)
  const recovered: number = Try(() => {
    throw 'input'
  }, {
    catch() {
      return 42
    },
  })
  Test.expect(result).toBe(value)
  Test.expect(recovered).toBe(42)
})

Test.test('Try > normalizes unknown failures and preserves structured error identity', () => {
  for (const thrown of [new Error('raw'), 'failure', null, undefined]) {
    Test.throws(() =>
      Try(() => {
        throw thrown
      }), error => {
      Test.expect(Errors.isTaoError(error)).toBe(true)
      Test.expect((error as Errors.TaoError).name).toBe('UnexpectedBehaviorError')
      Test.expect((error as Errors.TaoError).cause).toBe(thrown)
      return true
    })
  }
  const original = Errors.fromUnknown(new Error('structured failure'))
  Test.throws(() =>
    Try(() => {
      throw original
    }), error => {
    Test.expect(error).toBe(original)
    return true
  })
})

Test.test('Try > finalizes once with the original failure even after catch recovery or failure', () => {
  const original = { reason: 'body failed' }
  const handlerFailure = new Error('handler failed')
  for (const handlerFails of [false, true]) {
    const contexts: unknown[][] = []
    const action = () =>
      Try(() => {
        throw original
      }, {
        catch(thrown) {
          Test.expect(thrown).toBe(original)
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
      Test.throws(action, error => {
        Test.expect((error as Errors.TaoError).cause).toBe(handlerFailure)
        return true
      })
    } else {
      Test.expect(action()).toBe('recovered')
    }
    Test.expect(contexts).toHaveLength(1)
    Test.expect(contexts[0]![0]).toBe(original)
    Test.expect((contexts[0]![1] as Errors.TaoError).cause).toBe(original)
  }
})

Test.test('Try > finalizes successful callbacks with empty context and ignores finalizer values', () => {
  const contexts: unknown[][] = []
  const result: number = Try(() => 7, {
    finally(thrown, error) {
      contexts.push([thrown, error])
      return 99
    },
  })
  Test.expect(result).toBe(7)
  Test.expect(contexts).toEqual([[undefined, undefined]])
})

Test.test('Try > awaits callback, recovery and cleanup in order before resolving', async () => {
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
      Test.expect(thrown).toBe(original)
      events.push('catch')
      enteredCatch.resolve()
      return recovery.promise
    },
    finally(thrown, error) {
      Test.expect(thrown).toBe(original)
      Test.expect(error?.cause).toBe(original)
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
  Test.expect(events).toEqual([])
  body.reject(original)
  await enteredCatch.promise
  Test.expect(events).toEqual(['catch'])
  Test.expect(settled).toBe(false)
  recovery.resolve(42)
  await enteredFinally.promise
  Test.expect(events).toEqual(['catch', 'finally'])
  Test.expect(settled).toBe(false)
  cleanup.resolve()
  Test.expect(await observed).toBe(42)
  Test.expect(events).toEqual(['catch', 'finally', 'settled'])
})

Test.test('Try > normalizes asynchronous body and catch failures', async () => {
  const original = new Error('async body')
  const replacement = Errors.fromUnknown(new Error('async handler'))
  await Test.rejects(
    Try(async () => {
      throw original
    }),
    error => {
      Test.expect((error as Errors.TaoError).cause).toBe(original)
      return true
    },
  )
  const contexts: unknown[][] = []
  await Test.expect(
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
  Test.expect(contexts).toHaveLength(1)
  Test.expect(contexts[0]![0]).toBe(original)
  Test.expect((contexts[0]![1] as Errors.TaoError).cause).toBe(original)
})

Test.test('Try > normalizes finalizer failures and lets them override pending results or errors', async () => {
  for (const bodyFails of [false, true]) {
    for (const asynchronous of [false, true]) {
      const cleanupFailure = new Error('cleanup failed')
      let calls = 0
      const cleanup = () => {
        calls++
        throw cleanupFailure
      }
      await Test.rejects(async () =>
        Try(() => {
          if (bodyFails) {
            throw 'body failed'
          }
          return 7
        }, { finally: asynchronous ? async () => cleanup() : cleanup }), error => {
        Test.expect((error as Errors.TaoError).cause).toBe(cleanupFailure)
        return true
      })
      Test.expect(calls).toBe(1)
    }
  }
})

Test.test('Try > awaits asynchronous finalizers and catch handlers for synchronous callbacks', async () => {
  const result: Promise<number> = Try(() => 3, { async finally() {} })
  Test.expect(result).toBeInstanceOf(Promise)
  Test.expect(await result).toBe(3)
  Test.expect(
    await Try(() => {
      throw 'body'
    }, {
      async catch() {
        return 8
      },
    }),
  ).toBe(8)
})

Test.test('Try > assimilates thenables and normalizes a throwing then getter', async () => {
  const thenable: PromiseLike<number> = {
    then(resolve, reject) {
      return Promise.resolve(9).then(resolve, reject)
    },
  }
  const result: Promise<number> = Try(() => thenable)
  Test.expect(await result).toBe(9)
  const failure = new Error('then getter')
  Test.throws(() =>
    Try(() => ({
      get then() {
        throw failure
      },
    })), error => {
    Test.expect((error as Errors.TaoError).cause).toBe(failure)
    return true
  })
})
