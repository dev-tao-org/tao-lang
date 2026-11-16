import * as Time from './Time'
import { Try } from './TryCatch'

/** TimingSample records one completed operation in its explicitly named monotonic clock domain. */
export type TimingSample = {
  name: string
  role: TimingRole
  clock: string
  startMs: number
  durationMs: number
  status: TimingStatus
}

/** TimingEntry preserves a callable timing boundary and its collector-aware operation. */
export type TimingEntry<Arguments extends unknown[], Value> = ((...args: Arguments) => Value) & {
  readonly [entry]: (timings: Timings, ...args: Arguments) => Value
}

type RunnableOperation<Arguments extends unknown[], Value> = Operation<Arguments, Value> | TimingEntry<Arguments, Value>

/** Timings collects operation spans for one request or bounded measurement run.
 *  Define orchestration with measure and leaves with measured; run descriptors through a collector.
 *  Collectors use the runtime's clock identity.
 *  Discard the collector with its request; timestamps from different clock domains cannot be subtracted. */
export class Timings {
  readonly samples: TimingSample[] = []

  readonly clock = Time.clockIdentity

  private constructor() {}

  record(name: string, startMs: number): void {
    this.samples.push({
      name,
      role: 'observation',
      clock: this.clock,
      startMs,
      durationMs: Time.nowMs() - startMs,
      status: 'succeeded',
    })
  }

  /** run executes a descriptor or callable entry with this collector through promise settlement. */
  run<Arguments extends unknown[], Value>(
    operation: RunnableOperation<Arguments, Value>,
    ...args: Arguments
  ): Value {
    if (typeof operation === 'function') {
      return operation[entry](this, ...args)
    }
    const startMs = Time.nowMs()
    return Try(() => operation[action](this, ...args), {
      finally: (_thrown, error) => {
        this.samples.push({
          name: operation.name,
          role: operation.role,
          clock: this.clock,
          startMs,
          durationMs: Time.nowMs() - startMs,
          status: error ? 'failed' : 'succeeded',
        })
      },
    }) as Value
  }

  /** measure defines a non-callable orchestration operation receiving its execution context first. */
  static measure<Arguments extends unknown[], Value>(
    name: string,
    callback: (timings: Timings, ...args: Arguments) => Value,
  ): Operation<Arguments, Value> {
    return { name, role: 'orchestration', [action]: callback }
  }

  /** measured defines a non-callable leaf receiving only its authored arguments. */
  static measured<Arguments extends unknown[], Value>(
    name: string,
    callback: (...args: Arguments) => Value,
  ): Operation<Arguments, Value> {
    return { name, role: 'leaf', [action]: (_timings, ...args) => callback(...args) }
  }

  /** createTopLevelTimer creates a callable fresh-collector boundary that run can enter with an existing collector. */
  static createTopLevelTimer<Arguments extends unknown[], Value>(
    action: (timings: Timings, ...args: Arguments) => Value,
  ): TimingEntry<Arguments, Value> {
    return Object.assign(
      (...args: Arguments) => action(new Timings(), ...args),
      { [entry]: action },
    )
  }
}

type OperationRole = 'orchestration' | 'leaf'
type TimingRole = OperationRole | 'observation'
type TimingStatus = 'succeeded' | 'failed'
type Operation<Arguments extends unknown[], Value> = {
  readonly name: string
  readonly role: OperationRole
  readonly [action]: (timings: Timings, ...args: Arguments) => Value
}
const entry = Symbol('timing entry')
const action = Symbol('timing operation')
