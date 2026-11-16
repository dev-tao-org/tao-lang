import { S } from '@shared'
import * as Tests from '@shared-tests'
import { FS } from '@shared/os'

import { parseSlowTestSeconds, withTestTimings } from '../CLIs-src/cli-checks/slow-tests'

Tests.test('a per-run threshold accepts non-negative seconds and rejects invalid values', () => {
  Tests.expect(parseSlowTestSeconds('0.25')).toBe(0.25)
  Tests.expect(parseSlowTestSeconds()).toBe(0.075)
  Tests.expect(parseSlowTestSeconds('0')).toBe(0)
  for (const invalid of ['-1', 'Infinity', 'invalid', '']) {
    Tests.expect(() => parseSlowTestSeconds(invalid)).toThrow('--slow requires')
  }
})

Tests.test('shard timing observations use file wall time including setup', async () => {
  const timings = await withTestTimings(async report => {
    const junit = S`
      <testsuites>
        <testsuite file="package/one.test.ts" time="1.25">
          <testsuite name="nested" file="package/one.test.ts" time="0.02">
            <testcase name="quick test" time="0.02"/>
          </testsuite>
        </testsuite>
      </testsuites>
    `
    await FS.writeFile(report!, junit)
  })
  Tests.expect(timings).toEqual([{ file: 'package/one.test.ts', durationMs: 1250 }])
})
