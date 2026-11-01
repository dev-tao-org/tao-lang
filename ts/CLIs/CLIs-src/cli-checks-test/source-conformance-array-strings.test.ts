import { joinTextLines } from '@shared'
import { Tests } from '@shared/os'
import * as TypeScript from 'typescript'
import { arrayMultilineStringIssue } from '../cli-checks/source-conformance-array-strings'

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
  Tests.expect(joinTextLines('first', '', null, undefined, 'last\r')).toBe('first\n\n\n\nlast\r')
})

function issuesFor(expression: string): string[] {
  const file = TypeScript.createSourceFile('/array-lines.ts', expression, TypeScript.ScriptTarget.Latest, true)
  const issues: string[] = []
  const visit = (node: TypeScript.Node): void => {
    const issue = arrayMultilineStringIssue(node)
    if (issue) {
      issues.push(issue)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}
