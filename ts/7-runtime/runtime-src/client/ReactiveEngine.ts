import { Errors, Time, Try } from '@shared'
import Preact from './Bridge_preact-signals-core'
import React from './Bridge_react/Bridge_react'
import { runSynchronousReactiveBatch } from './ReactiveBatch'
import { decodeReactiveValue, encodeReactiveValue, type ReactiveValue } from './ReactiveValues'
import { areValueSnapshotsEqual, registerValueCapability, takeValueSnapshot } from './ValueSnapshots'
import type { ValueCapability, ValueSnapshot } from './ValueSnapshots'

/** Expression exposes a raw value and an immediate, change-only observation. */
export type Expression<T> = ValueCapability & ExpressionReader<T, Observation>

/** WritableExpression is the single authoritative writable Tao value. */
export type WritableExpression<T> = Expression<ValueSnapshot<T>> & {
  update(value: WritableValue<T>): void
}

/** ReactiveEngineOptions selects an honest provider experiment and delivery scheduler. */
export type ReactiveEngineOptions = {
  strategy?: ReactiveReadStrategy
  scheduleDelivery?: (deliver: () => void) => void
}

/** ReactiveEngine creates expressions over one Preact dependency graph. */
export type ReactiveEngine = {
  createWritable<T>(initial: T): WritableExpression<T>
  createComputed<T>(evaluate: () => T): Expression<ValueSnapshot<T>>
  createConstant<T>(value: T): Expression<ValueSnapshot<T>>
  batch<T>(perform: () => T): T
  dispose(): void
}

/** createReactiveEngine adapts Preact Signals to Tao expression semantics.
 *  ex: source.update(2) -> derived.jsValue() returns the newly computed value. */
export function createReactiveEngine(options: ReactiveEngineOptions = {}): ReactiveEngine {
  return buildEngine({
    strategy: options.strategy ?? 'native-lazy',
    scheduleDelivery: options.scheduleDelivery ?? (deliver => deliver()),
    allStops: new Set(),
    pending: [],
    disposed: false,
    evaluationDepth: 0,
    deliveryChainCount: 0,
    deliveryChainActive: false,
    cancelDeliveryChainReset: undefined,
    deliveryDepth: 0,
    deliveryScheduled: false,
    flushingDelivery: false,
  })
}

/** useWritable retains one source expression as the hook's authoritative state. */
export function useWritable<T>(initializer: () => T): WritableExpression<T> {
  const [source] = React.useState(() => defaultEngine.createWritable(initializer()))
  return source
}

/** useComputed memoizes a pure, recreatable candidate from stable inputs. */
export function useComputed<T>(evaluate: () => T, stableInputs: readonly unknown[]): Expression<ValueSnapshot<T>> {
  return React.useMemo(() => defaultEngine.createComputed(evaluate), stableInputs)
}

