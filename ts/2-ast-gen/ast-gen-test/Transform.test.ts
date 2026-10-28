import * as AST from '@ast-gen/AST'
import { Errors, Range, S, Source, Timings } from '@shared'
import { Tests } from '@shared/os'
import { createParser } from '../../1-grammar/grammar-src/parser'
import { transform } from '../ast-gen-src/Transform'

Tests.test(
  'an app becomes semantic declarations and names with source origins',
  Timings.createTopLevelTimer(async timings => {
    const source = await readAppDeclaration()

    const tree = createParser().parse(source)
    const result = timings.run(transform, tree)
    Tests.expect(result?.root).toStrictEqual({
      kind: 'File',
      range: Range(0, 34),
      block: {
        kind: 'Block',
        range: Range(0, 34),
        statements: [{
          kind: 'AppDeclaration',
          range: Range(0, 34),
          name: { kind: 'Name', range: Range(4, 15), value: 'Performance' },
          block: {
            kind: 'Block',
            range: Range(16, 34),
            statements: [{
              kind: 'RootDeclaration',
              range: Range(20, 32),
              view: { kind: 'Name', range: Range(25, 32), value: 'Preview' },
            }],
          },
          visibility: undefined,
        }],
      },
    })
    const { root } = result!
    const app = root.block.statements[0]!
    if (!AST.IsAppDeclaration(app)) {
      Errors.ThrowShouldNeverHappen('Expected app')
    }
    const second = transform(tree)
    Tests.expect(second?.root).not.toBe(root)
    Tests.expect(second?.root.block.statements[0]?.range.start).toBe(app.range.start)
    Tests.expect(timings.samples.map(sample => [sample.name, sample.status])).toEqual([
      ['transformer.transform', 'succeeded'],
    ])
  }),
)

Tests.test('an unfinished app produces no AST', async () => {
  const source = await readAppDeclaration()
  const tree = createParser().parse(source.slice(0, -1))
  Tests.expect(tree.rootNode.hasError).toBe(true)
  Tests.expect(transform(tree)).toBeUndefined()
})

Tests.test('Preview performance fixture transforms imported generic renders', async () => {
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  const tree = createParser().parse(source)
  const result = transform(tree)
  const view = result?.root.block.statements.find(AST.IsViewDeclaration)
  Tests.expect(view).toMatchObject({
    kind: 'ViewDeclaration',
    range: { start: source.indexOf('view Preview') },
    name: { kind: 'Name', value: 'Preview' },
    parameters: [],
    body: {
      kind: 'Block',
      statements: [{
        kind: 'RenderViewExpressionStatement',
        expression: {
          kind: 'ViewRenderExpression',
          target: { kind: 'Name', value: /render (\w+)/.exec(source)![1] },
          arguments: [],
          block: {
            kind: 'Block',
            statements: [{
              kind: 'ViewRenderExpression',
              target: { kind: 'Name', value: 'Text' },
              arguments: [{ kind: 'TextLiteral', value: 'Hello World' }],
              block: undefined,
              tag: undefined,
            }],
          },
        },
      }],
    },
  })
})

async function readAppDeclaration(): Promise<string> {
  return (await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')).match(
    /app Performance[\s\S]*?\n}/,
  )![0]
}

Tests.test('module statements and declaration visibility become semantic nodes', () => {
  const source = S`
    use Name, Other as Alias from ./views/common
    use Standalone
    use all from tao@ui
    use package tao@ui as UI
    file app Demo { root UI . Home }
    folder view Home(Value UI.Text) { render UI.Text(Value) }
    public let Value is UI.Text = UI.Default
  `
  const tree = createParser().parse(source)
  const result = transform(tree)
  Tests.expect(result?.root.block.statements.map(node => node.kind)).toEqual([
    'UseStatement',
    'UseStatement',
    'UseStatement',
    'UsePackageStatement',
    'AppDeclaration',
    'ViewDeclaration',
    'LetDeclaration',
  ])
  Tests.expect(result?.root.block.statements[0]).toMatchObject({
    kind: 'UseStatement',
    all: false,
    from: { value: './views/common' },
    imports: [{ target: { value: 'Name' } }, { target: { value: 'Other' }, alias: { value: 'Alias' } }],
  })
  Tests.expect(result?.root.block.statements[1]).toMatchObject({
    kind: 'UseStatement',
    all: false,
    imports: [{ target: { value: 'Standalone' } }],
  })
  Tests.expect(result?.root.block.statements[2]).toMatchObject({ kind: 'UseStatement', all: true })
  Tests.expect(result?.root.block.statements[3]).toMatchObject({
    kind: 'UsePackageStatement',
    from: { value: 'tao@ui' },
    alias: { value: 'UI' },
  })
  Tests.expect(result?.root.block.statements[4]).toMatchObject({
    kind: 'AppDeclaration',
    visibility: 'file',
    block: { statements: [{ view: { value: 'UI.Home' } }] },
  })
  Tests.expect(result?.root.block.statements[5]).toMatchObject({ kind: 'ViewDeclaration', visibility: 'folder' })
  Tests.expect(result?.root.block.statements[6]).toMatchObject({ kind: 'LetDeclaration', visibility: 'public' })
  Tests.expect(result?.root.block.statements[0]).toMatchObject({ range: { start: 0, end: source.indexOf('\n') } })
})

Tests.test('requirements and foreign views retain authored fields and source ranges', () => {
  const source = S`
    requires github:acme/widgets version v1.2.0 as widgets
    requires file:../widgets
    requires npm:date-fns version 4.1.0
    requires bundled:tao as tao
    use Button from widgets@ui/controls
    public view FormattedDate(Value text) from ./FormattedDate.tsx
  `
  const tree = createParser().parse(source)
  const result = transform(tree)
  Tests.expect(result?.root.block.statements.map(node => node.kind)).toEqual([
    'RequiresDeclaration',
    'RequiresDeclaration',
    'RequiresDeclaration',
    'RequiresDeclaration',
    'UseStatement',
    'ViewDeclaration',
  ])
  Tests.expect(result?.root.block.statements.slice(0, 4)).toMatchObject([
    { provider: 'github', identifier: 'acme/widgets', version: 'v1.2.0', alias: { value: 'widgets' } },
    { provider: 'file', identifier: '../widgets' },
    { provider: 'npm', identifier: 'date-fns', version: '4.1.0' },
    { provider: 'bundled', identifier: 'tao', alias: { value: 'tao' } },
  ])
  Tests.expect(result?.root.block.statements[4]).toMatchObject({
    imports: [{ target: { value: 'Button' } }],
    from: { value: 'widgets@ui/controls' },
  })
  Tests.expect(result?.root.block.statements[5]).toMatchObject({
    body: { kind: 'ForeignView', path: { value: './FormattedDate.tsx' } },
  })
  Tests.expect(result?.root.block.statements.map(node => Source.slice(source, node.range))).toEqual([
    'requires github:acme/widgets version v1.2.0 as widgets',
    'requires file:../widgets',
    'requires npm:date-fns version 4.1.0',
    'requires bundled:tao as tao',
    'use Button from widgets@ui/controls',
    'public view FormattedDate(Value text) from ./FormattedDate.tsx',
  ])
})
