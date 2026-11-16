import * as AST from '@ast-gen'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'

import * as Grammar from '@grammar'
import { transform } from '../ast-gen-src/Transform'

const RenderedViewNameRegx = /render (\w+)/
const PerformanceAppDeclarationRegx = /app Performance[\s\S]*?\n}/

Tests.test(
  'an app becomes semantic declarations and names with source origins',
  Shared.Timings.createTopLevelTimer(async timings => {
    const source = await readAppDeclaration()

    const tree = Grammar.createParser().parse(source)
    const result = timings.run(transform, tree)
    Tests.expect(result?.root).toStrictEqual({
      kind: 'File',
      range: Shared.Range(0, 34),
      block: {
        kind: 'Block',
        range: Shared.Range(0, 34),
        statements: [{
          kind: 'AppDeclaration',
          range: Shared.Range(0, 34),
          name: { kind: 'Name', range: Shared.Range(4, 15), value: 'Performance' },
          block: {
            kind: 'Block',
            range: Shared.Range(16, 34),
            statements: [{
              kind: 'RootDeclaration',
              range: Shared.Range(20, 32),
              view: { kind: 'Name', range: Shared.Range(25, 32), value: 'Preview' },
            }],
          },
          visibility: undefined,
        }],
      },
    })
    const { root } = result!
    const app = root.block.statements[0]!
    if (!AST.IsAppDeclaration(app)) {
      Shared.Errors.ThrowShouldNeverHappen('Expected app')
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
  const tree = Grammar.createParser().parse(source.slice(0, -1))
  Tests.expect(tree.rootNode.hasError).toBe(true)
  Tests.expect(transform(tree)).toBeUndefined()
})

Tests.test('boolean literals and qualified names headed by yes or no remain distinct', () => {
  const source = Shared.S`
    use package ./yes
    use package ./no
    let Value = yes.Flag
    view Root {
      render Panel(yes, no, no.Flag) [disabled no.Flag] {
        Button [disabled yes]
      }
    }
  `
  const result = transform(Grammar.createParser().parse(source))
  const statements = result?.root.block.statements ?? []
  Tests.expect(AST.FindLetDeclaration(statements, 'Value')?.value).toMatchObject({
    kind: 'Name',
    value: 'yes.Flag',
  })
  Tests.expect(AST.FindViewDeclaration(statements, 'Root')?.body).toMatchObject({
    statements: [{
      expression: {
        arguments: [
          { kind: 'BooleanLiteral', value: true },
          { kind: 'BooleanLiteral', value: false },
          { kind: 'Name', value: 'no.Flag' },
        ],
        interaction: { condition: { kind: 'Name', value: 'no.Flag' } },
        block: {
          statements: [{ interaction: { condition: { kind: 'BooleanLiteral', value: true } } }],
        },
      },
    }],
  })
})

Tests.test('Preview performance fixture transforms imported generic renders', async () => {
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  const tree = Grammar.createParser().parse(source)
  const result = transform(tree)
  const view = result && AST.FindViewDeclaration(result.root.block.statements)
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
          target: { kind: 'Name', value: RenderedViewNameRegx.exec(source)![1] },
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
    PerformanceAppDeclarationRegx,
  )![0]
}

Tests.test('module statements and declaration visibility become semantic nodes', () => {
  const source = Shared.S`
    use ./views/common Name, Other as Alias
    use Standalone
    use tao@ui all
    use package tao@ui as UI
    file app Demo { root UI . Home }
    folder view Home(Value UI.Text) { render UI.Text(Value) }
    public let Value is UI.Text = UI.Default
  `
  const tree = Grammar.createParser().parse(source)
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
  assertPackageImport(result?.root.block.statements[2], result?.root.block.statements[3])
  Tests.expect(result?.root.block.statements[4]).toMatchObject({
    kind: 'AppDeclaration',
    visibility: 'file',
    block: { statements: [{ view: { value: 'UI.Home' } }] },
  })
  Tests.expect(result?.root.block.statements[5]).toMatchObject({ kind: 'ViewDeclaration', visibility: 'folder' })
  Tests.expect(result?.root.block.statements[6]).toMatchObject({ kind: 'LetDeclaration', visibility: 'public' })
  Tests.expect(result?.root.block.statements[0]).toMatchObject({
    range: { start: 0, end: source.indexOf(Shared.NewlineCharacter) },
  })
})

function assertPackageImport(all?: AST.Node, packageImport?: AST.Node): void {
  Tests.expect(all).toMatchObject({ kind: 'UseStatement', all: true })
  Tests.expect(packageImport).toMatchObject({
    kind: 'UsePackageStatement',
    from: { value: 'tao@ui' },
    alias: { value: 'UI' },
  })
}

Tests.test('requirements and foreign views retain authored fields and source ranges', () => {
  const source = Shared.S`
    requires github:acme/widgets version v1.2.0 as Widgets
    requires file:../widgets
    requires npm:date-fns version 4.1.0
    requires bundled:tao as TaoSource
    use Widgets@ui/controls Button
    public view FormattedDate(Value text) from ./FormattedDate.tsx
  `
  const tree = Grammar.createParser().parse(source)
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
    { provider: 'github', identifier: 'acme/widgets', version: 'v1.2.0', alias: { value: 'Widgets' } },
    { provider: 'file', identifier: '../widgets' },
    { provider: 'npm', identifier: 'date-fns', version: '4.1.0' },
    { provider: 'bundled', identifier: 'tao', alias: { value: 'TaoSource' } },
  ])
  Tests.expect(result?.root.block.statements[4]).toMatchObject({
    imports: [{ target: { value: 'Button' } }],
    from: { value: 'Widgets@ui/controls' },
  })
  Tests.expect(result?.root.block.statements[5]).toMatchObject({
    body: { kind: 'ForeignView', path: { value: './FormattedDate.tsx' } },
  })
  Tests.expect(result?.root.block.statements.map(node => Shared.Source.slice(source, node.range))).toEqual([
    'requires github:acme/widgets version v1.2.0 as Widgets',
    'requires file:../widgets',
    'requires npm:date-fns version 4.1.0',
    'requires bundled:tao as TaoSource',
    'use Widgets@ui/controls Button',
    'public view FormattedDate(Value text) from ./FormattedDate.tsx',
  ])
})
