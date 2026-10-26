import { Tests } from '@shared/os'
import { parseSlowTestSeconds } from '../cli-checks/slow-tests'

Tests.test('a per-run threshold accepts non-negative seconds and rejects invalid values', () => {
  Tests.expect(parseSlowTestSeconds('0.25')).toBe(0.25)
  Tests.expect(parseSlowTestSeconds()).toBe(0.075)
  Tests.expect(parseSlowTestSeconds('0')).toBe(0)
  for (const invalid of ['-1', 'Infinity', 'invalid', '']) {
    Tests.expect(() => parseSlowTestSeconds(invalid)).toThrow('--slow requires')
  }
})
