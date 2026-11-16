import * as AST from '@ast-gen'
import { Range } from '@shared'
import * as Tests from '@shared-tests'

import { linkModules } from '../typecheck-src/Typecheck'
import type { ImportStatement, SourceModule } from '../typecheck-src/Typecheck'
import * as Fixtures from './Typecheck.test-fixtures.LinkModules'

Tests.test('named aliases, public wildcards and folder siblings become local bindings', () => {
  const entry = Fixtures.createSource('app/main.tao', [useNamed('Open', 'Renamed'), useAll()], ['app/views.tao'])
  const imported = Fixtures.createSource('app/views.tao', [
    Fixtures.createLetDefinition('Open', 'shown', 'public'),
    Fixtures.createLetDefinition('Hidden', 'hidden'),
    Fixtures.createView('Sibling', 'folder'),
  ])
  const wildcardSource = Fixtures.createSource('app/wildcards.tao', [
    Fixtures.createLetDefinition('OpenAll', 'shown', 'public'),
  ])
  entry.imports = [
    createResolvedImport(useNamed('Open', 'Renamed'), 'app/views.tao', 'same-directory'),
    createResolvedImport(useAll(), 'app/wildcards.tao', 'same-directory'),
  ]
  const linked = linkModules(entry.path, [entry, imported, wildcardSource])
  Tests.expect(linked.modules[0]?.bindings).toEqual([
    { name: 'Renamed', source: 'app/views.tao', target: 'Open' },
    { name: 'OpenAll', source: 'app/wildcards.tao', target: 'OpenAll' },
    { name: 'Sibling', source: 'app/views.tao', target: 'Sibling' },
  ])
})

Tests.test('an explicit import takes precedence over an implicit sibling with the same name', () => {
  const statement = useNamed('Item')
  const entry = Fixtures.createSource('app/main.tao', [statement], ['app/sibling.tao'])
  const sibling = Fixtures.createSource('app/sibling.tao', [Fixtures.createView('Item', 'folder')])
  const imported = Fixtures.createSource('app/explicit.tao', [Fixtures.createView('Item', 'public')])
  entry.imports = [createResolvedImport(statement, imported.path, 'same-project')]
  const linked = linkModules(entry.path, [entry, sibling, imported])
  Tests.expect(linked.modules[0]?.bindings).toEqual([
    { name: 'Item', source: imported.path, target: 'Item' },
  ])
})

