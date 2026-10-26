/** ReactiveValue is Preact's internal equality-preserving representation of Tao values. */
export type ReactiveValue = unknown

/** encodeReactiveValue adapts Preact's strict equality to Object.is for numeric edge values. */
export function encodeReactiveValue(value: unknown): ReactiveValue {
  if (typeof value !== 'number') {
    return value
  }
  if (Object.is(value, -0)) {
    return negativeZero
  }
  if (Number.isNaN(value)) {
    return nanValue
  }
  return value
}

/** decodeReactiveValue keeps internal equality sentinels out of public reads and evaluators. */
export function decodeReactiveValue<T>(value: ReactiveValue): T {
  if (value === negativeZero) {
    return -0 as T
  }
  if (value === nanValue) {
    return Number.NaN as T
  }
  return value as T
}

const negativeZero = Object.freeze({ value: '-0' })
const nanValue = Object.freeze({ value: 'NaN' })
