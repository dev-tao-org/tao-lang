import { S, Source, Timings } from '@shared'
import * as Tests from '@shared-tests'

import { createParser } from '../grammar-src/parser'

Tests.test(
  'parser entry points join an existing collector and return only the parsing session and CST',
  Timings.createTopLevelTimer(timings => {
    const parser = timings.run(createParser)
    Tests.expect(Object.keys(parser)).toEqual(['parse'])
    const tree = timings.run(parser.parse, 'view Root { render Text("Hello") }')
    Tests.expect(tree.rootNode.hasError).toBe(false)
    Tests.expect(timings.samples.map(sample => [sample.name, sample.role])).toEqual([
      ['parser.native-load', 'leaf'],
      ['parser.initialize', 'orchestration'],
      ['parser.parse', 'leaf'],
    ])
  }),
)

Tests.test(
  'Performance produces a positioned CST with named app, root, view and text nodes',
  Timings.createTopLevelTimer(async timings => {
    const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')

    const parser = createParser()
    const tree = timings.run(parser.parse, source)
    Tests.expect(timings.samples.map(sample => [sample.name, sample.role, sample.status]))
      .toEqual([['parser.parse', 'leaf', 'succeeded']])
    Tests.expect(tree.rootNode.hasError).toBe(false)
    Tests.expect(tree.rootNode.descendantsOfType('ViewDeclaration').length).toBe(1)
    Tests.expect(tree.rootNode.descendantsOfType('UseStatement').length).toBe(1)
    const app = tree.rootNode.descendantsOfType('AppDeclaration')[0]!
    Tests.expect(app.childForFieldName('name')?.text).toBe('Performance')
    const text = tree.rootNode.descendantsOfType('TextLiteral')[0]
    Tests.expect(text.text).toBe('"Hello World"')
    Tests.expect(text.startPosition).toEqual({ row: 8, column: 9 })
    Tests.expect(Source.slice(source, text)).toBe('"Hello World"')
  }),
)

Tests.test('render injections preserve typed parameters, named captures and opaque TypeScript', () => {
  const source =
    'view Text(Value text) { render inject Value, Alias Value, Children @@children ```ts return <Tao.Text>{Value}</Tao.Text> ``` }'
  const tree = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('Parameter')[0]?.text).toBe('Value text')
  Tests.expect(tree.rootNode.descendantsOfType('InjectionCapture').map(node => node.text))
    .toEqual(['Value', 'Alias Value', 'Children @@children'])
  Tests.expect(tree.rootNode.descendantsOfType('TypeScript')[0]?.text).toContain('<Tao.Text>')
})

Tests.test('an unfinished edit recovers to generic view names, arguments and children', () => {
  const parser = createParser()
  Tests.expect(parser.parse('view RootView { render Col { Text("Hello")').rootNode.hasError).toBe(true)
  const repaired = parser.parse('view RootView { render Custom("Title", Value) { Unknown("Hello") Leaf } }')
  Tests.expect(repaired.rootNode.hasError).toBe(false)
  Tests.expect(
    repaired.rootNode.descendantsOfType('ViewRenderExpression').map(node => node.childForFieldName('view')?.text),
  )
    .toEqual(['Custom', 'Unknown', 'Leaf'])
  Tests.expect(repaired.rootNode.descendantsOfType('ArgumentList')[0]?.namedChildren.map(node => node.type))
    .toEqual(['TextLiteral', 'QualifiedName'])
})

Tests.test('text literals reject raw JSON control characters but retain escaped controls', () => {
  const parser = createParser()
  const rawControl = parser.parse('view RootView { render Text("raw\u0001control") }')
  const escapedControl = parser.parse('view RootView { render Text("escaped\\u0001control") }')

  Tests.expect(rawControl.rootNode.hasError).toBe(true)
  Tests.expect(escapedControl.rootNode.hasError).toBe(false)
})

Tests.test('syntax diagnostics reject incomplete statements and superseded imports', () => {
  const parser = createParser()
  const invalidSources = [
    'app Demo { root }',
    'view Main { render Col { Text("Hello") }',
    'view Main { let Title = }',
    'tests { test { type into #save } }',
    'use Text from tao@ui',
    'use all from tao@ui',
    'use package tao@ui as UI',
  ]

  for (const source of invalidSources) {
    Tests.expect({ source, hasError: parser.parse(source).rootNode.hasError }).toEqual({ source, hasError: true })
  }
})

Tests.test('module imports, visibility prefixes and qualified references parse', () => {
  const source = S`
    use ./views/common Name, Other as Alias
    use Standalone
    use tao@ui Text
    file app Demo { root UI.Home }
    folder view Home(Value UI.Text) { render UI.Text(Value) }
    package let Value is UI.Text = UI.Default
  `
  const tree = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('UseStatement')).toHaveLength(3)
  Tests.expect(tree.rootNode.descendantsOfType('QualifiedName').map(node => node.text)).toEqual([
    'UI.Home',
    'UI.Text',
    'UI.Text',
    'Value',
    'UI.Text',
    'UI.Default',
  ])
  Tests.expect(tree.rootNode.descendantsOfType('Visibility').map(node => node.text))
    .toEqual(['file', 'folder', 'package'])
})

Tests.test('requirements, package subpath imports and foreign views parse', () => {
  const source = S`
    requires github:acme/widgets version v1.2.0 as Widgets
    requires file:../widgets as Widgets
    requires npm:@date-fns/tz version 4.1.0
    requires bundled:tao version v2 as TaoSource
    use @store Save
    use Widgets@ui/controls Button
    package view FormattedDate(Value text) from ./FormattedDate.tsx
  `
  const tree = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  Tests.expect(tree.rootNode.descendantsOfType('RequiresDeclaration')).toHaveLength(4)
  Tests.expect(tree.rootNode.descendantsOfType('ImportPath').map(node => node.text)).toEqual([
    '@store',
    'Widgets@ui/controls',
    './FormattedDate.tsx',
  ])
  Tests.expect(tree.rootNode.descendantsOfType('ForeignView')).toHaveLength(1)
})
