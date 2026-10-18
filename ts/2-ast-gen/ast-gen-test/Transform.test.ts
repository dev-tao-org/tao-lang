import * as AST from '@ast-gen/AST'
import { Errors, S, Timings } from '@shared'
import { Tests } from '@shared/os'
import { createParser } from '../../1-grammar/grammar-src/parser'
import { transform } from '../ast-gen-src/Transform'

Tests.test('an app becomes semantic declarations and names with source origins', async () => {
  const source = await readAppDeclaration()
  const timings = new Timings('transform-test')
  const { tree } = createParser().parse(source)
  const result = transform(tree, timings)
  Tests.expect(result?.root).toEqual({
    kind: 'File',
    start: 0,
    end: 34,
    declarations: [{
      kind: 'AppDeclaration',
      start: 0,
      end: 34,
      name: { kind: 'Name', start: 4, end: 14, value: 'HelloWorld' },
      root: { kind: 'Name', start: 24, end: 32, value: 'RootView' },
    }],
  })
  const { root } = result!
  const app = root.declarations[0]!
  if (!AST.IsAppDeclaration(app)) {
    Errors.ThrowUnexpected('Expected app')
  }
  const second = transform(tree)
  Tests.expect(second?.root).not.toBe(root)
  Tests.expect(second?.root.declarations[0]?.start).toBe(app.start)
  Tests.expect(timings.samples.map(sample => [sample.name, sample.status])).toEqual([
    ['transformer.transform', 'succeeded'],
  ])
})

Tests.test('an unfinished app produces no AST', async () => {
  const source = await readAppDeclaration()
  const { tree } = createParser().parse(source.slice(0, -1))
  Tests.expect(tree.rootNode.hasError).toBe(true)
  Tests.expect(transform(tree)).toBeUndefined()
})

Tests.test('Hello World transforms imported generic renders', async () => {
  const source = await Tests.readApp('Hello World')
  const { tree } = createParser().parse(source)
  const result = transform(tree)
  const view = result?.root.declarations.find(AST.IsViewDeclaration)
  Tests.expect(view).toMatchObject({
    kind: 'ViewDeclaration',
    start: source.indexOf('view RootView'),
    name: { kind: 'Name', value: 'RootView' },
    parameters: [],
    definitions: [],
    render: {
      kind: 'ViewRender',
      target: { kind: 'Name', value: /render (\w+)/.exec(source)![1] },
      arguments: [],
      children: [{
        kind: 'ViewRender',
        target: { kind: 'Name', value: 'Text' },
        arguments: [{ kind: 'TextLiteral', value: 'Hello World' }],
        children: [],
      }],
    },
  })
})

async function readAppDeclaration(): Promise<string> {
  return (await Tests.readApp('Hello World')).match(/app HelloWorld[\s\S]*?\n}/)![0]
}

Tests.test('module statements and declaration visibility become semantic nodes', () => {
  const source = S`
    use Name, Other as Alias from ./views/common
    use Standalone
    use all from @tao/ui
    use package @tao/ui as UI
    file app Demo { root UI . Home }
    folder view Home(Value UI.Text) { render UI.Text(Value) }
    public let Value is UI.Text = UI.Default
  `
  const { tree } = createParser().parse(source)
  const result = transform(tree)
  Tests.expect(result?.root.declarations.map(node => node.kind)).toEqual([
    'UseStatement',
    'UseStatement',
    'UseStatement',
    'UsePackageStatement',
    'AppDeclaration',
    'ViewDeclaration',
    'LetDefinition',
  ])
  Tests.expect(result?.root.declarations[0]).toMatchObject({
    kind: 'UseStatement',
    all: false,
    from: { value: './views/common' },
    imports: [{ target: { value: 'Name' } }, { target: { value: 'Other' }, alias: { value: 'Alias' } }],
  })
  Tests.expect(result?.root.declarations[1]).toMatchObject({
    kind: 'UseStatement',
    all: false,
    imports: [{ target: { value: 'Standalone' } }],
  })
  Tests.expect(result?.root.declarations[2]).toMatchObject({ kind: 'UseStatement', all: true })
  Tests.expect(result?.root.declarations[3]).toMatchObject({
    kind: 'UsePackageStatement',
    from: { value: '@tao/ui' },
    alias: { value: 'UI' },
  })
  Tests.expect(result?.root.declarations[4]).toMatchObject({
    kind: 'AppDeclaration',
    visibility: 'file',
    root: { value: 'UI.Home' },
  })
  Tests.expect(result?.root.declarations[5]).toMatchObject({ kind: 'ViewDeclaration', visibility: 'folder' })
  Tests.expect(result?.root.declarations[6]).toMatchObject({ kind: 'LetDefinition', visibility: 'public' })
  Tests.expect(result?.root.declarations[0]).toMatchObject({ start: 0, end: source.indexOf('\n') })
})
