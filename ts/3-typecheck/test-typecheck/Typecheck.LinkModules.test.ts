import * as AST from '@ast-gen'
import { Range } from '@shared'
import * as Tests from '@shared-tests'

import { linkModules } from '../typecheck-src/Typecheck'
import type { SourceModule } from '../typecheck-src/Typecheck'
import * as Fixtures from './Typecheck.test-fixtures.LinkModules'

Tests.test('named aliases and folder siblings become local bindings', () => {
  const statement = useNamed('Open', 'Renamed')
  const entry = Fixtures.createSource('app/main.tao', [statement], ['app/views.tao'])
  const imported = Fixtures.createSource('app/views.tao', [
    Fixtures.createLetDefinition('Open', 'shown', 'package'),
    Fixtures.createLetDefinition('Hidden', 'hidden'),
    Fixtures.createView('Sibling', 'folder'),
  ])
  entry.imports = [createResolvedImport(statement, imported.path, 'same-directory')]
  const linked = linkModules(entry.path, [entry, imported])
  Tests.expect(linked.modules[0]?.bindings).toEqual([
    { name: 'Renamed', source: 'app/views.tao', target: 'Open' },
    { name: 'Sibling', source: 'app/views.tao', target: 'Sibling' },
  ])
})

Tests.test('an explicit import takes precedence over an implicit sibling with the same name', () => {
  const statement = useNamed('Item')
  const entry = Fixtures.createSource('app/main.tao', [statement], ['app/sibling.tao'])
  const sibling = Fixtures.createSource('app/sibling.tao', [Fixtures.createView('Item', 'folder')])
  const imported = Fixtures.createSource('app/explicit.tao', [Fixtures.createView('Item', 'package')])
  entry.imports = [createResolvedImport(statement, imported.path, 'package-api')]
  const linked = linkModules(entry.path, [entry, sibling, imported])
  Tests.expect(linked.modules[0]?.bindings).toEqual([
    { name: 'Item', source: imported.path, target: 'Item' },
  ])
})

Tests.test('named imports report missing and invisible declarations', () => {
  const statement = useNamed('Secret')
  const entry = Fixtures.createSource('app/main.tao', [statement])
  const target = Fixtures.createSource('app/private.tao', [Fixtures.createLetDefinition('Secret', 'hidden')])
  entry.imports = [createResolvedImport(statement, target.path, 'same-directory')]
  Tests.expect(() => linkModules(entry.path, [entry, target])).toThrow(
    'Cannot import Secret from app/main.tao: it is not visible',
  )
  const missing = useNamed('Missing')
  entry.imports = [createResolvedImport(missing, target.path, 'same-directory')]
  Tests.expect(() => linkModules(entry.path, [entry, target])).toThrow(
    'Cannot import Missing from app/main.tao: it does not exist',
  )
})

Tests.test('duplicate local declarations, repeated imports and import collisions fail', () => {
  const duplicate = Fixtures.createSource('app/duplicate.tao', [
    Fixtures.createLetDefinition('Value', 'one'),
    Fixtures.createLetDefinition('Value', 'two'),
  ])
  Tests.expect(() => linkModules(duplicate.path, [duplicate])).toThrow('declares Value more than once')

  const statement = useNamed('Value')
  const entry = Fixtures.createSource('app/main.tao', [statement, statement])
  const target = Fixtures.createSource('app/values.tao', [Fixtures.createLetDefinition('Value', 'value', 'package')])
  entry.imports = [
    createResolvedImport(statement, target.path, 'same-directory'),
    createResolvedImport(statement, target.path, 'same-directory'),
  ]
  Tests.expect(() => linkModules(entry.path, [entry, target])).toThrow('repeats an import statement')

  const collision = Fixtures.createSource('app/main.tao', [statement, Fixtures.createLetDefinition('Value', 'own')])
  collision.imports = [createResolvedImport(statement, target.path, 'same-directory')]
  Tests.expect(() => linkModules(collision.path, [collision, target])).toThrow('which it also declares')

  const renamed = useNamed('Second', 'Value')
  const second = Fixtures.createSource('app/second.tao', [Fixtures.createLetDefinition('Second', 'value', 'package')])
  entry.imports = [
    createResolvedImport(statement, target.path, 'same-directory'),
    createResolvedImport(renamed, second.path, 'same-directory'),
  ]
  Tests.expect(() => linkModules(entry.path, [entry, target, second])).toThrow('more than one binding named Value')
})

Tests.test('duplicate view bindings fail in their own scope while child scopes may shadow', () => {
  const duplicate: AST.ViewDeclaration = {
    ...Fixtures.createView('Main', 'file'),
    body: Fixtures.createViewBlock([
      Fixtures.createLetDefinition('Title', 'one'),
      Fixtures.createLetDefinition('Title', 'two'),
      renderViewExpression(Fixtures.createViewRender('Text')),
    ]),
  }
  Tests.expect(() => linkModules('app/main.tao', [Fixtures.createSource('app/main.tao', [duplicate])]))
    .toThrow('View Main in app/main.tao declares Title more than once in one scope')

  const root: AST.ViewDeclaration = {
    ...Fixtures.createView('Main', 'file'),
    body: Fixtures.createViewBlock([
      Fixtures.createLetDefinition('Title', 'outer'),
      renderViewExpression(Fixtures.createViewRender('Col', [
        Fixtures.createLetDefinition('Title', 'inner'),
        Fixtures.createViewRender('Row', [Fixtures.createLetDefinition('Title', 'nested')]),
      ])),
    ]),
  }
  Tests.expect(() => linkModules('app/main.tao', [Fixtures.createSource('app/main.tao', [root])])).not.toThrow()
})

