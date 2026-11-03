/** Comparator compares two values and returns their sort order. */
export type Comparator<Value> = (left: Value, right: Value) => number

/** CompareStrings compares strings by ordinal UTF-16 code-unit order. */
export function CompareStrings(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

/** By compares values by a derived key. */
export function By<Value, Key>(keyOf: (value: Value) => Key, compare: Comparator<Key>): Comparator<Value> {
  return (left, right) => compare(keyOf(left), keyOf(right))
}

/** Reverse reverses a comparator's argument order. */
export function Reverse<Value>(compare: Comparator<Value>): Comparator<Value> {
  return (left, right) => compare(right, left)
}

/** Strings returns a sorted copy of string values using ordinal UTF-16 code-unit order. */
export function Strings(values: Iterable<string>): string[] {
  return [...values].sort(CompareStrings)
}
