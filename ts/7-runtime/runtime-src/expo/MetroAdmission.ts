import { Errors, Try } from '@shared'
import * as MetroPlatform from '../../../shared/shared-src/os/MetroPlatform'

/** createMetroAdmission owns revision changes across all admitted Metro readers and scheduled HMR work.
 *  A change listener must reserve synchronously before its debounce; nested reads retain that lease.
 *  Publication closes new admission, drains readers, then retains its bytes until all change leases end. */
export function createMetroAdmission(): MetroAdmission {
  const state: AdmissionState = {
    context: MetroPlatform.createOperationContext(),
    closed: false,
    poisoned: false,
    active: 0,
    openWaiters: [],
    idleWaiters: [],
  }
  return {
    read: operation => readOperation(state, operation),
    schedule(operation) {
      assertHealthy(state)
      return state.context.current()?.active ? runLease(state, operation) : readOperation(state, operation)
    },
    publish: operation => publishOperation(state, operation),
    poison() {
      state.poisoned = true
    },
  }
}

/** MetroAdmission separates source-consuming reads from an exclusively owned publication. */
export type MetroAdmission = {
  read<Value>(operation: () => Promise<Value>): Promise<Value>
  schedule<Value>(operation: () => Promise<Value>): Promise<Value>
  publish<Value>(operation: () => Promise<Value>): Promise<Value>
  poison(): void
}

type AdmissionState = {
  context: MetroPlatform.OperationContext<AdmissionContext>
  closed: boolean
  poisoned: boolean
  active: number
  openWaiters: (() => void)[]
  idleWaiters: (() => void)[]
}
type AdmissionContext = { kind: 'read' | 'publication'; active: boolean }
const AdmissionContext = (kind: AdmissionContext['kind'], active: boolean): AdmissionContext => ({ kind, active })

async function readOperation<Value>(state: AdmissionState, operation: () => Promise<Value>): Promise<Value> {
  assertHealthy(state)
  if (state.context.current()?.active) {
    return await operation()
  }
  while (state.closed) {
    await new Promise<void>(resolve => state.openWaiters.push(resolve))
  }
  assertHealthy(state)
  return await runLease(state, operation)
}

function runLease<Value>(state: AdmissionState, operation: () => Promise<Value>): Promise<Value> {
  state.active++
  const context = AdmissionContext('read', true)
  return state.context.run(context, () =>
    Try(operation, {
      finally() {
        context.active = false
        releaseLease(state)
      },
    }))
}

function releaseLease(state: AdmissionState): void {
  state.active--
  if (state.active === 0) {
    for (const resolve of state.idleWaiters.splice(0)) {
      resolve()
    }
  }
}

async function publishOperation<Value>(state: AdmissionState, operation: () => Promise<Value>): Promise<Value> {
  assertHealthy(state)
  if (state.closed) {
    Errors.ThrowShouldNeverHappen('Concurrent Metro publication owner.')
  }
  state.closed = true
  return await Try(async () => {
    await waitForIdle(state)
    const context = AdmissionContext('publication', true)
    const result = await state.context.run(context, () =>
      Try(operation, {
        finally() {
          context.active = false
        },
      }))
    await waitForIdle(state)
    return result
  }, {
    async finally() {
      await waitForIdle(state)
      state.closed = false
      for (const resolve of state.openWaiters.splice(0)) {
        resolve()
      }
    },
  })
}

async function waitForIdle(state: AdmissionState): Promise<void> {
  if (state.active > 0) {
    await new Promise<void>(resolve => state.idleWaiters.push(resolve))
  }
}

function assertHealthy(state: AdmissionState): void {
  if (state.poisoned) {
    Errors.ThrowHostEnvironment('Metro session requires restart after a partial commit.')
  }
}
