import { Tests } from '@shared/os'
import * as TypeScript from 'typescript'
import { getQuotedObjectKeyChanges, objectLiteralKeysIssue } from '../cli-checks/source-conformance-object-keys'

Tests.test('object keys > quotes named properties, methods, accessors, and shorthand consistently', () => {
  const source =
    "const value = { 'label': text, count, run() {}, get ready() { return true }, set active(value: boolean) {} }"
  const file = parse(source)
  Tests.expect(objectLiteralKeysIssue(findObject(file))).toBe(
    'quote every string property name when any string property name is quoted',
  )
  Tests.expect(applyChanges(file)).toBe(
    "const value = { 'label': text, 'count': count, 'run'() {}, get 'ready'() { return true }, set 'active'(value: boolean) {} }",
  )
})

Tests.test('object keys > leaves computed names, spreads, numeric keys, types, and patterns alone', () => {
  const source =
    "const value = { 'label': text, [key]: value, ...other, 2: count }; type Shape = { label: string; count: number }; const { count: renamed } = value"
  const file = parse(source)
  Tests.expect(objectLiteralKeysIssue(findObject(file))).toBeUndefined()
  Tests.expect(getQuotedObjectKeyChanges(file)).toEqual([])
})

Tests.test('object keys > leaves computed and spread members intact while quoting named keys', () => {
  const source = "const value = { 'label': text, [key]: value, ...other, count }"
  const file = parse(source)
  Tests.expect(applyChanges(file)).toBe("const value = { 'label': text, [key]: value, ...other, 'count': count }")
})

Tests.test('object keys > leaves objects with unexpandable assignment shorthand unchanged', () => {
  const source = "const value = { 'label': text, count = fallback }"
  Tests.expect(getQuotedObjectKeyChanges(parse(source))).toEqual([])
})

Tests.test('object keys > preserves __proto__ shorthand semantics and produces a stable valid fix', () => {
  const source = "const value = { 'label': text, __proto__ }"
  const formatted = applyChanges(parse(source))
  Tests.expect(formatted).toBe("const value = { 'label': text, ['__proto__']: __proto__ }")
  const syntax = TypeScript.transpileModule(formatted, { reportDiagnostics: true })
  Tests.expect(syntax.diagnostics ?? []).toEqual([])
  Tests.expect(getQuotedObjectKeyChanges(parse(formatted))).toEqual([])
})

function applyChanges(file: TypeScript.SourceFile): string {
  return getQuotedObjectKeyChanges(file).sort((first, second) => second.span.start - first.span.start).reduce(
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
