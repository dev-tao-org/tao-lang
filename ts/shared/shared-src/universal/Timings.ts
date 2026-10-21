import * as Time from './Time'
import { Try } from './TryCatch'

/** TimingSample records one completed operation in its explicitly named monotonic clock domain. */
export type TimingSample = {
  name: string
  clock: string
  startMs: number
  durationMs: number
  status: 'succeeded' | 'failed'
}

/** Timings collects operation spans for one request or bounded measurement run.
 *  Use Timings.exec for inline operations; create reusable measured functions at module scope.
 *  Default collectors use the runtime's clock identity; injected clocks require an explicit identity.
 *  Discard the collector with its request; timestamps from different clock domains cannot be subtracted. */
export class Timings {
  readonly samples: TimingSample[] = []

  constructor(readonly clock = Time.clockIdentity, private readonly now = Time.nowMs) {}

  record(name: string, startMs: number): void {
    this.samples.push({ name, clock: this.clock, startMs, durationMs: this.now() - startMs, status: 'succeeded' })
  }

  /** exec measures an inline operation through synchronous completion or promise settlement. */
  static exec<Value>(timings: Timings, name: string, action: () => Value): Value {
    const startMs = timings.now()
    return Try(action, {
      finally(_thrown, error) {
        timings.samples.push({
          name,
          clock: timings.clock,
          startMs,
          durationMs: timings.now() - startMs,
          status: error ? 'failed' : 'succeeded',
        })
      },
    }) as Value
  }

  static measure<Arguments extends unknown[], Value>(
    name: string,
    action: (...arguments_: Arguments) => Value,
  ): (timings: Timings, ...arguments_: Arguments) => Value {
    return (timings: Timings, ...arguments_: Arguments): Value =>
      Timings.exec(timings, name, () => action(...arguments_))
  }
}
