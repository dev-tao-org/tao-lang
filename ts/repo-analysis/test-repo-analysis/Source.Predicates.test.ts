import { S } from '@shared'
import * as Tests from '@shared-tests'

import { TypeScript } from '@tao/shared/typescript'
import { predicateOperatorIssue } from '../repo-analysis-src/Source/source-conformance-predicates'

Tests.test('predicate operators require a named boolean or narrowing owner', () => {
  const source = S`
    function compile(value: object) { return 'status' in value ? 'done' : 'pending' }
    function inspect(value: unknown) { if (value instanceof Error) return value.message }
    function isMisnamed(value: object): void { void ('status' in value) }
    const anonymous = values.some((value: object): boolean => 'status' in value)
  `
  Tests.expect(issueCount(source)).toBe(4)
})

Tests.test('predicate operators retain canonical functions, callable bindings and methods', () => {
  const source = S`
    function IsDocument(value: unknown): value is Document { return value instanceof Document }
    function hasStatus(value: object): boolean { return 'status' in value }
    const hasName = (value: object): boolean => 'name' in value
    const checks = { hasCode(value: object): boolean { return 'code' in value } }
    class Scope { hasName(value: object): boolean { return 'name' in value } }
  `
  Tests.expect(issueCount(source)).toBe(0)
})

Tests.test('predicate operators do not inherit permission across callbacks or class initializers', () => {
  const source = S`
    function hasItems(values: object[]): boolean { return values.some(value => 'status' in value) }
    function hasInner(value: object): boolean {
      class Inner { static present = 'status' in value }
      return Inner.present
    }
  `
  Tests.expect(issueCount(source)).toBe(2)
})

Tests.test('predicate operators ignore iteration, mapped types and source text', () => {
  const source = S`
    for (const key in values) consume(key)
    type Fields = { [Key in keyof Shape]: Shape[Key] }
    const text = "value instanceof Error; 'status' in result"
  `
  Tests.expect(issueCount(source)).toBe(0)
})

function issueCount(source: string): number {
  const file = TypeScript.createSourceFile('/predicate-fixture.ts', source, TypeScript.ScriptTarget.Latest, true)
  let count = 0
  const visit = (node: TypeScript.Node): void => {
    if (predicateOperatorIssue(node)) {
      count++
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return count
}