Tests.test('ambiguous sibling names fail only when the module references them', () => {
  const unreferenced = Fixtures.createView('Main', 'file')
  const left = Fixtures.createSource('app/left.tao', [Fixtures.createView('Item', 'folder')])
  const right = Fixtures.createSource('app/right.tao', [Fixtures.createView('Item', 'folder')])
  const entry = Fixtures.createSource('app/main.tao', [unreferenced], [left.path, right.path])

  Tests.expect(linkModules(entry.path, [entry, left, right]).modules[0]?.bindings).toEqual([])
  const referenced = Fixtures.createSource(
    'app/main.tao',
    [{ ...unreferenced, body: Fixtures.createViewBlock([renderViewExpression(Fixtures.createViewRender('Item'))]) }],
    [left.path, right.path],
  )
  Tests.expect(() => linkModules(referenced.path, [referenced, left, right])).toThrow('ambiguous sibling name Item')

  const parameterView: AST.ViewDeclaration = {
    ...unreferenced,
    parameters: [Fixtures.createParameter('Item', 'text')],
    body: Fixtures.createViewBlock([renderViewExpression(renderWithNameArgument('Text', 'Item'))]),
  }
  const parameterSource = Fixtures.createSource('app/main.tao', [parameterView], [left.path, right.path])
  Tests.expect(() => linkModules(parameterSource.path, [parameterSource, left, right])).not.toThrow()

  const typedParameterView: AST.ViewDeclaration = {
    ...unreferenced,
    parameters: [Fixtures.createParameter('Value', 'Item')],
  }
  const typedParameterSource = Fixtures.createSource('app/main.tao', [typedParameterView], [left.path, right.path])
  Tests.expect(() => linkModules(typedParameterSource.path, [typedParameterSource, left, right]))
    .toThrow('ambiguous sibling name Item')

  const localLetView: AST.ViewDeclaration = {
    ...unreferenced,
    body: Fixtures.createViewBlock([renderViewExpression(Fixtures.createViewRender('Col', [
      Fixtures.createLetDefinition('Item', 'local'),
      renderWithNameArgument('Text', 'Item'),
    ]))]),
  }
  const localLetSource = Fixtures.createSource('app/main.tao', [localLetView], [left.path, right.path])
  Tests.expect(() => linkModules(localLetSource.path, [localLetSource, left, right])).not.toThrow()
})

Tests.test('cross-module lets are ordered by dependency and cycles are reported', () => {
  const importBase = useNamed('Base')
  const entry = Fixtures.createSource('app/main.tao', [importBase, createLetReference('Result', 'Base')])
  const base = Fixtures.createSource('app/base.tao', [Fixtures.createLetDefinition('Base', 'ready', 'package')])
  entry.imports = [createResolvedImport(importBase, base.path, 'package-api')]
  const linked = linkModules(entry.path, [entry, base])
  Tests.expect(linked.definitions.map(item => `${item.source}:${item.declaration.name.value}`))
    .toEqual(['app/base.tao:Base', 'app/main.tao:Result'])

  const importA = useNamed('A')
  const importB = useNamed('B')
  const a = Fixtures.createSource('app/a.tao', [importB, createLetReference('A', 'B', 'package')])
  const b = Fixtures.createSource('app/b.tao', [importA, createLetReference('B', 'A', 'package')])
  a.imports = [createResolvedImport(importB, b.path, 'package-api')]
  b.imports = [createResolvedImport(importA, a.path, 'package-api')]
  Tests.expect(() => linkModules(a.path, [a, b])).toThrow('Module-level let cycle')
})

Tests.test('unknown module-level let references fail with their owning source', () => {
  const module = Fixtures.createSource('app/main.tao', [createLetReference('Result', 'Missing')])
  Tests.expect(() => linkModules(module.path, [module])).toThrow('Unknown let reference Missing in app/main.tao')
  const statement = useNamed('Base')
  const qualified = Fixtures.createSource('app/main.tao', [statement, createLetReference('Result', 'Base.Missing')])
  const imported = Fixtures.createSource('app/base.tao', [Fixtures.createLetDefinition('Base', 'ready', 'package')])
  qualified.imports = [createResolvedImport(statement, imported.path, 'package-api')]
  Tests.expect(() => linkModules(qualified.path, [qualified, imported]))
    .toThrow('Unknown let reference Base.Missing in app/main.tao')
})

function createLetReference(name: string, value: string, visibility?: AST.Visibility): AST.LetDeclaration {
  return {
    kind: 'LetDeclaration',
    range: Range(),
    name: Fixtures.createIdentifier(name),
    type: undefined,
    value: Fixtures.createIdentifier(value),
    visibility,
  }
}

function renderWithNameArgument(target: string, name: string): AST.ViewRenderExpression {
  return { ...Fixtures.createViewRender(target), arguments: [Fixtures.createIdentifier(name)] }
}

function renderViewExpression(expression: AST.ViewRenderExpression): AST.RenderViewExpressionStatement {
  return { kind: 'RenderViewExpressionStatement', range: Range(), expression }
}

function useNamed(target: string, alias?: string): AST.UseStatement {
  return {
    kind: 'UseStatement',
    range: Range(),
    from: undefined,
    imports: [{
      kind: 'NamedImport',
      range: Range(),
      target: Fixtures.createIdentifier(target),
      alias: alias ? Fixtures.createIdentifier(alias) : undefined,
    }],
  }
}

type ImportRelation = SourceModule['imports'][number]['targets'][number]['relation']
function createResolvedImport(
  statement: AST.UseStatement,
  path: string,
  relation: ImportRelation,
): SourceModule['imports'][number] {
  return { statement, targets: [{ path, relation }] }
}
