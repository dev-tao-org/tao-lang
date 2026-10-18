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
 *  Discard the collector with its request; timestamps from different clock domains cannot be subtracted. */
export class Timings {
  readonly samples: TimingSample[] = []

  constructor(readonly clock: string, private readonly now = Time.nowMs) {}

  record(name: string, startMs: number): void {
    this.samples.push({ name, clock: this.clock, startMs, durationMs: this.now() - startMs, status: 'succeeded' })
  }

  measure<Arguments extends unknown[], Value>(
    name: string,
    action: (...arguments_: Arguments) => Value,
  ): (...arguments_: Arguments) => Value {
    const now = this.now
    const clock = this.clock
    const samples = this.samples
    return (...arguments_: Arguments): Value => {
      const startMs = now()
      return Try(() => action(...arguments_), {
        finally(_thrown, error) {
          samples.push({
            name,
            clock,
            startMs,
            durationMs: now() - startMs,
            status: error ? 'failed' : 'succeeded',
          })
        },
      }) as Value
    }
  }
}
