import { Errors, Timings, Try } from '@shared'
import { Tests } from '@shared/os'

Tests.test('operation timings preserve results, nesting and failed operation identity', () => {
  const ticks = [10, 12, 15, 20, 21, 23]
  const timings = new Timings('server:run-1', () => ticks.shift()!)
  const result = timings.measure('compile', () => timings.measure('parse', () => 42))
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
  const observed = Try(() => timings.measure('parse', () => Errors.Throw(failure)), {
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
  const completed = timings.measure('publish', async () => {
    now = 7
    return 'saved'
  })
  Tests.expect(timings.samples).toEqual([])
  Tests.expect(await completed).toBe('saved')
  const failure = Try(() => Errors.ThrowUserInput('Publish failed'), {
    catch(error) {
      return error
    },
  })
  const observed = await Try(() =>
    timings.measure('publish', async () => {
      now = 11
      Errors.Throw(failure)
    }), {
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
