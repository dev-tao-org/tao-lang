import { Errors, Timings, Try } from '@shared'
import { Tests } from '@shared/os'

Tests.test('measured functions start on each invocation and preserve arguments', () => {
  const ticks = [4, 7, 10, 15]
  const timings = new Timings('server:reusable', () => ticks.shift()!)
  const concatenate = timings.measure('concatenate', function concatenate(left: string, right: string) {
    return left + right
  })
  Tests.expect(timings.samples).toEqual([])
  Tests.expect(concatenate('T', 'ao')).toBe('Tao')
  Tests.expect(concatenate('Tao', '!')).toBe('Tao!')
  Tests.expect(timings.samples.map(sample => [sample.startMs, sample.durationMs])).toEqual([[4, 3], [10, 5]])
})

Tests.test('operation timings preserve results, nesting and failed operation identity', () => {
  const ticks = [10, 12, 15, 20, 21, 23]
  const timings = new Timings('server:run-1', () => ticks.shift()!)
  const parse = timings.measure('parse', function parse() {
    return 42
  })
  const compile = timings.measure('compile', function compile() {
    return parse()
  })
  Tests.expect(timings.samples).toEqual([])
  const result = compile()
  Tests.expect(result).toBe(42)
  Tests.expect(timings.samples).toEqual([
    { name: 'parse', clock: 'server:run-1', startMs: 12, durationMs: 3, status: 'succeeded' },
    { name: 'compile', clock: 'server:run-1', startMs: 10, durationMs: 10, status: 'succeeded' },
  ])
  const failure = Try(() => Errors.ThrowUserInput('Invalid source'), {
    catch(error) {
      return error
    },
  })
  const failParse = timings.measure('parse', function failParse() {
    return Errors.Throw(failure)
  })
  const observed = Try(() => failParse(), {
    catch(error) {
      return error
    },
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
  let now = 0
  const timings = new Timings('browser:frame-1', () => now)
  const publish = timings.measure('publish', async function publish() {
    now = 7
    return 'saved'
  })
  Tests.expect(timings.samples).toEqual([])
  Tests.expect(await publish()).toBe('saved')
  const failure = Try(() => Errors.ThrowUserInput('Publish failed'), {
    catch(error) {
      return error
    },
  })
  const failPublish = timings.measure('publish', async function failPublish() {
    now = 11
    Errors.Throw(failure)
  })
  const observed = await Try(() => failPublish(), {
    catch(error) {
      return error
    },
  })
  Tests.expect(observed).toBe(failure)
  Tests.expect(timings.samples.map(sample => [sample.durationMs, sample.status])).toEqual([
    [7, 'succeeded'],
    [4, 'failed'],
  ])
})
