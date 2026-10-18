import { S } from '@shared'
import { Tests } from '@shared/os'
import { sourceConformanceIssues } from '../cli-checks/source-conformance'

const builtinImportIssue = 'runtime builtin imports belong in @shared/os'
const platformGlobalIssue = 'platform globals belong in @shared/os; use its named APIs'
const multilineStringIssue = 'multiline strings must use S from @shared'
const invalidSLayoutIssue = 'S content must start on a new line, be indented, and end with an aligned closing delimiter'

const platformViolations = [
  "import { readFile } from 'node:fs/promises'",
  "import { readFile } from 'fs/promises'",
  "export { test } from 'bun:test'",
  "const runtime = await import('bun')",
  "const runtime = require('node:path')",
  "type Runtime = typeof import('node:process')",
  'const value = process.env.VALUE',
  'const runtime = Bun',
  "const value = Buffer.from('text')",
  'const value = performance.now()',
  'const value = Date.now()',
  'const value = new Date()',
  "const value = Date['now']()",
  'const value = Date()',
  'const value = globalThis.Date.now()',
  'const value = new globalThis.Date()',
  'type Stream = ReadableStream<Uint8Array>',
  "const value = globalThis['process'].pid",
  'const value = globalThis.Bun.argv',
]

const invalidMultilineStrings = [
  'const value = `first\nsecond`',
  'const value = String.raw`first\nsecond`',
  'const value = "first\\\nsecond"',
  'const value = S`first\n  second\n`',
  'const value = S`\n  first\n  second`',
  'const value = S`\nfirst\n`',
  '  const value = S`\n    first\n`',
]

Tests.test('source conformance > checks object methods and 45-line function-body boundaries', () => {
  const valid = S`
    const encrypt = async (value: string) => value
    const object = { encrypt, async decrypt(value: string) { record(value); return value }, *values() { yield 1 } }
    type Shape = { encrypt: (value: string) => Promise<string> }
  `
  Tests.expect(sourceConformanceIssues('fixture.ts', valid)).toEqual([])

  const accepted = `function boundary() {\n${physicalBodyLines(45)}\n}`
  Tests.expect(sourceConformanceIssues('fixture.ts', accepted)).toEqual([])
  const rejected = [
    `function tooLong() {\n${physicalBodyLines(46)}\n}`,
    `class Service {\n  run() {\n${physicalBodyLines(46)}\n  }\n}`,
    `class Service {\n  constructor() {\n${physicalBodyLines(46)}\n  }\n}`,
    `const callback = () => {\n${physicalBodyLines(46)}\n}`,
    `const expression = () => (\n${Array.from({ length: 44 }, () => '  value,').join('\n')}\n  value\n)`,
  ].join('\n')
  Tests.expect(messages(sourceConformanceIssues('fixture.ts', rejected))).toEqual([
    ...Array(4).fill('function bodies must contain at most 45 physical lines; found 46'),
    'function bodies must contain at most 45 physical lines; found 47',
  ])
})

Tests.test('source conformance > prefers concise arrows for single-return object functions', () => {
  const valid = S`
    Try(() => work(), { catch: () => "" })
    Try(() => work(), { catch: error => error })
    Try(() => work(), { catch(error) { log(error); return error } })
    Try(() => work(), { async catch() { await recover() } })
  `
  Tests.expect(sourceConformanceIssues('fixture.ts', valid)).toEqual([])
  const invalid = S`
    Try(() => work(), { catch(error) { return error } })
    Try(() => work(), { handler: (value) => { return value } })
    Try(() => work(), { catch: (error) => { log(error); return error } })
    Try(() => work(), { catch: function (error) { return error } })
  `
  const methodIssues = sourceConformanceIssues('fixture.ts', invalid)
  Tests.expect(methodIssues).toHaveLength(4)
  Tests.expect(methodIssues.filter(issue =>
    issue.endsWith(
      'single-return object functions should use expression-bodied arrow properties',
    )
  )).toHaveLength(3)
  Tests.expect(methodIssues.filter(issue => issue.endsWith('multi-statement object functions must use method syntax')))
    .toHaveLength(1)
})

