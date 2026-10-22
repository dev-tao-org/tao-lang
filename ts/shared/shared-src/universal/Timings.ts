import * as Time from './Time'
import { Try } from './TryCatch'

/** TimingSample records one completed operation in its explicitly named monotonic clock domain. */
export type TimingSample = {
  name: string
  role: 'orchestration' | 'leaf' | 'observation'
  clock: string
  startMs: number
  durationMs: number
  status: 'succeeded' | 'failed'
}

/** Timings collects operation spans for one request or bounded measurement run.
 *  Define orchestration with measure and leaves with measured; run descriptors through a collector.
 *  Default collectors use the runtime's clock identity; injected clocks require an explicit identity.
 *  Discard the collector with its request; timestamps from different clock domains cannot be subtracted. */
export class Timings {
  readonly samples: TimingSample[] = []

  private constructor(readonly clock = Time.clockIdentity, private readonly now = Time.nowMs) {}

  record(name: string, startMs: number): void {
    this.samples.push({
      name,
      role: 'observation',
      clock: this.clock,
      startMs,
      durationMs: this.now() - startMs,
      status: 'succeeded',
    })
  }

  /** run executes a descriptor or callable entry with this collector through promise settlement. */
  run<Arguments extends unknown[], Value>(
    operation: Operation<Arguments, Value> | Entry<Arguments, Value>,
    ...arguments_: Arguments
  ): Value {
    if (typeof operation === 'function') {
      return operation[entry](this, ...arguments_)
    }
    const startMs = this.now()
    return Try(() => operation[action](this, ...arguments_), {
      finally: (_thrown, error) => {
        this.samples.push({
          name: operation.name,
          role: operation.role,
          clock: this.clock,
          startMs,
          durationMs: this.now() - startMs,
          status: error ? 'failed' : 'succeeded',
        })
      },
    }) as Value
  }

  /** measure defines a non-callable orchestration operation receiving its execution context first. */
  static measure<Arguments extends unknown[], Value>(
    name: string,
    callback: (timings: Timings, ...arguments_: Arguments) => Value,
  ): Operation<Arguments, Value> {
    return { name, role: 'orchestration', [action]: callback }
  }

  /** measured defines a non-callable leaf receiving only its authored arguments. */
  static measured<Arguments extends unknown[], Value>(
    name: string,
    callback: (...arguments_: Arguments) => Value,
  ): Operation<Arguments, Value> {
    return { name, role: 'leaf', [action]: (_timings, ...arguments_) => callback(...arguments_) }
  }

  /** createTopLevelTimer creates a callable fresh-collector boundary that run can enter with an existing collector. */
  static createTopLevelTimer<Arguments extends unknown[], Value>(
    action: (timings: Timings, ...arguments_: Arguments) => Value,
    options?: { clock: string; now: () => number },
  ): Entry<Arguments, Value> {
    return Object.assign(
      (...arguments_: Arguments) => action(new Timings(options?.clock, options?.now), ...arguments_),
      { [entry]: action },
    )
  }
}

type Operation<Arguments extends unknown[], Value> = {
  readonly name: string
  readonly role: 'orchestration' | 'leaf'
  readonly [action]: (timings: Timings, ...arguments_: Arguments) => Value
}
type Entry<Arguments extends unknown[], Value> = ((...arguments_: Arguments) => Value) & {
  readonly [entry]: (timings: Timings, ...arguments_: Arguments) => Value
}
const entry = Symbol('timing entry')
const action = Symbol('timing operation')