/** useValue subscribes to a cached provider snapshot through React's commit-owned bridge. */
export function useValue<T>(expression: ExpressionReader<T>): T {
  const subscribe = React.useMemo(() => (notify: () => void) => {
    const observation = expression.observe(() => notify())
    return () => observation.unobserve()
  }, [expression])
  const snapshot = React.useMemo(() => {
    const cached = expression as InternalExpression<T>
    return cached.snapshot ?? (() => expression.jsValue())
  }, [expression])
  return React.useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** batch groups shared hook-backed writes under the default engine's native settlement boundary. */
export function batch<T>(perform: () => T): T {
  return defaultEngine.batch(perform)
}

type Observation = ValueCapability & { unobserve(): void }
type WritableValue<T> = T | ValueSnapshot<T>
type ExpressionReader<T, Subscription = Pick<Observation, 'unobserve'>> = {
  jsValue(): T
  observe(receive: (value: T) => void): Subscription
}

const MaxReentrantDeliveries = 100
const defaultEngine = createReactiveEngine()
type Node<T> = { value: Preact.Signal<ReactiveValue>; evaluate(): T }
type InternalExpression<T> = ExpressionReader<T, Observation> & { snapshot?: () => T }
type EngineState = {
  strategy: NonNullable<ReactiveEngineOptions['strategy']>
  scheduleDelivery: (deliver: () => void) => void
  allStops: Set<() => void>
  pending: (() => void)[]
  disposed: boolean
  evaluationDepth: number
  deliveryChainCount: number
  deliveryChainActive: boolean
  cancelDeliveryChainReset: OptionalDeliveryReset
  deliveryDepth: number
  deliveryScheduled: boolean
  flushingDelivery: boolean
}

function buildEngine(state: EngineState): ReactiveEngine {
  return {
    createWritable: initial => createWritable(state, initial),
    createComputed(evaluate) {
      assertActive(state)
      return createExpression(state, () => takeValueSnapshot(evaluate()))
    },
    createConstant(value) {
      assertActive(state)
      const snapshot = takeValueSnapshot(value)
      return createExpression(state, () => snapshot)
    },
    batch(perform) {
      assertActive(state)
      return runSynchronousReactiveBatch(perform)
    },
    dispose: () => disposeEngine(state),
  }
}

function createNode<T>(state: EngineState, evaluate: () => T): Node<T> {
  let previous: ReactiveValue
  const value = Preact.computed(() => {
    previous = evaluateNode(state, evaluate, previous)
    return previous
  })
  return { value, evaluate }
}

function createExpression<T>(state: EngineState, evaluate: () => T): Expression<T> {
  const node = createNode(state, evaluate)
  const expression = expressionFor(state, node)
  return registerValueCapability(expression)
}

function expressionFor<T>(state: EngineState, node: Node<T>): InternalExpression<T> {
  return {
    jsValue: () => readNode(state, node),
    observe: receive => observeNode(state, node, receive),
    snapshot: () => decodeReactiveValue<T>(node.value.value),
  }
}

function readNode<T>(state: EngineState, node: Node<T>): T {
  assertActive(state)
  return state.strategy === 'uncached-public-read' && state.evaluationDepth === 0
    ? node.evaluate()
    : decodeReactiveValue<T>(node.value.value)
}

function evaluateNode<T>(state: EngineState, evaluate: () => T, previous: ReactiveValue): ReactiveValue {
  state.evaluationDepth += 1
  return Try(() => encodeReactiveValue(evaluate(), previous), {
    finally() {
      state.evaluationDepth -= 1
    },
  })
}

function observeNode<T>(state: EngineState, node: Node<T>, receive: (value: T) => void): Observation {
  assertActive(state)
  let active = true
  let deliveryPending = false
  let pendingValue = decodeReactiveValue<T>(node.value.value)
  let lastDelivered = pendingValue
  const stopEffect = Preact.effect(() =>
    watchNode(state, node, value => {
      if (!active) {
        return
      }
      pendingValue = value
      if (deliveryPending || areValueSnapshotsEqual(lastDelivered, pendingValue)) {
        return
      }
      deliveryPending = true
      queueDelivery(state, () => {
        deliveryPending = false
        if (active && !areValueSnapshotsEqual(lastDelivered, pendingValue)) {
          lastDelivered = pendingValue
          deliverValue(state, receive, lastDelivered)
        }
      })
    })
  )
  const stop = (): void => {
    if (!active) {
      return
    }
    active = false
    stopEffect()
    state.allStops.delete(stop)
  }
  state.allStops.add(stop)
  Try<void>(() => deliverValue(state, receive, lastDelivered), {
    catch(thrown) {
      stop()
      return Errors.Throw(thrown)
    },
  })
  return registerValueCapability({ unobserve: stop })
}

function watchNode<T>(state: EngineState, node: Node<T>, changed: (value: T) => void): void {
  assertActive(state)
  changed(decodeReactiveValue<T>(node.value.value))
}

function deliverValue<T>(state: EngineState, receive: (value: T) => void, value: T): void {
  if (!state.deliveryChainActive) {
    state.deliveryChainCount = 0
  }
  state.deliveryChainActive = false
  state.deliveryChainCount += 1
  if (state.deliveryChainCount > MaxReentrantDeliveries) {
    failDeliveryCycle(state)
  }
  state.deliveryDepth += 1
  Try(() => Preact.untracked(() => receive(value)), {
    finally() {
      state.deliveryDepth -= 1
    },
  })
  if (!state.deliveryChainActive) {
    resetDeliveryChain(state)
  }
}

function scheduleDeliveryChainReset(state: EngineState): void {
  state.cancelDeliveryChainReset?.()
  state.cancelDeliveryChainReset = Time.scheduleMicrotask(() => resetDeliveryChain(state))
}

function resetDeliveryChain(state: EngineState): void {
  state.cancelDeliveryChainReset?.()
  state.cancelDeliveryChainReset = undefined
  state.deliveryChainCount = 0
  state.deliveryChainActive = false
}

function queueDelivery(state: EngineState, deliver: () => void): void {
  state.pending.push(deliver)
  if (state.deliveryScheduled || state.flushingDelivery) {
    return
  }
  state.deliveryScheduled = true
  state.scheduleDelivery(() => {
    if (!state.disposed) {
      flushDelivery(state)
    }
  })
}

function flushDelivery(state: EngineState): void {
  state.deliveryScheduled = false
  state.flushingDelivery = true
  let passes = 0
  let failure: unknown
  Try(() => {
    while (state.pending.length > 0) {
      passes += 1
      if (passes > MaxReentrantDeliveries) {
        failDeliveryCycle(state)
      }
      const current = state.pending
      state.pending = []
      Preact.batch(() => {
        for (const deliver of current) {
          Try(deliver, {
            catch: () => undefined,
            finally(_thrown, error) {
              failure ??= error
            },
          })
        }
      })
    }
  }, {
    finally() {
      state.flushingDelivery = false
    },
  })
  if (failure) {
    Errors.Throw(failure)
  }
}

function failDeliveryCycle(state: EngineState): never {
  state.pending = []
  disposeObservers(state)
  return Errors.ThrowUserInput('Reactive observers exceeded the reentrant delivery limit; break the update cycle.')
}

function createWritable<T>(state: EngineState, initial: T): WritableExpression<T> {
  assertActive(state)
  const snapshot = takeValueSnapshot(initial)
  const source = Preact.signal(encodeReactiveValue(snapshot))
  const node = createNode(state, () => decodeReactiveValue<ValueSnapshot<T>>(source.value))
  return registerValueCapability({
    ...expressionFor(state, node),
    update: (value: WritableValue<T>) => updateSource(state, source, value),
  })
}

function updateSource(state: EngineState, source: Preact.Signal<ReactiveValue>, value: unknown): void {
  assertActive(state)
  const snapshot = takeValueSnapshot(value)
  if (state.deliveryDepth > 0) {
    state.deliveryChainActive = true
  } else {
    resetDeliveryChain(state)
  }
  Preact.batch(() => {
    source.value = encodeReactiveValue(snapshot, source.peek())
  })
  if (state.deliveryDepth > 0) {
    scheduleDeliveryChainReset(state)
  }
}

function disposeEngine(state: EngineState): void {
  if (state.disposed) {
    return
  }
  state.disposed = true
  state.cancelDeliveryChainReset?.()
  state.cancelDeliveryChainReset = undefined
  disposeObservers(state)
  state.pending = []
}

function disposeObservers(state: EngineState): void {
  state.allStops.forEach(stop => stop())
  state.allStops.clear()
}

function assertActive(state: EngineState): void {
  if (state.disposed) {
    Errors.ThrowShouldNeverHappen('The reactive engine has been disposed.')
  }
}

type ReactiveReadStrategy = 'native-lazy' | 'uncached-public-read'
type OptionalDeliveryReset = (() => void) | undefined
