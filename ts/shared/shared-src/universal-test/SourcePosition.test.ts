import { joinTextLines } from '@shared'
import { Tests } from '@shared/os'
import { sourcePositionAt } from '../universal/SourcePosition'

Tests.test('source positions use UTF-16 columns and LF line boundaries, including CRLF and end offsets', () => {
  const source = joinTextLines('A😀\r', 'B')
  Tests.expect(sourcePositionAt(source, 0)).toEqual({ line: 0, column: 0 })
  Tests.expect(sourcePositionAt(source, 3)).toEqual({ line: 0, column: 3 })
  Tests.expect(sourcePositionAt(source, 4)).toEqual({ line: 0, column: 4 })
  Tests.expect(sourcePositionAt(source, 5)).toEqual({ line: 1, column: 0 })
  Tests.expect(sourcePositionAt(source, 6)).toEqual({ line: 1, column: 1 })
})
