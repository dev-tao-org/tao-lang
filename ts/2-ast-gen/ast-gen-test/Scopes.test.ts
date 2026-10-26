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

Tests.test('private views remain ordered after the owner render in the view AST', () => {
  const source = S`
    view Main {
      render Col { Card }
      view Card { render Text("card") }
    }
  `
  const tree = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = transform(tree)!
  const view = document.root.block.statements.find(AST.IsViewDeclaration)!
  Tests.expect(view.body).toMatchObject({
    kind: 'Block',
    statements: [
      { kind: 'RenderViewExpressionStatement' },
      { kind: 'ViewDeclaration', name: { value: 'Card' }, body: { kind: 'Block' } },
    ],
  })
})

Tests.test('nested foreign views retain their external implementation path', () => {
  const source = S`
    view Main {
      render Col { Native }
      view Native(Value text) from ./Native.tsx
    }
  `
  const tree = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = transform(tree)!
  const view = document.root.block.statements.find(AST.IsViewDeclaration)!
  const nested = view.body.kind === 'Block' && view.body.statements.find(AST.IsViewDeclaration)
  Tests.expect(AST.GetViewDeclarations(document).map(item => item.name.value)).toEqual(['Main'])
  Tests.expect(AST.GetAllViewDeclarations(document).map(item => item.name.value)).toEqual(['Main', 'Native'])
  Tests.expect(AST.HasForeignViews(document)).toBe(true)
  Tests.expect(nested).toMatchObject({
    kind: 'ViewDeclaration',
    name: { value: 'Native' },
    body: { kind: 'ForeignView', path: { value: './Native.tsx' } },
  })
})
