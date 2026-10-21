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
  Tests.expect(document.root.declarations[0]).toMatchObject({
    kind: 'LetDefinition',
    name: { value: 'Title' },
    type: { value: 'text' },
    value: { value: 'File' },
  })
  const view = document.root.declarations.find(AST.IsViewDeclaration)!
  Tests.expect(view.definitions).toMatchObject([{
    name: { value: 'Caption' },
    value: { kind: 'Name', value: 'Title' },
  }])
  Tests.expect(view.render).toMatchObject({
    children: [
      { kind: 'ViewRender' },
      { kind: 'LetDefinition', name: { value: 'Caption' }, value: { value: 'Block' } },
      { kind: 'ViewRender' },
    ],
  })
})
