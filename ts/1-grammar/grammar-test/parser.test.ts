import { S } from '@shared'
import { Tests } from '@shared/os'
import { createParser } from '../grammar-src/parser'

Tests.test('HelloWorld produces a positioned CST with named app, root, view and text nodes', async () => {
  const source = await Tests.readApp('Hello World')
  const { tree, timings } = createParser().parse(source)
  Tests.expect(timings.map(sample => [sample.name, sample.status])).toEqual([['parser.parse', 'succeeded']])
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('ViewDeclaration').length).toBe(1)
  Tests.expect(tree.rootNode.descendantsOfType('UseStatement').length).toBe(1)
  const app = tree.rootNode.descendantsOfType('AppDeclaration')[0]!
  Tests.expect(app.childForFieldName('name')?.text).toBe('HelloWorld')
  const text = tree.rootNode.descendantsOfType('TextLiteral')[0]
  Tests.expect(text.text).toBe('"Hello World"')
  Tests.expect(text.startPosition).toEqual({ row: 8, column: 9 })
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
    .toEqual(['TextLiteral', 'QualifiedName'])
})

Tests.test('text literals reject raw JSON control characters but retain escaped controls', () => {
  const parser = createParser()
  const rawControl = parser.parse('view RootView { render Text("raw\u0001control") }')
  const escapedControl = parser.parse('view RootView { render Text("escaped\\u0001control") }')

  Tests.expect(rawControl.tree.rootNode.hasError).toBe(true)
  Tests.expect(escapedControl.tree.rootNode.hasError).toBe(false)
})

Tests.test('module imports, visibility prefixes and qualified references parse', () => {
  const source = S`
    use Name, Other as Alias from ./views/common
    use Standalone
    use all from @tao/ui
    use package @tao/ui as UI
    file app Demo { root UI.Home }
    folder view Home(Value UI.Text) { render UI.Text(Value) }
    public let Value is UI.Text = UI.Default
  `
  const { tree } = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('UseStatement')).toHaveLength(3)
  Tests.expect(tree.rootNode.descendantsOfType('UsePackageStatement')).toHaveLength(1)
  Tests.expect(tree.rootNode.descendantsOfType('QualifiedName').map(node => node.text)).toEqual([
    'UI.Home',
    'UI.Text',
    'UI.Text',
    'Value',
    'UI.Text',
    'UI.Default',
  ])
  Tests.expect(tree.rootNode.descendantsOfType('Visibility').map(node => node.text))
    .toEqual(['file', 'folder', 'public'])
})

Tests.test('requirements, package subpath imports and foreign views parse', () => {
  const source = S`
    requires github:acme/widgets version v1.2.0 as widgets
    requires file:../widgets as widgets
    requires npm:@date-fns/tz version 4.1.0
    requires bundled:tao version v2 as tao
    use Save from @store
    use Button from widgets@ui/controls
    public view FormattedDate(Value text) from ./FormattedDate.tsx
  `
  const { tree } = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('RequiresDeclaration')).toHaveLength(4)
  Tests.expect(tree.rootNode.descendantsOfType('ImportPath').map(node => node.text)).toEqual([
    '@store',
    'widgets@ui/controls',
    './FormattedDate.tsx',
  ])
  Tests.expect(tree.rootNode.descendantsOfType('ForeignView')).toHaveLength(1)
})
