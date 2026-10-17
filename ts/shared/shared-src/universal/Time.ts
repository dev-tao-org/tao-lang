/** nowMs returns a monotonic millisecond reading, for measuring how long work took. */
export function nowMs(): number {
  return performance.now()
}
