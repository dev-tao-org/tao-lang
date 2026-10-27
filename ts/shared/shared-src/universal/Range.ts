/** Range records two numeric endpoints without assigning coordinate semantics. */
export type Range = { start: number; end: number }

/** Range creates a mutable range record with empty or explicit endpoints. */
export const Range: {
  (): Range
  (start: number, end: number): Range
} = (start: number = 0, end: number = start): Range => ({ start, end })
