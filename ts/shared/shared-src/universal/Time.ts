/** clockIdentity identifies this runtime's monotonic clock; distinct identities cannot share relative timestamps. */
export const clockIdentity = `runtime:${performance.timeOrigin}:${Math.random().toString(36).slice(2)}`

/** nowMs returns a monotonic millisecond reading for duration measurements. */
export function nowMs(): number {
  return performance.now()
}

/** timestampMs returns a high-resolution epoch-relative timestamp for a same-host timeline.
 *  Independent runtimes may have small anchor offsets; use nowMs for local durations. */
export function timestampMs(): number {
  return performance.timeOrigin + performance.now()
}

/** now returns the current Unix time in milliseconds. */
export function now(): number {
  return Date.now()
}

/** date returns the current wall-clock date. */
export function date(): Date {
  return new Date()
}

/** sleep resolves after the supplied duration in milliseconds on any supported runtime. */
export function sleep(duration: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, duration))
}

/** WaitOptions bounds synchronous readiness checks in milliseconds. */
export type WaitOptions = {
  timeout: number
  interval?: number
}

type WaitSuccess<Value> = { value: Value }
const WaitSuccess = <Value>(value: Value): WaitSuccess<Value> => ({ value })
type WaitProbe<Value> = (success: typeof WaitSuccess) => WaitSuccess<Value> | undefined
const DefaultWaitInterval = 25

/** waitFor checks immediately, then periodically until explicit success or timeout.
 *  The probe returns success(value) to finish, or undefined to retry. Timeout returns undefined;
 *  probe errors propagate. Supply a finite nonnegative timeout and a positive interval (default 25 ms). */
export async function waitFor<Value>(probe: WaitProbe<Value>, options: WaitOptions): Promise<Value | undefined> {
  const started = nowMs()
  const interval = options.interval ?? DefaultWaitInterval
  do {
    const result = probe(WaitSuccess)
    if (result !== undefined) {
      return result.value
    }
    const remaining = options.timeout - (nowMs() - started)
    if (remaining <= 0) {
      return undefined
    }
    await sleep(Math.min(interval, remaining))
  } while (nowMs() - started < options.timeout)
  return undefined
}

/** schedule runs an action after a delay and returns a cancellation function. */
export function schedule(durationMs: number, action: () => void): () => void {
  const timer = setTimeout(action, durationMs)
  return () => clearTimeout(timer)
}

/** scheduleMicrotask runs after the current synchronous stack unless canceled first. */
export function scheduleMicrotask(action: () => void): () => void {
  let active = true
  queueMicrotask(() => {
    if (active) {
      action()
    }
  })
  return () => {
    active = false
  }
}
