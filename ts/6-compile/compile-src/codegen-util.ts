/** CallbackNames contains collision-safe generated callback parameter names. */
export type CallbackNames = { values: string; children: string }

/** literal serializes a source string as a JavaScript string literal. */
export function literal(value: { readonly value: string }): string {
  return JSON.stringify(value.value)
}

/** listMap emits an array literal compiled from its input values. */
export function listMap<T>(values: readonly T[], compile: (value: T) => string): string {
  return `[${values.map(compile).join(', ')}]`
}

/** unusedName reserves and returns a generated name absent from the occupied set. */
export function unusedName(base: string, occupied: Set<string>): string {
  let candidate = base
  let suffix = 0
  while (occupied.has(candidate)) {
    candidate = `${base}${++suffix}`
  }
  occupied.add(candidate)
  return candidate
}
