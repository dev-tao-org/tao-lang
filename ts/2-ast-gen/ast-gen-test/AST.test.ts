import { Tests } from '@shared/os'
import * as AST from '../ast-gen-src/AST'

Tests.test('semantic kind guards narrow one or several discriminants', () => {
  const node: AST.Node = { kind: 'TextLiteral', start: 0, end: 7, value: 'hello' }
  Tests.expect(AST.IsKind(node, ['Name', 'TextLiteral'])).toBe(true)
  Tests.expect(literalValue(node)).toBe('hello')
  Tests.expect(literalValue({ kind: 'File', start: 0, end: 0, declarations: [] })).toBeUndefined()
  Tests.expect(AST.IsKind(node, 'Name')).toBe(false)
  Tests.expect(AST.IsKind(node, 'TextLiteral')).toBe(true)
})

function literalValue(node: AST.Node): string | undefined {
  return AST.IsKind(node, ['Name', 'TextLiteral']) ? node.value : undefined
}
