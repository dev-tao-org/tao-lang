import { S } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { slowTestWarnings } from './slow-tests'

Describe('slow test warnings', () => {
  Test('lists only tests strictly over 75ms, slowest first, with source and suite names', () => {
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
    Expect(warnings).toEqual([
      '\u001b[33mSlow tests (>75 ms):\u001b[0m',
      '\u001b[33m  250.00 ms  commands > slowest (commands.test.ts)\u001b[0m',
      '\u001b[33m  75.01 ms  nested suite > slow (commands.test.ts)\u001b[0m',
    ])
  })

  Test('decodes escaped names and ignores XML-looking diagnostics and skipped or invalid timings', () => {
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
    Expect(warnings).toEqual([
      '\u001b[33mSlow tests (>75 ms):\u001b[0m',
      '\u001b[33m  123.00 ms  outer > A > B "value" & \'x\' 🐱 (file & name.test.ts)\u001b[0m',
      '\u001b[33m  102.00 ms  outer > after inner (file & name.test.ts)\u001b[0m',
      '\u001b[33m  101.00 ms  inner > nested (inner.test.ts)\u001b[0m',
    ])
    Expect(slowTestWarnings('<testsuite><testcase name="fast" time="0.01" /></testsuite>')).toEqual([])
  })
})
