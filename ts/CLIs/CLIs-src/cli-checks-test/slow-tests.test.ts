import { S } from '@shared'
import { Repo, Tests } from '@shared/os'
import { parseSlowTestSeconds, slowTestWarnings } from '../cli-checks/slow-tests'

Tests.test('a per-run threshold uses seconds and warns strictly above the boundary', () => {
  const seconds = parseSlowTestSeconds('0.25')
  const report = S`
    <testsuite name="threshold">
      <testcase name="fast" time="0.1" />
      <testcase name="boundary" time="0.25" />
      <testcase name="slow" time="0.251" />
    </testsuite>
  `
  Tests.expect(slowTestWarnings(report, seconds)).toEqual(['Slow tests (>250 ms):', '  251.00 ms  threshold > slow'])
  Tests.expect(parseSlowTestSeconds()).toBe(0.075)
  Tests.expect(parseSlowTestSeconds('0')).toBe(0)
  for (const invalid of ['-1', 'Infinity', 'invalid', '']) {
    Tests.expect(() => parseSlowTestSeconds(invalid)).toThrow('--slow requires')
  }
})

Tests.describe('slow test warnings', () => {
  Tests.test('lists only tests strictly over 75ms, slowest first, with source and suite names', () => {
    const warnings = slowTestWarnings(S`
      <testsuites>
        <testsuite name="commands" file="commands.test.ts">
          <testcase name="boundary" time="0.075" />
          <testcase name="slow" classname="nested suite" time="0.07501" />
          <testcase name="fast" time="0.001" />
          <testcase name="slowest" time="0.25"><failure message="failed" /></testcase>
        </testsuite>
      </testsuites>
    `)
    Tests.expect(warnings).toEqual([
      'Slow tests (>75 ms):',
      `  ${Repo.resolvePath('ts/commands.test.ts')}  250.00 ms  commands > slowest`,
      `  ${Repo.resolvePath('ts/commands.test.ts')}  75.01 ms  nested suite > slow`,
    ])
  })

  Tests.test('decodes escaped names and ignores XML-looking diagnostics and skipped or invalid timings', () => {
    const warnings = slowTestWarnings(S`
      <testsuites>
        <!-- <testcase name="comment" time="10" /> -->
        <testsuite name="outer" file="file &amp; name.test.ts">
          <testcase name="A &gt; B &quot;value&quot; &amp; &#39;x&#39; &#x1F431;" time='0.123' />
          <testsuite name="inner" file="inner.test.ts">
            <testcase name="nested" time="0.101" />
          </testsuite>
          <testcase name="after inner" time="0.102" />
          <testcase name="skipped" time="1"><skipped /></testcase>
          <testcase name="invalid" time="Infinity" />
          <testcase name="absent" />
          <system-out><![CDATA[<testcase name="diagnostic" time="10" />]]></system-out>
        </testsuite>
      </testsuites>
    `)
    Tests.expect(warnings).toEqual([
      'Slow tests (>75 ms):',
      `  ${Repo.resolvePath('ts/file & name.test.ts')}  123.00 ms  outer > A > B "value" & 'x' 🐱`,
      `  ${Repo.resolvePath('ts/file & name.test.ts')}  102.00 ms  outer > after inner`,
      `  ${Repo.resolvePath('ts/inner.test.ts')}  101.00 ms  inner > nested`,
    ])
    Tests.expect(slowTestWarnings('<testsuite><testcase name="fast" time="0.01" /></testsuite>')).toEqual([])
  })
})
