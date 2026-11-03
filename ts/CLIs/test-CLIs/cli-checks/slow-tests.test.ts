import * as Tests from '@shared-tests'

import { parseSlowTestSeconds } from '../../CLIs-src/cli-checks/slow-tests'

Tests.test('a per-run threshold accepts non-negative seconds and rejects invalid values', () => {
  Tests.expect(parseSlowTestSeconds('0.25')).toBe(0.25)
  Tests.expect(parseSlowTestSeconds()).toBe(0.075)
  Tests.expect(parseSlowTestSeconds('0')).toBe(0)
  for (const invalid of ['-1', 'Infinity', 'invalid', '']) {
    Tests.expect(() => parseSlowTestSeconds(invalid)).toThrow('--slow requires')
  }
})
