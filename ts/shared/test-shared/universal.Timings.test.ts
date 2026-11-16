import { Errors, Time, Timings, Try } from '@shared'
import * as Tests from '@shared-tests'

import type { OperationValue } from './universal.test-fixtures.Timings.Types'

const RuntimeClockNameRegx = /^runtime:/

const concatenate = Timings.measured('concatenate', (left: string, right: string) => left + right)
const parse = Timings.measured('parse', () => 42)
const compile = Timings.measure('compile', (timings, suffix: string) => timings.run(parse) + suffix)
const nothing = Timings.measured('nothing', () => {})
const fail = Timings.measured('failure', (failure: unknown) => Errors.Throw(failure))
const publish = Timings.measured('publish', async () => {
  await Promise.resolve()
  return 'saved'
})
const failPublish = Timings.measured('publish', async (failure: unknown) => Errors.Throw(failure))

Tests.test(
  'operations preserve inferred arguments, ordinary values and void without being callable',
  Timings.createTopLevelTimer(timings => {
    Tests.expect(typeof concatenate).toBe('object')
    Tests.expect(timings.run(concatenate, 'T', 'ao')).toBe('Tao')
    Tests.expect(timings.run(nothing)).toBeUndefined()
    Tests.expect(timings.samples.map(sample => sample.role)).toEqual(['leaf', 'leaf'])
    const result: OperationValue = timings.run(parse)
    Tests.expect(result).toBe(42)
  }),
)

Tests.test('repeated operation executions sample their own clock intervals and collector', () => {
  Timings.createTopLevelTimer(timings => {
    timings.run(concatenate, 'T', 'ao')
    timings.run(concatenate, 'Tao', '!')
    const [first, second] = timings.samples
    Tests.expect(second.startMs).toBeGreaterThanOrEqual(first.startMs + first.durationMs)
    Tests.expect(second.clock).toBe(first.clock)
  })()
})

Tests.test('orchestration injects its collector and records nested leaf spans', () => {
  Timings.createTopLevelTimer(timings => {
    Tests.expect(timings.run(compile, '!')).toBe('42!')
    const [leaf, orchestration] = timings.samples
    Tests.expect(leaf).toMatchObject({ name: 'parse', role: 'leaf', clock: timings.clock, status: 'succeeded' })
    Tests.expect(orchestration).toMatchObject({
      name: 'compile',
      role: 'orchestration',
      clock: timings.clock,
      status: 'succeeded',
    })
    Tests.expect(leaf.startMs).toBeGreaterThanOrEqual(orchestration.startMs)
    Tests.expect(leaf.durationMs).toBeLessThanOrEqual(orchestration.durationMs)
  })()
})

Tests.test(
  'synchronous failures retain identity and complete failed spans',
  Timings.createTopLevelTimer(timings => {
    const failure = Try(() => Errors.ThrowUserInput('Invalid source'), { catch: error => error })
    Tests.expect(Try(() => timings.run(fail, failure), { catch: error => error })).toBe(failure)
    Tests.expect(timings.samples[0]?.status).toBe('failed')
  }),
)

Tests.test('async spans finish after settlement and retain failure identity', async () => {
  await Timings.createTopLevelTimer(async timings => {
    const pending = timings.run(publish)
    Tests.expect(timings.samples).toEqual([])
    Tests.expect(await pending).toBe('saved')
    const failure = Try(() => Errors.ThrowUserInput('Publish failed'), { catch: error => error })
    Tests.expect(await Try(() => timings.run(failPublish, failure), { catch: error => error })).toBe(failure)
    Tests.expect(timings.samples.map(sample => sample.status)).toEqual(['succeeded', 'failed'])
  })()
})

Tests.test('callable entries isolate boundaries and retain the existing context and clock through run', () => {
  const contexts: Timings[] = []
  const entry = Timings.createTopLevelTimer((timings, value: string) => {
    contexts.push(timings)
    return timings.run(concatenate, value, '!')
  })
  Tests.expect(entry('first')).toBe('first!')
  Tests.expect(entry('second')).toBe('second!')
  const [first, second] = contexts
  Tests.expect(first).not.toBe(second)
  Tests.expect(first.samples).toHaveLength(1)
  Tests.expect(second.samples).toHaveLength(1)
  Tests.expect(first.clock).toMatch(RuntimeClockNameRegx)
  Tests.expect(second.clock).toBe(first.clock)
  Timings.createTopLevelTimer(existing => {
    Tests.expect(existing.run(entry, 'nested')).toBe('nested!')
    Tests.expect(contexts[2]).toBe(existing)
    Tests.expect(existing.samples[0]?.clock).toBe(existing.clock)
  })()
})

Tests.test('concurrent async entries retain separate collectors across interleaved settlement', async () => {
  const contexts: Timings[] = []
  const entry = Timings.createTopLevelTimer(async (timings, ready: Promise<void>) => {
    contexts.push(timings)
    await ready
    return timings.run(parse)
  })
  let release!: () => void
  const waiting = new Promise<void>(resolve => {
    release = resolve
  })
  const firstPending = entry(waiting)
  Tests.expect(await entry(Promise.resolve())).toBe(42)
  Tests.expect(contexts[0].samples).toHaveLength(0)
  Tests.expect(contexts[1].samples).toHaveLength(1)
  release()
  Tests.expect(await firstPending).toBe(42)
  Tests.expect(contexts[0]).not.toBe(contexts[1])
  Tests.expect(contexts[0].samples).toHaveLength(1)
  await Timings.createTopLevelTimer(async existing => {
    Tests.expect(await existing.run(entry, Promise.resolve())).toBe(42)
    Tests.expect(contexts[2]).toBe(existing)
    Tests.expect(existing.samples).toHaveLength(1)
  })()
})

Tests.test(
  'manual observations retain their clock and distinguish their span role',
  Timings.createTopLevelTimer(timings => {
    const startMs = Time.nowMs()
    timings.record('queue', startMs)
    const [sample] = timings.samples
    Tests.expect(sample).toMatchObject({
      name: 'queue',
      role: 'observation',
      clock: timings.clock,
      startMs,
      status: 'succeeded',
    })
    Tests.expect(sample.durationMs).toBeGreaterThanOrEqual(0)
  }),
)
