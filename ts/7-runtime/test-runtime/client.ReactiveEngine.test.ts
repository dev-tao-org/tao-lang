import { Errors } from '@shared'
import * as Tests from '@shared-tests'

import { createReactiveEngine } from '../runtime-src/client/ReactiveEngine'
import type { ReactiveEngine } from '../runtime-src/client/ReactiveEngine'

Tests.test('expressions preserve Object.is values, dynamic dependencies, diamonds, and fresh batched reads', () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable(0)
  const negative = engine.createComputed(() => 1 / source.jsValue())
  const left = engine.createComputed(() => source.jsValue() + 1)
  const right = engine.createComputed(() => source.jsValue() + 2)
  const diamond = engine.createComputed(() => left.jsValue() + right.jsValue())
  const chooseLeft = engine.createWritable(true)
  const a = engine.createWritable('a')
  const b = engine.createWritable('b')
  const selected = engine.createComputed(() => chooseLeft.jsValue() ? a.jsValue() : b.jsValue())
  const inverseValues: number[] = []
  const selectedValues: string[] = []
  negative.observe(value => inverseValues.push(value))
  selected.observe(value => selectedValues.push(value))

  Tests.expect(diamond.jsValue()).toBe(3)
  engine.batch(() => {
    source.update(-0)
    Tests.expect(negative.jsValue()).toBe(Number.NEGATIVE_INFINITY)
    source.update(0)
    Tests.expect(negative.jsValue()).toBe(Number.POSITIVE_INFINITY)
  })
  Tests.expect(inverseValues).toEqual([Number.POSITIVE_INFINITY])
  source.update(-0)
  Tests.expect(inverseValues).toEqual([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
  Tests.expect(diamond.jsValue()).toBe(3)
  source.update(5)
  Tests.expect(diamond.jsValue()).toBe(13)

  chooseLeft.update(false)
  a.update('ignored')
  b.update('used')
  Tests.expect(selectedValues).toEqual(['a', 'b', 'used'])
  engine.dispose()
})

Tests.test('computed output encoding preserves signed zero through a downstream calculation', () => {
  const engine = createReactiveEngine()
  const negative = engine.createWritable(false)
  const signedZero = engine.createComputed(() => negative.jsValue() ? -0 : 0)
  const inverse = engine.createComputed(() => 1 / signedZero.jsValue())
  const observed: number[] = []
  inverse.observe(value => observed.push(value))

  negative.update(true)

  Tests.expect(Object.is(signedZero.jsValue(), -0)).toBe(true)
  Tests.expect(inverse.jsValue()).toBe(Number.NEGATIVE_INFINITY)
  Tests.expect(observed).toEqual([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
  engine.dispose()
})

Tests.test('NaN writes and computed NaN outputs settle once under Object.is equality', () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable(Number.NaN)
  let evaluations = 0
  const derived = engine.createComputed(() => {
    evaluations += 1
    return source.jsValue() + 1
  })
  const values: number[] = []
  derived.observe(value => values.push(value))
  source.update(Number.NaN)
  Tests.expect(values).toEqual([Number.NaN])
  Tests.expect(evaluations).toBe(1)
  engine.dispose()
})

Tests.test('native lazy and uncached public reads retain their distinct evaluation counts', () => {
  const lazy = createReactiveEngine()
  const lazyInput = lazy.createWritable(1)
  let lazyRuns = 0
  const lazyValue = lazy.createComputed(() => {
    lazyRuns += 1
    return lazyInput.jsValue() * 2
  })
  Tests.expect(lazyValue.jsValue()).toBe(2)
  Tests.expect(lazyValue.jsValue()).toBe(2)
  Tests.expect(lazyRuns).toBe(1)
  lazy.dispose()

  const uncached = createReactiveEngine({ strategy: 'uncached-public-read' })
  const uncachedInput = uncached.createWritable(1)
  let uncachedRuns = 0
  const uncachedValue = uncached.createComputed(() => {
    uncachedRuns += 1
    return uncachedInput.jsValue() * 2
  })
  uncachedValue.jsValue()
  uncachedValue.jsValue()
  Tests.expect(uncachedRuns).toBe(2)
  uncached.dispose()
})

Tests.test('supported read and delivery policies preserve shared expression semantics', () => {
  const queue: (() => void)[] = []
  const policies = [
    {},
    { strategy: 'uncached-public-read' as const },
    { scheduleDelivery: (deliver: () => void) => queue.push(deliver) },
  ]
  policies.forEach(options => {
    const engine = createReactiveEngine(options)
    verifyPolicySemantics(engine, queue)
    engine.dispose()
  })
})

Tests.test('deferred delivery coalesces and cancelled or disposed observers ignore queued callbacks', () => {
  const queue: (() => void)[] = []
  const engine = createReactiveEngine({ scheduleDelivery: deliver => queue.push(deliver) })
  const source = engine.createWritable(0)
  const values: number[] = []
  const observation = source.observe(value => values.push(value))
  source.update(1)
  source.update(2)
  Tests.expect(source.jsValue()).toBe(2)
  Tests.expect(values).toEqual([0])
  queue.splice(0).forEach(deliver => deliver())
  Tests.expect(values).toEqual([0, 2])
  source.update(0)
  queue.splice(0).forEach(deliver => deliver())
  Tests.expect(values).toEqual([0, 2, 0])
  source.update(1)
  source.update(0)
  queue.splice(0).forEach(deliver => deliver())
  Tests.expect(values).toEqual([0, 2, 0])
  source.update(3)
  queue.splice(0).forEach(deliver => deliver())
  Tests.expect(values).toEqual([0, 2, 0, 3])
  observation.unobserve()
  observation.unobserve()

  const pending = source.observe(() => {})
  source.update(4)
  engine.dispose()
  pending.unobserve()
  queue.splice(0).forEach(deliver => deliver())
  Tests.expect(() => source.jsValue()).toThrow('reactive engine has been disposed')
})

Tests.test('nested batches clean up after errors and reject asynchronous ownership', () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable(0)
  Tests.expect(() =>
    engine.batch(() => {
      source.update(1)
      engine.batch(() => source.update(2))
      throw new Error('failed')
    })
  ).toThrow('failed')
  Tests.expect(source.jsValue()).toBe(2)
  Tests.expect(() => engine.batch(() => Promise.resolve())).toThrow('must finish synchronously')
  Tests.expect(source.jsValue()).toBe(2)
  engine.dispose()
})

Tests.test('a failing queued observer does not strand other deliveries or subsequent writes', () => {
  const queue: (() => void)[] = []
  const engine = createReactiveEngine({ scheduleDelivery: deliver => queue.push(deliver) })
  const source = engine.createWritable(0)
  const values: number[] = []
  source.observe(value => {
    if (value === 1) {
      Errors.ThrowUserInput('observer failed')
    }
  })
  source.observe(value => values.push(value))
  source.update(1)
  Tests.expect(() => flushQueuedDeliveries(queue)).toThrow('observer failed')
  Tests.expect(values).toEqual([0, 1])
  source.update(2)
  flushQueuedDeliveries(queue)
  Tests.expect(values).toEqual([0, 1, 2])
  engine.dispose()
})

Tests.test('reentrant observer update loops fail with a bounded actionable error', () => {
  const engine = createReactiveEngine()
  const first = engine.createWritable(0)
  const second = engine.createWritable(0)
  first.observe(value => {
    if (value > 0 && value < 1000) {
      second.update(value + 1)
    }
  })
  second.observe(value => {
    if (value > 0 && value < 1000) {
      first.update(value + 1)
    }
  })

  Tests.expect(() => first.update(1)).toThrow('reentrant delivery limit')
  engine.dispose()
})

Tests.test('independent observers and source updates are not counted as one delivery cycle', () => {
  const engine = createReactiveEngine()
  const source = engine.createWritable(0)
  let deliveries = 0
  for (let index = 0; index < 128; index += 1) {
    source.observe(() => {
      deliveries += 1
    })
  }

  source.update(1)
  source.update(2)

  Tests.expect(deliveries).toBe(128 * 3)
  engine.dispose()
})

Tests.test('observer reads do not become dependencies of the observed expression', () => {
  const engine = createReactiveEngine()
  const observed = engine.createWritable(0)
  const incidental = engine.createWritable('before')
  const values: number[] = []
  observed.observe(value => {
    values.push(value)
    incidental.jsValue()
  })

  incidental.update('after')

  Tests.expect(values).toEqual([0])
  observed.update(1)
  Tests.expect(values).toEqual([0, 1])
  engine.dispose()
})

function verifyPolicySemantics(engine: ReactiveEngine, queue: (() => void)[]): void {
  verifyDiamondAndNestedBatch(engine, queue)
  verifyDynamicBranchDetaches(engine, queue)
  verifyObjectIsEquality(engine, queue)
}

function verifyDiamondAndNestedBatch(engine: ReactiveEngine, queue: (() => void)[]): void {
  const source = engine.createWritable(0)
  const left = engine.createComputed(() => source.jsValue())
  const right = engine.createComputed(() => source.jsValue() * 2)
  const diamond = engine.createComputed(() => left.jsValue() + right.jsValue())
  const values: number[] = []
  diamond.observe(value => values.push(value))
  engine.batch(() => {
    source.update(1)
    engine.batch(() => {
      source.update(2)
      Tests.expect(diamond.jsValue()).toBe(6)
    })
  })
  flushQueuedDeliveries(queue)
  Tests.expect(values).toEqual([0, 6])
}

function verifyDynamicBranchDetaches(engine: ReactiveEngine, queue: (() => void)[]): void {
  const chooseLeft = engine.createWritable(true)
  const left = engine.createWritable('left')
  const right = engine.createWritable('right')
  const selected = engine.createComputed(() => chooseLeft.jsValue() ? left.jsValue() : right.jsValue())
  const values: string[] = []
  selected.observe(value => values.push(value))
  engine.batch(() => {
    chooseLeft.update(false)
    right.update('right-2')
  })
  flushQueuedDeliveries(queue)
  left.update('detached')
  flushQueuedDeliveries(queue)
  Tests.expect(values).toEqual(['left', 'right-2'])
}

function verifyObjectIsEquality(engine: ReactiveEngine, queue: (() => void)[]): void {
  const source = engine.createWritable(0)
  const values: number[] = []
  source.observe(value => values.push(value))
  source.update(-0)
  flushQueuedDeliveries(queue)
  source.update(-0)
  source.update(Number.NaN)
  source.update(Number.NaN)
  flushQueuedDeliveries(queue)
  Tests.expect(values.length).toBe(3)
  Tests.expect(Object.is(values[1], -0)).toBe(true)
  Tests.expect(Number.isNaN(values[2])).toBe(true)
}

function flushQueuedDeliveries(queue: (() => void)[]): void {
  while (queue.length > 0) {
    queue.shift()?.()
  }
}
