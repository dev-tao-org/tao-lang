/** isObject narrows unknown values to non-null objects. */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
