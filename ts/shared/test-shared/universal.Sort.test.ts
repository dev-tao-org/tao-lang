import { Sort } from '@shared'
import * as Tests from '@shared-tests'

Tests.test('Sort compares strings by ordinal UTF-16 code-unit order', () => {
  const values = ['\uE000', '😀', 'a', 'A']

  Tests.expect(Sort.Strings(values)).toEqual(['A', 'a', '😀', '\uE000'])
  Tests.expect(Sort.CompareStrings('😀', '\uE000')).toBeLessThan(0)
  Tests.expect(values).toEqual(['\uE000', '😀', 'a', 'A'])
})

Tests.test('Sort composes key and reverse comparators', () => {
  const values = [
    { name: 'b', rank: 2 },
    { name: 'a', rank: 1 },
    { name: 'c', rank: 3 },
    { name: 'd', rank: 2 },
  ]
  const byRankDescending = Sort.Reverse(Sort.By((value: { rank: number }) => value.rank, (left, right) => left - right))

  Tests.expect([...values].sort(byRankDescending)).toEqual([
    { name: 'c', rank: 3 },
    { name: 'b', rank: 2 },
    { name: 'd', rank: 2 },
    { name: 'a', rank: 1 },
  ])
})