Tests.test('source conformance > retains object methods with sensitive bindings', () => {
  const source = S`
    const object = {
      thisValue() { return this.value },
      argumentValue() { return arguments[0] },
      superValue() { return super.value },
      explicitThis(this: object) { return 1 },
      computedName() { return { [this.value]() {} } },
      namedFunction: function self() { return self },
    }
  `
  Tests.expect(sourceConformanceIssues('fixture.ts', source)).toEqual([])
})

Tests.test('source conformance > checks platform imports and globals in one source fixture', () => {
  const source = platformViolations.join('\n')
  const issues = messages(sourceConformanceIssues('ts/feature.ts', source)).toSorted()
  Tests.expect(issues).toEqual([
    ...Array(6).fill(builtinImportIssue),
    ...Array(13).fill(platformGlobalIssue),
  ].toSorted())
  Tests.expect(sourceConformanceIssues('ts/shared/shared-src/os/Platform.ts', source)).toEqual([])
  Tests.expect(messages(sourceConformanceIssues('ts/shared/shared-src/os-other/Platform.ts', source)).toSorted())
    .toEqual(issues)

  const allowedTime = S`
    const monotonic = performance.now()
    const clock = Date.now()
    const date = new Date()
    setTimeout(() => {}, 1)
    const prohibited = process.pid
  `
  Tests.expect(messages(sourceConformanceIssues('ts/shared/shared-src/universal/Time.ts', allowedTime))).toEqual([
    platformGlobalIssue,
  ])
})

Tests.test('source conformance > requires S for multiline literals and honors exact content indentation', () => {
  const issues = messages(sourceConformanceIssues('fixture.ts', invalidMultilineStrings.join('\n'))).toSorted()
  Tests.expect(issues).toEqual([
    ...Array(3).fill(multilineStringIssue),
    ...Array(4).fill(invalidSLayoutIssue),
  ].toSorted())
  Tests.expect(sourceConformanceIssues('fixture.ts', 'type Pattern = `first\nsecond`')).toEqual([])
  Tests.expect(sourceConformanceIssues('fixture.ts', "const value = 'first\\nsecond'")).toEqual([])
  Tests.expect(sourceConformanceIssues('fixture.ts', 'const value = S`\n  first\n    nested\n`')).toEqual([])
  Tests.expect(sourceConformanceIssues('fixture.ts', 'const value = S`\n  ${\n    format(value)\n  }\n`')).toEqual([])
})

Tests.test('source conformance > checks comments and exact native-try exception in combined fixtures', () => {
  const invalid = S`
    /* header */
    const value = /* value */ 1 /* trailing */
    if /* condition */ (value) { value }
    function work() { try { work() } finally { cleanup() } }
  `
  const issues = messages(sourceConformanceIssues('fixture.ts', invalid)).toSorted()
  Tests.expect(issues).toEqual([
    'use // lines instead of non-JSDoc block comments',
    'use // lines instead of non-JSDoc block comments',
    'use // lines instead of non-JSDoc block comments',
    'use // lines instead of non-JSDoc block comments',
    'use Try from @shared instead of native try/catch/finally',
  ].toSorted())
  const ignoredSyntax = [
    `const string = '/* text */ try {} catch {} /** text */'`,
    'const template = `/* head */ ${1} /* tail */ try {} catch {}`',
    String.raw`const pattern = /\/\*.*\*\//`,
  ].join('\n')
  Tests.expect(sourceConformanceIssues('fixture.ts', ignoredSyntax)).toEqual([])
  const tryStatement = 'function work() { try { work() } finally { cleanup() } }'
  Tests.expect(sourceConformanceIssues('ts/shared/shared-src/universal/TryCatch.ts', tryStatement)).toEqual([])
  Tests.expect(sourceConformanceIssues('ts/other/TryCatch.ts', tryStatement)).toHaveLength(1)
})

function physicalBodyLines(count: number): string {
  return Array.from({ length: count }, (_, index) => index % 9 === 0 ? '  // body line' : '  value()').join('\n')
}

function messages(issues: string[]): string[] {
  return issues.map(issue => issue.replace(/^.*?:\d+: /u, ''))
}
