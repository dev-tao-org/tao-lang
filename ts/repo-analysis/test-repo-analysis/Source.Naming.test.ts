import { S } from '@shared'
import * as Tests from '@shared-tests'

import { TypeScript } from '@tao/shared/typescript'
import * as ConformanceNaming from '../repo-analysis-src/Source/source-conformance-naming'

Tests.test('source conformance > rejects arguments_ local and parameter bindings only', () => {
  const source = S`
    const arguments_ = []
    function read(...arguments_: unknown[]) { return arguments_ }
    type Callback = (...arguments_: unknown[]) => void
    const record = { arguments_: 'property' }
    record.arguments_
    const text = 'arguments_'
    function readIntrinsic() { return arguments }
    const { arguments_: args } = record
    const { value: arguments_ } = record
  `
  Tests.expect(issuesFor(source, ConformanceNaming.argumentsIdentifierIssue)).toEqual([1, 2, 3, 9])
})

Tests.test('source conformance > counts connected boolean operators through parentheses and negation', () => {
  const source = S`
    a && b;
    a && b || c;
    a && (b || c) && d;
    !(a && b) || (c && d);
    a && b && c && d && e;
    !a && !b || !c;
    (a && b as boolean) || c && d;
    (a && b)! || c && d;
    (a && b satisfies boolean) || c && d;
    <boolean>(a && b) || c && d;
  `
  Tests.expect(issuesFor(source, ConformanceNaming.booleanExpressionIssue)).toEqual([3, 4, 5, 7, 8, 9, 10])
})

Tests.test('source conformance > keeps nullish, call, comparison and callback boolean boundaries separate', () => {
  const source = S`
    (a && b && c) ?? (d || e || f)
    (a ?? b) && c && d
    run(a && b && c) && d && e
    (a && b && c) === (d || e || f)
    a && run(() => b && c && d) && e
    a && run(function () { return b && c && d && e }) && f
    const narrowed = value && value.name && value.name.length
    a && (b ?? c) && d && e
  `
  Tests.expect(issuesFor(source, ConformanceNaming.booleanExpressionIssue)).toEqual([6, 8])
})

Tests.test('source conformance > names unions in parameters, values, members and nested contracts', () => {
  const source = S`
    type Choice = First | Second
    type OptionalChoice = (Choice | undefined)
    type Nested = Array<First | Second>
    type Record = { value: First | undefined }
    declare function run(value: First | undefined): void
    let current: First | Second
    interface Values { value: First | Second }
    type Callback = (value: First | Second) => void
    type Tuple = [First | Second]
    type NestedUnion = (First | Second) | Third
  `
  Tests.expect(issuesFor(source, ConformanceNaming.unnamedUnionIssue)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
})

Tests.test('source conformance > permits only simple absence unions in direct or async returns', () => {
  const source = S`
    declare function first(): Value | undefined
    declare function second(): Value | null | Missing | None | void
    declare function third(): Promise<Value | undefined>
    type Callback = () => Value | None
    interface Reader { read(): Value | Missing }
    declare function choices(): First | Second | undefined
    declare function array(): Array<Value | undefined>
    declare function nested(): Promise<Array<Value | undefined>>
    declare function unreachable(): Value | never
    const callback = (): Value | undefined => value
    class Reader { get value(): Value | undefined { return undefined } }
    declare function named(): OptionalValue
  `
  Tests.expect(issuesFor(source, ConformanceNaming.unnamedUnionIssue)).toEqual([6, 7, 8, 9])
})

Tests.test('source conformance > requires regex literals as named const initializers', () => {
  const source = S`
    const Words = /word/gu
    const Wrapped = (/word/)
    let mutable = /word/
    text.replace(/word/g, '')
    const match = /word/.test(text)
    const patterns = { word: /word/ }
    const patterns = [/word/]
    const { word } = /word/
    function read() { const Local = /word/; return Local }
    const condition = flag ? /word/ : Words
    const text = '/not-a-regex/'
    const quotient = first / second
    const Created = new RegExp(pattern)
    text.replace(new RegExp(pattern), '')
    const Called = RegExp(pattern)
    text.replace(RegExp(pattern), '')
    const Global = new globalThis.RegExp(pattern)
    text.replace(new globalThis.RegExp(pattern), '')
    text.replace((RegExp)(pattern), '')
  `
  Tests.expect(issuesFor(source, ConformanceNaming.namedRegexIssue)).toEqual([3, 4, 5, 6, 7, 8, 10, 14, 16, 18, 19])
})

type IssueForNode = (node: TypeScript.Node) => string | undefined

function issuesFor(source: string, issueFor: IssueForNode): number[] {
  const file = TypeScript.createSourceFile('/naming-fixture.ts', source, TypeScript.ScriptTarget.Latest, true)
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
