/** Parse decodes JSON as unknown; the owning domain must validate its shape. */
export function Parse(source: string): unknown {
  return JSON.parse(source) as unknown
}

/** Print serializes with native JSON semantics, preserving insertion order and native omission rules.
 *  Callers own their input domain; unsupported top-level inputs retain native undefined output. */
export const Print: typeof JSON.stringify = JSON.stringify

/** PrintIndented serializes native JSON with two-space indentation and no trailing newline. */
export function PrintIndented(value: unknown): string {
  return JSON.stringify(value, null, 2)
}
