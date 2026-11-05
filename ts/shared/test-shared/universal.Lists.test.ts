import * as Tests from '@shared-tests'

import { Lists } from '../shared-src/universal/universal'

Tests.test('Lists.unique preserves first-seen order across iterable sources using Set equality', () => {
  const first = { name: 'first' }
  const second = { name: 'second' }
  const values = Lists.unique([first, NaN, -0], new Set([second, NaN, 0]))

  Tests.expect(values).toEqual([first, NaN, 0, second])
  Tests.expect(values[0]).toBe(first)
  Tests.expect(values[3]).toBe(second)
})
