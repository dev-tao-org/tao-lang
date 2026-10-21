import { Errors, Timings, Try } from '@shared'
import { Tests } from '@shared/os'
import type { TimingResult } from './Timings.types'

const concatenate = Timings.measured('concatenate', (left: string, right: string) => left + right)
const parse = Timings.measured('parse', () => 42)
const compile = Timings.measure('compile', (timings, suffix: string) => timings.run(parse) + suffix)
const nothing = Timings.measured('nothing', () => {})
const fail = Timings.measured('failure', (failure: unknown) => Errors.Throw(failure))
const publish = Timings.measured('publish', async (clock: { now: number }) => {
  await Promise.resolve()
  clock.now = 7
  return 'saved'
})
const failPublish = Timings.measured('publish', async (clock: { now: number }, failure: unknown) => {
  clock.now = 11
  Errors.Throw(failure)
})

Tests.test(
  'operations preserve inferred arguments, ordinary values and void without being callable',
  Timings.topLevelTimer(timings => {
    Tests.expect(typeof concatenate).toBe('object')
    Tests.expect(timings.run(concatenate, 'T', 'ao')).toBe('Tao')
    Tests.expect(timings.run(nothing)).toBeUndefined()
    Tests.expect(timings.samples.map(sample => sample.role)).toEqual(['leaf', 'leaf'])
    const result: TimingResult = timings.run(parse)
    Tests.expect(result).toBe(42)
  }),
)

Tests.test('repeated operation executions sample their own clock intervals and collector', () => {
  const ticks = [4, 7, 10, 15]
  Timings.topLevelTimer(timings => {
    timings.run(concatenate, 'T', 'ao')
    timings.run(concatenate, 'Tao', '!')
    Tests.expect(timings.samples.map(sample => [sample.startMs, sample.durationMs])).toEqual([[4, 3], [10, 5]])
    Timings.topLevelTimer(other => {
      Tests.expect(other.run(concatenate, 'T', 'ao')).toBe('Tao')
      Tests.expect(other.samples[0]?.clock).toBe('other')
    }, { clock: 'other', now: () => 100 })()
    Tests.expect(timings.samples).toHaveLength(2)
  }, { clock: 'first', now: () => ticks.shift()! })()
})

Tests.test('orchestration injects its collector and records nested leaf spans', () => {
  const ticks = [10, 12, 15, 20]
  Timings.topLevelTimer(timings => {
    Tests.expect(timings.run(compile, '!')).toBe('42!')
    Tests.expect(timings.samples).toEqual([
      { name: 'parse', role: 'leaf', clock: 'test', startMs: 12, durationMs: 3, status: 'succeeded' },
      { name: 'compile', role: 'orchestration', clock: 'test', startMs: 10, durationMs: 10, status: 'succeeded' },
    ])
  }, { clock: 'test', now: () => ticks.shift()! })()
})

Tests.test(
  'synchronous failures retain identity and complete failed spans',
  Timings.topLevelTimer(timings => {
    const failure = Try(() => Errors.ThrowUserInput('Invalid source'), { catch: error => error })
    Tests.expect(Try(() => timings.run(fail, failure), { catch: error => error })).toBe(failure)
    Tests.expect(timings.samples[0]?.status).toBe('failed')
  }),
)

Tests.test('async spans finish after settlement and retain failure identity', async () => {
  const clock = { now: 0 }
  await Timings.topLevelTimer(async timings => {
    const pending = timings.run(publish, clock)
    Tests.expect(timings.samples).toEqual([])
    Tests.expect(await pending).toBe('saved')
    const failure = Try(() => Errors.ThrowUserInput('Publish failed'), { catch: error => error })
    Tests.expect(await Try(() => timings.run(failPublish, clock, failure), { catch: error => error })).toBe(failure)
    Tests.expect(timings.samples.map(sample => [sample.durationMs, sample.status])).toEqual([
      [7, 'succeeded'],
      [4, 'failed'],
    ])
  }, { clock: 'test', now: () => clock.now })()
})

Tests.test('callable entries isolate boundaries and retain the existing context and clock through run', () => {
  const contexts: Timings[] = []
  const entry = Timings.topLevelTimer((timings, value: string) => {
    contexts.push(timings)
    return timings.run(concatenate, value, '!')
  })
  Tests.expect(entry('first')).toBe('first!')
  Tests.expect(entry('second')).toBe('second!')
  const [first, second] = contexts
  Tests.expect(first).not.toBe(second)
  Tests.expect(first.samples).toHaveLength(1)
  Tests.expect(second.samples).toHaveLength(1)
  Tests.expect(first.clock).toMatch(/^runtime:/)
  Tests.expect(second.clock).toBe(first.clock)
  Timings.topLevelTimer(existing => {
    Tests.expect(existing.run(entry, 'nested')).toBe('nested!')
    Tests.expect(contexts[2]).toBe(existing)
    Tests.expect(existing.samples[0]?.clock).toBe('existing')
  }, { clock: 'existing', now: () => 1 })()
})

Tests.test('concurrent async entries retain separate collectors across interleaved settlement', async () => {
  const contexts: Timings[] = []
  const entry = Timings.topLevelTimer(async (timings, ready: Promise<void>) => {
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
  await Timings.topLevelTimer(async existing => {
    Tests.expect(await existing.run(entry, Promise.resolve())).toBe(42)
    Tests.expect(contexts[2]).toBe(existing)
    Tests.expect(existing.samples).toHaveLength(1)
  })()
})

Tests.test(
  'manual observations retain their clock and distinguish their span role',
  Timings.topLevelTimer(timings => {
    timings.record('queue', 3)
    Tests.expect(timings.samples).toEqual([
      { name: 'queue', role: 'observation', clock: 'observation', startMs: 3, durationMs: 5, status: 'succeeded' },
    ])
  }, { clock: 'observation', now: () => 8 }),
)
