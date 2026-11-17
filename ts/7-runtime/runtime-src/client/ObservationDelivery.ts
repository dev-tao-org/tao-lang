import { Errors, Try } from '@shared'
import Preact from './Bridge_preact-signals-core'
import { isThenable } from './ReactiveBatch'

/** ObservationCallback accepts callbacks whose inferred result has no callable then method. */
export type ObservationCallback<T, Result> = ((value: T) => Result) & SynchronousResult<Result>

/** requireSynchronousObserver rejects native async callbacks before calling them. */
export function requireSynchronousObserver(receive: (value: never) => unknown): void {
  if (Object.getPrototypeOf(receive) === AsyncFunctionPrototype) {
    throwAsynchronousObservation()
  }
}

/** deliverObservation runs a callback inside the shared, synchronous read-only scope. */
export function deliverObservation<T>(receive: (value: T) => unknown, value: T, stop: () => void): void {
  const parent = activeDelivery
  const delivery: Delivery = { stop, writeRejected: false }
  activeDelivery = delivery
  Try(() =>
    Preact.untracked(() => {
      const result = receive(value)
      requireSynchronousResult(result, stop)
    }), {
    finally() {
      activeDelivery = parent
      if (delivery.writeRejected) {
        throwObservationWrite()
      }
    },
  })
}

/** assertObservationAllowsWrite rejects a Tao state update before inspecting its value. */
export function assertObservationAllowsWrite(): void {
  if (activeDelivery) {
    activeDelivery.writeRejected = true
    activeDelivery.stop()
    throwObservationWrite()
  }
}

type ThenableResult = { then: (...args: never[]) => unknown }
type SynchronousResult<Result> = [Extract<Result, ThenableResult>] extends [never] ? unknown : never
type Delivery = { stop(): void; writeRejected: boolean }
type OptionalDelivery = Delivery | undefined
const AsyncFunctionPrototype = Object.getPrototypeOf(async () => {})
let activeDelivery: OptionalDelivery

function requireSynchronousResult(result: unknown, stop: () => void): void {
  if (!isThenable(result)) {
    return
  }
  stop()
  // Consume an already-started native promise without invoking an arbitrary thenable's method.
  void Try(() => Promise.prototype.then.call(result, undefined, () => undefined), { catch: () => undefined })
  throwAsynchronousObservation()
}

function throwAsynchronousObservation(): never {
  return Errors.ThrowUserInput('Observation callbacks must finish synchronously. Do not use async or return a promise.')
}

function throwObservationWrite(): never {
  return Errors.ThrowUserInput(
    'Observation callbacks cannot write Tao state. Move the write to an action or external event.',
  )
}
