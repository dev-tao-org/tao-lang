import { Range } from '@shared'
import { Tests } from '@shared/os'
import * as AST from '../ast-gen-src/AST'

Tests.test('semantic kind guards narrow one or several discriminants', () => {
  const node: AST.Node = { kind: 'TextLiteral', range: Range(0, 7), value: 'hello' }
  Tests.expect(AST.IsKind(node, ['Name', 'TextLiteral'])).toBe(true)
  Tests.expect(getLiteralValue(node)).toBe('hello')
  Tests.expect(getLiteralValue({
    kind: 'File',
    range: Range(),
    block: { kind: 'Block', range: Range(), statements: [] },
  })).toBeUndefined()
  Tests.expect(AST.IsKind(node, 'Name')).toBe(false)
  Tests.expect(AST.IsKind(node, 'TextLiteral')).toBe(true)
})

function getLiteralValue(node: AST.Node): string | undefined {
  return AST.IsKind(node, ['Name', 'TextLiteral']) ? node.value : undefined
}
