import { S } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'

import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { arrayMultilineStringIssue } from '../repo-analysis-src/Source/source-conformance-array-strings'
import { multilineStringIssue } from '../repo-analysis-src/Source/source-conformance-layout'

Tests.test('array multiline strings > requires the shared helper for newline-joined array literals', () => {
  Tests.expect(issuesFor("['first', 'second'].join('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("([value] as readonly string[]).join('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("(<readonly string[]>['first', 'second']).join('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("([value] satisfies readonly unknown[]).join('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("(['first', 'second']!).join('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("(['first', 'second']).join(`\\n`)")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("[stdout, stderr].join('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("['first', 'second']['join']('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("['first', 'second'].join?.('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("['first', 'second']['join']?.('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
  Tests.expect(issuesFor("(['first', 'second'])?.['join']?.('\\n')")).toEqual([
    'use S for authored multiline strings or joinTextLines from @shared for dynamic lines',
  ])
})

Tests.test('array multiline strings > leaves dynamic collections and other separators unchanged', () => {
  Tests.expect(issuesFor("values.join('\\n')")).toEqual([])
  Tests.expect(issuesFor("values.map(value => value).join('\\n')")).toEqual([])
  Tests.expect(issuesFor("['first', 'second'].join('')")).toEqual([])
  Tests.expect(issuesFor("['first', 'second'].join()")).toEqual([])
  Tests.expect(issuesFor("['first', 'second'][methodName]('\\n')")).toEqual([])
  Tests.expect(issuesFor("['first', 'second'].join('\\n\\n')")).toEqual([])
})

Tests.test('joinTextLines > preserves empty, nullish, and carriage-return content', () => {
  Tests.expect(Shared.joinTextLines('first', '', null, undefined, 'last\r')).toBe('first\n\n\n\nlast\r')
})

Tests.test('multiline strings > catches escaped newline literals and interpolated text', () => {
  Tests.expect(issuesFor("const text = 'first\\nsecond'", multilineStringIssue)).toEqual([
    'multiline strings must use S from @shared',
  ])
  Tests.expect(issuesFor('const text = `first${value}\\nsecond`', multilineStringIssue)).toEqual([
    'multiline strings must use S from @shared',
  ])
})

Tests.test('multiline strings > preserves delimiters, literal escapes, tags and type syntax', () => {
  const source = S`
    const delimiter = '\\n'
    const fieldSeparator = ';\\n'
    const pattern = 'first\\\\nsecond'
    const text = S\`first\\nsecond\`
    const source = String.raw\`first\\nsecond\`
    type Label = 'first\\nsecond'
  `
  Tests.expect(issuesFor(source, multilineStringIssue)).toEqual([])
  const expressionOnly = S`
    const text = \`first\${
      readValue()
    }second\`
  `
  Tests.expect(issuesFor(expressionOnly, multilineStringIssue)).toEqual([])
  const namespaced = S`
    const text = Shared.S\`
      first
      second
    \`
  `
  Tests.expect(issuesFor(namespaced, multilineStringIssue)).toEqual([])
})

Tests.test('multiline strings > retains independent expected bytes while checking test inputs', () => {
  const source = S`
    const input = 'first\\nsecond'
    Tests.expect(result).toBe('first\\nsecond')
    Tests.expect(result).toEqual({ text: 'first\\nsecond' })
  `
  Tests.expect(issuesFor(source, multilineStringIssue, '/fixture.test.ts')).toEqual([
    'multiline strings must use S from @shared',
  ])
  Tests.expect(issuesFor(source, multilineStringIssue)).toHaveLength(3)
})

type StringRule = (node: TypeScript.Node, file: TypeScript.SourceFile) => string | undefined

function issuesFor(
  expression: string,
  rule: StringRule = arrayMultilineStringIssue,
  filename = '/array-lines.ts',
): string[] {
  const file = TypeScript.createSourceFile(filename, expression, TypeScript.ScriptTarget.Latest, true)
  const issues: string[] = []
  const visit = (node: TypeScript.Node): void => {
    const issue = rule(node, file)
    if (issue) {
      issues.push(issue)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}
