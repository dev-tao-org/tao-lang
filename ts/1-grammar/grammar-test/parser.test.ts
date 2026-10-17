import { Tests } from '@shared/os'
import { createParser } from '../grammar-src/parser'

Tests.test('HelloWorld produces a positioned CST with named app, root, view and text nodes', async () => {
  const source = await Tests.readApp('Hello World')
  const { tree, timings } = createParser().parse(source)
  Tests.expect(timings.map(sample => [sample.name, sample.status])).toEqual([['parser.parse', 'succeeded']])
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.toString()).toBe(
    '(source_file (app_declaration name: (identifier) (root_declaration view: (identifier))) (view_declaration name: (identifier) (render_clause body: (container (text_view value: (string))))))',
  )
  const app = tree.rootNode.namedChild(0)!
  Tests.expect(app.childForFieldName('name')?.text).toBe('HelloWorld')
  const text = tree.rootNode.descendantsOfType('string')[0]
  Tests.expect(text.text).toBe('"Hello World"')
  Tests.expect(text.startPosition).toEqual({ row: 6, column: 9 })
  Tests.expect(source.slice(text.startIndex, text.endIndex)).toBe('"Hello World"')
})

Tests.test('an unfinished edit reports CST errors and a subsequent full parse recovers', () => {
  const parser = createParser()
  Tests.expect(parser.parse('view RootView { render Col { Text("Hello")').tree.rootNode.hasError).toBe(true)
  const { tree: repaired } = parser.parse('view RootView { render Row { Text("Hello") Text("Again") } }')
  Tests.expect(repaired.rootNode.hasError).toBe(false)
  Tests.expect(repaired.rootNode.descendantsOfType('text_view')).toHaveLength(2)
})
