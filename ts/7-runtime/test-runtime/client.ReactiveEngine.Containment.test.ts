import * as Tests from '@shared-tests'
import { createReactiveEngine } from '../runtime-src/client/ReactiveEngine'

Tests.test('feedback failure preserves unrelated observers and queued deliveries', () => {
  for (const deferred of [false, true]) {
    const queue: (() => void)[] = []
    const engine = createReactiveEngine({ scheduleDelivery: deferred ? deliver => queue.push(deliver) : undefined })
    const first = engine.createWritable(0)
    const second = engine.createWritable(0)
    const independent = engine.createWritable(0)
    const observed: number[] = []
    independent.observe(value => observed.push(value))
    first.observe(value => {
      if (value > 0) {
        second.update(value + 1)
      }
    })
    second.observe(value => {
      if (value > 0) {
        first.update(value + 1)
      }
    })

    Tests.expect(() => {
      engine.batch(() => {
        first.update(1)
        independent.update(1)
      })
      while (queue.length > 0) {
        queue.shift()?.()
      }
    }).toThrow('reentrant delivery limit')
    independent.update(2)
    while (queue.length > 0) {
      queue.shift()?.()
    }
    Tests.expect(observed).toEqual([0, 1, 2])
    engine.dispose()
  }
})

Tests.test('feedback stays bounded with interleaved observers and replacement subscriptions', () => {
  for (const deferred of [false, true]) {
    for (const replace of [false, true]) {
      verifyInterleavedFeedback(deferred, replace)
    }
  }
})

Tests.test('an independent observer entering near the feedback limit remains subscribed', () => {
  const queue: (() => void)[] = []
  const engine = createReactiveEngine({ scheduleDelivery: deliver => queue.push(deliver) })
  const source = engine.createWritable(0)
  const independent = engine.createWritable(0)
  const observed: number[] = []
  independent.observe(value => observed.push(value))
  source.observe(value => {
    if (value > 0 && value < 1000) {
      source.update(value + 1)
      if (value === 98) {
        independent.update(1)
      }
    }
  })
  source.update(1)
  Tests.expect(() => queue.shift()?.()).toThrow('reentrant delivery limit')
  independent.update(2)
  queue.shift()?.()
  Tests.expect(observed).toEqual([0, 1, 2])
  engine.dispose()
})

function verifyInterleavedFeedback(deferred: boolean, replace: boolean): void {
  const queue: (() => void)[] = []
  const engine = createReactiveEngine({ scheduleDelivery: deferred ? deliver => queue.push(deliver) : undefined })
  const source = engine.createWritable(0)
  const independent = engine.createWritable(0)
  let latest = 0
  let subscription = source.observe(() => undefined)
  const receive = (value: number): void => {
    if (value > 0 && value < 1000) {
      if (replace) {
        subscription.unobserve()
        let initial = true
        subscription = source.observe(next => {
          if (!initial) {
            receive(next)
          }
        })
        initial = false
      }
      source.update(value + 1)
      independent.update(value)
    }
  }
  subscription.unobserve()
  subscription = source.observe(receive)
  independent.observe(value => latest = value)
  Tests.expect(() => {
    source.update(1)
    queue.shift()?.()
  }).toThrow('reentrant delivery limit')
  Tests.expect(source.jsValue() < 1000).toBe(true)
  independent.update(2000)
  while (queue.length > 0) {
    queue.shift()?.()
  }
  Tests.expect(latest).toBe(2000)
  source.update(1)
  queue.shift()?.()
  Tests.expect(source.jsValue()).toBe(1)
  engine.dispose()
}
