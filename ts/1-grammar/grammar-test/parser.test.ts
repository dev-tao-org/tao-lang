import { Tests } from '@shared/os'
import { createParser } from '../grammar-src/parser'

Tests.test('HelloWorld produces a positioned CST with named app, root, view and text nodes', async () => {
  const source = await Tests.readApp('Hello World')
  const { tree, timings } = createParser().parse(source)
  Tests.expect(timings.map(sample => [sample.name, sample.status])).toEqual([['parser.parse', 'succeeded']])
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('ViewDeclaration').length).toBe(4)
  Tests.expect(tree.rootNode.descendantsOfType('Injection').length).toBe(3)
  const app = tree.rootNode.namedChild(0)!
  Tests.expect(app.childForFieldName('name')?.text).toBe('HelloWorld')
  const text = tree.rootNode.descendantsOfType('TextLiteral')[0]
  Tests.expect(text.text).toBe('"Hello World"')
  Tests.expect(text.startPosition).toEqual({ row: 6, column: 9 })
  Tests.expect(source.slice(text.startIndex, text.endIndex)).toBe('"Hello World"')
})

Tests.test('render injections preserve typed parameters, named captures and opaque TypeScript', () => {
  const source =
    'view Text(Value text) { render inject Value, Alias Value, Children @@children ```ts return <TR.ReactNative.Text>{Value}</TR.ReactNative.Text> ``` }'
  const { tree } = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('Parameter')[0]?.text).toBe('Value text')
  Tests.expect(tree.rootNode.descendantsOfType('InjectionCapture').map(node => node.text))
    .toEqual(['Value', 'Alias Value', 'Children @@children'])
  Tests.expect(tree.rootNode.descendantsOfType('TypeScript')[0]?.text).toContain('<TR.ReactNative.Text>')
})

Tests.test('an unfinished edit recovers to generic view names, arguments and children', () => {
  const parser = createParser()
  Tests.expect(parser.parse('view RootView { render Col { Text("Hello")').tree.rootNode.hasError).toBe(true)
  const { tree: repaired } = parser.parse('view RootView { render Custom("Title", Value) { Unknown("Hello") Leaf } }')
  Tests.expect(repaired.rootNode.hasError).toBe(false)
  Tests.expect(repaired.rootNode.descendantsOfType('ViewRender').map(node => node.childForFieldName('view')?.text))
    .toEqual(['Custom', 'Unknown', 'Leaf'])
  Tests.expect(repaired.rootNode.descendantsOfType('ArgumentList')[0]?.namedChildren.map(node => node.type))
    .toEqual(['TextLiteral', 'Identifier'])
})
