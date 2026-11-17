import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'

import { S } from '@shared'

import { transform } from '../ast-gen-src/Transform'

Tests.test('lets retain their lexical owner and ordered render block', () => {
  const source = S`
    let Title = "File"
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
  const tree = Grammar.createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = transform(tree)!
  Tests.expect(document.root.block.statements[0]).toMatchObject({
    kind: 'LetDeclaration',
    name: { value: 'Title' },
    value: { value: 'File' },
  })
  const view = AST.FindViewDeclaration(document.root.block.statements)!
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
  const tree = Grammar.createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = transform(tree)!
  const view = AST.FindViewDeclaration(document.root.block.statements)!
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
  const tree = Grammar.createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = transform(tree)!
  const view = AST.FindViewDeclaration(document.root.block.statements)!
  const nested = AST.IsKind(view.body, 'Block') && AST.FindViewDeclaration(view.body.statements)
  Tests.expect(AST.GetViewDeclarations(document).map(item => item.name.value)).toEqual(['Main'])
  Tests.expect(AST.GetAllViewDeclarations(document).map(item => item.name.value)).toEqual(['Main', 'Native'])
  Tests.expect(AST.HasForeignViews(document)).toBe(true)
  Tests.expect(nested).toMatchObject({
    kind: 'ViewDeclaration',
    name: { value: 'Native' },
    body: { kind: 'ForeignView', path: { value: './Native.tsx' } },
  })
})
