import { Errors, Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'

Describe('Try', () => {
  Test('recovers and finalizes even when a thrown object cannot be inspected', async () => {
    const revoked = Proxy.revocable({}, {})
    revoked.revoke()
    const hostile = new Proxy({}, {
      getPrototypeOf: () => {
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
          catch: original => {
            Expect(original).toBe(thrown)
            events.push('catch')
            return 'recovered'
          },
          finally: (original, error) => {
            Expect(original).toBe(thrown)
            Expect(Errors.isTaoError(error)).toBe(true)
            Expect(error?.cause).toBe(thrown)
            events.push('finally')
          },
        })
        Expect(result).toBe('recovered')
        Expect(events).toEqual(['catch', 'finally'])
      }
    }
  })

  Test('loads the package universal export as declared for consumers', async () => {
    const manifest = await Bun.file(new URL('../package.json', import.meta.url)).json()
    const universal = await import(new URL(manifest.exports['./universal'], new URL('../', import.meta.url)).href)
    Expect(universal.Try).toBe(Try)
    Expect(universal.Errors).toBe(Errors)
  })

  Test('preserves synchronous values and allows catch to recover synchronously', () => {
    const value = { id: 1 }
    const result: typeof value = Try(() => value)
    const recovered: number = Try(() => {
      throw 'input'
    }, { catch: () => 42 })
    Expect(result).toBe(value)
    Expect(recovered).toBe(42)
  })

  Test('normalizes unknown failures and preserves structured error identity', () => {
    for (const thrown of [new Error('raw'), 'failure', null, undefined]) {
      const error = Try(() =>
        Try(() => {
          throw thrown
        }), { catch: value => value })
      Expect(Errors.isTaoError(error)).toBe(true)
      Expect((error as Errors.TaoError).name).toBe('UnexpectedBehaviorError')
      Expect((error as Errors.TaoError).cause).toBe(thrown)
    }
    const original = Try(() => Errors.ThrowUserInput('Fix input'), { catch: value => value })
    Expect(Try(() =>
      Try(() => {
        throw original
      }), { catch: value => value })).toBe(original)
  })

  Test('finalizes once with the original failure even after catch recovery or failure', () => {
    const original = { reason: 'body failed' }
    const handlerFailure = new Error('handler failed')
    for (const handlerFails of [false, true]) {
      const contexts: unknown[][] = []
      const result = Try(() =>
        Try(() => {
          throw original
        }, {
          catch: thrown => {
            Expect(thrown).toBe(original)
            if (handlerFails) {
              throw handlerFailure
            }
            return 'recovered'
          },
          finally: (thrown, error) => {
            contexts.push([thrown, error])
          },
        }), { catch: error => error })
      Expect(contexts).toHaveLength(1)
      Expect(contexts[0]![0]).toBe(original)
      Expect((contexts[0]![1] as Errors.TaoError).cause).toBe(original)
      if (handlerFails) {
        Expect((result as Errors.TaoError).cause).toBe(handlerFailure)
      } else {
        Expect(result).toBe('recovered')
      }
    }
  })

  Test('finalizes successful callbacks with empty context and ignores finalizer values', () => {
    const contexts: unknown[][] = []
    const result: number = Try(() => 7, {
      finally: (thrown, error) => {
        contexts.push([thrown, error])
        return 99
      },
    })
    Expect(result).toBe(7)
    Expect(contexts).toEqual([[undefined, undefined]])
  })

  Test('awaits callback, recovery and cleanup in order before resolving', async () => {
    const events: string[] = []
    const original = new Error('body failed')
    const body = Promise.withResolvers<never>()
    const recovery = Promise.withResolvers<number>()
    const cleanup = Promise.withResolvers<void>()
    const enteredCatch = Promise.withResolvers<void>()
    const enteredFinally = Promise.withResolvers<void>()
    let settled = false
    const result: Promise<number> = Try(() => body.promise, {
      catch: thrown => {
        Expect(thrown).toBe(original)
        events.push('catch')
        enteredCatch.resolve()
        return recovery.promise
      },
      finally: (thrown, error) => {
        Expect(thrown).toBe(original)
        Expect(error?.cause).toBe(original)
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
    Expect(events).toEqual([])
    body.reject(original)
    await enteredCatch.promise
    Expect(events).toEqual(['catch'])
    Expect(settled).toBe(false)
    recovery.resolve(42)
    await enteredFinally.promise
    Expect(events).toEqual(['catch', 'finally'])
    Expect(settled).toBe(false)
    cleanup.resolve()
    Expect(await observed).toBe(42)
    Expect(events).toEqual(['catch', 'finally', 'settled'])
  })

  Test('normalizes asynchronous body and catch failures', async () => {
    const original = new Error('async body')
    const replacement = Try(() => Errors.ThrowHostEnvironment('async handler'), { catch: value => value })
    const bodyFailure = await Try(() =>
      Try(async () => {
        throw original
      }), { catch: value => value })
    Expect((bodyFailure as Errors.TaoError).cause).toBe(original)
    const contexts: unknown[][] = []
    const handlerFailure = await Try(() =>
      Try(async () => {
        throw original
      }, {
        catch: async () => {
          throw replacement
        },
        finally: (thrown, error) => {
          contexts.push([thrown, error])
        },
      }), { catch: value => value })
    Expect(handlerFailure).toBe(replacement)
    Expect(contexts).toHaveLength(1)
    Expect(contexts[0]![0]).toBe(original)
    Expect((contexts[0]![1] as Errors.TaoError).cause).toBe(original)
  })

  Test('normalizes finalizer failures and lets them override pending results or errors', async () => {
    for (const bodyFails of [false, true]) {
      for (const asynchronous of [false, true]) {
        const cleanupFailure = new Error('cleanup failed')
        let calls = 0
        const cleanup = () => {
          calls++
          throw cleanupFailure
        }
        const error = await Try(() =>
          Try(() => {
            if (bodyFails) {
              throw 'body failed'
            }
            return 7
          }, { finally: asynchronous ? async () => cleanup() : cleanup }), { catch: value => value })
        Expect((error as Errors.TaoError).cause).toBe(cleanupFailure)
        Expect(calls).toBe(1)
      }
    }
  })

  Test('awaits asynchronous finalizers and catch handlers for synchronous callbacks', async () => {
    const result: Promise<number> = Try(() => 3, { finally: async () => {} })
    Expect(result).toBeInstanceOf(Promise)
    Expect(await result).toBe(3)
    Expect(
      await Try(() => {
        throw 'body'
      }, { catch: async () => 8 }),
    ).toBe(8)
  })

  Test('assimilates thenables and normalizes a throwing then getter', async () => {
    const thenable: PromiseLike<number> = { then: (resolve, reject) => Promise.resolve(9).then(resolve, reject) }
    const result: Promise<number> = Try(() => thenable)
    Expect(await result).toBe(9)
    const failure = new Error('then getter')
    Expect(Try(() => ({
      get then() {
        throw failure
      },
    }), { catch: thrown => thrown })).toBe(failure)
  })
})

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
    const result = { command: 'tool', args: ['with spaces'], exitCode: 23, signal: null, stdout: 'out', stderr: 'err' }
    const error = Try(() => Errors.ThrowCommandExecution(result), { catch: value => value }) as Errors.TaoError
    Expect(error.name).toBe('CommandExecutionError')
    Expect(error.message).toBe('Command failed: tool "with spaces"')
    Expect(error.details).toMatchObject({ exitCode: 23, stdout: 'out', stderr: 'err' })
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
