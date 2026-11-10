import { NewlineCharacter, NewlineCharacterCode } from './Characters'

/** Span represents a source range or a syntax node with numeric source indices. */
export type Span = Range | { readonly range: Range } | { readonly startIndex: number; readonly endIndex: number }

/** SourcePosition records a zero-based UTF-16 line and column. */
export type SourcePosition = { line: number; column: number }

/** Range records two numeric source offsets. */
export type Range = { start: number; end: number }

/** Range creates a mutable range record with empty or explicit endpoints. */
export const Range: {
  (): Range
  (start: number, end: number): Range
} = (start: number = 0, end: number = start): Range => ({ start, end })

/** from converts a range or indexed syntax node to a named range record. */
export const from = (span: Span): Range => Range(startOf(span), endOf(span))

/** enclosing returns the outer source range covering all supplied spans. */
export function enclosing(first: Span, ...rest: Span[]): Range {
  const range = from(first)
  for (const span of rest) {
    range.start = Math.min(range.start, startOf(span))
    range.end = Math.max(range.end, endOf(span))
  }
  return range
}

/** startToStart returns a range from the first span's start to the second's start. */
export const startToStart = (first: Span, second: Span): Range => Range(startOf(first), startOf(second))

/** endToEnd returns a range from the first span's end to the second's end. */
export const endToEnd = (first: Span, second: Span): Range => Range(endOf(first), endOf(second))

/** startToEnd returns a range from the first span's start to the second's end. */
export const startToEnd = (first: Span, second: Span): Range => Range(startOf(first), endOf(second))

/** endToStart returns a range from the first span's end to the second's start. */
export const endToStart = (first: Span, second: Span): Range => Range(endOf(first), startOf(second))

/** compareByRange orders source spans by start offset, then end offset. */
export const compareByRange = (left: Span, right: Span): number =>
  startOf(left) - startOf(right) || endOf(left) - endOf(right)

/** lineStartBefore returns the first offset after the nearest preceding LF. */
export const lineStartBefore = (source: string, offset: number): number =>
  source.lastIndexOf(NewlineCharacter, offset) + 1

type SliceStart = Span | number
/** slice extracts source text using a span or explicit UTF-16 offsets. */
export function slice(source: string, span: Span): string
export function slice(source: string, start: number, end: number): string
export function slice(source: string, spanOrStart: SliceStart, end?: number): string {
  return typeof spanOrStart === 'number'
    ? source.slice(spanOrStart, end!)
    : source.slice(startOf(spanOrStart), endOf(spanOrStart))
}

/** replace substitutes a source span with replacement text. */
export const replace = (source: string, span: Span, replacement: string): string =>
  slice(source, 0, startOf(span)) + replacement + slice(source, endOf(span), source.length)

/** positionAt finds a zero-based UTF-16 line and column for a valid source offset. */
export function positionAt(source: string, offset: number): SourcePosition {
  let line = 0
  let lineStart = 0
  for (let index = 0; index < offset; index++) {
    if (source.charCodeAt(index) === NewlineCharacterCode) {
      line++
      lineStart = index + 1
    }
  }
  return { line, column: offset - lineStart }
}

/** offsetAt finds a UTF-16 source offset for a zero-based line and column. */
export function offsetAt(source: string, position: SourcePosition): number {
  let line = 0
  let lineStart = 0
  for (let index = 0; index < source.length && line < position.line; index++) {
    if (source.charCodeAt(index) === NewlineCharacterCode) {
      line++
      lineStart = index + 1
    }
  }
  return lineStart + position.column
}

function startOf(span: Span): number {
  if (isRange(span)) {
    return span.start
  }
  if (isRangeOwner(span)) {
    return span.range.start
  }
  return span.startIndex
}

function endOf(span: Span): number {
  if (isRange(span)) {
    return span.end
  }
  if (isRangeOwner(span)) {
    return span.range.end
  }
  return span.endIndex
}

function isRange(span: Span): span is Range {
  return 'start' in span
}

function isRangeOwner(span: Span): span is { readonly range: Range } {
  return 'range' in span
}
