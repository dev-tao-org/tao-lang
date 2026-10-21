import * as CST from '@cst'
import { createParser } from '@grammar/parser'
import { Tests } from '@shared/os'
import * as AST from '../ast-gen-src/AST'

Tests.test('field construction preserves import order and absence while checking expected semantic kinds', () => {
  const tree = createParser().parse('use First, Second as Alias from ./views/common')
  const statement = CST.RequiredChild(tree.rootNode, 'UseStatement')
  Tests.expect(AST.FieldList(statement, 'imports', 'NamedImport').map(node => node.target.value))
    .toEqual(['First', 'Second'])
  Tests.expect(AST.FieldList(statement, 'missing', 'NamedImport')).toEqual([])
  Tests.expect(AST.OptionalField(statement, 'from', 'ImportPath')?.value).toBe('./views/common')
  Tests.expect(AST.OptionalField(statement, 'missing', 'Name')).toBeUndefined()
  Tests.expect(() => AST.OptionalField(statement, 'from', 'Name')).toThrow('Unexpected ImportPath')
  Tests.expect(() => AST.FieldList(statement, 'imports', 'Name')).toThrow('Unexpected NamedImport')
})
