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
