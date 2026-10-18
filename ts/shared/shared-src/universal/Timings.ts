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
 *  Create measured functions at module scope and pass their recorder on each call.
 *  Discard the collector with its request; timestamps from different clock domains cannot be subtracted. */
export class Timings {
  readonly samples: TimingSample[] = []

  constructor(readonly clock: string, private readonly now = Time.nowMs) {}

  record(name: string, startMs: number): void {
    this.samples.push({ name, clock: this.clock, startMs, durationMs: this.now() - startMs, status: 'succeeded' })
  }

  static measure<Arguments extends unknown[], Value>(
    name: string,
    action: (...arguments_: Arguments) => Value,
  ): (timings: Timings, ...arguments_: Arguments) => Value {
    return (timings: Timings, ...arguments_: Arguments): Value => {
      const startMs = timings.now()
      return Try(() => action(...arguments_), {
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
  }
}
