import { Tests } from '@shared/os'
import { createParser } from '../grammar-src/parser'

Tests.test('HelloWorld produces a positioned CST with named app, root, view and text nodes', async () => {
  const source = await Tests.readApp('Hello World')
  const { tree, timings } = createParser().parse(source)
  Tests.expect(timings.map(sample => [sample.name, sample.status])).toEqual([['parser.parse', 'succeeded']])
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.toString()).toBe(
    '(SourceFile (AppDeclaration name: (Identifier) (RootDeclaration view: (Identifier))) (ViewDeclaration name: (Identifier) (RenderStatement body: (ViewRender view: (Identifier) children: (ViewRender view: (Identifier) argumentList: (ArgumentList (TextLiteral)))))))',
  )
  const app = tree.rootNode.namedChild(0)!
  Tests.expect(app.childForFieldName('name')?.text).toBe('HelloWorld')
  const text = tree.rootNode.descendantsOfType('TextLiteral')[0]
  Tests.expect(text.text).toBe('"Hello World"')
  Tests.expect(text.startPosition).toEqual({ row: 6, column: 9 })
  Tests.expect(source.slice(text.startIndex, text.endIndex)).toBe('"Hello World"')
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
