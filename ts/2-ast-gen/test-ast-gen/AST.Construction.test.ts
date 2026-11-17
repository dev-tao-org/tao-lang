import * as CST from '@cst'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'

import * as AST from '../ast-gen-src/AST'

Tests.test('field construction preserves import order and absence while checking expected semantic kinds', () => {
  const tree = Grammar.createParser().parse('use ./views/common First, Second as Alias')
  const statement = tree.rootNode.namedChildren.find(node => node.type === 'UseStatement')!
  const use = AST.UseStatement(statement)
  Tests.expect(use.imports.map(node => node.target.value)).toEqual(['First', 'Second'])
  Tests.expect(use.from?.value).toBe('./views/common')
  const firstImport = CST.RequiredField(statement, 'imports')
  Tests.expect(AST.Name(CST.RequiredField(firstImport, 'target')).value).toBe('First')
  Tests.expect(() => AST.Construct(statement, 'AppDeclaration')).toThrow('Unexpected UseStatement')
})

Tests.test('generic blocks retain broad node statements', () => {
  const source = 'view Main { render Text }'
  const tree = Grammar.createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const view = tree.rootNode.namedChildren.find(node => node.type === 'ViewDeclaration')!
  const body = CST.RequiredField(view, 'body')
  Tests.expect(AST.Block(body).statements.map(node => node.kind)).toEqual(['RenderViewExpressionStatement'])
  Tests.expect(AST.Construct(view, 'ViewDeclaration').body.kind).toBe('Block')
})
