import { CarriageReturnCharacter, Range, Source } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'

Tests.test('Source builds, normalizes, encloses and combines source spans', () => {
  const range = Range(2, 5)
  const node = { startIndex: 8, endIndex: 12 }
  Tests.expect(Range()).toEqual({ start: 0, end: 0 })
  Tests.expect(Source.from(range)).toEqual({ start: 2, end: 5 })
  Tests.expect(Source.from({ range })).toEqual({ start: 2, end: 5 })
  Tests.expect(Source.from(node)).toEqual({ start: 8, end: 12 })
  Tests.expect(Source.enclosing(range, node, Range(0, 1))).toEqual({ start: 0, end: 12 })
  Tests.expect(Source.startToStart(range, node)).toEqual({ start: 2, end: 8 })
  Tests.expect(Source.endToEnd(range, node)).toEqual({ start: 5, end: 12 })
  Tests.expect(Source.startToEnd(range, node)).toEqual({ start: 2, end: 12 })
  Tests.expect(Source.endToStart(range, node)).toEqual({ start: 5, end: 8 })
  Tests.expect(Source.slice('0123456789', { range })).toBe('234')
  Tests.expect([{ range: Range(5, 8) }, { range }].sort(Source.compareByRange)).toEqual([{ range }, {
    range: Range(5, 8),
  }])
})

Tests.test('Source slices spans and numeric offsets', () => {
  const source = '0123456789'
  Tests.expect(Source.slice(source, Range(2, 5))).toBe('234')
  Tests.expect(Source.slice(source, { startIndex: 5, endIndex: 8 })).toBe('567')
  Tests.expect(Source.slice(source, 2, 5)).toBe('234')
  Tests.expect(Source.replace(source, Range(2, 5), 'abc')).toBe('01abc56789')
  Tests.expect(Source.lineStartBefore(Shared.joinTextLines('first', '  second'), 11)).toBe(6)
})

Tests.test('Source positions round trip UTF-16 offsets across LF and CRLF lines', () => {
  const source = Shared.joinTextLines('A😀' + CarriageReturnCharacter, 'B')
  for (const offset of [0, 3, 4, 5, 6]) {
    const position = Source.positionAt(source, offset)
    Tests.expect(Source.offsetAt(source, position)).toBe(offset)
  }
  Tests.expect(Source.positionAt(source, 5)).toEqual({ line: 1, column: 0 })
})

if (false) {
  // @ts-expect-error Range accepts either zero or two arguments.
  Range(4)
}
