import * as AST from '@ast-gen/AST'
import { createParser } from '@grammar/parser'
import { S } from '@shared'
import { Tests } from '@shared/os'
import { transform } from '../ast-gen-src/Transform'

Tests.test('lets retain their lexical owner and ordered render block', () => {
  const source = S`
    let Title is text = "File"
    app Example { root Root }
    view Root {
      let Caption = Title
      render Col {
        Text(Caption)
        let Caption = "Block"
        Text(Caption)
      }
    }
  `
  const tree = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = transform(tree)!
  Tests.expect(document.root.block.statements[0]).toMatchObject({
    kind: 'LetDeclaration',
    name: { value: 'Title' },
    type: { value: 'text' },
    value: { value: 'File' },
  })
  const view = document.root.block.statements.find(AST.IsViewDeclaration)!
  Tests.expect(view.body).toMatchObject({
    kind: 'Block',
    statements: [
      { kind: 'LetDeclaration', name: { value: 'Caption' }, value: { kind: 'Name', value: 'Title' } },
      { kind: 'RenderViewExpressionStatement', expression: { kind: 'ViewRenderExpression' } },
    ],
  })
  const render = view.body.kind === 'Block' && view.body.statements[1]
  Tests.expect(render).toMatchObject({
    expression: {
      block: {
        statements: [
          { kind: 'ViewRenderExpression' },
          { kind: 'LetDeclaration', name: { value: 'Caption' }, value: { value: 'Block' } },
          { kind: 'ViewRenderExpression' },
        ],
      },
    },
  })
})
