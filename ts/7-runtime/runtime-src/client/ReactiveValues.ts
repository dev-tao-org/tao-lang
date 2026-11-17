/** ReactiveValue is Preact's internal equality-preserving representation of Tao values. */
export type ReactiveValue = unknown

/** encodeReactiveValue adapts Preact's strict equality to Object.is for numeric edge values. */
export function encodeReactiveValue(value: unknown): ReactiveValue {
  if (typeof value !== 'number') {
    return value
  }
  if (Object.is(value, -0)) {
    return NegativeZero
  }
  if (Number.isNaN(value)) {
    return NaNValue
  }
  return value
}

/** decodeReactiveValue keeps internal equality sentinels out of public reads and evaluators. */
export function decodeReactiveValue<T>(value: ReactiveValue): T {
  if (value === NegativeZero) {
    return -0 as T
  }
  if (value === NaNValue) {
    return Number.NaN as T
  }
  return value as T
}

const NegativeZero = Object.freeze({ value: '-0' })
const NaNValue = Object.freeze({ value: 'NaN' })
