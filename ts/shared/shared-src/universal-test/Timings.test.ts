import { Errors, Timings, Try } from '@shared'
import { Tests } from '@shared/os'

const concatenate = Timings.measure('concatenate', (left: string, right: string) => left + right)
const parse = Timings.measure('parse', () => 42)
const compile = Timings.measure('compile', (timings: Timings) => parse(timings))
const failParse = Timings.measure('parse', (failure: unknown) => Errors.Throw(failure))
const publish = Timings.measure('publish', async (clock: { now: number }) => {
  clock.now = 7
  return 'saved'
})
const failPublish = Timings.measure('publish', async (clock: { now: number }, failure: unknown) => {
  clock.now = 11
  Errors.Throw(failure)
})

Tests.test('measured functions start on each invocation and preserve arguments', () => {
  const ticks = [4, 7, 10, 15]
  const timings = new Timings('server:reusable', () => ticks.shift()!)
  Tests.expect(timings.samples).toEqual([])
  Tests.expect(concatenate(timings, 'T', 'ao')).toBe('Tao')
  Tests.expect(concatenate(timings, 'Tao', '!')).toBe('Tao!')
  Tests.expect(timings.samples.map(sample => [sample.startMs, sample.durationMs])).toEqual([[4, 3], [10, 5]])
  const otherTicks = [100, 108]
  const other = new Timings('server:other', () => otherTicks.shift()!)
  Tests.expect(concatenate(other, 'T', 'ao')).toBe('Tao')
  Tests.expect(other.samples).toEqual([
    { name: 'concatenate', clock: 'server:other', startMs: 100, durationMs: 8, status: 'succeeded' },
  ])
  Tests.expect(timings.samples).toHaveLength(2)
})

Tests.test('operation timings preserve results, nesting and failed operation identity', () => {
  const ticks = [10, 12, 15, 20, 21, 23]
  const timings = new Timings('server:run-1', () => ticks.shift()!)
  Tests.expect(timings.samples).toEqual([])
  const result = compile(timings, timings)
  Tests.expect(result).toBe(42)
  Tests.expect(timings.samples).toEqual([
    { name: 'parse', clock: 'server:run-1', startMs: 12, durationMs: 3, status: 'succeeded' },
    { name: 'compile', clock: 'server:run-1', startMs: 10, durationMs: 10, status: 'succeeded' },
  ])
  const failure = Try(() => Errors.ThrowUserInput('Invalid source'), {
    catch: (error) => error,
  })
  const observed = Try(() => failParse(timings, failure), {
    catch: (error) => error,
  })
  Tests.expect(observed).toBe(failure)
  Tests.expect(timings.samples[2]).toEqual({
    name: 'parse',
    clock: 'server:run-1',
    startMs: 21,
    durationMs: 2,
    status: 'failed',
  })
})

Tests.test('async operation timings finish after settlement and retain the original failure', async () => {
  const clock = { now: 0 }
  const timings = new Timings('browser:frame-1', () => clock.now)
  Tests.expect(timings.samples).toEqual([])
  Tests.expect(await publish(timings, clock)).toBe('saved')
  const failure = Try(() => Errors.ThrowUserInput('Publish failed'), {
    catch: (error) => error,
  })
  const observed = await Try(() => failPublish(timings, clock, failure), {
    catch: (error) => error,
  })
  Tests.expect(observed).toBe(failure)
  Tests.expect(timings.samples.map(sample => [sample.durationMs, sample.status])).toEqual([
    [7, 'succeeded'],
    [4, 'failed'],
  ])
})
