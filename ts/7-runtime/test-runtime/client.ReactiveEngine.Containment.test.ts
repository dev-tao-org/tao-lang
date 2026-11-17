import { Time, Try, UserInput } from '@shared'
import * as Tests from '@shared-tests'
import { createReactiveEngine } from '../runtime-src/client/ReactiveEngine'

Tests.test('a write during initial delivery fails before changing the value', () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable(0)
  let calls = 0
  Tests.expect(() =>
    source.observe(() => {
      calls += 1
      source.update(1)
    })
  ).toThrow('Observation callbacks cannot write Tao state')
  Tests.expect(source.jsValue()).toBe(0)
  source.update(2)
  Tests.expect(calls).toBe(1)
  engine.dispose()
})

Tests.test('equal writes through a nested batch fail and only stop the writing observer', () => {
  verifyNestedBatchFailure(false)
  verifyNestedBatchFailure(true)
})

Tests.test('a native async callback is rejected before its body executes', () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable(0)
  let called = false
  const receive = async (): Promise<void> => {
    called = true
  }

  if (false) {
    // @ts-expect-error Native async callbacks are rejected by the public expression type.
    source.observe(receive)
    // @ts-expect-error Callable then methods are rejected even on structural thenables.
    source.observe(() => ({ then: () => undefined }))
  }

  Tests.expect(() => source.observe(receive as () => void)).toThrow('Observation callbacks must finish synchronously')
  const receiveThenable = () => ({ then: () => undefined })
  Tests.expect(() => source.observe(receiveThenable as () => void)).toThrow(
    'Observation callbacks must finish synchronously',
  )
  Tests.expect(called).toBe(false)
  engine.dispose()
})

Tests.test('a rejected promise return stops its observer and releases the writing boundary synchronously', async () => {
  const queue: (() => void)[] = []
  const engine = createReactiveEngine({ scheduleDelivery: deliver => queue.push(deliver) })
  const source = engine.createWritable(0)
  let calls = 0
  const receive = (value: number) => {
    calls += 1
    if (value === 1) {
      return Promise.resolve().then(() => UserInput.fail('late failure'))
    }
    return undefined
  }
  if (false) {
    // @ts-expect-error A callback may not return a promise on any branch.
    source.observe(receive)
  }
  source.observe(receive as (value: number) => void)
  source.update(1)
  Tests.expect(() => queue.shift()?.()).toThrow('Observation callbacks must finish synchronously')
  source.update(2)
  queue.shift()?.()
  await Time.sleep(0)
  Tests.expect(source.jsValue()).toBe(2)
  Tests.expect(calls).toBe(2)
  engine.dispose()
})

Tests.test('rejecting a structural thenable does not execute its deferred write', async () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable(0)
  let called = false
  const receive = () => ({
    then(resolve: () => void) {
      called = true
      source.update(1)
      resolve()
    },
  })
  Tests.expect(() => source.observe(receive as () => void)).toThrow('Observation callbacks must finish synchronously')
  await Promise.resolve()
  Tests.expect(called).toBe(false)
  Tests.expect(source.jsValue()).toBe(0)
  engine.dispose()
})

Tests.test('rejecting a promise does not execute a thenable produced by its species', async () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable(0)
  const result = Promise.resolve()
  let calls = 0
  function createDerived(execute: (resolve: () => void, reject: () => void) => void) {
    execute(() => undefined, () => undefined)
    return {
      then(resolve: () => void) {
        calls += 1
        source.update(1)
        resolve()
      },
    }
  }
  Object.defineProperty(result, 'constructor', { value: { [Symbol.species]: createDerived } })
  Tests.expect(() => source.observe((() => result) as () => void)).toThrow(
    'Observation callbacks must finish synchronously',
  )
  await Promise.resolve()
  Tests.expect(calls).toBe(0)
  Tests.expect(source.jsValue()).toBe(0)
  engine.dispose()
})

function verifyNestedBatchFailure(deferred: boolean): void {
  const queue: (() => void)[] = []
  const engine = createReactiveEngine({ scheduleDelivery: deferred ? deliver => queue.push(deliver) : undefined })
  const otherEngine = createReactiveEngine()
  const source = engine.createWritable(0)
  const independent = otherEngine.createWritable(0)
  const observed: number[] = []
  const nestedValues: number[] = []
  let writingCalls = 0
  source.observe(value => {
    writingCalls += 1
    if (value === 1) {
      independent.observe(next => nestedValues.push(next))
      Try(() => otherEngine.batch(() => independent.update(0)), { catch: () => undefined })
    }
  })
  source.observe(value => observed.push(value))

  Tests.expect(() => {
    source.update(1)
    queue.shift()?.()
  }).toThrow('Observation callbacks cannot write Tao state')
  independent.update(2)
  source.update(2)
  queue.shift()?.()
  Tests.expect(writingCalls).toBe(2)
  Tests.expect(observed).toEqual([0, 1, 2])
  Tests.expect(nestedValues).toEqual([0, 2])
  engine.dispose()
  otherEngine.dispose()
}