Tests.test('package imports bind visible exports under explicit or derived namespaces', () => {
  const statement = usePackage('libs/widgets', 'UI')
  const derived = usePackage('@scope/catalog')
  const entry = Fixtures.createSource('app/main.tao', [statement, derived])
  const pkg = Fixtures.createSource('libs/widgets/index.tao', [
    Fixtures.createLetDefinition('Card', 'card', 'public'),
    Fixtures.createView('InternalCard', 'project'),
  ])
  const catalog = Fixtures.createSource('libs/catalog/main.tao', [Fixtures.createView('Item', 'public')])
  entry.imports = [
    createResolvedImport(statement, pkg.path, 'same-package'),
    createResolvedImport(derived, catalog.path, 'same-project'),
  ]
  Tests.expect(linkModules(entry.path, [entry, pkg, catalog]).modules[0]?.bindings).toEqual([
    { name: 'UI.Card', source: pkg.path, target: 'Card' },
    { name: 'UI.InternalCard', source: pkg.path, target: 'InternalCard' },
    { name: 'catalog.Item', source: catalog.path, target: 'Item' },
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
})

Tests.test('duplicate local declarations, repeated imports and import collisions fail', () => {
  const duplicate = Fixtures.createSource('app/duplicate.tao', [
    Fixtures.createLetDefinition('Value', 'one'),
    Fixtures.createLetDefinition('Value', 'two'),
  ])
  Tests.expect(() => linkModules(duplicate.path, [duplicate])).toThrow('declares Value more than once')

  const statement = useNamed('Value')
  const entry = Fixtures.createSource('app/main.tao', [statement, statement])
  const target = Fixtures.createSource('app/values.tao', [Fixtures.createLetDefinition('Value', 'value', 'public')])
  entry.imports = [
    createResolvedImport(statement, target.path, 'same-directory'),
    createResolvedImport(statement, target.path, 'same-directory'),
  ]
  Tests.expect(() => linkModules(entry.path, [entry, target])).toThrow('repeats an import statement')

  const collision = Fixtures.createSource('app/main.tao', [statement, Fixtures.createLetDefinition('Value', 'own')])
  collision.imports = [createResolvedImport(statement, target.path, 'same-directory')]
  Tests.expect(() => linkModules(collision.path, [collision, target])).toThrow('which it also declares')

  const packageUse = usePackage('libs/ui', 'UI')
  const namespaceCollision = Fixtures.createSource('app/main.tao', [
    packageUse,
    Fixtures.createLetDefinition('UI', 'value'),
  ])
  namespaceCollision.imports = [createResolvedImport(packageUse, 'libs/ui/index.tao', 'same-package')]
  const packageExports = Fixtures.createSource('libs/ui/index.tao', [Fixtures.createView('Text', 'public')])
  Tests.expect(() => linkModules(namespaceCollision.path, [namespaceCollision, packageExports]))
    .toThrow('value and namespace both named UI')
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
  const base = Fixtures.createSource('app/base.tao', [Fixtures.createLetDefinition('Base', 'ready', 'public')])
  entry.imports = [createResolvedImport(importBase, base.path, 'same-project')]
  const linked = linkModules(entry.path, [entry, base])
  Tests.expect(linked.definitions.map(item => `${item.source}:${item.declaration.name.value}`))
    .toEqual(['app/base.tao:Base', 'app/main.tao:Result'])

  const importA = useNamed('A')
  const importB = useNamed('B')
  const a = Fixtures.createSource('app/a.tao', [importB, createLetReference('A', 'B', 'public')])
  const b = Fixtures.createSource('app/b.tao', [importA, createLetReference('B', 'A', 'public')])
  a.imports = [createResolvedImport(importB, b.path, 'same-project')]
  b.imports = [createResolvedImport(importA, a.path, 'same-project')]
  Tests.expect(() => linkModules(a.path, [a, b])).toThrow('Module-level let cycle')
})

Tests.test('unknown module-level let references fail with their owning source', () => {
  const module = Fixtures.createSource('app/main.tao', [createLetReference('Result', 'Missing')])
  Tests.expect(() => linkModules(module.path, [module])).toThrow('Unknown let reference Missing in app/main.tao')
  const statement = useNamed('Base')
  const qualified = Fixtures.createSource('app/main.tao', [statement, createLetReference('Result', 'Base.Missing')])
  const imported = Fixtures.createSource('app/base.tao', [Fixtures.createLetDefinition('Base', 'ready', 'public')])
  qualified.imports = [createResolvedImport(statement, imported.path, 'same-project')]
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
    all: false,
    from: undefined,
    imports: [{
      kind: 'NamedImport',
      range: Range(),
      target: Fixtures.createIdentifier(target),
      alias: alias ? Fixtures.createIdentifier(alias) : undefined,
    }],
  }
}

function useAll(): AST.UseStatement {
  return { kind: 'UseStatement', range: Range(), all: true, imports: [], from: undefined }
}

function usePackage(path: string, alias?: string): AST.UsePackageStatement {
  return {
    kind: 'UsePackageStatement',
    range: Range(),
    from: { kind: 'ImportPath', range: Range(), value: path },
    alias: alias ? Fixtures.createIdentifier(alias) : undefined,
  }
}

type ImportRelation = 'same-file' | 'same-directory' | 'same-package' | 'same-project' | 'public'
function createResolvedImport(
  statement: ImportStatement,
  path: string,
  relation: ImportRelation,
): SourceModule['imports'][number] {
  return { statement, targets: [{ path, relation }] }
}
