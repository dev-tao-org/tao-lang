/** unique returns values from iterable sources once, preserving first-seen order. */
export function unique<T>(...sources: readonly Iterable<T>[]): T[] {
  const values = new Set<T>()
  for (const source of sources) {
    for (const value of source) {
      values.add(value)
    }
  }
  return [...values]
}
