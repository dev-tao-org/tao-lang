import { Range } from '@shared'
import { Tests } from '@shared/os'

Tests.test('Range creates empty and explicit endpoint records', () => {
  Tests.expect(Range()).toEqual({ start: 0, end: 0 })
  Tests.expect(Range(4, 9)).toEqual({ start: 4, end: 9 })
})

if (false) {
  // @ts-expect-error Range accepts either zero or two arguments.
  Range(4)
}
