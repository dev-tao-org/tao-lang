import { S } from '@shared'
import { Tests } from '@shared/os'
import { createParser } from '../grammar-src/parser'

Tests.test('app journeys parse render tags, interactions and grouped expectations', () => {
  const tree = createParser().parse(S`
    app Example { root Form }
    view Form { render #form Col { #username Input #save Button } }
    tests "Forms" {
      test "Save" {
        run Example
        expect text "Ready"
        press #save
        type "Hello World" into #username
        expect #username input value "Hello World"
        expect { text "Saved" text "Hello World" }
        expect #username { input value "Hello World" }
      }
      test(Label "Fresh launch") { run Example expect text "Ready" }
    }
  `)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('TestDeclaration')).toHaveLength(2)
  Tests.expect(tree.rootNode.descendantsOfType('ViewRenderExpression').map(node => node.childForFieldName('tag')?.text))
    .toEqual(['#form', '#username', '#save'])
  Tests.expect(tree.rootNode.descendantsOfType('RenderViewExpressionStatement')).toHaveLength(1)
  Tests.expect(tree.rootNode.descendantsOfType('Block')).toHaveLength(8)
})
Tests.test('private views follow their owner render and can be referenced within its scope', () => {
  const source = S`
    view Main {
      render Col { Card }
      view Card { render Text("card") }
    }
  `
  const tree = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('ViewDeclaration').map(node => node.childForFieldName('name')?.text))
    .toEqual(['Main', 'Card'])
})
