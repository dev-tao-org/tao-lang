import { S } from '@shared'
import * as Tests from '@shared-tests'

import { TypeScript } from '@tao/shared/typescript'
import { optionalAccessIssue } from '../repo-analysis-src/Source/source-conformance-optional'

Tests.test('optional access conformance > replaces nullable member reads without treating other falsy values as nullish', () => {
  const source = S`
    declare const node: { text: string } | null
    declare const token: { text: string } | undefined
    declare const scalar: string | undefined
    declare const number: number | undefined
    declare const flag: boolean | undefined
    declare const uncertain: any
    declare const unknown: unknown
    declare const imported: UnresolvedType
    declare function next(): { text: string } | null
    declare const holder: { node: { text: string } | null }
    declare const literal: '' | 'label' | undefined
    node ? node.text as 'label' : undefined
    token ? token['text'] : undefined
    scalar ? scalar.length : undefined
    number ? number.toFixed : undefined
    flag ? flag.valueOf : undefined
    uncertain ? uncertain.text : undefined
    unknown ? (unknown as { text: string }).text : undefined
    imported ? imported.text : undefined
    next() ? next()!.text : undefined
    holder.node ? holder.node.text : undefined
    node ? token?.text : undefined
    node ? node.text : null
    literal ? literal.length : undefined
  `
  Tests.expect(issuesFor(source)).toEqual([12, 13])
})

function issuesFor(source: string): number[] {
  const filename = '/optional-access-fixture.ts'
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  const host = TypeScript.createCompilerHost({ strict: true, noLib: true })
  host.getSourceFile = path => path === filename ? file : undefined
  const program = TypeScript.createProgram([filename], { strict: true, noLib: true }, host)
  const checker = program.getTypeChecker()
  const issues: number[] = []
  const visit = (node: TypeScript.Node): void => {
    if (optionalAccessIssue(node, checker)) {
      issues.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}
