import { S } from '@shared'
import * as Tests from '@shared-tests'

import { TypeScript } from '@tao/shared/typescript'
import * as SourceConformanceConditional from '../repo-analysis-src/Source/source-conformance-conditional'
import { complexSignatureTypeIssue } from '../repo-analysis-src/Source/source-conformance-signatures'

Tests.test('source conformance > requires aliases for complex signature contracts', () => {
  const source = S`
    type Options = { slow?: string }
    declare function run(options: { slow?: string } & Options): Promise<{ ok: boolean; value: string; count: number }>
    declare const callback: (value: { first: string; second: string; third: number }) => void
    declare function simple(value: Options | null, callback: (name: string) => number): Promise<void>
    declare function small(value: { name: string }): void
    declare function nested(value: { settings: { enabled: boolean } }): void
    declare function union(value: { kind: 'first'; value: string } | { kind: 'second'; value: number }): void
    declare function map<Key extends string>(value: { [Name in Key]: string }): void
    declare function choose<Value>(value: Value extends string ? { value: Value } : undefined): void
    function body(value: unknown): void {
      const cast = value as { first: string; second: string; third: number }
      void cast
    }
  `
  Tests.expect(issuesFor(source, complexSignatureTypeIssue)).toEqual([2, 2, 3, 6, 7, 8, 9])
})

Tests.test('source conformance > rejects nested ternaries through wrappers but keeps callback decisions separate', () => {
  const source = S`
    declare const value: boolean
    declare const flag: boolean
    value ? (flag ? 1 : 2) : 3
    value ? ((flag ? 1 : 2) as number) : 0
    value ? () => flag ? 1 : 2 : () => 3
    value ? 1 : flag ? 2 : 3
  `
  Tests.expect(issuesFor(source, SourceConformanceConditional.nestedConditionalIssue)).toEqual([3, 4, 6])
})

Tests.test('source conformance > names selected callees without rejecting fallback arguments or ordinary calls', () => {
  const source = S`
    declare const first: (() => void) | undefined
    declare const second: () => void
    declare const flag: boolean
    declare function run(value: unknown): void
    (first ?? second)();
    (first || second)();
    (flag ? second : second)();
    ((first ?? second) as () => void)();
    (first ?? second)?.();
    const chosen = first ?? second
    chosen()
    run(first ?? second)
    ({ run: second }).run()
  `
  Tests.expect(issuesFor(source, SourceConformanceConditional.selectedFunctionCallIssue)).toEqual([5, 6, 7, 8, 9])
})

function issuesFor(source: string, issueFor: (node: TypeScript.Node) => string | undefined): number[] {
  const filename = '/source-conformance-fixture.ts'
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  const issues: number[] = []
  const visit = (node: TypeScript.Node): void => {
    if (issueFor(node)) {
      issues.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}
