import * as Tests from '@shared-tests'

import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import * as ObjectKeys from '../repo-analysis-src/Source/source-conformance-object-keys'

Tests.test('object keys > quotes named properties, methods, accessors, and shorthand consistently', () => {
  const source =
    "const value = { 'label': text, count, run() {}, get ready() { return true }, set active(value: boolean) {} }"
  const file = parse(source)
  Tests.expect(ObjectKeys.objectLiteralKeysIssue(findObject(file))).toBe(
    'quote every string property name when any string property name is quoted',
  )
  Tests.expect(applyChanges(file)).toBe(
    "const value = { 'label': text, 'count': count, 'run'() {}, get 'ready'() { return true }, set 'active'(value: boolean) {} }",
  )
})

Tests.test('object copies > requires Objects.copy for spread-only object literals', () => {
  const file = parse('const copy = { ...source }')
  Tests.expect(ObjectKeys.objectCopyIssue(findObject(file), file.fileName)).toBe(
    'use Objects.copy(source) for shallow object copies',
  )
  Tests.expect(ObjectKeys.objectCopyIssue(findObject(parse('const copy = { ...source, value: 1 }')), '/fixture.ts'))
    .toBeUndefined()
  Tests.expect(ObjectKeys.objectCopyIssue(findObject(parse('const copy = { value: 1 }')), '/fixture.ts'))
    .toBeUndefined()
})

Tests.test('object copies > permits the Objects.copy implementation', () => {
  const file = TypeScript.createSourceFile(
    '/workspace/ts/shared/shared-src/universal/Objects.ts',
    'export function copy(source: object): object { return { ...source } }',
    TypeScript.ScriptTarget.Latest,
    true,
  )
  Tests.expect(ObjectKeys.objectCopyIssue(findObject(file), file.fileName)).toBeUndefined()
})

Tests.test('object keys > leaves computed names, spreads, numeric keys, types, and patterns alone', () => {
  const source =
    "const value = { 'label': text, [key]: value, ...other, 2: count }; type Shape = { label: string; count: number }; const { count: renamed } = value"
  const file = parse(source)
  Tests.expect(ObjectKeys.objectLiteralKeysIssue(findObject(file))).toBeUndefined()
  Tests.expect(ObjectKeys.getQuotedObjectKeyChanges(file)).toEqual([])
})

Tests.test('object keys > leaves computed and spread members intact while quoting named keys', () => {
  const source = "const value = { 'label': text, [key]: value, ...other, count }"
  const file = parse(source)
  Tests.expect(applyChanges(file)).toBe("const value = { 'label': text, [key]: value, ...other, 'count': count }")
})

Tests.test('object keys > leaves objects with unexpandable assignment shorthand unchanged', () => {
  const source = "const value = { 'label': text, count = fallback }"
  Tests.expect(ObjectKeys.getQuotedObjectKeyChanges(parse(source))).toEqual([])
})

Tests.test('object keys > preserves __proto__ shorthand semantics and produces a stable valid fix', () => {
  const source = "const value = { 'label': text, __proto__ }"
  const formatted = applyChanges(parse(source))
  Tests.expect(formatted).toBe("const value = { 'label': text, ['__proto__']: __proto__ }")
  const syntax = TypeScript.transpileModule(formatted, { reportDiagnostics: true })
  Tests.expect(syntax.diagnostics ?? []).toEqual([])
  Tests.expect(ObjectKeys.getQuotedObjectKeyChanges(parse(formatted))).toEqual([])
})

function applyChanges(file: TypeScript.SourceFile): string {
  return ObjectKeys.getQuotedObjectKeyChanges(file).sort((first, second) => second.span.start - first.span.start)
    .reduce(
      (source, change) =>
        source.slice(0, change.span.start) + change.newText
        + source.slice(change.span.start + change.span.length),
      file.text,
    )
}

type OptionalObjectLiteral = TypeScript.ObjectLiteralExpression | undefined

function findObject(file: TypeScript.SourceFile): TypeScript.ObjectLiteralExpression {
  let object: OptionalObjectLiteral
  const visit = (node: TypeScript.Node): void => {
    if (TypeScript.isObjectLiteralExpression(node)) {
      object = node
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return object!
}

function parse(source: string): TypeScript.SourceFile {
  return TypeScript.createSourceFile('/object-keys-fixture.ts', source, TypeScript.ScriptTarget.Latest, true)
}
