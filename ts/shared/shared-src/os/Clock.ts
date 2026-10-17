/** nowMs returns a monotonic millisecond reading for duration measurements. */
export function nowMs(): number {
  return performance.now()
}

/** epochMs returns the current Unix time in milliseconds. */
export function epochMs(): number {
  return Date.now()
}

/** utcNow returns the current wall-clock date. */
export function utcNow(): Date {
  return new Date()
}
